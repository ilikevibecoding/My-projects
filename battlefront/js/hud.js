// =============================================================
// HUD: DOM overlays, minimap, deploy screen, menus, killfeed
// =============================================================
'use strict';

const HUD = (() => {
  const $ = id => document.getElementById(id);
  let els = {};
  let minimapCtx, minimapBg = null;
  let deployMapCtx;
  let selectedClass = 'assault';
  let selectedPost = null;
  let hitTimer = 0, killTimer = 0;
  const MM_SIZE = 192;
  const DM_SIZE = 320;

  function init() {
    els = {
      menu: $('menu'), deploy: $('deploy'), hud: $('hud'), end: $('end'),
      pause: $('pause'), loading: $('loading'),
      healthFill: $('health-fill'), healthNum: $('health-num'),
      ammoNum: $('ammo-num'), ammoClip: $('ammo-clip'), grenadeNum: $('grenade-num'),
      weaponName: $('weapon-name'),
      ticketsCoa: $('tickets-coalition'), ticketsDom: $('tickets-dominion'),
      postRow: $('post-row'), killfeed: $('killfeed'),
      capture: $('capture'), captureFill: $('capture-fill'), captureLabel: $('capture-label'),
      crosshair: $('crosshair'), hitmarker: $('hitmarker'),
      minimap: $('minimap'), deployMap: $('deploy-map'),
      classCards: $('class-cards'), deployBtn: $('deploy-btn'),
      deployTitle: $('deploy-title'), endTitle: $('end-title'), endStats: $('end-stats'),
      vehicleHud: $('vehicle-hud'), vehicleName: $('vehicle-name'), vehicleFill: $('vehicle-fill'),
      zoomOverlay: $('zoom-overlay'), objective: $('objective'),
      interactHint: $('interact-hint'), fps: $('fps'),
      spaceBanner: $('space-banner'),
    };
    minimapCtx = els.minimap.getContext('2d');
    deployMapCtx = els.deployMap.getContext('2d');

    // menu buttons
    document.querySelectorAll('[data-faction]').forEach(btn => {
      btn.addEventListener('click', () => {
        SynthAudio.resume();
        SynthAudio.sfx('uiClick');
        Game.startMatch(btn.dataset.faction);
      });
    });
    document.querySelectorAll('[data-quality]').forEach(btn => {
      btn.addEventListener('click', () => {
        syncQualityButtons(btn.dataset.quality);
        Graphics.setManualQuality(btn.dataset.quality);
        SynthAudio.sfx('uiClick');
      });
    });
    // reflect the auto-detected preset on the menu
    syncQualityButtons(Graphics.quality);
    els.deployBtn.addEventListener('click', () => {
      if (!selectedPost) return;
      SynthAudio.resume();
      SynthAudio.sfx('uiClick');
      Game.deployPlayer(selectedClass, selectedPost);
    });
    $('end-again').addEventListener('click', () => Game.backToMenu());
    $('pause-resume').addEventListener('click', () => Game.resume());
    $('pause-quit').addEventListener('click', () => Game.backToMenu());

    buildClassCards();
  }

  function hideLoading() { els.loading.style.display = 'none'; }

  // ---------- screens -----------------------------------------
  function show(name) {
    for (const k of ['menu', 'deploy', 'hud', 'end', 'pause']) {
      els[k].style.display = (k === name) ? '' : 'none';
    }
    if (name === 'deploy') refreshDeploy();
  }
  function showMenu() { show('menu'); }
  function showDeploy() { show('deploy'); }
  function showHUD() { show('hud'); refreshAmmo(); }
  function showPause() { show('pause'); }

  function showEnd(winnerTeam) {
    show('end');
    const won = winnerTeam === Game.playerTeam;
    els.endTitle.textContent = won ? 'VICTORY' : 'DEFEAT';
    els.endTitle.style.color = won ? '#7df0a8' : '#ff6655';
    const p = Game.playerStats;
    els.endStats.innerHTML =
      `<div><span>${CONFIG.factions[winnerTeam].name}</span> wins the battle</div>` +
      `<div class="stat-row"><b>${p.kills}</b> kills &nbsp;·&nbsp; <b>${p.deaths}</b> deaths &nbsp;·&nbsp; <b>${p.captures}</b> captures</div>` +
      `<div class="stat-row small">Final tickets — Coalition ${Math.ceil(Capture.tickets.coalition)} · Dominion ${Math.ceil(Capture.tickets.dominion)}</div>`;
  }

  // ---------- class cards ---------------------------------------
  function buildClassCards() {
    els.classCards.innerHTML = '';
    for (const key of Object.keys(CONFIG.classes)) {
      const C = CONFIG.classes[key];
      const card = document.createElement('div');
      card.className = 'class-card' + (key === selectedClass ? ' sel' : '');
      card.innerHTML = `<div class="cc-icon" style="color:#${C.pauldron.toString(16).padStart(6, '0')}">${C.icon}</div>
        <div class="cc-name">${C.name}</div>
        <div class="cc-desc">${C.desc}</div>
        <div class="cc-hp">HP ${C.health} · ${CONFIG.weapons[C.weapon].name}</div>`;
      card.addEventListener('click', () => {
        selectedClass = key;
        document.querySelectorAll('.class-card').forEach(c => c.classList.remove('sel'));
        card.classList.add('sel');
        SynthAudio.sfx('uiClick');
      });
      els.classCards.appendChild(card);
    }
  }

  // ---------- deploy screen ---------------------------------------
  function refreshDeploy() {
    els.deployTitle.innerHTML =
      `DEPLOY — <span style="color:${CONFIG.factions[Game.playerTeam].uiColor}">${CONFIG.factions[Game.playerTeam].name}</span>`;
    // default post: first spawnable
    const spawns = Capture.spawnablePosts(Game.playerTeam);
    if (!selectedPost || !spawns.find(p => p.id === selectedPost.id)) {
      selectedPost = spawns[0] || null;
    }
    els.deployBtn.disabled = !selectedPost;
    drawMap(deployMapCtx, DM_SIZE, true);
  }

  // click handling on the deploy map
  function deployMapClick(e) {
    const rect = els.deployMap.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (DM_SIZE / rect.width);
    const my = (e.clientY - rect.top) * (DM_SIZE / rect.height);
    const spawns = Capture.spawnablePosts(Game.playerTeam);
    for (const p of spawns) {
      const [px, py] = worldToMap(p.x, p.z, DM_SIZE);
      if (Math.hypot(mx - px, my - py) < 20) {
        selectedPost = p;
        els.deployBtn.disabled = false;
        SynthAudio.sfx('uiClick');
        return;
      }
    }
  }

  function worldToMap(x, z, size) {
    const half = CONFIG.world.size / 2 + 40;
    return [(x / (half * 2) + 0.5) * size, (z / (half * 2) + 0.5) * size];
  }

  // ---------- map drawing -------------------------------------------
  function buildMinimapBg(size) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    const half = CONFIG.world.size / 2 + 40;
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const wx = (x / size - 0.5) * half * 2;
        const wz = (y / size - 0.5) * half * 2;
        const h = World.getGroundHeight(wx, wz);
        const t = Math.max(0, Math.min(1, (h + 4) / 26));
        const i = (y * size + x) * 4;
        img.data[i] = 92 + t * 96;
        img.data[i + 1] = 74 + t * 74;
        img.data[i + 2] = 48 + t * 46;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  function drawMap(ctx, size, deployMode) {
    if (!minimapBg) minimapBg = buildMinimapBg(MM_SIZE);
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(minimapBg, 0, 0, size, size);
    // posts
    for (const [, p] of Capture.posts) {
      const [x, y] = worldToMap(p.def.x, p.def.z, size);
      const col = p.owner ? CONFIG.factions[p.owner].uiColor : '#cccccc';
      ctx.beginPath();
      ctx.arc(x, y, deployMode ? 14 : 7, 0, 7);
      ctx.fillStyle = col + 'cc';
      ctx.fill();
      if (p.contested || p.progress < 1) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.fillStyle = '#0a0c10';
      ctx.font = `bold ${deployMode ? 14 : 8}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.def.id, x, y + 0.5);
      if (deployMode && selectedPost && selectedPost.id === p.def.id) {
        ctx.beginPath();
        ctx.arc(x, y, 19, 0, 7);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
    }
    // soldiers
    for (const s of Soldiers.all) {
      if (!s.alive || s.isPlayer) continue;
      const [x, y] = worldToMap(s.position.x, s.position.z, size);
      ctx.fillStyle = s.team === Game.playerTeam ? '#7df0a8' : '#ff5544';
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    // vehicles
    for (const v of Vehicles.all) {
      if (!v.alive) continue;
      const [x, y] = worldToMap(v.position.x, v.position.z, size);
      ctx.strokeStyle = v.team ? CONFIG.factions[v.team].uiColor : '#bbbbbb';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - 2.5, y - 2.5, 5, 5);
    }
    // player arrow
    const pl = Game.player;
    if (pl && pl.alive && !deployMode) {
      const [x, y] = worldToMap(pl.position.x, pl.position.z, size);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI - Player.yaw);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(4, 5);
      ctx.lineTo(-4, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // ---------- killfeed ------------------------------------------------
  function killfeed(html, color = '#dddddd') {
    const div = document.createElement('div');
    div.className = 'kf-entry';
    div.style.borderLeftColor = color;
    div.innerHTML = html;
    els.killfeed.prepend(div);
    while (els.killfeed.children.length > 6) els.killfeed.lastChild.remove();
    setTimeout(() => { div.classList.add('fade'); }, 5200);
    setTimeout(() => { div.remove(); }, 6000);
  }

  function hitmarker(kill) {
    hitTimer = 0.18;
    if (kill) killTimer = 0.4;
  }

  function syncQualityButtons(q) {
    document.querySelectorAll('[data-quality]').forEach(b =>
      b.classList.toggle('sel', b.dataset.quality === q));
  }

  let toastEl = null, toastTimer = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = 'toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3800);
  }

  // ---------- per-frame update -----------------------------------------
  let mmTimer = 0;
  function update(dt) {
    hitTimer -= dt; killTimer -= dt;
    els.hitmarker.style.opacity = hitTimer > 0 ? 1 : 0;
    els.hitmarker.classList.toggle('kill', killTimer > 0);

    if (Game.state !== 'playing') return;

    // tickets
    els.ticketsCoa.textContent = Math.ceil(Capture.tickets.coalition);
    els.ticketsDom.textContent = Math.ceil(Capture.tickets.dominion);

    // post pips
    let pipHtml = '';
    for (const [, p] of Capture.posts) {
      const col = p.owner ? CONFIG.factions[p.owner].uiColor : '#999';
      const blink = p.contested ? 'blink' : '';
      pipHtml += `<span class="pip ${blink}" style="background:${col}">${p.def.id}</span>`;
    }
    els.postRow.innerHTML = pipHtml;

    // health
    const pl = Game.player;
    if (pl) {
      const hp = Math.max(0, Math.ceil(pl.health));
      els.healthNum.textContent = hp;
      els.healthFill.style.width = (hp / pl.maxHealth * 100) + '%';
      els.healthFill.style.background = hp < pl.maxHealth * 0.3 ? '#ff5544' : '#7df0a8';
    }

    // vehicle hud
    const v = Player.vehicle;
    if (v) {
      els.vehicleFill.style.width = (Math.max(0, v.health) / v.maxHealth * 100) + '%';
    }

    // capture progress (when player inside a post radius)
    let capping = null;
    if (pl && pl.alive) {
      for (const [, p] of Capture.posts) {
        const d = Math.hypot(pl.position.x - p.def.x, pl.position.z - p.def.z);
        if (d < p.def.radius && (p.progress < 1 || p.owner !== Game.playerTeam)) { capping = p; break; }
      }
    }
    if (capping) {
      els.capture.style.display = '';
      els.captureFill.style.width = (capping.progress * 100) + '%';
      const ownCol = capping.owner ? CONFIG.factions[capping.owner].uiColor : '#cccccc';
      els.captureFill.style.background = ownCol;
      els.captureLabel.textContent = capping.contested ? `${capping.def.name} — CONTESTED`
        : capping.owner === Game.playerTeam ? `Securing ${capping.def.name}`
        : capping.owner === null ? `Capturing ${capping.def.name}` : `Neutralizing ${capping.def.name}`;
    } else {
      els.capture.style.display = 'none';
    }

    // interact hint
    let hint = '';
    if (pl && pl.alive && !Player.vehicle) {
      const nv = Vehicles.nearestEnterable(pl.position, 4.2, Game.playerTeam);
      if (nv) hint = `Press E — enter ${nv.name}`;
    } else if (Player.vehicle && Player.vehicle.canExit()) {
      hint = 'Press E — exit';
    }
    els.interactHint.textContent = hint;
    els.interactHint.style.display = hint ? '' : 'none';

    // objective ticker
    const c = Capture.ownedPosts('coalition'), d2 = Capture.ownedPosts('dominion');
    const own = Game.playerTeam === 'coalition' ? c : d2;
    const opp = Game.playerTeam === 'coalition' ? d2 : c;
    els.objective.textContent = own > opp ? 'Your team holds the majority — enemy tickets are bleeding'
      : own < opp ? 'Enemy holds the majority — capture command posts!'
      : 'Capture command posts to start the ticket bleed';

    // minimap (throttled)
    mmTimer -= dt;
    if (mmTimer <= 0) {
      mmTimer = 0.12;
      drawMap(minimapCtx, MM_SIZE, false);
    }
  }

  function refreshAmmo() {
    const pl = Game.player;
    if (!pl) return;
    const W = CONFIG.weapons[pl.weaponKey];
    els.weaponName.textContent = W.name;
    els.ammoNum.textContent = pl.reloadTimer > 0 ? '——' : pl.ammo;
    els.ammoClip.textContent = W.clip === Infinity ? '∞' : W.clip;
    els.grenadeNum.textContent = pl.grenades;
  }

  function setVehicleHud(v) {
    els.vehicleHud.style.display = v ? '' : 'none';
    if (v) els.vehicleName.textContent = v.name;
    els.crosshair.classList.toggle('vehicle', !!v);
  }

  function setZoomOverlay(on) {
    els.zoomOverlay.style.display = on ? '' : 'none';
    els.crosshair.style.opacity = on ? 0 : 1;
  }

  function setSpaceBanner(on) {
    els.spaceBanner.style.display = on ? '' : 'none';
  }

  function setFps(v, ents) {
    if (els.fps) els.fps.textContent = `${v} fps · ${ents} entities`;
  }

  return {
    init, hideLoading, showMenu, showDeploy, showHUD, showPause, showEnd, update,
    killfeed, hitmarker, refreshAmmo, setVehicleHud, setZoomOverlay, setFps,
    deployMapClick, setSpaceBanner, toast, syncQualityButtons,
    get selectedClass() { return selectedClass; },
    get selectedPost() { return selectedPost; },
    bindDeployMap(el) { el.addEventListener('click', deployMapClick); },
  };
})();
