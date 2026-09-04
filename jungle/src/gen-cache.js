// Persistent cache for expensive deterministic generated data — the procedural
// texture pixels. Everything the generators paint is a pure function of the
// generator source, the world seed and the browser build (canvas
// rasterisation), so a second visit can rebuild the textures from stored bytes
// instead of repainting them.
//
// Storage: one IndexedDB object store; each record is keyed
// `${namespace}/${version}/${key}` where `version` hashes the generator
// module sources (fetched from their own module URLs), a caller salt (the
// world seed) and the user agent. A namespace is read in one `getAll` at
// import time so the generators can consult it synchronously when they run;
// writes are queued and flushed in an idle callback after the build so the
// first-visit path is not slowed down. Every failure (no IndexedDB, quota,
// corrupt record, version mismatch) degrades silently to regeneration.
//
// Painting workers: on a cache miss the generator modules can also run inside
// Workers (OffscreenCanvas rasterises byte-identically to a page canvas in the
// same browser build) and hand their pixels back as cache records, so the
// slices of a set paint in parallel and the page thread only restores them.
// A generator module registers its slices as a paint group
// (registerWorkerPaint); the first async build step runs every cold group
// through one worker pool (paintRegisteredInWorkers) before the synchronous
// generators look their records up.

// three.js resolves through the page's import map, which workers do not
// inherit; inside a painting worker this import fails and the module keeps
// working without it (workers only snapshot textures, never restore them).
const THREE = await import('three/webgpu').catch(() => null);

const IN_WORKER = typeof document === 'undefined';

// every namespace created on the page, so a build step can wait for all of
// them at once (they load in parallel while the renderer initialises)
const caches = [];

export function allCachesReady() {
  return Promise.all(caches.map((cache) => cache.ready)).then(() => undefined);
}

const DB_NAME = 'jungle-gen-cache';
const DB_VERSION = 1;
const STORE = 'records';
const LOAD_TIMEOUT_MS = 10000;
const WRITE_TIMEOUT_MS = 120000;
const FLUSH_IDLE_TIMEOUT_MS = 4000;
const FLUSH_BACKSTOP_MS = 12000;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      request.onsuccess = () => {
        const db = request.result;
        // another tab upgrading the schema: let go of the connection
        db.onversionchange = () => db.close();
        resolve(db);
      };
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch (error) {
      resolve(null);
    }
  });
  return dbPromise;
}

// Pure-JS 64-bit hash (two mixed 32-bit lanes) for contexts without
// crypto.subtle (plain http on a LAN address is not a secure context).
function hashText(text) {
  let h1 = 0x811c9dc5 | 0;
  let h2 = 0x01000193 | 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = (Math.imul(h2 ^ c, 16777619) + (h1 >>> 24)) | 0;
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

async function digest(text) {
  if (globalThis.crypto?.subtle) {
    try {
      const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
      let hex = '';
      for (let i = 0; i < 16; i += 1) hex += bytes[i].toString(16).padStart(2, '0');
      return hex;
    } catch (error) {
      // fall through to the JS hash
    }
  }
  return hashText(text);
}

async function computeVersion(sources, salt) {
  const texts = await Promise.all(sources.map(async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`gen-cache: ${response.status} fetching ${url}`);
    return response.text();
  }));
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  return digest(`${salt}\n${ua}\n${sources.map(String).join('\n')}\n${texts.join('\n')}`);
}

function readNamespace(db, prefix) {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).getAll(IDBKeyRange.bound(prefix, `${prefix}\uffff`));
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
      tx.onabort = () => resolve([]);
    } catch (error) {
      resolve([]);
    }
  });
}

// Write the records of one namespace version and drop every other version of
// that namespace (a stale generator's bytes are never read again). A
// transaction that has not completed by the deadline is aborted (false), so a
// stalled store cannot keep the batch in limbo.
function writeNamespace(db, name, version, records) {
  return new Promise((resolve) => {
    let watchdog = null;
    const settle = (ok) => {
      if (watchdog !== null) clearTimeout(watchdog);
      watchdog = null;
      resolve(ok);
    };
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const keep = `${name}/${version}/`;
      for (const record of records) store.put(record, `${keep}${record.key}`);
      const cursor = store.openKeyCursor(IDBKeyRange.bound(`${name}/`, `${name}/\uffff`));
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (!c) return;
        if (!String(c.key).startsWith(keep)) store.delete(c.key);
        c.continue();
      };
      tx.oncomplete = () => settle(true);
      tx.onerror = () => settle(false);
      tx.onabort = () => settle(false);
      watchdog = setTimeout(() => {
        try {
          tx.abort();
        } catch (error) {
          settle(false);
        }
      }, WRITE_TIMEOUT_MS);
    } catch (error) {
      settle(false);
    }
  });
}

const stats = { namespaces: {} };
if (typeof window !== 'undefined') window.__jungleGenCacheStats = stats;

// Inside a painting worker there is nothing to look up or persist: the page
// thread owns the store. Records put here are simply dropped.
function createInertCache(name) {
  const info = { hits: 0, misses: 0, restored: 0, written: 0, loadMs: 0, writeMs: 0, records: 0, bytes: 0, status: 'worker' };
  return {
    ready: Promise.resolve(),
    info,
    name,
    peek() {
      return undefined;
    },
    has() {
      return false;
    },
    get loaded() {
      return true;
    },
    put() {},
    release() {},
    flush() {},
  };
}

// One cache namespace: `sources` are module URLs whose text is part of the
// version, `salt` is any string of parameters the output depends on.
export function createGenCache({ name, sources, salt = '' }) {
  if (IN_WORKER) return createInertCache(name);
  const t0 = performance.now();
  const records = new Map();
  let version = null;
  let db = null;
  let loaded = false;
  const pending = new Map();
  let flushTimer = null;
  const info = { hits: 0, misses: 0, restored: 0, written: 0, loadMs: 0, writeMs: 0, records: 0, bytes: 0, status: 'loading' };
  stats.namespaces[name] = info;

  const load = (async () => {
    try {
      const [v, database] = await Promise.all([computeVersion(sources, salt), openDb()]);
      version = v;
      db = database;
      if (db) {
        const list = await readNamespace(db, `${name}/${version}/`);
        for (const record of list) {
          if (record && typeof record.key === 'string') {
            records.set(record.key, record);
            info.bytes += record.data?.byteLength || 0;
          }
        }
      }
      info.records = records.size;
      info.status = db ? (records.size ? 'loaded' : 'empty') : 'unavailable';
    } catch (error) {
      info.status = `failed: ${error?.message || error}`;
    }
  })();
  // A store that never answers (a blocked upgrade, a stalled fetch) must not
  // hold the page: past the deadline the namespace counts as empty and the
  // generators paint; records that arrive later are still put to use.
  const ready = Promise.race([load, new Promise((resolve) => setTimeout(resolve, LOAD_TIMEOUT_MS))]).then(() => {
    if (!loaded && info.status === 'loading') info.status = 'timeout';
    loaded = true;
    info.loadMs = Math.round(performance.now() - t0);
  });

  let retried = false;

  function flush() {
    if (!db || !version || pending.size === 0) return;
    const batch = [...pending.values()];
    pending.clear();
    const t1 = performance.now();
    writeNamespace(db, name, version, batch).then((ok) => {
      info.writeMs += Math.round(performance.now() - t1);
      if (ok) {
        info.written += batch.length;
      } else if (!retried) {
        // one more attempt (a quota error or an aborted transaction twice in
        // a row means the store is not usable for this visit)
        retried = true;
        for (const record of batch) pending.set(record.key, record);
        scheduleFlush();
      }
    });
  }

  // Write when the main thread is idle, but never much later than that: an
  // idle callback that does not get its turn is backed by a plain timer.
  let backstop = null;

  function scheduleFlush() {
    if (flushTimer !== null || backstop !== null) return;
    const run = () => {
      if (flushTimer !== null && typeof cancelIdleCallback === 'function') cancelIdleCallback(flushTimer);
      if (backstop !== null) clearTimeout(backstop);
      flushTimer = null;
      backstop = null;
      // the version may still be computing on a first visit
      load.then(flush);
    };
    if (typeof requestIdleCallback === 'function') {
      flushTimer = requestIdleCallback(run, { timeout: FLUSH_IDLE_TIMEOUT_MS });
    }
    backstop = setTimeout(run, flushTimer !== null ? FLUSH_BACKSTOP_MS : 2000);
  }

  const cache = {
    ready,
    info,
    name,
    // synchronous: the record, or undefined while loading / on a miss
    peek(key) {
      const record = loaded ? records.get(key) : undefined;
      if (record) info.hits += 1;
      else info.misses += 1;
      return record;
    },
    // the same lookup without touching the hit / miss counters
    has(key) {
      return loaded && records.has(key);
    },
    // true when the namespace has finished loading (hit or miss)
    get loaded() {
      return loaded;
    },
    // queue a record; written to IndexedDB when the main thread is idle
    put(key, record) {
      if (!record) return;
      record.key = key;
      records.set(key, record);
      pending.set(key, record);
      scheduleFlush();
    },
    // drop a record's bytes from memory once its texture exists (a queued
    // write keeps its own reference until it has been flushed)
    release(key) {
      records.delete(key);
    },
    flush,
  };
  caches.push(cache);
  return cache;
}

// ---------- texture (de)serialisation ----------

// Texture properties that decide how the bytes are sampled; restored as-is.
const TEXTURE_PROPS = [
  'colorSpace', 'wrapS', 'wrapT', 'magFilter', 'minFilter', 'anisotropy', 'generateMipmaps',
  'flipY', 'premultiplyAlpha', 'unpackAlignment', 'format', 'type', 'mapping', 'internalFormat', 'name',
];

// Snapshot a CanvasTexture / DataTexture (RGBA8) into a plain record. Nested
// textures in `userData` (the rock's height map) are snapshotted alongside.
// Returns null for anything else.
export function snapshotTexture(texture) {
  if (!texture || !texture.isTexture) return null;
  const image = texture.image;
  let record;
  if (image && typeof image.getContext === 'function') {
    const { width, height } = image;
    const pixels = image.getContext('2d').getImageData(0, 0, width, height);
    record = { kind: 'canvas', width, height, data: pixels.data.buffer };
  } else if (image && image.data instanceof Uint8Array && texture.isDataTexture) {
    const { width, height, data } = image;
    if (data.byteLength !== width * height * 4) return null;
    const own = data.byteOffset === 0 && data.byteLength === data.buffer.byteLength;
    record = { kind: 'data', width, height, data: own ? data.buffer : data.slice().buffer };
  } else {
    return null;
  }
  const props = {};
  for (const p of TEXTURE_PROPS) props[p] = texture[p];
  record.props = props;
  const nested = {};
  let hasNested = false;
  for (const [k, v] of Object.entries(texture.userData || {})) {
    if (v && v.isTexture) {
      const child = snapshotTexture(v);
      if (!child) return null;
      nested[k] = child;
      hasNested = true;
    }
  }
  if (hasNested) record.userData = nested;
  return record;
}

function validRecord(record) {
  return record && (record.kind === 'canvas' || record.kind === 'data') && record.data instanceof ArrayBuffer
    && record.width > 0 && record.height > 0 && record.data.byteLength === record.width * record.height * 4 && record.props;
}

// Rebuild the texture object a snapshot came from: same class, same bytes in
// the same image type (a canvas filled with putImageData or a DataTexture),
// same sampling properties, nested userData textures included.
export function restoreTexture(record) {
  if (!THREE || IN_WORKER || !validRecord(record)) return null;
  const { width, height, props } = record;
  let texture;
  if (record.kind === 'canvas') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(record.data), width, height), 0, 0);
    texture = new THREE.CanvasTexture(canvas);
  } else {
    texture = new THREE.DataTexture(new Uint8Array(record.data), width, height, props.format, props.type);
  }
  for (const p of TEXTURE_PROPS) {
    if (props[p] !== undefined) texture[p] = props[p];
  }
  if (record.userData) {
    for (const [k, child] of Object.entries(record.userData)) {
      const nested = restoreTexture(child);
      if (!nested) return null;
      texture.userData[k] = nested;
    }
  }
  texture.needsUpdate = true;
  return texture;
}

// Queue a whole { key: texture } set under `prefix`, plus a manifest listing
// its keys so a later visit can tell a complete set from a partial one.
// Nothing is written if any member is not cacheable.
export function storeTextureSet(cache, prefix, set) {
  const records = {};
  for (const [key, texture] of Object.entries(set)) {
    const record = snapshotTexture(texture);
    if (!record) return false;
    records[key] = record;
  }
  for (const [key, record] of Object.entries(records)) cache.put(`${prefix}/${key}`, record);
  cache.put(`${prefix}/__manifest`, { kind: 'manifest', keys: Object.keys(set) });
  return true;
}

// ---------- painting workers ----------

function workersSupported() {
  return !IN_WORKER && typeof Worker === 'function' && typeof OffscreenCanvas === 'function' && typeof Blob === 'function'
    && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';
}

// Body of a painting worker: a Blob module that imports each generator module
// by its absolute URL on demand, runs the requested export (a generator
// returning { key: texture }, painted onto OffscreenCanvas there), snapshots
// the textures and posts the records back with their pixel buffers transferred.
const WORKER_SOURCE = [
  `import { snapshotTexture } from ${JSON.stringify(import.meta.url)};`,
  'const modules = new Map();',
  'onmessage = async (event) => {',
  '  const { id, moduleUrl, fn, args } = event.data;',
  '  try {',
  '    let generators = modules.get(moduleUrl);',
  '    if (!generators) {',
  '      generators = await import(moduleUrl);',
  '      modules.set(moduleUrl, generators);',
  '    }',
  '    const set = await generators[fn](...args);',
  '    const records = {};',
  '    const transfer = [];',
  '    const collect = (record) => { transfer.push(record.data); for (const child of Object.values(record.userData || {})) collect(child); };',
  '    for (const [key, texture] of Object.entries(set)) {',
  '      const record = snapshotTexture(texture);',
  "      if (!record) throw new Error(`uncacheable texture ${key}`);",
  '      records[key] = record;',
  '      collect(record);',
  '    }',
  '    postMessage({ id, ok: true, records }, transfer);',
  '  } catch (error) {',
  '    postMessage({ id, ok: false, error: String((error && error.message) || error) });',
  '  }',
  '};',
].join('\n');

// Run `jobs` ({ moduleUrl, fn, args, weight }) on a pool of module Workers,
// heaviest first, and resolve with one { key: record } per job in job order
// (null for a job that failed: module load error, uncacheable texture, worker
// crash, or the whole batch timing out). Never rejects; without Worker /
// OffscreenCanvas support every result is null.
export function paintInWorkers(jobs, { concurrency = 0, timeoutMs = 120000 } = {}) {
  const results = jobs.map(() => null);
  if (jobs.length === 0 || !workersSupported()) return Promise.resolve(results);
  return new Promise((resolve) => {
    const order = jobs.map((job, index) => index).sort((a, b) => (jobs[b].weight || 0) - (jobs[a].weight || 0));
    const workers = new Set();
    let blobUrl = null;
    let timer = null;
    let next = 0;
    let done = 0;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (timer !== null) clearTimeout(timer);
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      for (const worker of workers) worker.terminate();
      workers.clear();
      resolve(results);
    };
    const settle = (index, records) => {
      if (index === null || index === undefined) return;
      results[index] = records || null;
      done += 1;
      if (done === jobs.length) finish();
    };
    const dispatch = (worker) => {
      if (next >= order.length) {
        worker.terminate();
        workers.delete(worker);
        return;
      }
      const index = order[next];
      next += 1;
      worker.jobIndex = index;
      const job = jobs[index];
      worker.postMessage({ id: index, moduleUrl: String(job.moduleUrl), fn: job.fn, args: job.args || [] });
    };
    const fail = (worker) => {
      // a crashed worker fails its job; the survivors take the rest — when
      // none are left the undispatched jobs stay null
      const index = worker.jobIndex;
      worker.jobIndex = null;
      worker.terminate();
      workers.delete(worker);
      settle(index, null);
      if (workers.size === 0) finish();
    };
    try {
      blobUrl = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
      const count = Math.max(1, Math.min(order.length, concurrency || navigator.hardwareConcurrency || 4));
      for (let i = 0; i < count; i += 1) {
        const worker = new Worker(blobUrl, { type: 'module' });
        worker.jobIndex = null;
        worker.onmessage = (event) => {
          const data = event.data || {};
          if (data.id !== worker.jobIndex) return;
          worker.jobIndex = null;
          settle(data.id, data.ok ? data.records : null);
          if (!finished) dispatch(worker);
        };
        worker.onerror = () => fail(worker);
        worker.onmessageerror = () => fail(worker);
        workers.add(worker);
        dispatch(worker);
      }
      timer = setTimeout(finish, timeoutMs);
    } catch (error) {
      finish();
    }
  });
}

// Paint groups registered by the generator modules: a set of records under
// `${prefix}/` in `cache`, produced by `jobs` whose functions each return part
// of the set ({ key: texture }); `manifest` is the key list to store for the
// set (true = the jobs' keys in job order, false = no manifest, the group is
// cold while any of `keys` is missing).
const paintGroups = [];
let registeredRun = null;

export function registerWorkerPaint({ cache, prefix, jobs, manifest = true, keys = null }) {
  if (IN_WORKER) return;
  paintGroups.push({ cache, prefix, jobs, manifest, keys });
}

function groupIsCold(group) {
  const { cache, prefix, manifest, keys } = group;
  if (manifest !== false) return !cache.has(`${prefix}/__manifest`);
  if (!Array.isArray(keys)) return true;
  return keys.some((key) => !cache.has(`${prefix}/${key}`));
}

// Paint every registered group whose records are not in its cache, all on one
// worker pool, and queue the records (plus manifests) as if the previous visit
// had stored them. Runs once; later calls return the same promise. Resolves
// with { cold, painted, sets, ms }: groups found cold, groups completed by the
// workers and their `${cache.name}/${prefix}` names (the rest fall back to
// the page thread when their generators run).
export function paintRegisteredInWorkers() {
  if (!registeredRun) {
    registeredRun = (async () => {
      const t0 = performance.now();
      await allCachesReady();
      const groups = paintGroups.filter((group) => group.cache.loaded && groupIsCold(group));
      const summary = { cold: groups.length, painted: 0, sets: [], ms: 0 };
      if (groups.length === 0 || !workersSupported()) return summary;
      const jobs = [];
      for (const group of groups) {
        for (const job of group.jobs) jobs.push({ ...job, group });
      }
      const results = await paintInWorkers(jobs);
      for (const group of groups) {
        const indices = jobs.map((job, index) => (job.group === group ? index : -1)).filter((index) => index >= 0);
        if (indices.some((index) => !results[index])) continue;
        const keys = [];
        for (const index of indices) {
          for (const [key, record] of Object.entries(results[index])) {
            group.cache.put(`${group.prefix}/${key}`, record);
            keys.push(key);
          }
        }
        if (group.manifest !== false) {
          group.cache.put(`${group.prefix}/__manifest`, { kind: 'manifest', keys: Array.isArray(group.manifest) ? group.manifest.slice() : keys });
        }
        summary.painted += 1;
        summary.sets.push(`${group.cache.name}/${group.prefix}`);
      }
      summary.ms = Math.round(performance.now() - t0);
      return summary;
    })().catch(() => ({ cold: 0, painted: 0, sets: [], ms: 0 }));
  }
  return registeredRun;
}

// Rebuild a set stored by storeTextureSet, in its original key order; null
// unless every member of the manifest restores. The records' bytes are
// released from memory afterwards (the textures hold the pixels now).
export function restoreTextureSet(cache, prefix) {
  if (!cache.loaded) return null;
  const manifest = cache.peek(`${prefix}/__manifest`);
  if (!manifest || manifest.kind !== 'manifest' || !Array.isArray(manifest.keys)) return null;
  const out = {};
  for (const key of manifest.keys) {
    const texture = restoreTexture(cache.peek(`${prefix}/${key}`));
    if (!texture) return null;
    out[key] = texture;
  }
  for (const key of manifest.keys) cache.release(`${prefix}/${key}`);
  cache.info.restored += manifest.keys.length;
  return out;
}
