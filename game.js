(() => {
    const canvas = document.getElementById("game");
    const ctx = canvas.getContext("2d");
    const overlay = document.getElementById("overlay");
    const startButton = document.getElementById("startButton");
    const reticle = document.getElementById("reticle");

    const ui = {
        objectiveTitle: document.getElementById("objectiveTitle"),
        objectiveSubtitle: document.getElementById("objectiveSubtitle"),
        depthValue: document.getElementById("depthValue"),
        biomeValue: document.getElementById("biomeValue"),
        timerValue: document.getElementById("timerValue"),
        oxygenValue: document.getElementById("oxygenValue"),
        oxygenFill: document.getElementById("oxygenFill"),
        healthValue: document.getElementById("healthValue"),
        healthFill: document.getElementById("healthFill"),
        powerValue: document.getElementById("powerValue"),
        powerFill: document.getElementById("powerFill"),
        feed: document.getElementById("feed"),
        scanPanel: document.getElementById("scanPanel"),
        scanTargetLabel: document.getElementById("scanTargetLabel"),
        scanFill: document.getElementById("scanFill"),
        scanDetail: document.getElementById("scanDetail"),
        scanCountValue: document.getElementById("scanCountValue"),
        sonarValue: document.getElementById("sonarValue"),
        refillValue: document.getElementById("refillValue"),
        threatValue: document.getElementById("threatValue"),
        missionBanner: document.getElementById("missionBanner"),
        missionTitle: document.getElementById("missionTitle"),
        missionCopy: document.getElementById("missionCopy")
    };

    const TAU = Math.PI * 2;
    const WORLD = {
        width: 5400,
        height: 3200,
        surface: 180
    };

    const viewport = {
        width: window.innerWidth,
        height: window.innerHeight,
        dpr: Math.min(window.devicePixelRatio || 1, 2)
    };

    const state = {
        started: false,
        won: false,
        lost: false,
        time: 0,
        sessionTime: 0,
        lastFrame: 0,
        camera: { x: 0, y: 0 },
        mouse: {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
            down: false
        },
        keys: {},
        rings: [],
        particles: [],
        plankton: [],
        feed: [],
        feedDirty: false,
        sonarCooldown: 0,
        scanTarget: null,
        scanLocked: false,
        lowOxygenWarning: false
    };

    let world = createWorld();
    let player = createPlayer(world.pod);

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function lerp(start, end, alpha) {
        return start + (end - start) * alpha;
    }

    function randomRange(rng, min, max) {
        return min + rng() * (max - min);
    }

    function createRng(seed) {
        let value = seed >>> 0;
        return () => {
            value = (value * 1664525 + 1013904223) >>> 0;
            return value / 4294967296;
        };
    }

    function distance(a, b) {
        return Math.hypot(a.x - b.x, a.y - b.y);
    }

    function angleTo(a, b) {
        return Math.atan2(b.y - a.y, b.x - a.x);
    }

    function formatClock(seconds) {
        const whole = Math.floor(Math.max(0, seconds));
        const minutes = String(Math.floor(whole / 60)).padStart(2, "0");
        const remainder = String(whole % 60).padStart(2, "0");
        return minutes + ":" + remainder;
    }

    function getDepthMeters() {
        return Math.max(0, Math.round((player.y - WORLD.surface) * 0.24));
    }

    function getBiome(y) {
        if (y < 1100) {
            return { name: "Sunlit Shelf", tint: "#7ff7ff" };
        }
        if (y < 1800) {
            return { name: "Kelp Expanse", tint: "#8cffc7" };
        }
        if (y < 2450) {
            return { name: "Twilight Garden", tint: "#95c4ff" };
        }
        return { name: "Abyss Edge", tint: "#ccb4ff" };
    }

    function createPlankton() {
        const rng = createRng(4040 + viewport.width + viewport.height);
        const count = clamp(Math.floor((viewport.width * viewport.height) / 9500), 70, 170);
        const motes = [];

        for (let index = 0; index < count; index += 1) {
            motes.push({
                x: randomRange(rng, 0, viewport.width),
                y: randomRange(rng, 0, viewport.height),
                size: randomRange(rng, 1, 3.6),
                speed: randomRange(rng, 8, 26),
                drift: randomRange(rng, 6, 20),
                phase: randomRange(rng, 0, TAU),
                alpha: randomRange(rng, 0.08, 0.28)
            });
        }

        return motes;
    }

    function buildReef(rng, x, y, scale, hue) {
        const lobes = [];
        const lobeCount = 4 + Math.floor(rng() * 4);

        for (let index = 0; index < lobeCount; index += 1) {
            lobes.push({
                ox: randomRange(rng, -scale * 0.55, scale * 0.55),
                oy: randomRange(rng, -scale * 0.4, scale * 0.4),
                rx: randomRange(rng, scale * 0.22, scale * 0.58),
                ry: randomRange(rng, scale * 0.16, scale * 0.46),
                rot: randomRange(rng, -0.8, 0.8)
            });
        }

        return {
            x,
            y,
            scale,
            hue,
            rotation: randomRange(rng, -0.5, 0.5),
            ridge: randomRange(rng, 0.18, 0.45),
            lobes
        };
    }

    function createWorld() {
        const rng = createRng(20260306);
        const pod = { x: 480, y: 760, radius: 88 };
        const reefs = [];
        const corals = [];
        const kelp = [];
        const glows = [];
        const vents = [];
        const schools = [];
        const rays = [];
        const predators = [];

        const artifacts = [
            {
                id: "shelf-fragment",
                name: "Shelf Fragment",
                note: "A shallow alien relay fused into bright coral.",
                x: 1180,
                y: 980,
                hue: 172,
                progress: 0,
                scanned: false,
                orbit: 0.8
            },
            {
                id: "kelp-lens",
                name: "Kelp Lens",
                note: "A refractive lens cluster buried in swaying kelp.",
                x: 2470,
                y: 1460,
                hue: 153,
                progress: 0,
                scanned: false,
                orbit: 1.9
            },
            {
                id: "twilight-spindle",
                name: "Twilight Spindle",
                note: "A resonant spindle emitting blue pulse harmonics.",
                x: 3620,
                y: 2140,
                hue: 206,
                progress: 0,
                scanned: false,
                orbit: 2.6
            },
            {
                id: "abyss-core",
                name: "Abyss Core",
                note: "A volatile core fragment broadcasting from the trench.",
                x: 4700,
                y: 2790,
                hue: 268,
                progress: 0,
                scanned: false,
                orbit: 3.8
            }
        ];

        const zoneSpecs = [
            { count: 18, yMin: 650, yMax: 1400, sMin: 120, sMax: 260, hueMin: 166, hueMax: 196 },
            { count: 16, yMin: 1200, yMax: 2200, sMin: 140, sMax: 300, hueMin: 178, hueMax: 214 },
            { count: 12, yMin: 2000, yMax: 3000, sMin: 180, sMax: 340, hueMin: 210, hueMax: 252 }
        ];

        zoneSpecs.forEach((spec) => {
            for (let index = 0; index < spec.count; index += 1) {
                reefs.push(
                    buildReef(
                        rng,
                        randomRange(rng, 160, WORLD.width - 160),
                        randomRange(rng, spec.yMin, spec.yMax),
                        randomRange(rng, spec.sMin, spec.sMax),
                        randomRange(rng, spec.hueMin, spec.hueMax)
                    )
                );
            }
        });

        reefs.push(buildReef(rng, pod.x + 170, pod.y + 170, 240, 184));
        reefs.push(buildReef(rng, 1100, 1020, 250, 178));
        reefs.push(buildReef(rng, 2360, 1520, 320, 188));
        reefs.push(buildReef(rng, 3610, 2140, 340, 214));
        reefs.push(buildReef(rng, 4660, 2810, 400, 246));

        for (let index = 0; index < 140; index += 1) {
            const anchor = reefs[Math.floor(rng() * reefs.length)];
            const angle = rng() * TAU;
            const radius = randomRange(rng, anchor.scale * 0.12, anchor.scale * 0.58);

            corals.push({
                x: anchor.x + Math.cos(angle) * radius,
                y: anchor.y + Math.sin(angle) * radius,
                size: randomRange(rng, 18, 42),
                hue: anchor.y > 2200 ? randomRange(rng, 180, 285) : randomRange(rng, 15, 210),
                kind: ["branch", "fan", "tube"][Math.floor(rng() * 3)],
                phase: rng() * TAU,
                glow: randomRange(rng, 0.2, 0.9)
            });
        }

        for (let index = 0; index < 86; index += 1) {
            kelp.push({
                x: randomRange(rng, 760, 3380),
                y: randomRange(rng, 860, 1820),
                height: randomRange(rng, 90, 220),
                lean: randomRange(rng, -30, 30),
                blades: 3 + Math.floor(rng() * 3),
                phase: rng() * TAU
            });
        }

        for (let index = 0; index < 64; index += 1) {
            glows.push({
                x: randomRange(rng, 900, WORLD.width - 260),
                y: randomRange(rng, 1650, WORLD.height - 180),
                size: randomRange(rng, 8, 22),
                hue: randomRange(rng, 170, 280),
                alpha: randomRange(rng, 0.1, 0.28),
                phase: rng() * TAU
            });
        }

        [
            { x: 700, y: 930, radius: 105, intensity: 1.1 },
            { x: 1880, y: 1350, radius: 100, intensity: 1.2 },
            { x: 2850, y: 1710, radius: 100, intensity: 1.2 },
            { x: 3430, y: 2240, radius: 120, intensity: 1.35 },
            { x: 4240, y: 2480, radius: 110, intensity: 1.45 },
            { x: 4860, y: 2870, radius: 130, intensity: 1.55 }
        ].forEach((vent) => {
            vents.push({
                ...vent,
                timer: randomRange(rng, 0, 0.18),
                phase: rng() * TAU
            });
        });

        for (let index = 0; index < 18; index += 1) {
            const y = randomRange(rng, 780, 2850);
            schools.push({
                x: randomRange(rng, -200, WORLD.width + 200),
                y,
                baseY: y,
                count: 8 + Math.floor(rng() * 11),
                span: randomRange(rng, 80, 200),
                speed: randomRange(rng, 22, 58),
                dir: rng() > 0.5 ? 1 : -1,
                phase: rng() * TAU,
                hue: y < 1600 ? randomRange(rng, 170, 210) : randomRange(rng, 185, 270)
            });
        }

        for (let index = 0; index < 5; index += 1) {
            const y = randomRange(rng, 980, 2860);
            rays.push({
                x: randomRange(rng, -400, WORLD.width + 400),
                y,
                baseY: y,
                span: randomRange(rng, 120, 220),
                speed: randomRange(rng, 16, 24),
                dir: rng() > 0.5 ? 1 : -1,
                phase: rng() * TAU
            });
        }

        [
            {
                name: "Reef Stalker",
                x: 2870,
                y: 1620,
                radius: 38,
                speed: 142,
                noticeRadius: 320,
                hue: 188,
                patrol: [
                    { x: 2670, y: 1470 },
                    { x: 3040, y: 1670 },
                    { x: 2840, y: 1860 }
                ]
            },
            {
                name: "Shade Prowler",
                x: 3690,
                y: 2210,
                radius: 42,
                speed: 156,
                noticeRadius: 360,
                hue: 216,
                patrol: [
                    { x: 3480, y: 2040 },
                    { x: 3900, y: 2250 },
                    { x: 3590, y: 2400 }
                ]
            },
            {
                name: "Abyss Hunter",
                x: 4740,
                y: 2780,
                radius: 52,
                speed: 176,
                noticeRadius: 430,
                hue: 265,
                patrol: [
                    { x: 4500, y: 2650 },
                    { x: 4950, y: 2820 },
                    { x: 4630, y: 3000 }
                ]
            }
        ].forEach((predator) => {
            predators.push({
                ...predator,
                vx: 0,
                vy: 0,
                angle: -0.2,
                chase: 0,
                attackCooldown: 0,
                patrolIndex: 0,
                phase: rng() * TAU
            });
        });

        return {
            pod,
            artifacts,
            reefs,
            corals,
            kelp,
            glows,
            vents,
            schools,
            rays,
            predators
        };
    }

    function createPlayer(pod) {
        return {
            x: pod.x + 110,
            y: pod.y + 30,
            vx: 0,
            vy: 0,
            angle: 0,
            radius: 19,
            oxygen: 100,
            health: 100,
            power: 100,
            hitFlash: 0,
            bubbleTimer: 0,
            dockTimer: 0
        };
    }

    function isOnScreen(x, y, padding = 0) {
        return (
            x >= state.camera.x - padding &&
            x <= state.camera.x + viewport.width + padding &&
            y >= state.camera.y - padding &&
            y <= state.camera.y + viewport.height + padding
        );
    }

    function pushFeed(text, tone = "neutral") {
        state.feed.unshift({ text, tone, ttl: 5.5 });
        state.feed = state.feed.slice(0, 6);
        state.feedDirty = true;
    }

    function renderFeed() {
        if (!state.feed.length) {
            ui.feed.innerHTML = '<div class="feed-entry">Awaiting dive telemetry.</div>';
            return;
        }

        ui.feed.innerHTML = state.feed
            .map((entry) => '<div class="feed-entry ' + entry.tone + '">' + entry.text + "</div>")
            .join("");
    }

    function updateFeed(dt) {
        let removed = false;
        state.feed = state.feed.filter((entry) => {
            entry.ttl -= dt;
            const keep = entry.ttl > 0;
            if (!keep) {
                removed = true;
            }
            return keep;
        });

        if (removed || state.feedDirty) {
            renderFeed();
            state.feedDirty = false;
        }
    }

    function emitBubble(x, y, spread, color, scale = 1) {
        const angle = Math.random() * TAU;
        state.particles.push({
            kind: "bubble",
            x: x + Math.cos(angle) * Math.random() * spread,
            y: y + Math.sin(angle) * Math.random() * spread * 0.35,
            vx: Math.cos(angle) * Math.random() * 10,
            vy: -randomRange(Math.random, 26, 62),
            size: randomRange(Math.random, 2.6, 7.5) * scale,
            ttl: randomRange(Math.random, 1.6, 3.4),
            drift: randomRange(Math.random, 10, 30),
            phase: Math.random() * TAU,
            color
        });
    }

    function startDive() {
        state.started = true;
        state.won = false;
        state.lost = false;
        state.sessionTime = 0;
        state.sonarCooldown = 0;
        state.scanTarget = null;
        state.scanLocked = false;
        state.lowOxygenWarning = false;
        state.rings = [];
        state.particles = [];
        state.feed = [];
        state.feedDirty = true;
        world = createWorld();
        player = createPlayer(world.pod);
        state.camera.x = clamp(player.x - viewport.width / 2, 0, Math.max(0, WORLD.width - viewport.width));
        state.camera.y = clamp(player.y - viewport.height / 2, 0, Math.max(0, WORLD.height - viewport.height));
        state.mouse.down = false;

        overlay.classList.add("hidden");
        ui.missionBanner.classList.add("hidden");
        ui.missionTitle.textContent = "";
        ui.missionCopy.textContent = "";

        for (let index = 0; index < 18; index += 1) {
            emitBubble(world.pod.x, world.pod.y + 16, 30, "rgba(145, 238, 255, 0.45)", 1.15);
        }

        pushFeed("Lifepod systems online. Water clarity is optimal.", "good");
        pushFeed("Primary directive: scan all four fragments and return to base.", "warn");
        pushFeed("Bubble vents and the lifepod restore oxygen reserves.", "neutral");
        updateHud();
        renderFeed();
    }

    function endDive(title, copy, won) {
        if (state.won || state.lost) {
            return;
        }

        state.won = won;
        state.lost = !won;
        ui.missionTitle.textContent = title;
        ui.missionCopy.textContent = copy;
        ui.missionBanner.classList.remove("hidden");
        pushFeed(copy, won ? "good" : "danger");
    }

    function getNearestRefillSource() {
        if (distance(player, world.pod) < world.pod.radius + 26) {
            return { label: "Lifepod", strength: 1.4 };
        }

        for (const vent of world.vents) {
            if (distance(player, vent) < vent.radius) {
                return { label: "Vent", strength: vent.intensity };
            }
        }

        return null;
    }

    function getNearestThreatDistance() {
        let nearest = Infinity;
        for (const predator of world.predators) {
            nearest = Math.min(nearest, distance(predator, player));
        }
        return nearest;
    }

    function getScanTarget() {
        const mouseWorld = {
            x: state.mouse.x + state.camera.x,
            y: state.mouse.y + state.camera.y
        };

        let bestTarget = null;
        let bestScore = Infinity;

        for (const artifact of world.artifacts) {
            if (artifact.scanned) {
                continue;
            }

            const playerDistance = distance(player, artifact);
            const pointerDistance = Math.hypot(mouseWorld.x - artifact.x, mouseWorld.y - artifact.y);

            if (playerDistance > 230) {
                continue;
            }

            if (pointerDistance > 88 && artifact.progress <= 0) {
                continue;
            }

            const score = playerDistance * 0.55 + pointerDistance;
            if (score < bestScore) {
                bestScore = score;
                bestTarget = artifact;
            }
        }

        return bestTarget;
    }

    function triggerSonar() {
        if (!state.started || state.won || state.lost || state.sonarCooldown > 0 || player.power < 18) {
            return;
        }

        player.power = Math.max(0, player.power - 18);
        state.sonarCooldown = 6;
        state.rings.push({
            x: player.x,
            y: player.y,
            radius: 0,
            max: 860
        });
        pushFeed("Sonar pulse emitted. Reef geometry highlighted.", "neutral");
    }

    function updatePlayer(dt) {
        const inputX = (state.keys.d || state.keys.arrowright ? 1 : 0) - (state.keys.a || state.keys.arrowleft ? 1 : 0);
        const inputY = (state.keys.s || state.keys.arrowdown ? 1 : 0) - (state.keys.w || state.keys.arrowup ? 1 : 0);
        const inputLength = Math.hypot(inputX, inputY) || 1;
        const sprinting = (state.keys.shift || state.keys.Shift) && player.power > 6;
        const acceleration = sprinting ? 650 : 500;
        const maxSpeed = sprinting ? 400 : 305;

        if (inputX !== 0 || inputY !== 0) {
            player.vx += (inputX / inputLength) * acceleration * dt;
            player.vy += (inputY / inputLength) * acceleration * dt;

            if (sprinting) {
                player.power = Math.max(0, player.power - dt * 4.8);
            }

            player.bubbleTimer -= dt;
            if (player.bubbleTimer <= 0) {
                emitBubble(player.x - Math.cos(player.angle) * 10, player.y + 8, 10, "rgba(175, 241, 255, 0.42)", 0.8);
                player.bubbleTimer = sprinting ? 0.05 : 0.11;
            }
        }

        const damping = Math.exp(-dt * 2.3);
        player.vx *= damping;
        player.vy *= damping;

        const currentSpeed = Math.hypot(player.vx, player.vy);
        if (currentSpeed > maxSpeed) {
            const scale = maxSpeed / currentSpeed;
            player.vx *= scale;
            player.vy *= scale;
        }

        player.x = clamp(player.x + player.vx * dt, 110, WORLD.width - 110);
        player.y = clamp(player.y + player.vy * dt, WORLD.surface + 90, WORLD.height - 95);
        player.hitFlash = Math.max(0, player.hitFlash - dt);
        player.power = Math.min(100, player.power + dt * 4.2);
        state.sonarCooldown = Math.max(0, state.sonarCooldown - dt);

        const mouseWorldX = state.mouse.x + state.camera.x;
        const mouseWorldY = state.mouse.y + state.camera.y;
        player.angle = Math.atan2(mouseWorldY - player.y, mouseWorldX - player.x);

        const refillSource = getNearestRefillSource();
        const depthFactor = clamp((player.y - 520) / 2300, 0, 1);
        const oxygenDrain = 3.1 + depthFactor * 4.4;

        if (refillSource) {
            player.oxygen = Math.min(100, player.oxygen + dt * 30 * refillSource.strength);
            player.power = Math.min(100, player.power + dt * 8 * refillSource.strength);
            if (refillSource.label === "Lifepod") {
                player.health = Math.min(100, player.health + dt * 4);
            }
        } else {
            player.oxygen = Math.max(0, player.oxygen - dt * oxygenDrain);
        }

        if (player.oxygen <= 24 && !state.lowOxygenWarning) {
            state.lowOxygenWarning = true;
            pushFeed("Oxygen reserves critical. Find a vent or return to the pod.", "danger");
        } else if (player.oxygen > 34) {
            state.lowOxygenWarning = false;
        }

        if (player.oxygen <= 0) {
            player.health = Math.max(0, player.health - dt * 10.5);
            player.hitFlash = Math.max(player.hitFlash, 0.2);
            if (player.health <= 0) {
                endDive("Dive Failed", "Oxygen depletion overran the suit safeguards.", false);
            }
        }

        state.scanLocked = false;
        state.scanTarget = getScanTarget();

        if (state.scanTarget && state.mouse.down && player.power > 0) {
            state.scanLocked = true;
            state.scanTarget.progress = clamp(state.scanTarget.progress + dt / 3.2, 0, 1);
            player.power = Math.max(0, player.power - dt * 7.6);

            if (state.scanTarget.progress >= 1 && !state.scanTarget.scanned) {
                state.scanTarget.scanned = true;
                state.scanTarget.progress = 1;
                pushFeed("Fragment archived: " + state.scanTarget.name + ".", "good");
                for (let index = 0; index < 12; index += 1) {
                    emitBubble(state.scanTarget.x, state.scanTarget.y, 12, "rgba(137, 255, 227, 0.38)", 0.75);
                }
            }
        }

        const allScanned = world.artifacts.every((artifact) => artifact.scanned);
        if (allScanned && distance(player, world.pod) < world.pod.radius + 30) {
            player.dockTimer += dt;
            if (player.dockTimer >= 1.2) {
                endDive("Expedition Complete", "All scan data uplinked to the lifepod. Press Enter to dive again.", true);
            }
        } else {
            player.dockTimer = 0;
        }
    }

    function updatePredators(dt) {
        for (const predator of world.predators) {
            predator.attackCooldown = Math.max(0, predator.attackCooldown - dt);
            const toPlayer = distance(predator, player);

            if (!state.won && !state.lost && toPlayer < predator.noticeRadius) {
                predator.chase = 3.4;
            } else {
                predator.chase = Math.max(0, predator.chase - dt);
            }

            let target = predator.patrol[predator.patrolIndex];
            let speed = predator.speed * 0.58;

            if (predator.chase > 0 && !state.won && !state.lost) {
                target = player;
                speed = predator.speed * 1.12;
            } else if (distance(predator, target) < 44) {
                predator.patrolIndex = (predator.patrolIndex + 1) % predator.patrol.length;
                target = predator.patrol[predator.patrolIndex];
            }

            const angle = angleTo(predator, target) + Math.sin(state.time * 1.8 + predator.phase) * 0.16;
            predator.vx += Math.cos(angle) * speed * dt * 1.4;
            predator.vy += Math.sin(angle) * speed * dt * 1.4;

            const damping = Math.exp(-dt * 2.7);
            predator.vx *= damping;
            predator.vy *= damping;

            const maxSpeed = predator.chase > 0 ? predator.speed * 1.15 : predator.speed * 0.68;
            const magnitude = Math.hypot(predator.vx, predator.vy);
            if (magnitude > maxSpeed) {
                predator.vx *= maxSpeed / magnitude;
                predator.vy *= maxSpeed / magnitude;
            }

            predator.x = clamp(predator.x + predator.vx * dt, 110, WORLD.width - 110);
            predator.y = clamp(predator.y + predator.vy * dt, WORLD.surface + 120, WORLD.height - 120);
            predator.angle = magnitude > 6 ? Math.atan2(predator.vy, predator.vx) : predator.angle;

            if (!state.won && !state.lost && toPlayer < predator.radius + player.radius + 24 && predator.attackCooldown <= 0) {
                predator.attackCooldown = 1.45;
                predator.chase = 3.8;
                player.health = Math.max(0, player.health - 16);
                player.oxygen = Math.max(0, player.oxygen - 8);
                player.hitFlash = 0.6;
                player.vx += Math.cos(angleTo(predator, player)) * 180;
                player.vy += Math.sin(angleTo(predator, player)) * 180;
                pushFeed(predator.name + " slammed into the suit.", "danger");

                if (player.health <= 0) {
                    endDive("Dive Failed", "A predator cracked the outer suit plating.", false);
                }
            }
        }
    }

    function updateSchools(dt) {
        for (const school of world.schools) {
            school.x += school.speed * school.dir * dt;
            school.y = school.baseY + Math.sin(state.time * 0.5 + school.phase) * 34;

            if (school.dir > 0 && school.x > WORLD.width + 220) {
                school.x = -220;
            } else if (school.dir < 0 && school.x < -220) {
                school.x = WORLD.width + 220;
            }
        }
    }

    function updateRays(dt) {
        for (const ray of world.rays) {
            ray.x += ray.speed * ray.dir * dt;
            ray.y = ray.baseY + Math.sin(state.time * 0.32 + ray.phase) * 42;

            if (ray.dir > 0 && ray.x > WORLD.width + 320) {
                ray.x = -320;
            } else if (ray.dir < 0 && ray.x < -320) {
                ray.x = WORLD.width + 320;
            }
        }
    }

    function updateVents(dt) {
        for (const vent of world.vents) {
            vent.timer -= dt;
            if (vent.timer <= 0) {
                const burstCount = 2 + Math.floor(vent.intensity * 2);
                for (let index = 0; index < burstCount; index += 1) {
                    emitBubble(vent.x, vent.y - 8, 16, "rgba(170, 244, 255, 0.36)", 1.2);
                }
                vent.timer = randomRange(Math.random, 0.08, 0.18);
            }
        }
    }

    function updateParticles(dt) {
        state.particles = state.particles.filter((particle) => {
            particle.ttl -= dt;
            particle.x += particle.vx * dt + Math.sin(state.time * 2 + particle.phase) * particle.drift * dt;
            particle.y += particle.vy * dt;
            particle.vx *= 0.988;

            return particle.ttl > 0 && particle.y > WORLD.surface - 60;
        });
    }

    function updateRings(dt) {
        state.rings = state.rings.filter((ring) => {
            ring.radius += dt * 420;
            return ring.radius < ring.max;
        });
    }

    function updatePlankton(dt) {
        for (const mote of state.plankton) {
            mote.y += mote.speed * dt;
            mote.x += Math.sin(state.time * 0.7 + mote.phase) * mote.drift * dt;

            if (mote.y > viewport.height + 12) {
                mote.y = -12;
                mote.x = Math.random() * viewport.width;
            }

            if (mote.x < -18) {
                mote.x = viewport.width + 18;
            } else if (mote.x > viewport.width + 18) {
                mote.x = -18;
            }
        }
    }

    function updateCamera() {
        const targetX = clamp(player.x - viewport.width / 2, 0, Math.max(0, WORLD.width - viewport.width));
        const targetY = clamp(player.y - viewport.height / 2, 0, Math.max(0, WORLD.height - viewport.height));
        state.camera.x = lerp(state.camera.x, targetX, 0.08);
        state.camera.y = lerp(state.camera.y, targetY, 0.08);
    }

    function updateHud() {
        const biome = getBiome(player.y);
        const scannedCount = world.artifacts.filter((artifact) => artifact.scanned).length;
        const refillSource = getNearestRefillSource();
        const threatDistance = getNearestThreatDistance();

        ui.depthValue.textContent = getDepthMeters() + "m";
        ui.biomeValue.textContent = biome.name;
        ui.timerValue.textContent = formatClock(state.sessionTime);
        ui.oxygenValue.textContent = Math.round(player.oxygen) + "%";
        ui.healthValue.textContent = Math.round(player.health) + "%";
        ui.powerValue.textContent = Math.round(player.power) + "%";
        ui.oxygenFill.style.width = clamp(player.oxygen, 0, 100) + "%";
        ui.healthFill.style.width = clamp(player.health, 0, 100) + "%";
        ui.powerFill.style.width = clamp(player.power, 0, 100) + "%";
        ui.scanCountValue.textContent = scannedCount + " / " + world.artifacts.length;
        ui.sonarValue.textContent = state.sonarCooldown > 0 ? state.sonarCooldown.toFixed(1) + "s" : "Ready";
        ui.refillValue.textContent = refillSource ? refillSource.label : "Search";
        ui.threatValue.textContent =
            threatDistance > 760 ? "Low" : threatDistance > 420 ? "Medium" : "High";

        if (!state.started) {
            ui.objectiveTitle.textContent = "Begin the descent";
            ui.objectiveSubtitle.textContent = "Scan the reef fragments, manage oxygen, and return to the lifepod.";
        } else if (state.lost) {
            ui.objectiveTitle.textContent = "Dive lost";
            ui.objectiveSubtitle.textContent = "Press Enter to restart the expedition.";
        } else if (state.won) {
            ui.objectiveTitle.textContent = "Data uplink complete";
            ui.objectiveSubtitle.textContent = "Press Enter to launch another scan run.";
        } else if (scannedCount < world.artifacts.length) {
            if (state.scanTarget && !state.scanTarget.scanned) {
                ui.objectiveTitle.textContent = state.scanLocked ? "Scanning fragment" : "Acquire scan lock";
                ui.objectiveSubtitle.textContent =
                    state.scanTarget.note + " Hold left mouse to archive the signal.";
            } else {
                ui.objectiveTitle.textContent =
                    scannedCount === world.artifacts.length - 1 ? "Locate the final fragment" : "Scan alien fragments";
                ui.objectiveSubtitle.textContent =
                    "Sweep each biome, manage oxygen carefully, and use sonar to reveal the route ahead.";
            }
        } else {
            ui.objectiveTitle.textContent = "Return to the lifepod";
            ui.objectiveSubtitle.textContent =
                "All fragments are archived. Dock at the lifepod to complete the expedition.";
        }

        if (state.scanTarget && !state.scanTarget.scanned) {
            ui.scanPanel.classList.remove("hidden");
            ui.scanTargetLabel.textContent = state.scanTarget.name;
            ui.scanFill.style.width = state.scanTarget.progress * 100 + "%";
            ui.scanDetail.textContent = state.scanLocked
                ? "Signal stabilizing. Maintain the scan beam."
                : "Keep the reticle on target and hold left mouse.";
        } else {
            ui.scanPanel.classList.add("hidden");
        }

        reticle.classList.toggle("active", Boolean(state.scanTarget) && !state.scanLocked);
        reticle.classList.toggle("lock", Boolean(state.scanLocked));
    }

    function update(dt) {
        state.time += dt;
        updateFeed(dt);
        updatePlankton(dt);

        if (!state.started) {
            updateCamera();
            updateHud();
            return;
        }

        updateRays(dt);
        updateSchools(dt);
        updateVents(dt);
        updateParticles(dt);
        updateRings(dt);

        if (!state.won && !state.lost) {
            state.sessionTime += dt;
            updatePlayer(dt);
            updatePredators(dt);
        }

        updateCamera();
        updateHud();
    }

    function drawBackdrop() {
        const depthFactor = clamp((player.y - 420) / 2400, 0, 1);
        const gradient = ctx.createLinearGradient(0, 0, 0, viewport.height);
        gradient.addColorStop(0, "rgb(10, " + Math.round(118 - depthFactor * 42) + ", " + Math.round(144 - depthFactor * 70) + ")");
        gradient.addColorStop(0.4, "rgb(5, " + Math.round(77 - depthFactor * 22) + ", " + Math.round(104 - depthFactor * 40) + ")");
        gradient.addColorStop(1, "rgb(2, " + Math.round(22 - depthFactor * 8) + ", " + Math.round(36 - depthFactor * 16) + ")");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, viewport.width, viewport.height);

        for (let index = 0; index < 4; index += 1) {
            const x = viewport.width * (0.16 + index * 0.22) + Math.sin(state.time * 0.08 + index) * 120;
            const y = viewport.height * (0.1 + index * 0.12);
            const radius = 180 + index * 40;
            const bloom = ctx.createRadialGradient(x, y, 0, x, y, radius);
            bloom.addColorStop(0, "rgba(122, 238, 255, 0.1)");
            bloom.addColorStop(1, "rgba(122, 238, 255, 0)");
            ctx.fillStyle = bloom;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, TAU);
            ctx.fill();
        }
    }

    function drawLightShafts() {
        const shallow = 1 - clamp((player.y - 520) / 1700, 0, 1);
        if (shallow <= 0.02) {
            return;
        }

        ctx.save();
        ctx.globalCompositeOperation = "screen";

        for (let index = 0; index < 6; index += 1) {
            const width = 120 + Math.sin(state.time * 0.55 + index) * 24;
            const x = (viewport.width / 6) * index + Math.sin(state.time * 0.13 + index) * 70;
            const gradient = ctx.createLinearGradient(x, 0, x, viewport.height);
            gradient.addColorStop(0, "rgba(165, 240, 255, " + (0.08 * shallow) + ")");
            gradient.addColorStop(0.55, "rgba(123, 233, 255, " + (0.02 * shallow) + ")");
            gradient.addColorStop(1, "rgba(123, 233, 255, 0)");
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.moveTo(x - width * 0.18, 0);
            ctx.lineTo(x + width * 0.18, 0);
            ctx.lineTo(x + width * 1.4, viewport.height);
            ctx.lineTo(x - width * 0.95, viewport.height);
            ctx.closePath();
            ctx.fill();
        }

        ctx.restore();
    }

    function drawCaustics() {
        const shallow = 1 - clamp((player.y - 620) / 1800, 0, 1);
        if (shallow <= 0.02) {
            return;
        }

        const startX = Math.floor(state.camera.x / 80) * 80 - 80;
        const endX = state.camera.x + viewport.width + 80;
        const startY = Math.floor(state.camera.y / 80) * 80 - 80;
        const endY = state.camera.y + viewport.height + 80;

        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.strokeStyle = "rgba(210, 248, 255, " + (0.04 + shallow * 0.06) + ")";
        ctx.lineWidth = 2;

        for (let y = startY; y <= endY; y += 80) {
            ctx.beginPath();
            for (let x = startX; x <= endX; x += 40) {
                const waveY = y + Math.sin(x * 0.012 + state.time * 1.8 + y * 0.02) * 11;
                if (x === startX) {
                    ctx.moveTo(x, waveY);
                } else {
                    ctx.lineTo(x, waveY);
                }
            }
            ctx.stroke();
        }

        ctx.restore();
    }

    function drawRays() {
        for (const ray of world.rays) {
            if (!isOnScreen(ray.x, ray.y, ray.span)) {
                continue;
            }

            ctx.save();
            ctx.translate(ray.x, ray.y);
            ctx.scale(ray.dir, 1);
            ctx.globalAlpha = 0.12;

            ctx.beginPath();
            ctx.moveTo(-ray.span * 0.5, 0);
            ctx.quadraticCurveTo(-ray.span * 0.1, -ray.span * 0.3, ray.span * 0.38, -ray.span * 0.08);
            ctx.quadraticCurveTo(ray.span * 0.54, 0, ray.span * 0.38, ray.span * 0.08);
            ctx.quadraticCurveTo(-ray.span * 0.1, ray.span * 0.3, -ray.span * 0.5, 0);
            ctx.fillStyle = "rgba(3, 15, 26, 0.95)";
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(-ray.span * 0.5, 0);
            ctx.lineTo(-ray.span * 0.78, ray.span * 0.18);
            ctx.lineTo(-ray.span * 0.6, 0);
            ctx.lineTo(-ray.span * 0.78, -ray.span * 0.18);
            ctx.closePath();
            ctx.fill();

            ctx.restore();
        }
    }

    function drawReefs() {
        for (const reef of world.reefs) {
            if (!isOnScreen(reef.x, reef.y, reef.scale + 120)) {
                continue;
            }

            ctx.save();
            ctx.translate(reef.x, reef.y);
            ctx.rotate(reef.rotation);

            ctx.beginPath();
            ctx.ellipse(0, reef.scale * 0.2, reef.scale * 0.8, reef.scale * 0.42, 0, 0, TAU);
            ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
            ctx.fill();

            for (const lobe of reef.lobes) {
                const gradient = ctx.createRadialGradient(
                    lobe.ox - lobe.rx * 0.3,
                    lobe.oy - lobe.ry * 0.4,
                    0,
                    lobe.ox,
                    lobe.oy,
                    Math.max(lobe.rx, lobe.ry)
                );
                gradient.addColorStop(0, "hsla(" + reef.hue + ", 52%, 55%, 0.95)");
                gradient.addColorStop(0.58, "hsla(" + (reef.hue + 8) + ", 46%, 34%, 0.94)");
                gradient.addColorStop(1, "hsla(" + (reef.hue + 12) + ", 40%, 18%, 0.94)");

                ctx.beginPath();
                ctx.ellipse(lobe.ox, lobe.oy, lobe.rx, lobe.ry, lobe.rot, 0, TAU);
                ctx.fillStyle = gradient;
                ctx.fill();
            }

            ctx.strokeStyle = "rgba(219, 247, 255, 0.08)";
            ctx.lineWidth = Math.max(1.5, reef.scale * 0.018);
            ctx.beginPath();
            ctx.moveTo(-reef.scale * 0.45, -reef.scale * 0.08);
            ctx.quadraticCurveTo(0, -reef.scale * reef.ridge, reef.scale * 0.45, reef.scale * 0.03);
            ctx.stroke();

            ctx.restore();
        }
    }

    function drawKelp() {
        for (const plant of world.kelp) {
            if (!isOnScreen(plant.x, plant.y, plant.height + 40)) {
                continue;
            }

            const sway = Math.sin(state.time * 1.1 + plant.phase) * 16;
            ctx.save();
            ctx.translate(plant.x, plant.y);

            for (let blade = 0; blade < plant.blades; blade += 1) {
                const offset = (blade - (plant.blades - 1) / 2) * 10;
                const bladeHeight = plant.height - blade * 18;
                const bend = sway + plant.lean * 0.18 + blade * 5;
                const gradient = ctx.createLinearGradient(0, 0, 0, -bladeHeight);
                gradient.addColorStop(0, "rgba(10, 78, 57, 0.95)");
                gradient.addColorStop(1, "rgba(92, 202, 141, 0.72)");
                ctx.strokeStyle = gradient;
                ctx.lineWidth = 5 - blade * 0.7;
                ctx.beginPath();
                ctx.moveTo(offset, 0);
                ctx.quadraticCurveTo(offset + bend * 0.3, -bladeHeight * 0.45, offset + bend, -bladeHeight);
                ctx.stroke();
            }

            ctx.restore();
        }
    }

    function drawCorals() {
        for (const coral of world.corals) {
            if (!isOnScreen(coral.x, coral.y, coral.size + 30)) {
                continue;
            }

            const sway = Math.sin(state.time * 1.8 + coral.phase) * (coral.size * 0.06);
            ctx.save();
            ctx.translate(coral.x, coral.y);
            ctx.shadowBlur = 14 * coral.glow;
            ctx.shadowColor = "hsla(" + coral.hue + ", 90%, 72%, 0.38)";

            if (coral.kind === "branch") {
                ctx.strokeStyle = "hsla(" + coral.hue + ", 85%, 68%, 0.82)";
                ctx.lineWidth = Math.max(2, coral.size * 0.14);
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.quadraticCurveTo(-coral.size * 0.2, -coral.size * 0.42, -coral.size * 0.28 + sway, -coral.size);
                ctx.moveTo(0, 0);
                ctx.quadraticCurveTo(coral.size * 0.1, -coral.size * 0.38, coral.size * 0.34 + sway, -coral.size * 0.8);
                ctx.moveTo(0, 0);
                ctx.quadraticCurveTo(0, -coral.size * 0.45, sway * 0.4, -coral.size * 1.12);
                ctx.stroke();

                for (let tip = 0; tip < 3; tip += 1) {
                    const tx = (tip - 1) * coral.size * 0.26 + sway * 0.6;
                    const ty = -coral.size * (0.78 + tip * 0.12);
                    ctx.beginPath();
                    ctx.arc(tx, ty, coral.size * 0.12, 0, TAU);
                    ctx.fillStyle = "hsla(" + (coral.hue + 18) + ", 95%, 74%, 0.9)";
                    ctx.fill();
                }
            } else if (coral.kind === "fan") {
                ctx.strokeStyle = "hsla(" + coral.hue + ", 82%, 70%, 0.78)";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(0, 0, coral.size, Math.PI, TAU);
                ctx.stroke();
                for (let spoke = 0; spoke <= 5; spoke += 1) {
                    const angle = Math.PI + (spoke / 5) * Math.PI;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(Math.cos(angle) * coral.size, Math.sin(angle) * coral.size);
                    ctx.stroke();
                }
            } else {
                ctx.fillStyle = "hsla(" + coral.hue + ", 84%, 70%, 0.84)";
                for (let tube = 0; tube < 3; tube += 1) {
                    const offset = (tube - 1) * coral.size * 0.22;
                    ctx.beginPath();
                    ctx.ellipse(offset + sway * 0.5, -coral.size * 0.45, coral.size * 0.16, coral.size * 0.46, 0, 0, TAU);
                    ctx.fill();
                }
            }

            ctx.restore();
        }
    }

    function drawGlows() {
        ctx.save();
        ctx.globalCompositeOperation = "screen";

        for (const glow of world.glows) {
            if (!isOnScreen(glow.x, glow.y, glow.size * 3)) {
                continue;
            }

            const pulse = 0.8 + Math.sin(state.time * 1.6 + glow.phase) * 0.2;
            const gradient = ctx.createRadialGradient(glow.x, glow.y, 0, glow.x, glow.y, glow.size * 3.4);
            gradient.addColorStop(0, "hsla(" + glow.hue + ", 95%, 70%, " + glow.alpha * pulse + ")");
            gradient.addColorStop(1, "hsla(" + glow.hue + ", 95%, 70%, 0)");
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(glow.x, glow.y, glow.size * 3.4, 0, TAU);
            ctx.fill();
        }

        ctx.restore();
    }

    function drawVents() {
        for (const vent of world.vents) {
            if (!isOnScreen(vent.x, vent.y, vent.radius + 50)) {
                continue;
            }

            ctx.save();
            ctx.translate(vent.x, vent.y);

            ctx.beginPath();
            ctx.ellipse(0, 10, 38, 18, 0, 0, TAU);
            ctx.fillStyle = "rgba(7, 17, 24, 0.4)";
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(-26, 12);
            ctx.quadraticCurveTo(-14, -18, 0, -8);
            ctx.quadraticCurveTo(16, -22, 28, 12);
            ctx.closePath();
            ctx.fillStyle = "rgba(52, 92, 112, 0.95)";
            ctx.fill();

            const pulse = 0.3 + Math.sin(state.time * 2.8 + vent.phase) * 0.12;
            const aura = ctx.createRadialGradient(0, -10, 0, 0, -10, vent.radius);
            aura.addColorStop(0, "rgba(150, 240, 255, " + pulse + ")");
            aura.addColorStop(1, "rgba(150, 240, 255, 0)");
            ctx.fillStyle = aura;
            ctx.beginPath();
            ctx.arc(0, -10, vent.radius, 0, TAU);
            ctx.fill();

            ctx.restore();
        }
    }

    function drawArtifacts() {
        for (const artifact of world.artifacts) {
            if (!isOnScreen(artifact.x, artifact.y, 120)) {
                continue;
            }

            const pulse = 0.65 + Math.sin(state.time * 2.4 + artifact.orbit) * 0.35;
            const intensity = artifact.scanned ? 0.25 : 0.95;
            const radius = artifact.scanned ? 18 : 22;

            ctx.save();
            ctx.translate(artifact.x, artifact.y);
            ctx.globalCompositeOperation = "screen";

            const aura = ctx.createRadialGradient(0, 0, 0, 0, 0, 62);
            aura.addColorStop(0, "hsla(" + artifact.hue + ", 95%, 72%, " + (0.3 * intensity * pulse) + ")");
            aura.addColorStop(1, "hsla(" + artifact.hue + ", 95%, 72%, 0)");
            ctx.fillStyle = aura;
            ctx.beginPath();
            ctx.arc(0, 0, 62, 0, TAU);
            ctx.fill();

            ctx.rotate(state.time * 0.4 + artifact.orbit);
            ctx.strokeStyle = "hsla(" + artifact.hue + ", 92%, 78%, " + (0.7 * intensity) + ")";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, -radius);
            ctx.lineTo(radius * 0.86, radius * 0.5);
            ctx.lineTo(-radius * 0.86, radius * 0.5);
            ctx.closePath();
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(0, 0, radius * 0.46, 0, TAU);
            ctx.fillStyle = "hsla(" + artifact.hue + ", 95%, 70%, " + (0.82 * intensity + 0.18) + ")";
            ctx.fill();

            for (let dot = 0; dot < 3; dot += 1) {
                const angle = state.time * 0.8 + artifact.orbit + dot * (TAU / 3);
                ctx.beginPath();
                ctx.arc(Math.cos(angle) * 32, Math.sin(angle) * 32, 3.2, 0, TAU);
                ctx.fillStyle = "rgba(225, 252, 255, 0.84)";
                ctx.fill();
            }

            ctx.restore();
        }
    }

    function drawPod() {
        ctx.save();
        ctx.translate(world.pod.x, world.pod.y);

        const aura = ctx.createRadialGradient(0, 0, 0, 0, 0, 150);
        aura.addColorStop(0, "rgba(133, 236, 255, 0.18)");
        aura.addColorStop(1, "rgba(133, 236, 255, 0)");
        ctx.fillStyle = aura;
        ctx.beginPath();
        ctx.arc(0, 0, 150, 0, TAU);
        ctx.fill();

        ctx.beginPath();
        ctx.ellipse(0, 30, 88, 34, 0, 0, TAU);
        ctx.fillStyle = "rgba(0, 0, 0, 0.24)";
        ctx.fill();

        ctx.beginPath();
        ctx.ellipse(0, 0, 76, 48, 0, 0, TAU);
        ctx.fillStyle = "#f3f7fb";
        ctx.fill();
        ctx.strokeStyle = "rgba(110, 153, 184, 0.34)";
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.fillStyle = "#ff9c4f";
        ctx.fillRect(-64, -10, 22, 32);
        ctx.fillRect(42, -10, 22, 32);

        ctx.beginPath();
        ctx.ellipse(0, -6, 22, 18, 0, 0, TAU);
        ctx.fillStyle = "#2e6d89";
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(0, -48);
        ctx.lineTo(0, -92);
        ctx.strokeStyle = "rgba(210, 244, 255, 0.55)";
        ctx.lineWidth = 4;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, -98, 9, 0, TAU);
        ctx.fillStyle = "#7ff7ff";
        ctx.fill();

        ctx.restore();
    }

    function drawSchools() {
        for (const school of world.schools) {
            if (!isOnScreen(school.x, school.y, school.span + 60)) {
                continue;
            }

            ctx.save();
            ctx.globalAlpha = 0.55;
            ctx.fillStyle = "hsla(" + school.hue + ", 78%, 72%, 0.8)";

            for (let fish = 0; fish < school.count; fish += 1) {
                const offset = fish / Math.max(1, school.count - 1);
                const sway = Math.sin(state.time * 2.2 + school.phase + fish) * 10;
                const fx = school.x + school.dir * (-school.span * 0.5 + offset * school.span);
                const fy = school.y + Math.sin(offset * TAU * 2 + state.time * 0.8 + school.phase) * 16 + sway * 0.4;
                ctx.save();
                ctx.translate(fx, fy);
                ctx.rotate(school.dir > 0 ? 0 : Math.PI);
                ctx.beginPath();
                ctx.moveTo(-7, 0);
                ctx.quadraticCurveTo(0, -4.5, 10, 0);
                ctx.quadraticCurveTo(0, 4.5, -7, 0);
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(-7, 0);
                ctx.lineTo(-12, -4);
                ctx.lineTo(-10, 0);
                ctx.lineTo(-12, 4);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            }

            ctx.restore();
        }
    }

    function drawPredators() {
        for (const predator of world.predators) {
            if (!isOnScreen(predator.x, predator.y, predator.radius + 60)) {
                continue;
            }

            const chaseGlow = clamp(predator.chase / 3.4, 0, 1);
            ctx.save();
            ctx.translate(predator.x, predator.y);
            ctx.rotate(predator.angle);

            ctx.beginPath();
            ctx.ellipse(-predator.radius * 0.24, predator.radius * 0.88, predator.radius * 0.9, predator.radius * 0.32, 0, 0, TAU);
            ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
            ctx.fill();

            const body = ctx.createLinearGradient(-predator.radius * 1.3, 0, predator.radius * 1.5, 0);
            body.addColorStop(0, "hsla(" + predator.hue + ", 40%, 10%, 0.98)");
            body.addColorStop(0.55, "hsla(" + predator.hue + ", 55%, 24%, 0.98)");
            body.addColorStop(1, "hsla(" + (predator.hue + 12) + ", 60%, 42%, 0.98)");

            ctx.beginPath();
            ctx.moveTo(-predator.radius * 1.15, 0);
            ctx.quadraticCurveTo(-predator.radius * 0.15, -predator.radius * 0.95, predator.radius * 1.4, 0);
            ctx.quadraticCurveTo(-predator.radius * 0.15, predator.radius * 0.95, -predator.radius * 1.15, 0);
            ctx.fillStyle = body;
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(-predator.radius * 1.15, 0);
            ctx.lineTo(-predator.radius * 1.7, predator.radius * 0.46);
            ctx.lineTo(-predator.radius * 1.45, 0);
            ctx.lineTo(-predator.radius * 1.7, -predator.radius * 0.46);
            ctx.closePath();
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(-predator.radius * 0.18, -predator.radius * 0.18);
            ctx.lineTo(predator.radius * 0.32, -predator.radius * 0.82);
            ctx.lineTo(predator.radius * 0.1, -predator.radius * 0.14);
            ctx.closePath();
            ctx.fillStyle = "rgba(204, 235, 255, 0.14)";
            ctx.fill();

            ctx.shadowBlur = 22 * chaseGlow;
            ctx.shadowColor = "rgba(255, 114, 114, 0.75)";
            ctx.fillStyle = "rgba(255, 148, 132, 0.95)";
            ctx.beginPath();
            ctx.arc(predator.radius * 0.74, -predator.radius * 0.14, 3.2 + chaseGlow * 1.8, 0, TAU);
            ctx.fill();

            ctx.restore();
        }
    }

    function drawPlayer() {
        if (state.scanTarget && state.scanLocked) {
            ctx.save();
            ctx.strokeStyle = "rgba(255, 240, 163, 0.74)";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(player.x, player.y);
            ctx.lineTo(state.scanTarget.x, state.scanTarget.y);
            ctx.stroke();
            ctx.restore();
        }

        ctx.save();
        ctx.translate(player.x, player.y);
        ctx.rotate(player.angle);

        const flashlight = ctx.createRadialGradient(18, 0, 0, 28, 0, 80);
        flashlight.addColorStop(0, "rgba(205, 249, 255, 0.24)");
        flashlight.addColorStop(1, "rgba(205, 249, 255, 0)");
        ctx.fillStyle = flashlight;
        ctx.beginPath();
        ctx.ellipse(46, 0, 76, 46, 0, 0, TAU);
        ctx.fill();

        ctx.beginPath();
        ctx.ellipse(0, player.radius + 9, 22, 10, 0, 0, TAU);
        ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
        ctx.fill();

        ctx.fillStyle = "#f5fafb";
        ctx.beginPath();
        ctx.ellipse(0, 0, 22, 15, 0, 0, TAU);
        ctx.fill();

        ctx.fillStyle = "#ff9d43";
        ctx.beginPath();
        ctx.ellipse(-5, 0, 8, 15, 0, 0, TAU);
        ctx.fill();

        ctx.fillStyle = "#224c62";
        ctx.beginPath();
        ctx.arc(8, 0, 7, 0, TAU);
        ctx.fill();

        ctx.fillStyle = player.hitFlash > 0 ? "#ffd6d6" : "#9de6ff";
        ctx.fillRect(-18, -8, 10, 16);

        ctx.fillStyle = "#0d1f2a";
        ctx.beginPath();
        ctx.moveTo(-20, 0);
        ctx.lineTo(-34, -8);
        ctx.lineTo(-30, 0);
        ctx.lineTo(-34, 8);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "#8ff3ff";
        ctx.beginPath();
        ctx.arc(24, 0, 4.2, 0, TAU);
        ctx.fill();

        ctx.restore();
    }

    function drawParticles() {
        for (const particle of state.particles) {
            if (!isOnScreen(particle.x, particle.y, 40)) {
                continue;
            }

            const alpha = clamp(particle.ttl / 3.4, 0, 1);
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.arc(particle.x, particle.y, particle.size, 0, TAU);
            ctx.fillStyle = particle.color;
            ctx.fill();
            ctx.strokeStyle = "rgba(245, 253, 255, 0.42)";
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.restore();
        }
    }

    function drawSonarRings() {
        for (const ring of state.rings) {
            const screenX = ring.x - state.camera.x;
            const screenY = ring.y - state.camera.y;
            const alpha = 1 - ring.radius / ring.max;

            ctx.save();
            ctx.strokeStyle = "rgba(136, 242, 255, " + alpha * 0.45 + ")";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(screenX, screenY, ring.radius, 0, TAU);
            ctx.stroke();
            ctx.restore();

            for (const artifact of world.artifacts) {
                const delta = Math.abs(distance(ring, artifact) - ring.radius);
                if (delta < 14) {
                    ctx.save();
                    ctx.strokeStyle = "rgba(255, 236, 157, " + alpha * 0.85 + ")";
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(artifact.x - state.camera.x, artifact.y - state.camera.y, 14, 0, TAU);
                    ctx.stroke();
                    ctx.restore();
                }
            }

            for (const predator of world.predators) {
                const delta = Math.abs(distance(ring, predator) - ring.radius);
                if (delta < 18) {
                    ctx.save();
                    ctx.strokeStyle = "rgba(255, 137, 137, " + alpha * 0.82 + ")";
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(predator.x - state.camera.x, predator.y - state.camera.y, predator.radius + 8, 0, TAU);
                    ctx.stroke();
                    ctx.restore();
                }
            }
        }
    }

    function drawPlankton() {
        ctx.save();
        ctx.globalCompositeOperation = "screen";

        for (const mote of state.plankton) {
            ctx.globalAlpha = mote.alpha;
            ctx.beginPath();
            ctx.arc(mote.x, mote.y, mote.size, 0, TAU);
            ctx.fillStyle = "rgba(220, 251, 255, 0.96)";
            ctx.fill();
        }

        ctx.restore();
    }

    function drawVignette() {
        const vignette = ctx.createRadialGradient(
            viewport.width * 0.5,
            viewport.height * 0.38,
            viewport.width * 0.18,
            viewport.width * 0.5,
            viewport.height * 0.5,
            viewport.width * 0.85
        );
        vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
        vignette.addColorStop(1, "rgba(0, 12, 19, 0.44)");
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, viewport.width, viewport.height);
    }

    function render() {
        ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
        ctx.clearRect(0, 0, viewport.width, viewport.height);

        drawBackdrop();
        drawLightShafts();

        ctx.save();
        ctx.translate(-state.camera.x, -state.camera.y);
        drawCaustics();
        drawRays();
        drawReefs();
        drawKelp();
        drawCorals();
        drawGlows();
        drawVents();
        drawArtifacts();
        drawPod();
        drawSchools();
        drawPredators();
        drawPlayer();
        drawParticles();
        ctx.restore();

        drawSonarRings();
        drawPlankton();
        drawVignette();
    }

    function resizeCanvas() {
        viewport.width = window.innerWidth;
        viewport.height = window.innerHeight;
        viewport.dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * viewport.dpr);
        canvas.height = Math.floor(viewport.height * viewport.dpr);
        canvas.style.width = viewport.width + "px";
        canvas.style.height = viewport.height + "px";
        state.plankton = createPlankton();
        moveReticle(state.mouse.x, state.mouse.y);
    }

    function moveReticle(x, y) {
        reticle.style.left = x + "px";
        reticle.style.top = y + "px";
    }

    function animate(timestamp) {
        const dt = Math.min(0.033, (timestamp - state.lastFrame) / 1000 || 0.016);
        state.lastFrame = timestamp;

        update(dt);
        render();
        requestAnimationFrame(animate);
    }

    window.addEventListener("resize", resizeCanvas);

    window.addEventListener("mousemove", (event) => {
        state.mouse.x = event.clientX;
        state.mouse.y = event.clientY;
        moveReticle(event.clientX, event.clientY);
    });

    window.addEventListener("mousedown", (event) => {
        if (event.button === 0) {
            state.mouse.down = true;
        }
    });

    window.addEventListener("mouseup", (event) => {
        if (event.button === 0) {
            state.mouse.down = false;
        }
    });

    window.addEventListener("blur", () => {
        state.mouse.down = false;
        state.keys = {};
    });

    window.addEventListener("contextmenu", (event) => event.preventDefault());

    window.addEventListener("keydown", (event) => {
        const key = event.key.toLowerCase();
        state.keys[key] = true;

        if (!state.started && (key === "enter" || key === " ")) {
            event.preventDefault();
            startDive();
            return;
        }

        if ((state.won || state.lost) && key === "enter") {
            event.preventDefault();
            startDive();
            return;
        }

        if (key === " " || event.code === "Space") {
            event.preventDefault();
            if (!event.repeat) {
                triggerSonar();
            }
        }
    });

    window.addEventListener("keyup", (event) => {
        state.keys[event.key.toLowerCase()] = false;
    });

    startButton.addEventListener("click", startDive);

    resizeCanvas();
    renderFeed();
    updateHud();
    requestAnimationFrame(animate);
})();
