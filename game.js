(() => {
    const STORAGE_KEY = "doodle-jump-parody-save-v2";

    const WIDTH = 432;
    const HEIGHT = 768;
    const TOP_BAR_HEIGHT = 56;
    const PLATFORM_WIDTH = 74;
    const PLATFORM_HEIGHT = 20;
    const PLAYER_WIDTH = 62;
    const PLAYER_HEIGHT = 60;
    const MOVE_SPEED = 182;
    const GRAVITY = -1910;
    const JUMP_VELOCITY = 872;
    const SPRING_VELOCITY = 1115;
    const PROPELLER_VELOCITY = 972;
    const JETPACK_VELOCITY = 1225;
    const CAMERA_THRESHOLD = 305;
    const DEATH_BUFFER = 110;
    const BULLET_SPEED = 880;
    const SHOT_COOLDOWN = 0.23;
    const MAX_DT = 1 / 30;
    const BOOST_MONSTER_CLEARANCE = 280;
    const BOOST_INVULNERABLE_EXTRA = 0.45;

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const randomRange = (min, max) => min + Math.random() * (max - min);
    const chance = (value) => Math.random() < value;

    const IMAGE_URLS = {
        playerRight: "assets/images/player-right.png",
        playerLeft: "assets/images/player-left.png",
        playerRightJump: "assets/images/player-right-jump.png",
        playerLeftJump: "assets/images/player-left-jump.png",
        playerShoot: "assets/images/player-shoot.png",
        playerShootJump: "assets/images/player-shoot-jump.png",
        propeller: "assets/images/propeller.png",
        jetpack: "assets/images/jetpack.png",
        projectile: "assets/images/projectile.png",
        platformGreen: "assets/images/platform-green.png",
        platformBlue: "assets/images/platform-blue.png",
        platformBrown: "assets/images/platform-brown.png",
        platformBrownBroken: "assets/images/platform-brown-broken.png",
        platformWhite: "assets/images/platform-white.png",
        spring: "assets/images/spring.png",
        springCompressed: "assets/images/spring-compressed.png",
        monster: "assets/images/monster.png",
    };

    const AUDIO_URLS = {
        break: "assets/audio/break.wav",
        jump: "assets/audio/jump.wav",
        gameOver: "assets/audio/gameover.wav",
        poof: "assets/audio/pop.mp3",
        spring: "assets/audio/spring.mp3",
        propeller: "assets/audio/propeller.mp3",
        jetpack: "assets/audio/jetpack.mp3",
        shoot: "assets/audio/shoot.mp3",
        monster: "assets/audio/monster.mp3",
    };

    class AudioSystem {
        constructor(urls) {
            this.urls = urls;
            this.buffers = new Map();
            this.enabled = false;
        }

        preload() {
            Object.entries(this.urls).forEach(([name, url]) => {
                const audio = new Audio(url);
                audio.preload = "auto";
                audio.crossOrigin = "anonymous";
                this.buffers.set(name, audio);
            });
        }

        setEnabled(value) {
            this.enabled = value;
        }

        play(name, volume = 0.55) {
            if (!this.enabled) {
                return;
            }
            const base = this.buffers.get(name);
            if (!base) {
                return;
            }
            const sound = base.cloneNode();
            sound.volume = volume;
            sound.play().catch(() => {});
        }
    }

    class AssetLoader {
        constructor(manifest) {
            this.manifest = manifest;
            this.images = {};
        }

        load(onProgress) {
            const entries = Object.entries(this.manifest);
            let loaded = 0;

            const tasks = entries.map(([name, url]) =>
                new Promise((resolve) => {
                    const image = new Image();
                    image.crossOrigin = "anonymous";
                    image.onload = () => {
                        this.images[name] = image;
                        loaded += 1;
                        onProgress?.(loaded, entries.length);
                        resolve();
                    };
                    image.onerror = () => {
                        this.images[name] = null;
                        loaded += 1;
                        onProgress?.(loaded, entries.length);
                        resolve();
                    };
                    image.src = url;
                }),
            );

            return Promise.all(tasks).then(() => this.images);
        }
    }

    class InputController {
        constructor() {
            this.left = false;
            this.right = false;
            this.shoot = false;
            this.shootTapRequested = false;
            this.pauseRequested = false;
            this.startRequested = false;
        }

        bind({ leftButton, rightButton, shootButton }) {
            const setPressed = (key, value, element) => {
                this[key] = value;
                element?.classList.toggle("is-active", value);
            };

            window.addEventListener("keydown", (event) => {
                if (["ArrowLeft", "a", "A"].includes(event.key)) {
                    this.left = true;
                }
                if (["ArrowRight", "d", "D"].includes(event.key)) {
                    this.right = true;
                }
                if (event.key === " " || event.key === "Spacebar") {
                    event.preventDefault();
                    this.shoot = true;
                    this.shootTapRequested = true;
                }
                if (["p", "P", "Escape"].includes(event.key)) {
                    this.pauseRequested = true;
                }
                if (["Enter", "r", "R"].includes(event.key)) {
                    this.startRequested = true;
                }
            });

            window.addEventListener("keyup", (event) => {
                if (["ArrowLeft", "a", "A"].includes(event.key)) {
                    this.left = false;
                }
                if (["ArrowRight", "d", "D"].includes(event.key)) {
                    this.right = false;
                }
                if (event.key === " " || event.key === "Spacebar") {
                    this.shoot = false;
                }
            });

            const bindButton = (element, key) => {
                if (!element) {
                    return;
                }

                const down = (event) => {
                    event.preventDefault();
                    setPressed(key, true, element);
                    if (key === "shoot") {
                        this.shootTapRequested = true;
                    }
                };
                const up = (event) => {
                    event.preventDefault();
                    setPressed(key, false, element);
                };

                element.addEventListener("pointerdown", down);
                element.addEventListener("pointerup", up);
                element.addEventListener("pointercancel", up);
                element.addEventListener("pointerleave", (event) => {
                    if (event.buttons === 0) {
                        up(event);
                    }
                });
            };

            bindButton(leftButton, "left");
            bindButton(rightButton, "right");
            bindButton(shootButton, "shoot");
        }

        axis() {
            return (this.right ? 1 : 0) - (this.left ? 1 : 0);
        }

        consumePause() {
            const value = this.pauseRequested;
            this.pauseRequested = false;
            return value;
        }

        consumeStart() {
            const value = this.startRequested;
            this.startRequested = false;
            return value;
        }

        consumeShootTap() {
            const value = this.shootTapRequested;
            this.shootTapRequested = false;
            return value;
        }
    }

    class Game {
        constructor() {
            this.canvas = document.getElementById("gameCanvas");
            this.ctx = this.canvas.getContext("2d");
            this.loader = new AssetLoader(IMAGE_URLS);
            this.audio = new AudioSystem(AUDIO_URLS);
            this.input = new InputController();

            this.elements = {
                hudScore: document.getElementById("hudScore"),
                soundToggle: document.getElementById("soundToggle"),
                pauseButton: document.getElementById("pauseButton"),
                startScreen: document.getElementById("startScreen"),
                pauseScreen: document.getElementById("pauseScreen"),
                gameOverScreen: document.getElementById("gameOverScreen"),
                startButton: document.getElementById("startButton"),
                resumeButton: document.getElementById("resumeButton"),
                restartButton: document.getElementById("restartButton"),
                finalScore: document.getElementById("finalScore"),
                finalBest: document.getElementById("finalBest"),
                loadingLabel: document.getElementById("loadingLabel"),
                leftButton: document.getElementById("leftButton"),
                rightButton: document.getElementById("rightButton"),
                shootButton: document.getElementById("shootButton"),
            };

            this.state = "loading";
            this.assets = {};
            this.platforms = [];
            this.monsters = [];
            this.bullets = [];
            this.effects = [];
            this.cameraY = 0;
            this.maxY = 0;
            this.score = 0;
            this.bestScore = 0;
            this.muted = true;
            this.lastFrame = 0;
            this.spawnAnchorX = WIDTH / 2;
            this.highestPlatformY = 0;
            this.time = 0;
            this.player = this.createPlayer();

            this.restore();
            this.audio.preload();
            this.audio.setEnabled(!this.muted);
            this.input.bind({
                leftButton: this.elements.leftButton,
                rightButton: this.elements.rightButton,
                shootButton: this.elements.shootButton,
            });
            this.bindUi();
            this.updateHud();
        }

        createPlayer() {
            return {
                x: WIDTH / 2,
                y: 120,
                prevY: 120,
                width: PLAYER_WIDTH,
                height: PLAYER_HEIGHT,
                vx: 0,
                vy: JUMP_VELOCITY,
                facing: "right",
                shootCooldown: 0,
                boostType: null,
                boostTimer: 0,
                boostInvulnerableTimer: 0,
            };
        }

        bindUi() {
            this.elements.startButton.addEventListener("click", () => this.startRun());
            this.elements.resumeButton.addEventListener("click", () => this.resume());
            this.elements.restartButton.addEventListener("click", () => this.startRun());
            this.elements.pauseButton.addEventListener("click", () => {
                if (this.state === "playing") {
                    this.pause();
                } else if (this.state === "paused") {
                    this.resume();
                } else if (this.state === "start" || this.state === "gameOver") {
                    this.startRun();
                }
            });
            this.elements.soundToggle.addEventListener("click", () => {
                this.muted = !this.muted;
                this.audio.setEnabled(!this.muted);
                this.persist();
                this.updateHud();
            });
        }

        restore() {
            try {
                const raw = window.localStorage.getItem(STORAGE_KEY);
                if (!raw) {
                    return;
                }
                const data = JSON.parse(raw);
                this.bestScore = Number(data.bestScore) || 0;
                this.muted = data.muted !== undefined ? Boolean(data.muted) : true;
            } catch (_error) {
                this.bestScore = 0;
                this.muted = true;
            }
        }

        persist() {
            try {
                window.localStorage.setItem(
                    STORAGE_KEY,
                    JSON.stringify({
                        bestScore: this.bestScore,
                        muted: this.muted,
                    }),
                );
            } catch (_error) {
                // Storage may be unavailable.
            }
        }

        init() {
            this.loader
                .load((loaded, total) => {
                    this.elements.loadingLabel.textContent = `Loading sprites and sounds… ${loaded}/${total}`;
                })
                .then((images) => {
                    this.assets = images;
                    this.state = "start";
                    this.elements.startButton.disabled = false;
                    this.elements.startButton.textContent = "Play";
                    this.elements.loadingLabel.textContent = "Closer movement, classic platforms, shooting, boosts, and sound.";
                    this.resetWorld();
                    this.setOverlay();
                });

            this.lastFrame = performance.now();
            requestAnimationFrame((time) => this.frame(time));
        }

        resetWorld() {
            this.player = this.createPlayer();
            this.platforms = [];
            this.monsters = [];
            this.bullets = [];
            this.effects = [];
            this.cameraY = 0;
            this.maxY = this.player.y;
            this.score = 0;
            this.spawnAnchorX = WIDTH / 2;
            this.highestPlatformY = 0;
            this.time = 0;

            this.platforms.push({
                x: WIDTH / 2,
                y: 80,
                width: 92,
                type: "green",
                active: true,
                vx: 0,
                brokenTimer: 0,
                vanishTimer: 0,
                pickup: null,
            });
            this.highestPlatformY = 80;

            for (let index = 0; index < 11; index += 1) {
                this.spawnNextPlatform(true);
            }

            this.ensureWorld();
            this.updateHud();
        }

        setOverlay() {
            this.elements.startScreen.classList.toggle("is-hidden", this.state !== "start");
            this.elements.pauseScreen.classList.toggle("is-hidden", this.state !== "paused");
            this.elements.gameOverScreen.classList.toggle("is-hidden", this.state !== "gameOver");
            this.elements.pauseButton.textContent = this.state === "paused" ? "▶" : "Ⅱ";
        }

        startRun() {
            if (this.state === "loading") {
                return;
            }
            this.audio.setEnabled(!this.muted);
            this.resetWorld();
            this.state = "playing";
            this.setOverlay();
        }

        pause() {
            if (this.state !== "playing") {
                return;
            }
            this.state = "paused";
            this.setOverlay();
        }

        resume() {
            if (this.state !== "paused") {
                return;
            }
            this.state = "playing";
            this.setOverlay();
        }

        gameOver() {
            this.bestScore = Math.max(this.bestScore, this.score);
            this.persist();
            this.elements.finalScore.textContent = this.score.toLocaleString();
            this.elements.finalBest.textContent = this.bestScore.toLocaleString();
            this.audio.play("gameOver", 0.55);
            this.state = "gameOver";
            this.setOverlay();
            this.updateHud();
        }

        frame(timestamp) {
            const dt = Math.min(MAX_DT, (timestamp - this.lastFrame) / 1000 || 0);
            this.lastFrame = timestamp;

            if (this.input.consumePause()) {
                if (this.state === "playing") {
                    this.pause();
                } else if (this.state === "paused") {
                    this.resume();
                }
            }

            if (this.input.consumeStart() && (this.state === "start" || this.state === "gameOver")) {
                this.startRun();
            }

            if (this.state === "playing") {
                this.update(dt);
            }

            this.render();
            requestAnimationFrame((time) => this.frame(time));
        }

        update(dt) {
            this.time += dt;
            this.player.prevY = this.player.y;
            this.player.shootCooldown = Math.max(0, this.player.shootCooldown - dt);

            const axis = this.input.axis();
            this.player.vx = axis * MOVE_SPEED;
            if (axis !== 0) {
                this.player.facing = axis < 0 ? "left" : "right";
            }

            this.player.x += this.player.vx * dt;
            if (this.player.x < -this.player.width / 2) {
                this.player.x = WIDTH + this.player.width / 2;
            }
            if (this.player.x > WIDTH + this.player.width / 2) {
                this.player.x = -this.player.width / 2;
            }

            if (this.player.boostTimer > 0) {
                this.player.boostTimer = Math.max(0, this.player.boostTimer - dt);
                if (this.player.boostType === "jetpack") {
                    this.player.vy = JETPACK_VELOCITY;
                } else if (this.player.boostType === "propeller") {
                    this.player.vy = PROPELLER_VELOCITY;
                }
                if (this.player.boostTimer === 0) {
                    this.player.boostType = null;
                }
            } else {
                this.player.vy += GRAVITY * dt;
            }

            this.player.boostInvulnerableTimer = Math.max(0, this.player.boostInvulnerableTimer - dt);

            this.player.y += this.player.vy * dt;

            if (this.player.boostTimer > 0) {
                this.effects.push({
                    kind: "trail",
                    x: this.player.x + randomRange(-16, 16),
                    y: this.player.y + randomRange(-8, 18),
                    vy: -45,
                    life: 0.16,
                    size: randomRange(18, 34),
                    alpha: 0.38,
                    color: this.player.boostType === "jetpack" ? "rgba(255, 169, 84, 0.65)" : "rgba(255,255,255,0.5)",
                });
                this.effects.push({
                    kind: "burst",
                    x: this.player.x,
                    y: this.player.y + 16,
                    vy: -30,
                    life: 0.14,
                    radius: this.player.boostType === "jetpack" ? 46 : 34,
                    alpha: 0.22,
                    color: this.player.boostType === "jetpack" ? "rgba(255, 200, 128, 0.65)" : "rgba(255,255,255,0.55)",
                });
            }

            if (this.input.shoot && this.player.shootCooldown <= 0) {
                this.fireBullet();
            }

            this.updatePlatforms(dt);
            this.updateBullets(dt);
            this.updateMonsters(dt);
            this.updateEffects(dt);
            this.handlePlatformCollisions();
            this.handlePickupCollisions();
            this.handleMonsterCollisions();

            this.maxY = Math.max(this.maxY, this.player.y);
            this.score = Math.max(0, Math.floor(this.maxY - 120));
            this.cameraY = Math.max(this.cameraY, this.player.y - CAMERA_THRESHOLD);

            if (this.player.y < this.cameraY - DEATH_BUFFER) {
                this.gameOver();
                return;
            }

            this.cleanupWorld();
            this.ensureWorld();
            this.updateHud();
        }

        updatePlatforms(dt) {
            for (const platform of this.platforms) {
                if (platform.type === "blue") {
                    platform.x += platform.vx * dt;
                    if (platform.x < platform.width / 2 + 12 || platform.x > WIDTH - platform.width / 2 - 12) {
                        platform.vx *= -1;
                        platform.x = clamp(platform.x, platform.width / 2 + 12, WIDTH - platform.width / 2 - 12);
                    }
                }

                if (platform.brokenTimer > 0) {
                    platform.brokenTimer = Math.max(0, platform.brokenTimer - dt);
                }
                if (platform.vanishTimer > 0) {
                    platform.vanishTimer = Math.max(0, platform.vanishTimer - dt);
                }
            }
        }

        updateBullets(dt) {
            this.bullets = this.bullets.filter((bullet) => {
                bullet.y += bullet.vy * dt;
                return bullet.y < this.cameraY + HEIGHT + 120;
            });
        }

        updateMonsters(dt) {
            for (const monster of this.monsters) {
                monster.x += monster.vx * dt;
                if (monster.x < monster.width / 2 + 10 || monster.x > WIDTH - monster.width / 2 - 10) {
                    monster.vx *= -1;
                    monster.x = clamp(monster.x, monster.width / 2 + 10, WIDTH - monster.width / 2 - 10);
                }
            }
        }

        updateEffects(dt) {
            this.effects = this.effects.filter((effect) => {
                effect.life -= dt;
                effect.y += effect.vy * dt;
                effect.alpha = Math.max(0, (effect.alpha ?? 1) - dt * 1.8);
                return effect.life > 0;
            });
        }

        fireBullet() {
            this.player.shootCooldown = SHOT_COOLDOWN;
            this.bullets.push({
                x: this.player.x + (this.player.facing === "left" ? -10 : 10),
                y: this.player.y + this.player.height - 6,
                vy: BULLET_SPEED,
            });
            this.audio.play("shoot", 0.32);
        }

        handlePlatformCollisions() {
            if (this.player.vy > 0 || this.player.boostTimer > 0) {
                return;
            }

            for (let index = this.platforms.length - 1; index >= 0; index -= 1) {
                const platform = this.platforms[index];
                if (!platform.active) {
                    continue;
                }

                const overlap = Math.min(this.player.x + this.player.width / 2, platform.x + platform.width / 2) -
                    Math.max(this.player.x - this.player.width / 2, platform.x - platform.width / 2);

                if (
                    overlap > 18 &&
                    this.player.prevY >= platform.y &&
                    this.player.y <= platform.y
                ) {
                    if (platform.type === "brown") {
                        platform.active = false;
                        platform.brokenTimer = 0.28;
                        this.audio.play("break", 0.45);
                        this.effects.push({ x: platform.x, y: platform.y + 12, vy: 20, life: 0.35, text: "CRACK!" });
                        return;
                    }

                    let bounceVelocity = JUMP_VELOCITY;

                    if (platform.pickup?.type === "spring" && !platform.pickup.used) {
                        platform.pickup.used = true;
                        bounceVelocity = SPRING_VELOCITY;
                        this.audio.play("spring", 0.5);
                    } else {
                        this.audio.play("jump", 0.34);
                    }

                    if (platform.type === "white") {
                        platform.active = false;
                        platform.vanishTimer = 0.08;
                        this.audio.play("poof", 1);
                        this.effects.push({ x: platform.x, y: platform.y + 14, vy: 18, life: 0.3, text: "POOF!" });
                        this.effects.push({ kind: "burst", x: platform.x, y: platform.y + 8, vy: 0, life: 0.22, radius: 40, alpha: 0.48, color: "rgba(255,255,255,0.9)" });
                    }

                    this.player.y = platform.y;
                    this.player.vy = bounceVelocity;
                    return;
                }
            }
        }

        handlePickupCollisions() {
            for (const platform of this.platforms) {
                if (!platform.pickup || platform.pickup.used || platform.pickup.type === "spring") {
                    continue;
                }

                const pickup = platform.pickup;
                const width = pickup.type === "jetpack" ? 36 : 42;
                const height = pickup.type === "jetpack" ? 46 : 32;
                const pickupY = platform.y + 42;

                if (
                    this.player.x + this.player.width / 2 > pickup.x - width / 2 &&
                    this.player.x - this.player.width / 2 < pickup.x + width / 2 &&
                    this.player.y < pickupY + height &&
                    this.player.y + this.player.height > pickupY
                ) {
                    pickup.used = true;
                    if (pickup.type === "propeller") {
                        this.player.boostType = "propeller";
                        this.player.boostTimer = 1.05;
                        this.player.boostInvulnerableTimer = 1.05 + BOOST_INVULNERABLE_EXTRA;
                        this.player.vy = PROPELLER_VELOCITY;
                        this.audio.play("propeller", 0.48);
                    } else if (pickup.type === "jetpack") {
                        this.player.boostType = "jetpack";
                        this.player.boostTimer = 1.32;
                        this.player.boostInvulnerableTimer = 1.32 + BOOST_INVULNERABLE_EXTRA;
                        this.player.vy = JETPACK_VELOCITY;
                        this.audio.play("jetpack", 0.45);
                    }
                    this.effects.push({ x: this.player.x, y: this.player.y + 60, vy: 34, life: 0.5, text: pickup.type === "propeller" ? "PROPELLER!" : "JETPACK!" });
                    return;
                }
            }
        }

        handleMonsterCollisions() {
            for (const bullet of this.bullets) {
                for (const monster of this.monsters) {
                    if (monster.dead) {
                        continue;
                    }
                    if (
                        bullet.x > monster.x - monster.width / 2 &&
                        bullet.x < monster.x + monster.width / 2 &&
                        bullet.y > monster.y &&
                        bullet.y < monster.y + monster.height
                    ) {
                        monster.dead = true;
                        bullet.dead = true;
                        this.audio.play("monster", 0.42);
                        this.score += 250;
                        this.effects.push({ x: monster.x, y: monster.y + 20, vy: 30, life: 0.4, text: "POP!" });
                    }
                }
            }

            this.bullets = this.bullets.filter((bullet) => !bullet.dead);
            this.monsters = this.monsters.filter((monster) => !monster.dead);

            if (this.player.boostInvulnerableTimer > 0) {
                for (const monster of this.monsters) {
                    const verticalDelta = monster.y - this.player.y;
                    const horizontalDelta = Math.abs(monster.x - this.player.x);
                    const overlapX = Math.min(this.player.x + this.player.width / 2, monster.x + monster.width / 2) -
                        Math.max(this.player.x - this.player.width / 2, monster.x - monster.width / 2);
                    const overlapY = Math.min(this.player.y + this.player.height, monster.y + monster.height) -
                        Math.max(this.player.y, monster.y);

                    if (
                        (verticalDelta > -90 && verticalDelta < BOOST_MONSTER_CLEARANCE && horizontalDelta < 130) ||
                        (overlapX > 10 && overlapY > 6)
                    ) {
                        monster.dead = true;
                        this.effects.push({ x: monster.x, y: monster.y + 20, vy: 24, life: 0.32, text: "WHOOSH!" });
                        this.effects.push({ kind: "burst", x: monster.x, y: monster.y + 12, vy: 6, life: 0.18, radius: 28, alpha: 0.25, color: "rgba(255,245,220,0.7)" });
                    }
                }

                this.monsters = this.monsters.filter((monster) => !monster.dead);
                return;
            }

            for (const monster of this.monsters) {
                const overlapX = Math.min(this.player.x + this.player.width / 2, monster.x + monster.width / 2) -
                    Math.max(this.player.x - this.player.width / 2, monster.x - monster.width / 2);
                const overlapY = Math.min(this.player.y + this.player.height, monster.y + monster.height) -
                    Math.max(this.player.y, monster.y);

                if (overlapX > 12 && overlapY >= 6) {
                    const stompLine = monster.y + monster.height - 6;
                    const stompedFromAbove = this.player.prevY >= stompLine && this.player.y <= stompLine;
                    if (this.player.vy <= 0 && stompedFromAbove) {
                        monster.dead = true;
                        this.player.y = stompLine;
                        this.player.vy = JUMP_VELOCITY * 0.98;
                        this.audio.play("monster", 0.42);
                        this.effects.push({ x: monster.x, y: monster.y + 16, vy: 28, life: 0.4, text: "BOUNCE!" });
                        this.monsters = this.monsters.filter((activeMonster) => !activeMonster.dead);
                        return;
                    } else {
                        this.gameOver();
                        return;
                    }
                }
            }

            this.monsters = this.monsters.filter((monster) => !monster.dead);
        }

        cleanupWorld() {
            const floor = this.cameraY - 80;
            this.platforms = this.platforms.filter((platform) => {
                if (platform.y <= floor - 40) {
                    return false;
                }
                if (!platform.active && platform.type === "brown" && platform.brokenTimer <= 0) {
                    return false;
                }
                if (!platform.active && platform.type === "white" && platform.vanishTimer <= 0) {
                    return false;
                }
                return true;
            });
            this.monsters = this.monsters.filter((monster) => monster.y > floor - 60);
        }

        ensureWorld() {
            while (this.highestPlatformY < this.cameraY + HEIGHT + 240) {
                this.spawnNextPlatform(false);
            }
        }

        spawnNextPlatform(isEarly) {
            const heightScore = Math.max(0, this.highestPlatformY - 100);
            const difficulty = clamp(heightScore / 5200, 0, 1);
            const gap = isEarly ? randomRange(64, 82) : randomRange(68, 96 + difficulty * 10);
            const y = this.highestPlatformY + gap;
            const width = randomRange(70, 92);

            let type = "green";
            if (!isEarly) {
                const movingChance = heightScore > 450 ? 0.16 + difficulty * 0.08 : 0;
                const brownChance = heightScore > 900 ? 0.11 + difficulty * 0.07 : 0;
                const whiteChance = heightScore > 1500 ? 0.09 + difficulty * 0.06 : 0;
                const roll = Math.random();

                if (whiteChance && roll < whiteChance) {
                    type = "white";
                } else if (brownChance && roll < whiteChance + brownChance) {
                    type = "brown";
                } else if (movingChance && roll < whiteChance + brownChance + movingChance) {
                    type = "blue";
                }
            }

            const shift = isEarly ? 78 : 92 + difficulty * 16;
            const x = clamp(
                this.spawnAnchorX + randomRange(-shift, shift),
                width / 2 + 14,
                WIDTH - width / 2 - 14,
            );

            const platform = {
                x,
                y,
                width,
                type,
                active: true,
                vx: type === "blue" ? randomRange(42, 78) * (chance(0.5) ? -1 : 1) : 0,
                brokenTimer: 0,
                vanishTimer: 0,
                pickup: null,
            };

            if (chance(isEarly ? 0.1 : 0.15) && type !== "brown" && type !== "white") {
                platform.pickup = { type: "spring", x, used: false };
            } else if (!isEarly && heightScore > 900 && chance(0.06)) {
                platform.pickup = { type: "propeller", x, used: false };
            } else if (!isEarly && heightScore > 2200 && chance(0.04)) {
                platform.pickup = { type: "jetpack", x, used: false };
            }

            if (!isEarly && heightScore > 1200 && chance(0.08 + difficulty * 0.08)) {
                this.monsters.push({
                    x: clamp(x + randomRange(-42, 42), 40, WIDTH - 40),
                    y: y + randomRange(54, 94),
                    width: 62,
                    height: 42,
                    vx: randomRange(30, 58) * (chance(0.5) ? -1 : 1),
                    dead: false,
                });
            }

            const conflictsWithNearbyGreen = this.platforms.some((existingPlatform) =>
                existingPlatform.type === "green" &&
                Math.abs(existingPlatform.x - platform.x) < 72 &&
                Math.abs(existingPlatform.y - platform.y) < 64,
            );
            if (conflictsWithNearbyGreen && (platform.type === "brown" || platform.type === "white")) {
                platform.type = "green";
            }

            this.platforms.push(platform);

            this.highestPlatformY = y;
            this.spawnAnchorX = x;
        }

        updateHud() {
            this.elements.hudScore.textContent = this.score.toLocaleString();
            this.elements.soundToggle.textContent = this.muted ? "🔇" : "🔊";
            this.elements.soundToggle.setAttribute("aria-pressed", String(!this.muted));
        }

        worldToScreen(y) {
            return HEIGHT - (y - this.cameraY);
        }

        drawBackground() {
            const ctx = this.ctx;
            ctx.clearRect(0, 0, WIDTH, HEIGHT);

            ctx.fillStyle = "#eef4f2";
            ctx.fillRect(0, 0, WIDTH, TOP_BAR_HEIGHT);

            ctx.fillStyle = "#f7f2e8";
            ctx.fillRect(0, TOP_BAR_HEIGHT, WIDTH, HEIGHT - TOP_BAR_HEIGHT);

            ctx.strokeStyle = "rgba(217, 175, 141, 0.34)";
            ctx.lineWidth = 1;
            for (let x = 0; x <= WIDTH; x += 18) {
                ctx.beginPath();
                ctx.moveTo(x + 0.5, TOP_BAR_HEIGHT);
                ctx.lineTo(x + 0.5, HEIGHT);
                ctx.stroke();
            }

            for (let y = TOP_BAR_HEIGHT; y <= HEIGHT; y += 18) {
                ctx.beginPath();
                ctx.moveTo(0, y + 0.5);
                ctx.lineTo(WIDTH, y + 0.5);
                ctx.stroke();
            }

            ctx.strokeStyle = "#171310";
            ctx.lineWidth = 5;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(0, TOP_BAR_HEIGHT);
            for (let x = 0; x <= WIDTH; x += 28) {
                ctx.lineTo(x, TOP_BAR_HEIGHT + Math.sin((this.time * 2.4) + x * 0.03) * 1.2);
            }
            ctx.stroke();
        }

        drawImageOrFallback(image, drawImage, fallback) {
            if (image) {
                drawImage(image);
            } else {
                fallback();
            }
        }

        drawSpriteFrame(image, frameWidth, frameHeight, frameIndex, columns, dx, dy, dw, dh) {
            const totalColumns = Math.max(1, Math.floor(image.width / frameWidth));
            const totalRows = Math.max(1, Math.floor(image.height / frameHeight));
            const totalFrames = totalColumns * totalRows;
            const safeIndex = ((frameIndex % totalFrames) + totalFrames) % totalFrames;
            const sx = (safeIndex % columns) * frameWidth;
            const sy = Math.floor(safeIndex / columns) * frameHeight;
            this.ctx.drawImage(image, sx, sy, frameWidth, frameHeight, dx, dy, dw, dh);
        }

        drawPlatforms() {
            for (const platform of this.platforms) {
                if (!platform.active && platform.type === "brown" && platform.brokenTimer <= 0) {
                    continue;
                }
                if (!platform.active && platform.type === "white" && platform.vanishTimer <= 0) {
                    continue;
                }

                const screenY = this.worldToScreen(platform.y);
                const image =
                    platform.type === "green"
                        ? this.assets.platformGreen
                        : platform.type === "blue"
                            ? this.assets.platformBlue
                            : platform.type === "brown"
                                ? (platform.brokenTimer > 0 ? this.assets.platformBrownBroken : this.assets.platformBrown)
                                : this.assets.platformWhite;

                this.drawImageOrFallback(
                    image,
                    (img) => {
                        this.ctx.save();
                        if (!platform.active && platform.type === "brown") {
                            this.ctx.globalAlpha = clamp(platform.brokenTimer / 0.28, 0, 1);
                        }
                        if (!platform.active && platform.type === "white") {
                            this.ctx.globalAlpha = clamp(platform.vanishTimer / 0.18, 0, 1);
                        }
                        this.ctx.drawImage(img, platform.x - platform.width / 2, screenY - 12, platform.width, 18);
                        this.ctx.restore();
                    },
                    () => {
                        this.ctx.save();
                        if (!platform.active && platform.type === "brown") {
                            this.ctx.globalAlpha = clamp(platform.brokenTimer / 0.28, 0, 1);
                        }
                        if (!platform.active && platform.type === "white") {
                            this.ctx.globalAlpha = clamp(platform.vanishTimer / 0.18, 0, 1);
                        }
                        this.ctx.fillStyle = platform.type === "green" ? "#79c937" : platform.type === "blue" ? "#6bb8f2" : platform.type === "brown" ? "#8d6338" : "#ffffff";
                        this.ctx.strokeStyle = "#191511";
                        this.ctx.lineWidth = 2;
                        this.ctx.beginPath();
                        this.ctx.roundRect(platform.x - platform.width / 2, screenY - 12, platform.width, 18, 12);
                        this.ctx.fill();
                        this.ctx.stroke();
                        this.ctx.restore();
                    },
                );

                if (platform.pickup && !platform.pickup.used) {
                    this.drawPickup(platform);
                }
            }
        }

        drawPickup(platform) {
            const pickup = platform.pickup;
            const screenY = this.worldToScreen(platform.y + 28);

            if (pickup.type === "spring") {
                this.drawImageOrFallback(
                    this.assets.spring,
                    (img) => this.ctx.drawImage(img, pickup.x - 14, screenY - 26, 28, 30),
                    () => {
                        this.ctx.strokeStyle = "#171310";
                        this.ctx.lineWidth = 2;
                        this.ctx.beginPath();
                        this.ctx.moveTo(pickup.x - 8, screenY + 2);
                        this.ctx.lineTo(pickup.x - 4, screenY - 4);
                        this.ctx.lineTo(pickup.x, screenY + 2);
                        this.ctx.lineTo(pickup.x + 4, screenY - 4);
                        this.ctx.lineTo(pickup.x + 8, screenY + 2);
                        this.ctx.stroke();
                    },
                );
                return;
            }

            if (pickup.type === "propeller") {
                this.drawImageOrFallback(
                    this.assets.propeller,
                    (img) => {
                        const frame = Math.floor(this.time * 12) % 4;
                        this.drawSpriteFrame(
                            img,
                            img.width / 2,
                            img.height / 2,
                            frame,
                            2,
                            pickup.x - 22,
                            screenY - 30 + Math.sin(this.time * 16) * 2,
                            44,
                            32,
                        );
                    },
                    () => {
                        this.ctx.fillStyle = "#ffb83f";
                        this.ctx.fillRect(pickup.x - 8, screenY - 12, 16, 12);
                        this.ctx.strokeRect(pickup.x - 8, screenY - 12, 16, 12);
                    },
                );
                return;
            }

            if (pickup.type === "jetpack") {
                this.drawImageOrFallback(
                    this.assets.jetpack,
                    (img) => {
                        const frame = Math.floor(this.time * 14) % 4;
                        this.drawSpriteFrame(
                            img,
                            img.width / 4,
                            img.height / 4,
                            frame,
                            4,
                            pickup.x - 20,
                            screenY - 34,
                            40,
                            46,
                        );
                    },
                    () => {
                        this.ctx.fillStyle = "#9dd6ff";
                        this.ctx.fillRect(pickup.x - 10, screenY - 18, 20, 24);
                        this.ctx.strokeRect(pickup.x - 10, screenY - 18, 20, 24);
                    },
                );
            }
        }

        drawMonsters() {
            for (const monster of this.monsters) {
                const screenY = this.worldToScreen(monster.y);
                const fadedByBoost = this.player.boostInvulnerableTimer > 0 && monster.y > this.player.y - 80 && monster.y < this.player.y + 280;
                if (fadedByBoost) {
                    this.ctx.save();
                    this.ctx.globalAlpha = 0.32;
                }
                this.drawImageOrFallback(
                    this.assets.monster,
                    (img) => this.ctx.drawImage(img, monster.x - monster.width / 2, screenY - monster.height, monster.width, monster.height),
                    () => {
                        this.ctx.fillStyle = "#6fae39";
                        this.ctx.strokeStyle = "#191511";
                        this.ctx.lineWidth = 2;
                        this.ctx.beginPath();
                        this.ctx.ellipse(monster.x, screenY - monster.height / 2, monster.width / 2, monster.height / 2, 0, 0, Math.PI * 2);
                        this.ctx.fill();
                        this.ctx.stroke();
                    },
                );
                if (fadedByBoost) {
                    this.ctx.restore();
                }
            }
        }

        drawBullets() {
            for (const bullet of this.bullets) {
                const screenY = this.worldToScreen(bullet.y);
                this.drawImageOrFallback(
                    this.assets.projectile,
                    (img) => this.ctx.drawImage(img, bullet.x - 7, screenY - 16, 14, 18),
                    () => {
                        this.ctx.fillStyle = "#171310";
                        this.ctx.fillRect(bullet.x - 2, screenY - 12, 4, 12);
                    },
                );
            }
        }

        drawPlayer() {
            const screenY = this.worldToScreen(this.player.y);
            const ascending = this.player.vy > 0;
            const shooting = this.input.shoot && this.player.shootCooldown > SHOT_COOLDOWN - 0.1;

            let sprite = this.player.facing === "left" ? this.assets.playerLeft : this.assets.playerRight;
            if (ascending) {
                sprite = this.player.facing === "left" ? this.assets.playerLeftJump : this.assets.playerRightJump;
            }
            if (shooting) {
                sprite = ascending ? this.assets.playerShootJump : this.assets.playerShoot;
            }

            this.drawImageOrFallback(
                sprite,
                (img) => this.ctx.drawImage(img, this.player.x - this.player.width / 2, screenY - this.player.height, this.player.width, this.player.height),
                () => {
                    this.ctx.fillStyle = "#8bcf32";
                    this.ctx.strokeStyle = "#191511";
                    this.ctx.lineWidth = 2;
                    this.ctx.beginPath();
                    this.ctx.ellipse(this.player.x, screenY - 28, 24, 20, 0, 0, Math.PI * 2);
                    this.ctx.fill();
                    this.ctx.stroke();
                },
            );

            if (this.player.boostType === "propeller") {
                this.drawImageOrFallback(
                    this.assets.propeller,
                    (img) => {
                        const frame = Math.floor(this.time * 14) % 4;
                        this.drawSpriteFrame(
                            img,
                            img.width / 2,
                            img.height / 2,
                            frame,
                            2,
                            this.player.x - 24,
                            screenY - this.player.height - 18 + Math.sin(this.time * 20) * 2,
                            48,
                            30,
                        );
                    },
                    () => {},
                );
            }

            if (this.player.boostType === "jetpack") {
                this.drawImageOrFallback(
                    this.assets.jetpack,
                    (img) => {
                        const frame = Math.floor(this.time * 16) % 4;
                        this.drawSpriteFrame(
                            img,
                            img.width / 4,
                            img.height / 4,
                            frame,
                            4,
                            this.player.x - 25,
                            screenY - this.player.height + 2,
                            50,
                            52,
                        );
                    },
                    () => {},
                );
            }
        }

        drawEffects() {
            this.ctx.save();
            this.ctx.font = '700 18px "Patrick Hand SC"';
            this.ctx.textAlign = "center";
            this.ctx.fillStyle = "#171310";
            this.ctx.strokeStyle = "rgba(255,255,255,0.8)";
            this.ctx.lineWidth = 4;

            if (this.player.boostInvulnerableTimer > 0) {
                const strength = clamp(this.player.boostInvulnerableTimer / (this.player.boostType === "jetpack" ? 1.77 : 1.5), 0, 1);
                this.ctx.save();
                this.ctx.globalAlpha = 0.22 + strength * 0.22;
                this.ctx.strokeStyle = this.player.boostType === "jetpack" ? "rgba(255, 199, 105, 0.85)" : "rgba(255,255,255,0.75)";
                this.ctx.lineWidth = 3;
                for (let index = 0; index < 7; index += 1) {
                    const offset = (index - 3) * 18;
                    const x = this.player.x + offset;
                    const screenY = this.worldToScreen(this.player.y);
                    this.ctx.beginPath();
                    this.ctx.moveTo(x, screenY + 60);
                    this.ctx.lineTo(x, screenY - 120);
                    this.ctx.stroke();
                }
                this.ctx.restore();
            }

            for (const effect of this.effects) {
                const screenY = this.worldToScreen(effect.y);
                this.ctx.globalAlpha = effect.alpha ?? clamp(effect.life / 0.5, 0, 1);
                if (effect.kind === "trail") {
                    this.ctx.save();
                    this.ctx.strokeStyle = effect.color ?? "rgba(255,255,255,0.5)";
                    this.ctx.lineWidth = 4;
                    this.ctx.beginPath();
                    this.ctx.moveTo(effect.x, screenY - effect.size * 0.2);
                    this.ctx.lineTo(effect.x, screenY + effect.size);
                    this.ctx.stroke();
                    this.ctx.restore();
                    continue;
                }
                if (effect.kind === "burst") {
                    this.ctx.save();
                    this.ctx.strokeStyle = effect.color ?? "rgba(255,255,255,0.6)";
                    this.ctx.lineWidth = 5;
                    this.ctx.beginPath();
                    this.ctx.arc(effect.x, screenY, effect.radius, 0, Math.PI * 2);
                    this.ctx.stroke();
                    this.ctx.restore();
                    continue;
                }
                this.ctx.strokeText(effect.text, effect.x, screenY);
                this.ctx.fillText(effect.text, effect.x, screenY);
            }

            this.ctx.restore();
        }

        render() {
            this.drawBackground();
            this.drawPlatforms();
            this.drawMonsters();
            this.drawBullets();
            this.drawPlayer();
            this.drawEffects();
        }
    }

    const game = new Game();
    window.doodleJumpParody = game;
    window.addEventListener("DOMContentLoaded", () => game.init());
})();
