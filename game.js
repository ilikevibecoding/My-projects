(() => {
    const canvas = document.getElementById("viewport");
    const ctx = canvas.getContext("2d");

    const ui = {
        depthValue: document.getElementById("depthValue"),
        biomeValue: document.getElementById("biomeValue"),
        oxygenValue: document.getElementById("oxygenValue"),
        energyValue: document.getElementById("energyValue"),
        scanTargetName: document.getElementById("scanTargetName"),
        scanTargetDesc: document.getElementById("scanTargetDesc"),
        scanProgressFill: document.getElementById("scanProgressFill"),
        scanHint: document.getElementById("scanHint"),
        codexList: document.getElementById("codexList"),
        toastStack: document.getElementById("toastStack"),
        introOverlay: document.getElementById("introOverlay"),
        diveButton: document.getElementById("diveButton"),
    };

    const TWO_PI = Math.PI * 2;
    const WORLD_RADIUS = 210;
    const FLOOR_STEP = 12;
    const FLOOR_RANGE = 150;
    const NEAR = 0.6;

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const lerp = (a, b, t) => a + (b - a) * t;
    const smoothstep = (edge0, edge1, value) => {
        const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
        return t * t * (3 - 2 * t);
    };

    function mulberry32(seed) {
        return () => {
            let t = seed += 0x6D2B79F5;
            t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    function rgba(color, alpha) {
        return "rgba(" + color[0] + ", " + color[1] + ", " + color[2] + ", " + alpha + ")";
    }

    function mixColor(a, b, t) {
        return [
            Math.round(lerp(a[0], b[0], t)),
            Math.round(lerp(a[1], b[1], t)),
            Math.round(lerp(a[2], b[2], t)),
        ];
    }

    function scaleColor(color, factor) {
        return [
            Math.round(clamp(color[0] * factor, 0, 255)),
            Math.round(clamp(color[1] * factor, 0, 255)),
            Math.round(clamp(color[2] * factor, 0, 255)),
        ];
    }

    const palettes = {
        shelf: {
            sand: [199, 190, 138],
            moss: [84, 138, 98],
            fog: [42, 128, 164],
            accent: [255, 181, 95],
        },
        kelp: {
            sand: [128, 157, 118],
            moss: [70, 116, 78],
            fog: [28, 116, 142],
            accent: [134, 255, 169],
        },
        ember: {
            sand: [171, 122, 80],
            moss: [129, 77, 55],
            fog: [18, 94, 126],
            accent: [255, 161, 104],
        },
        dropoff: {
            sand: [79, 110, 132],
            moss: [46, 82, 105],
            fog: [14, 55, 92],
            accent: [111, 190, 255],
        },
    };

    const state = {
        started: false,
        pointerLocked: false,
        lastTime: 0,
        keys: Object.create(null),
        mouseDX: 0,
        mouseDY: 0,
        currentTargetId: null,
        currentTarget: null,
        scanProgress: 0,
        notifications: [],
        discoveries: [],
        discoveredIds: new Set(),
        lowOxygenTriggered: false,
        zeroOxygenTriggered: false,
        floorShimmer: 0,
        camera: null,
    };

    const player = {
        x: 0,
        y: -8,
        z: -18,
        yaw: 0,
        pitch: -0.08,
        vx: 0,
        vy: 0,
        vz: 0,
        oxygen: 100,
        energy: 100,
    };

    const screenParticles = [];
    const backgroundRays = [];

    function terrainHeight(x, z) {
        const shelf = -38
            + Math.sin(x * 0.032) * 4
            + Math.cos(z * 0.024) * 3.5
            + Math.sin((x + z) * 0.016) * 4.5;
        const plateau = 16 * Math.exp(-((x - 30) * (x - 30) + (z - 74) * (z - 74)) / 2100);
        const ridge = 12 * Math.exp(-((x + 76) * (x + 76) + (z + 12) * (z + 12)) / 1700);
        const trench = -16 * Math.exp(-((x + 8) * (x + 8) + (z - 140) * (z - 140)) / 2700);
        const vents = -8 * Math.exp(-((x - 112) * (x - 112) + (z + 60) * (z + 60)) / 1100);
        return shelf + plateau + ridge + trench + vents;
    }

    function biomeAt(x, z, height = terrainHeight(x, z)) {
        const noise = Math.sin(x * 0.014) + Math.cos(z * 0.018) + Math.sin((x - z) * 0.009);

        if (height < -50) {
            return { key: "dropoff", name: "Twilight Dropoff", palette: palettes.dropoff };
        }
        if (noise > 1.1) {
            return { key: "kelp", name: "Kelp Garden", palette: palettes.kelp };
        }
        if (noise < -1.0) {
            return { key: "ember", name: "Ember Reef", palette: palettes.ember };
        }
        return { key: "shelf", name: "Sunlit Shelf", palette: palettes.shelf };
    }

    function visibilityFor(distance, depth) {
        const distanceFog = 1 - smoothstep(55, 190, distance);
        const depthFog = 1 - smoothstep(30, 72, depth);
        return clamp(distanceFog * 0.8 + depthFog * 0.35, 0.08, 1);
    }

    function requestDive() {
        state.started = true;
        ui.introOverlay.classList.remove("visible");
        if (canvas.requestPointerLock) {
            canvas.requestPointerLock();
        }
        pushToast("Dive online", "Scanner feed active. Sweep the reef for anything glowing or moving.");
    }

    function pushToast(title, copy) {
        state.notifications.unshift({
            id: Math.random().toString(36).slice(2),
            title,
            copy,
            ttl: 4.5,
        });
        state.notifications = state.notifications.slice(0, 4);
        renderToasts();
    }

    function renderToasts() {
        ui.toastStack.innerHTML = state.notifications.map((item) => {
            return [
                '<div class="toast">',
                '<span class="toast-title">' + item.title + "</span>",
                '<span class="toast-copy">' + item.copy + "</span>",
                "</div>",
            ].join("");
        }).join("");
    }

    function renderCodex() {
        if (!state.discoveries.length) {
            ui.codexList.innerHTML = [
                '<div class="codex-entry">',
                '<span class="codex-entry-title">No scans logged yet</span>',
                '<div class="codex-entry-copy">Follow the highlighted silhouettes and scan them to build out the field log.</div>',
                "</div>",
            ].join("");
            return;
        }

        ui.codexList.innerHTML = state.discoveries.slice(0, 4).map((entry) => {
            return [
                '<div class="codex-entry">',
                '<span class="codex-entry-title">' + entry.name + "</span>",
                '<div class="codex-entry-copy">' + entry.description + "</div>",
                "</div>",
            ].join("");
        }).join("");
    }

    function seedWorld() {
        const rng = mulberry32(7);
        const world = {
            rocks: [],
            corals: [],
            kelps: [],
            schools: [],
            scannables: [],
        };

        const scannableTemplates = [
            {
                id: "reef-ray",
                name: "Reef Ray",
                description: "Wide-winged herbivore riding warm currents just beneath the surface glow.",
                kind: "creature",
                subtype: "ray",
                x: 28,
                y: -14,
                z: 48,
                radius: 4,
                glow: [148, 240, 255],
            },
            {
                id: "glow-kelp",
                name: "Glow Kelp",
                description: "Elastic plant life storing charge in translucent fronds along the garden wall.",
                kind: "flora",
                subtype: "kelp",
                x: -38,
                y: terrainHeight(-38, 86),
                z: 86,
                radius: 5,
                height: 18,
                glow: [146, 255, 176],
            },
            {
                id: "ember-coral",
                name: "Ember Coral",
                description: "Thermally active coral lattice with warm orange polyps and mineral bloom.",
                kind: "flora",
                subtype: "coral",
                x: 74,
                y: terrainHeight(74, 38),
                z: 38,
                radius: 4,
                height: 10,
                glow: [255, 170, 104],
            },
            {
                id: "arch-fragment",
                name: "Arch Fragment",
                description: "Alien alloy shard still humming with low power under a crust of salt.",
                kind: "artifact",
                subtype: "fragment",
                x: -84,
                y: terrainHeight(-84, -24) + 2.1,
                z: -24,
                radius: 4,
                size: 5.2,
                glow: [120, 248, 255],
            },
            {
                id: "lumen-eel",
                name: "Lumen Eel",
                description: "Ribbon predator that flashes its spine to scatter smaller fish before a strike.",
                kind: "creature",
                subtype: "eel",
                x: -14,
                y: -22,
                z: -92,
                radius: 5,
                glow: [110, 204, 255],
            },
            {
                id: "vent-bloom",
                name: "Vent Bloom",
                description: "Pressure-fed flora thriving around hot mineral vents in the darker shelf.",
                kind: "flora",
                subtype: "coral",
                x: 108,
                y: terrainHeight(108, -62),
                z: -62,
                radius: 4,
                height: 12,
                glow: [255, 219, 126],
            },
            {
                id: "echo-shell",
                name: "Echo Shell",
                description: "Spiral shell emitting a faint resonant pulse when disturbed by movement.",
                kind: "artifact",
                subtype: "shell",
                x: 12,
                y: terrainHeight(12, 132) + 1.2,
                z: 132,
                radius: 3.5,
                size: 4.6,
                glow: [145, 255, 243],
            },
            {
                id: "glassfin-cluster",
                name: "Glassfin Cluster",
                description: "Near-transparent juveniles traveling as a defensive prism of flickering bodies.",
                kind: "creature",
                subtype: "cluster",
                x: -104,
                y: -18,
                z: 76,
                radius: 6,
                glow: [178, 242, 255],
            },
        ];

        world.scannables = scannableTemplates;

        for (let i = 0; i < 90; i += 1) {
            const x = (rng() - 0.5) * 380;
            const z = (rng() - 0.5) * 380;
            if (Math.hypot(x, z) < 24) {
                continue;
            }
            const y = terrainHeight(x, z);
            world.rocks.push({
                x,
                y,
                z,
                height: 4 + rng() * 15,
                width: 0.36 + rng() * 0.55,
                highlight: rng(),
                tall: rng() > 0.7,
            });
        }

        for (let i = 0; i < 150; i += 1) {
            const x = (rng() - 0.5) * 380;
            const z = (rng() - 0.5) * 380;
            if (Math.hypot(x, z) < 24) {
                continue;
            }
            const y = terrainHeight(x, z);
            world.corals.push({
                x,
                y,
                z,
                height: 4 + rng() * 11,
                width: 0.7 + rng() * 0.7,
                phase: rng() * TWO_PI,
                shape: Math.floor(rng() * 3),
            });
        }

        for (let i = 0; i < 72; i += 1) {
            const x = (rng() - 0.5) * 380;
            const z = (rng() - 0.5) * 380;
            const ground = terrainHeight(x, z);
            const biome = biomeAt(x, z, ground);
            if (biome.key !== "kelp") {
                continue;
            }
            world.kelps.push({
                x,
                y: ground,
                z,
                height: 10 + rng() * 15,
                sway: rng() * TWO_PI,
                width: 0.9 + rng() * 0.5,
            });
        }

        for (let i = 0; i < 11; i += 1) {
            world.schools.push({
                x: (rng() - 0.5) * 320,
                y: -14 - rng() * 22,
                z: (rng() - 0.5) * 320,
                radius: 4 + rng() * 8,
                count: 10 + Math.floor(rng() * 9),
                speed: 0.5 + rng() * 0.7,
                phase: rng() * TWO_PI,
                tint: mixColor([122, 210, 255], [255, 198, 119], rng() * 0.35),
                size: 0.7 + rng() * 0.6,
            });
        }

        return world;
    }

    const world = seedWorld();

    function scannablePose(target, time) {
        if (target.subtype === "ray") {
            return {
                x: target.x + Math.cos(time * 0.22) * 16,
                y: target.y + Math.sin(time * 0.9) * 1.8,
                z: target.z + Math.sin(time * 0.26) * 10,
            };
        }
        if (target.subtype === "eel") {
            return {
                x: target.x + Math.sin(time * 0.55) * 14,
                y: target.y + Math.sin(time * 0.9 + 1.7) * 2.4,
                z: target.z + Math.cos(time * 0.48) * 10,
            };
        }
        if (target.subtype === "cluster") {
            return {
                x: target.x + Math.sin(time * 0.28) * 8,
                y: target.y + Math.cos(time * 0.46) * 1.5,
                z: target.z + Math.cos(time * 0.31) * 6,
            };
        }
        return { x: target.x, y: target.y, z: target.z };
    }

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    function syncCamera() {
        state.camera = {
            yawSin: Math.sin(player.yaw),
            yawCos: Math.cos(player.yaw),
            pitchSin: Math.sin(player.pitch),
            pitchCos: Math.cos(player.pitch),
            focal: Math.min(canvas.width, canvas.height) * 0.92,
            cx: canvas.width * 0.5,
            cy: canvas.height * 0.5,
        };
    }

    function worldToCamera(x, y, z) {
        const dx = x - player.x;
        const dy = y - player.y;
        const dz = z - player.z;

        const yawX = dx * state.camera.yawCos - dz * state.camera.yawSin;
        const yawZ = dx * state.camera.yawSin + dz * state.camera.yawCos;

        const pitchY = dy * state.camera.pitchCos - yawZ * state.camera.pitchSin;
        const pitchZ = dy * state.camera.pitchSin + yawZ * state.camera.pitchCos;

        return { x: yawX, y: pitchY, z: pitchZ };
    }

    function projectPoint(x, y, z) {
        const cam = worldToCamera(x, y, z);
        if (cam.z <= NEAR) {
            return null;
        }
        const invZ = state.camera.focal / cam.z;
        return {
            x: state.camera.cx + cam.x * invZ,
            y: state.camera.cy - cam.y * invZ,
            depth: cam.z,
            scale: invZ,
        };
    }

    function roundedRectPath(x, y, width, height, radius) {
        const r = Math.min(radius, width * 0.5, height * 0.5);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + width - r, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + r);
        ctx.lineTo(x + width, y + height - r);
        ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
        ctx.lineTo(x + r, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    function updatePlayer(dt) {
        player.yaw += state.mouseDX * 0.0025;
        player.pitch = clamp(player.pitch - state.mouseDY * 0.0018, -0.82, 0.42);
        state.mouseDX = 0;
        state.mouseDY = 0;

        const forwardInput = (state.keys.w ? 1 : 0) - (state.keys.s ? 1 : 0);
        const strafeInput = (state.keys.d ? 1 : 0) - (state.keys.a ? 1 : 0);
        const riseInput = (state.keys[" "] ? 1 : 0) - (state.keys.c ? 1 : 0);

        let inputLength = Math.hypot(forwardInput, strafeInput, riseInput);
        let moveX = 0;
        let moveY = 0;
        let moveZ = 0;

        const boosting = state.keys.shift && player.energy > 6;
        const moveSpeed = boosting ? 16 : 10;

        if (inputLength > 0) {
            const inv = 1 / inputLength;
            const normForward = forwardInput * inv;
            const normStrafe = strafeInput * inv;
            const normRise = riseInput * inv;
            const forwardX = Math.sin(player.yaw);
            const forwardZ = Math.cos(player.yaw);
            const rightX = Math.cos(player.yaw);
            const rightZ = -Math.sin(player.yaw);

            moveX = rightX * normStrafe + forwardX * normForward;
            moveZ = rightZ * normStrafe + forwardZ * normForward;
            moveY = normRise + Math.sin(player.pitch) * Math.abs(normForward) * 0.35;
            const total = Math.hypot(moveX, moveY, moveZ) || 1;
            moveX /= total;
            moveY /= total;
            moveZ /= total;
        }

        player.vx = lerp(player.vx, moveX * moveSpeed, dt * 4.2);
        player.vy = lerp(player.vy, moveY * moveSpeed, dt * 3.8);
        player.vz = lerp(player.vz, moveZ * moveSpeed, dt * 4.2);

        player.x += player.vx * dt;
        player.y += player.vy * dt;
        player.z += player.vz * dt;

        player.x = clamp(player.x, -WORLD_RADIUS, WORLD_RADIUS);
        player.z = clamp(player.z, -WORLD_RADIUS, WORLD_RADIUS);

        const floor = terrainHeight(player.x, player.z) + 3.2;
        if (player.y < floor) {
            player.y = floor;
            player.vy = Math.max(player.vy, 0.4);
        }
        if (player.y > -1.5) {
            player.y = -1.5;
            player.vy = Math.min(player.vy, 0);
        }

        if (boosting && inputLength > 0) {
            player.energy = clamp(player.energy - dt * 8.5, 0, 100);
        } else {
            player.energy = clamp(player.energy + dt * 5.5, 0, 100);
        }

        if (-player.y < 2.5) {
            player.oxygen = clamp(player.oxygen + dt * 20, 0, 100);
        } else {
            player.oxygen = clamp(player.oxygen - dt * 1.45, 0, 100);
        }

        if (player.oxygen < 28 && !state.lowOxygenTriggered) {
            state.lowOxygenTriggered = true;
            pushToast("Oxygen low", "Surface soon or keep the scanner run short.");
        }
        if (player.oxygen > 44) {
            state.lowOxygenTriggered = false;
        }
        if (player.oxygen <= 0 && !state.zeroOxygenTriggered) {
            state.zeroOxygenTriggered = true;
            pushToast("Emergency reserve", "Thrusters are forcing a return toward the light.");
        }
        if (player.oxygen <= 0) {
            player.y += dt * 8;
        }
        if (player.oxygen > 14) {
            state.zeroOxygenTriggered = false;
        }
    }

    function findTarget(time) {
        let best = null;
        const centerX = canvas.width * 0.5;
        const centerY = canvas.height * 0.5;

        for (const target of world.scannables) {
            const pose = scannablePose(target, time);
            let centerHeight = pose.y + (target.height ? target.height * 0.55 : 0);
            if (target.subtype === "fragment" || target.subtype === "shell") {
                centerHeight = pose.y + 1;
            }
            const projected = projectPoint(pose.x, centerHeight, pose.z);
            if (!projected) {
                continue;
            }

            const distance = Math.hypot(pose.x - player.x, centerHeight - player.y, pose.z - player.z);
            if (distance > 38) {
                continue;
            }

            const screenDistance = Math.hypot(projected.x - centerX, projected.y - centerY);
            if (screenDistance > 90) {
                continue;
            }

            const score = screenDistance + distance * 2.4;
            if (!best || score < best.score) {
                best = {
                    target,
                    pose,
                    score,
                    projected,
                    distance,
                };
            }
        }

        return best;
    }

    function completeScan(target) {
        if (state.discoveredIds.has(target.id)) {
            return;
        }
        state.discoveredIds.add(target.id);
        state.discoveries.unshift({
            id: target.id,
            name: target.name,
            description: target.description,
        });
        renderCodex();
        pushToast("Scan complete", target.name + " added to the field log.");
    }

    function updateScanning(dt, time) {
        const targetData = findTarget(time);
        state.currentTarget = targetData;

        if (!targetData) {
            state.currentTargetId = null;
            state.scanProgress = Math.max(0, state.scanProgress - dt * 0.65);
            return;
        }

        const target = targetData.target;
        if (state.currentTargetId !== target.id) {
            state.scanProgress = Math.max(0, state.scanProgress - dt * 1.5);
            state.currentTargetId = target.id;
        }

        const isScanning = state.keys.e && player.energy > 3;
        if (isScanning && !state.discoveredIds.has(target.id)) {
            player.energy = clamp(player.energy - dt * 4.4, 0, 100);
            state.scanProgress = clamp(state.scanProgress + dt * 0.7, 0, 1);
            if (state.scanProgress >= 1) {
                state.scanProgress = 0;
                completeScan(target);
            }
        } else {
            state.scanProgress = Math.max(0, state.scanProgress - dt * 0.4);
        }
    }

    function drawBackground(time) {
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, "#55d7f5");
        gradient.addColorStop(0.28, "#0d6f97");
        gradient.addColorStop(1, "#02101d");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const horizonGlow = ctx.createRadialGradient(
            canvas.width * 0.52,
            canvas.height * 0.18 + player.pitch * 160,
            0,
            canvas.width * 0.52,
            canvas.height * 0.18 + player.pitch * 160,
            canvas.width * 0.58
        );
        horizonGlow.addColorStop(0, "rgba(190, 255, 255, 0.28)");
        horizonGlow.addColorStop(0.34, "rgba(111, 245, 255, 0.08)");
        horizonGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = horizonGlow;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        for (const ray of backgroundRays) {
            const drift = Math.sin(time * ray.speed + ray.phase) * 140;
            ctx.fillStyle = "rgba(197, 251, 255, 0.05)";
            ctx.beginPath();
            ctx.moveTo(ray.x + drift, -20);
            ctx.lineTo(ray.x + ray.width * 0.5 + drift, canvas.height * 0.64);
            ctx.lineTo(ray.x - ray.width * 0.5 + drift, canvas.height * 0.64);
            ctx.closePath();
            ctx.fill();
        }
    }

    function drawFloor(time) {
        const tiles = [];
        const startX = Math.floor((player.x - FLOOR_RANGE) / FLOOR_STEP) * FLOOR_STEP;
        const startZ = Math.floor((player.z - FLOOR_RANGE) / FLOOR_STEP) * FLOOR_STEP;
        const endX = player.x + FLOOR_RANGE;
        const endZ = player.z + FLOOR_RANGE;

        for (let z = startZ; z < endZ; z += FLOOR_STEP) {
            for (let x = startX; x < endX; x += FLOOR_STEP) {
                const y1 = terrainHeight(x, z);
                const y2 = terrainHeight(x + FLOOR_STEP, z);
                const y3 = terrainHeight(x + FLOOR_STEP, z + FLOOR_STEP);
                const y4 = terrainHeight(x, z + FLOOR_STEP);
                const p1 = projectPoint(x, y1, z);
                const p2 = projectPoint(x + FLOOR_STEP, y2, z);
                const p3 = projectPoint(x + FLOOR_STEP, y3, z + FLOOR_STEP);
                const p4 = projectPoint(x, y4, z + FLOOR_STEP);

                if (!p1 || !p2 || !p3 || !p4) {
                    continue;
                }

                const avgDepth = (p1.depth + p2.depth + p3.depth + p4.depth) * 0.25;
                const avgHeight = (y1 + y2 + y3 + y4) * 0.25;
                if (avgDepth > 230) {
                    continue;
                }

                const biome = biomeAt(x + FLOOR_STEP * 0.5, z + FLOOR_STEP * 0.5, avgHeight);
                const textureMix = 0.34 + 0.26 * Math.sin((x + z) * 0.045);
                const base = mixColor(biome.palette.sand, biome.palette.moss, textureMix);
                const shallowness = 1 - smoothstep(20, 62, -avgHeight);
                const caustic = (Math.sin((x + time * 22) * 0.21) + Math.cos((z - time * 19) * 0.17)) * 0.09;
                const light = clamp(0.62 + shallowness * 0.34 + caustic, 0.3, 1.08);
                const color = scaleColor(base, light);
                const alpha = visibilityFor(avgDepth, -avgHeight) * 0.96;

                tiles.push({ p1, p2, p3, p4, avgDepth, color, alpha });
            }
        }

        tiles.sort((a, b) => b.avgDepth - a.avgDepth);

        for (const tile of tiles) {
            ctx.fillStyle = rgba(tile.color, tile.alpha);
            ctx.beginPath();
            ctx.moveTo(tile.p1.x, tile.p1.y);
            ctx.lineTo(tile.p2.x, tile.p2.y);
            ctx.lineTo(tile.p3.x, tile.p3.y);
            ctx.lineTo(tile.p4.x, tile.p4.y);
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = rgba(scaleColor(tile.color, 1.08), tile.alpha * 0.14);
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }

    function drawRock(rock) {
        const base = projectPoint(rock.x, rock.y, rock.z);
        const top = projectPoint(rock.x, rock.y + rock.height, rock.z);
        if (!base || !top) {
            return;
        }
        const distance = Math.hypot(rock.x - player.x, rock.y - player.y, rock.z - player.z);
        const visibility = visibilityFor(distance, -rock.y);
        const height = Math.max(12, Math.abs(top.y - base.y));
        const width = height * rock.width;
        const bodyColor = mixColor([24, 54, 64], [44, 88, 102], rock.highlight * 0.5);

        ctx.save();
        ctx.translate(base.x, base.y);
        ctx.globalAlpha = visibility;

        ctx.fillStyle = rgba(bodyColor, 0.98);
        ctx.beginPath();
        ctx.moveTo(-width * 0.55, 0);
        ctx.bezierCurveTo(-width * 0.68, -height * 0.28, -width * 0.34, -height * 0.95, 0, -height);
        ctx.bezierCurveTo(width * 0.3, -height * 0.92, width * 0.7, -height * 0.38, width * 0.56, 0);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = rgba([114, 167, 173], 0.14);
        ctx.beginPath();
        ctx.ellipse(-width * 0.08, -height * 0.48, width * 0.18, height * 0.2, -0.4, 0, TWO_PI);
        ctx.fill();
        ctx.restore();
    }

    function drawCoral(coral, time, colorBias) {
        const base = projectPoint(coral.x, coral.y, coral.z);
        const top = projectPoint(coral.x, coral.y + coral.height, coral.z);
        if (!base || !top) {
            return;
        }

        const biome = biomeAt(coral.x, coral.z, coral.y);
        const visibility = visibilityFor(base.depth, -coral.y);
        const height = Math.max(10, Math.abs(top.y - base.y));
        const width = height * coral.width * 0.34;
        const sway = Math.sin(time * 1.4 + coral.phase) * width * 0.45;
        const accent = colorBias || biome.palette.accent;
        const branchColor = mixColor(accent, [239, 222, 180], 0.22);

        ctx.save();
        ctx.translate(base.x, base.y);
        ctx.globalAlpha = visibility;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        if (coral.shape === 0) {
            ctx.strokeStyle = rgba(branchColor, 0.88);
            ctx.lineWidth = Math.max(1.2, width * 0.18);
            for (let i = 0; i < 5; i += 1) {
                const spread = lerp(-width, width, i / 4);
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.quadraticCurveTo(spread * 0.3, -height * 0.44, spread + sway * 0.2, -height);
                ctx.stroke();
            }
        } else if (coral.shape === 1) {
            ctx.fillStyle = rgba(branchColor, 0.8);
            ctx.beginPath();
            ctx.moveTo(-width * 0.9, -height * 0.18);
            ctx.quadraticCurveTo(0, -height * 1.05, width * 0.9, -height * 0.28);
            ctx.quadraticCurveTo(0, -height * 0.7, -width * 0.9, -height * 0.18);
            ctx.fill();
        } else {
            ctx.strokeStyle = rgba(branchColor, 0.84);
            ctx.lineWidth = Math.max(1, width * 0.16);
            for (let i = 0; i < 7; i += 1) {
                const spread = lerp(-width * 0.8, width * 0.8, i / 6);
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(spread * 0.3, -height * 0.35);
                ctx.lineTo(spread + sway * 0.18, -height * 0.78);
                ctx.stroke();
            }
        }

        ctx.fillStyle = rgba(scaleColor(accent, 1.14), 0.88);
        for (let i = 0; i < 7; i += 1) {
            const px = lerp(-width * 0.88, width * 0.88, i / 6) + Math.sin(i + coral.phase + time) * width * 0.08;
            const py = -height * (0.55 + (i % 2) * 0.18);
            ctx.beginPath();
            ctx.arc(px, py, Math.max(1.2, width * 0.08), 0, TWO_PI);
            ctx.fill();
        }

        ctx.restore();
    }

    function drawKelp(kelp, time, tint) {
        const base = projectPoint(kelp.x, kelp.y, kelp.z);
        const top = projectPoint(kelp.x, kelp.y + kelp.height, kelp.z);
        if (!base || !top) {
            return;
        }

        const visibility = visibilityFor(base.depth, -kelp.y);
        const height = Math.max(18, Math.abs(top.y - base.y));
        const width = height * 0.15 * kelp.width;
        const bladeColor = tint || [114, 213, 156];

        ctx.save();
        ctx.translate(base.x, base.y);
        ctx.globalAlpha = visibility;
        ctx.lineCap = "round";

        for (let strand = 0; strand < 4; strand += 1) {
            const spread = (strand - 1.5) * width * 0.34;
            const sway = Math.sin(time * 1.4 + kelp.sway + strand) * width * 1.3;
            ctx.strokeStyle = rgba(scaleColor(bladeColor, 0.78 + strand * 0.08), 0.82);
            ctx.lineWidth = Math.max(1.2, width * 0.22 - strand * 0.18);
            ctx.beginPath();
            ctx.moveTo(spread, 0);
            ctx.bezierCurveTo(spread - sway * 0.18, -height * 0.25, sway * 0.5, -height * 0.62, sway, -height);
            ctx.stroke();

            for (let leaf = 0; leaf < 5; leaf += 1) {
                const leafY = -height * (0.18 + leaf * 0.16);
                const leafX = spread + Math.sin(time * 1.8 + kelp.sway + leaf + strand) * width * 0.16;
                const leafSize = width * (0.6 - leaf * 0.08);
                ctx.strokeStyle = rgba(scaleColor(bladeColor, 0.94), 0.52);
                ctx.lineWidth = Math.max(1, width * 0.08);
                ctx.beginPath();
                ctx.moveTo(leafX, leafY);
                ctx.lineTo(leafX + leafSize, leafY - leafSize * 0.2);
                ctx.stroke();
            }
        }

        ctx.fillStyle = rgba(scaleColor(bladeColor, 1.16), 0.58);
        ctx.beginPath();
        ctx.arc(width * 0.18, -height * 0.82, Math.max(1.4, width * 0.16), 0, TWO_PI);
        ctx.fill();
        ctx.restore();
    }

    function drawSchool(school, time, emphasized) {
        for (let i = 0; i < school.count; i += 1) {
            const angle = time * school.speed + school.phase + i * 0.51;
            const orbit = school.radius * (0.65 + (i % 5) * 0.08);
            const x = school.x + Math.cos(angle) * orbit;
            const y = school.y + Math.sin(angle * 1.7) * 1.8;
            const z = school.z + Math.sin(angle * 1.15) * orbit * 0.9;
            const point = projectPoint(x, y, z);
            if (!point) {
                continue;
            }

            const visibility = visibilityFor(point.depth, -y) * (emphasized ? 1 : 0.75);
            const size = clamp(point.scale * (school.size * 16), 1.8, emphasized ? 16 : 11);
            const screenAngle = Math.sin(angle * 0.8) * 0.5;

            ctx.save();
            ctx.translate(point.x, point.y);
            ctx.rotate(screenAngle);
            ctx.globalAlpha = visibility;
            ctx.fillStyle = rgba(emphasized ? [200, 250, 255] : school.tint, 0.92);
            ctx.beginPath();
            ctx.ellipse(0, 0, size, size * 0.46, 0, 0, TWO_PI);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(-size, 0);
            ctx.lineTo(-size * 1.6, -size * 0.5);
            ctx.lineTo(-size * 1.6, size * 0.5);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
    }

    function drawRay(target, pose, time, highlight) {
        const center = projectPoint(pose.x, pose.y, pose.z);
        const top = projectPoint(pose.x, pose.y + 3.3, pose.z);
        if (!center || !top) {
            return;
        }
        const size = Math.max(18, Math.abs(top.y - center.y) * 4.2);
        const visibility = visibilityFor(center.depth, -pose.y);
        const wingFlap = Math.sin(time * 3.3) * size * 0.18;

        ctx.save();
        ctx.translate(center.x, center.y);
        ctx.globalAlpha = visibility;
        ctx.fillStyle = rgba(highlight ? [180, 252, 255] : [123, 208, 220], 0.78);
        ctx.beginPath();
        ctx.moveTo(-size * 1.15, 0);
        ctx.quadraticCurveTo(-size * 0.42, -size * 0.7 - wingFlap, 0, -size * 0.08);
        ctx.quadraticCurveTo(size * 0.42, -size * 0.7 + wingFlap, size * 1.15, 0);
        ctx.quadraticCurveTo(size * 0.4, size * 0.38, 0, size * 0.1);
        ctx.quadraticCurveTo(-size * 0.4, size * 0.38, -size * 1.15, 0);
        ctx.fill();

        ctx.strokeStyle = rgba(highlight ? target.glow : [88, 172, 186], 0.9);
        ctx.lineWidth = Math.max(1.2, size * 0.08);
        ctx.beginPath();
        ctx.moveTo(0, size * 0.08);
        ctx.lineTo(0, size * 0.9);
        ctx.stroke();
        ctx.restore();
    }

    function drawEel(target, pose, time, highlight) {
        const segments = [];
        for (let i = 0; i < 8; i += 1) {
            const offset = i * 1.4;
            const segment = projectPoint(
                pose.x - i * 1.2 + Math.sin(time * 3 + i * 0.6) * 0.6,
                pose.y + Math.sin(time * 4 + i * 0.4) * 0.4,
                pose.z - offset + Math.cos(time * 2.7 + i * 0.3) * 0.7
            );
            if (segment) {
                segments.push(segment);
            }
        }
        if (segments.length < 4) {
            return;
        }

        ctx.save();
        ctx.globalAlpha = visibilityFor(segments[0].depth, -pose.y);
        ctx.strokeStyle = rgba(highlight ? [188, 239, 255] : target.glow, 0.9);
        ctx.lineWidth = Math.max(1.6, segments[0].scale * 8);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(segments[0].x, segments[0].y);
        for (let i = 1; i < segments.length; i += 1) {
            ctx.lineTo(segments[i].x, segments[i].y);
        }
        ctx.stroke();

        ctx.fillStyle = rgba([240, 252, 255], 0.82);
        ctx.beginPath();
        ctx.arc(segments[0].x, segments[0].y, Math.max(2, segments[0].scale * 4), 0, TWO_PI);
        ctx.fill();
        ctx.restore();
    }

    function drawArtifact(target, pose, highlight) {
        const base = projectPoint(pose.x, pose.y, pose.z);
        const top = projectPoint(pose.x, pose.y + (target.size || 4.2), pose.z);
        if (!base || !top) {
            return;
        }
        const size = Math.max(10, Math.abs(top.y - base.y) * 0.8);
        const visibility = visibilityFor(base.depth, -pose.y);

        ctx.save();
        ctx.translate(base.x, base.y - size * 0.5);
        ctx.globalAlpha = visibility;
        ctx.strokeStyle = rgba(highlight ? [220, 255, 255] : target.glow, 0.95);
        ctx.fillStyle = rgba([20, 60, 82], 0.56);
        ctx.lineWidth = Math.max(1.3, size * 0.08);
        ctx.beginPath();
        for (let i = 0; i < 6; i += 1) {
            const angle = Math.PI / 6 + i * (TWO_PI / 6);
            const px = Math.cos(angle) * size;
            const py = Math.sin(angle) * size;
            if (i === 0) {
                ctx.moveTo(px, py);
            } else {
                ctx.lineTo(px, py);
            }
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, Math.max(2, size * 0.28), 0, TWO_PI);
        ctx.fillStyle = rgba(target.glow, 0.88);
        ctx.fill();
        ctx.restore();
    }

    function drawScannables(time) {
        for (const target of world.scannables) {
            const pose = scannablePose(target, time);
            const highlight = state.currentTarget && state.currentTarget.target.id === target.id;

            if (target.subtype === "ray") {
                drawRay(target, pose, time, highlight);
            } else if (target.subtype === "eel") {
                drawEel(target, pose, time, highlight);
            } else if (target.subtype === "cluster") {
                drawSchool({
                    x: pose.x,
                    y: pose.y,
                    z: pose.z,
                    radius: 3.4,
                    count: 14,
                    speed: 1.1,
                    phase: time * 0.4,
                    tint: [168, 234, 255],
                    size: 0.9,
                }, time, true);
            } else if (target.subtype === "kelp") {
                drawKelp({
                    x: pose.x,
                    y: pose.y,
                    z: pose.z,
                    height: target.height,
                    sway: 0.4,
                    width: 1.3,
                }, time, target.glow);
            } else if (target.subtype === "coral") {
                drawCoral({
                    x: pose.x,
                    y: pose.y,
                    z: pose.z,
                    height: target.height,
                    width: 1.4,
                    phase: 0.9,
                    shape: 0,
                }, time, target.glow);
            } else {
                drawArtifact(target, pose, highlight);
            }
        }
    }

    function drawWorldObjects(time) {
        const items = [];

        for (const rock of world.rocks) {
            const dx = rock.x - player.x;
            const dz = rock.z - player.z;
            const planar = Math.hypot(dx, dz);
            if (planar < 175) {
                items.push({ depth: planar, type: "rock", data: rock });
            }
        }

        for (const coral of world.corals) {
            const dx = coral.x - player.x;
            const dz = coral.z - player.z;
            const planar = Math.hypot(dx, dz);
            if (planar < 160) {
                items.push({ depth: planar, type: "coral", data: coral });
            }
        }

        for (const kelp of world.kelps) {
            const dx = kelp.x - player.x;
            const dz = kelp.z - player.z;
            const planar = Math.hypot(dx, dz);
            if (planar < 170) {
                items.push({ depth: planar, type: "kelp", data: kelp });
            }
        }

        for (const school of world.schools) {
            const dx = school.x - player.x;
            const dz = school.z - player.z;
            const planar = Math.hypot(dx, dz);
            if (planar < 150) {
                items.push({ depth: planar, type: "school", data: school });
            }
        }

        items.sort((a, b) => b.depth - a.depth);

        for (const item of items) {
            if (item.type === "rock") {
                drawRock(item.data);
            } else if (item.type === "coral") {
                drawCoral(item.data, state.floorShimmer);
            } else if (item.type === "kelp") {
                drawKelp(item.data, state.floorShimmer);
            } else if (item.type === "school") {
                drawSchool(item.data, state.floorShimmer, false);
            }
        }

        drawScannables(state.floorShimmer);
    }

    function drawTargetMarker() {
        if (!state.currentTarget) {
            return;
        }
        const target = state.currentTarget.target;
        const pose = state.currentTarget.pose;
        const marker = projectPoint(pose.x, pose.y + (target.height ? target.height * 0.5 : 1.6), pose.z);
        if (!marker) {
            return;
        }

        const pulse = 18 + Math.sin(state.floorShimmer * 4.2) * 4;
        ctx.save();
        ctx.strokeStyle = rgba(state.discoveredIds.has(target.id) ? [170, 255, 198] : target.glow, 0.85);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(marker.x, marker.y, pulse, 0, TWO_PI);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(marker.x, marker.y, pulse + 8, 0, TWO_PI);
        ctx.globalAlpha = 0.24;
        ctx.stroke();
        ctx.restore();
    }

    function drawSuspendedParticles(time) {
        for (const mote of screenParticles) {
            const driftX = Math.sin(time * mote.speed + mote.phase) * mote.range;
            const driftY = Math.cos(time * (mote.speed * 0.7) + mote.phase) * mote.range * 0.45;
            const x = (mote.x * canvas.width + driftX + canvas.width) % canvas.width;
            const y = (mote.y * canvas.height + driftY + canvas.height) % canvas.height;
            ctx.fillStyle = "rgba(220, 250, 255, " + mote.alpha + ")";
            ctx.beginPath();
            ctx.arc(x, y, mote.size, 0, TWO_PI);
            ctx.fill();
        }
    }

    function drawScannerTool(time) {
        const swayX = Math.sin(time * 2.2 + (Math.abs(player.vx) + Math.abs(player.vz)) * 0.1) * 10;
        const swayY = Math.cos(time * 3.1) * 8;
        const originX = canvas.width - 180 + swayX;
        const originY = canvas.height - 98 + swayY;

        ctx.save();
        ctx.translate(originX, originY);
        ctx.rotate(-0.25);

        ctx.fillStyle = "rgba(10, 18, 24, 0.55)";
        roundedRectPath(-90, -28, 116, 54, 22);
        ctx.fill();

        ctx.fillStyle = "rgba(215, 237, 245, 0.92)";
        roundedRectPath(-84, -36, 110, 52, 16);
        ctx.fill();

        ctx.fillStyle = "rgba(43, 61, 72, 0.95)";
        roundedRectPath(-48, -12, 34, 72, 14);
        ctx.fill();

        ctx.fillStyle = "rgba(15, 26, 34, 0.95)";
        roundedRectPath(-80, -22, 54, 25, 10);
        ctx.fill();

        ctx.fillStyle = "rgba(96, 248, 255, 0.85)";
        roundedRectPath(2, -24, 26, 26, 11);
        ctx.fill();

        ctx.strokeStyle = "rgba(10, 42, 54, 0.8)";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(15, -11, 11, 0, TWO_PI);
        ctx.stroke();

        ctx.strokeStyle = "rgba(0, 0, 0, 0.18)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-44, 18);
        ctx.lineTo(-18, 56);
        ctx.stroke();
        ctx.restore();
    }

    function drawVignette() {
        const vignette = ctx.createRadialGradient(
            canvas.width * 0.5,
            canvas.height * 0.46,
            Math.min(canvas.width, canvas.height) * 0.1,
            canvas.width * 0.5,
            canvas.height * 0.5,
            Math.max(canvas.width, canvas.height) * 0.72
        );
        vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
        vignette.addColorStop(1, "rgba(0, 14, 21, 0.42)");
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (player.oxygen < 24) {
            ctx.fillStyle = "rgba(255, 55, 84, " + ((24 - player.oxygen) / 24) * 0.12 + ")";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
    }

    function updateHud() {
        const depth = Math.max(0, Math.round(-player.y));
        const biome = biomeAt(player.x, player.z);
        ui.depthValue.textContent = depth + " m";
        ui.biomeValue.textContent = biome.name;
        ui.oxygenValue.textContent = Math.round(player.oxygen) + "%";
        ui.energyValue.textContent = Math.round(player.energy) + "%";
        ui.scanProgressFill.style.width = (state.scanProgress * 100).toFixed(1) + "%";

        if (!state.currentTarget) {
            ui.scanTargetName.textContent = "No target locked";
            ui.scanTargetDesc.textContent = "Sweep the reef for life signs and hold E to scan.";
            ui.scanHint.textContent = "WASD to swim, Space/C to ascend or dive, Shift to boost";
            return;
        }

        const target = state.currentTarget.target;
        const discovered = state.discoveredIds.has(target.id);
        ui.scanTargetName.textContent = target.name + (discovered ? " / catalogued" : "");
        ui.scanTargetDesc.textContent = target.description;
        ui.scanHint.textContent = discovered
            ? "Already logged. Keep exploring for more signatures."
            : "Hold E to scan while the reticle stays on target.";
    }

    function update(dt, time) {
        state.floorShimmer = time;
        state.notifications = state.notifications.filter((item) => {
            item.ttl -= dt;
            return item.ttl > 0;
        });
        renderToasts();

        if (state.started) {
            updatePlayer(dt);
            syncCamera();
            updateScanning(dt, time);
        } else {
            syncCamera();
        }

        updateHud();
    }

    function render(time) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawBackground(time);
        drawFloor(time);
        drawWorldObjects(time);
        drawTargetMarker();
        drawSuspendedParticles(time);
        drawScannerTool(time);
        drawVignette();
    }

    function animate(timestamp) {
        const time = timestamp * 0.001;
        const dt = Math.min(0.033, time - state.lastTime || 0.016);
        state.lastTime = time;

        update(dt, time);
        render(time);
        requestAnimationFrame(animate);
    }

    function preventMovementScroll(event) {
        if ([" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
            event.preventDefault();
        }
    }

    ui.diveButton.addEventListener("click", requestDive);
    canvas.addEventListener("click", () => {
        if (!state.started) {
            requestDive();
            return;
        }
        if (!state.pointerLocked && canvas.requestPointerLock) {
            canvas.requestPointerLock();
        }
    });

    document.addEventListener("pointerlockchange", () => {
        state.pointerLocked = document.pointerLockElement === canvas;
        if (state.started && !state.pointerLocked) {
            ui.introOverlay.classList.add("visible");
        } else if (state.started && state.pointerLocked) {
            ui.introOverlay.classList.remove("visible");
        }
    });

    document.addEventListener("mousemove", (event) => {
        if (!state.pointerLocked) {
            return;
        }
        state.mouseDX += event.movementX;
        state.mouseDY += event.movementY;
    });

    window.addEventListener("keydown", (event) => {
        preventMovementScroll(event);
        const key = event.key.toLowerCase();
        state.keys[key] = true;
        if (!state.started && (key === "enter" || key === " ")) {
            requestDive();
        }
    });

    window.addEventListener("keyup", (event) => {
        const key = event.key.toLowerCase();
        state.keys[key] = false;
    });

    window.addEventListener("blur", () => {
        state.keys = Object.create(null);
    });

    window.addEventListener("resize", resize);

    function seedOverlays() {
        const rng = mulberry32(17);
        for (let i = 0; i < 120; i += 1) {
            screenParticles.push({
                x: rng(),
                y: rng(),
                size: 0.6 + rng() * 2.1,
                alpha: 0.05 + rng() * 0.14,
                speed: 0.12 + rng() * 0.3,
                range: 16 + rng() * 28,
                phase: rng() * TWO_PI,
            });
        }
        for (let i = 0; i < 8; i += 1) {
            backgroundRays.push({
                x: rng() * canvas.width,
                width: 110 + rng() * 170,
                speed: 0.05 + rng() * 0.08,
                phase: rng() * TWO_PI,
            });
        }
    }

    resize();
    seedOverlays();
    renderCodex();
    syncCamera();
    requestAnimationFrame(animate);
})();
