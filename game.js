(() => {
    const STORAGE_KEY = "skybound-scribble-save-v1";

    const CONFIG = {
        width: 420,
        height: 720,
        gravity: -1820,
        moveAcceleration: 1650,
        friction: 1280,
        maxMoveSpeed: 320,
        jumpVelocity: 920,
        springVelocity: 1180,
        boostVelocity: 1260,
        breakVelocity: 760,
        jetpackVelocity: 1380,
        jetpackDuration: 1.3,
        cameraFollowHeight: 300,
        deathBuffer: 170,
        platformThickness: 14,
        cloudBuffer: 560,
        worldPadding: 18,
        maxDelta: 1 / 30,
    };

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const lerp = (start, end, amount) => start + (end - start) * amount;
    const randomRange = (min, max) => min + Math.random() * (max - min);
    const randomInt = (min, max) => Math.floor(randomRange(min, max + 1));
    const chance = (value) => Math.random() < value;
    const sign = () => (Math.random() < 0.5 ? -1 : 1);

    class AudioSystem {
        constructor() {
            this.context = null;
            this.master = null;
            this.muted = true;
        }

        ensureContext() {
            if (this.context) {
                if (this.context.state === "suspended") {
                    this.context.resume().catch(() => {});
                }
                return;
            }

            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) {
                return;
            }

            this.context = new AudioContext();
            this.master = this.context.createGain();
            this.master.gain.value = this.muted ? 0 : 0.08;
            this.master.connect(this.context.destination);
        }

        setMuted(value) {
            this.muted = value;
            if (this.master) {
                this.master.gain.value = value ? 0 : 0.08;
            }
        }

        tone(frequency, duration, type = "sine", volume = 0.2, slideTo = null) {
            if (!this.context || this.muted) {
                return;
            }

            const now = this.context.currentTime;
            const oscillator = this.context.createOscillator();
            const gain = this.context.createGain();

            oscillator.type = type;
            oscillator.frequency.setValueAtTime(frequency, now);
            if (slideTo) {
                oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), now + duration);
            }

            gain.gain.setValueAtTime(volume, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

            oscillator.connect(gain);
            gain.connect(this.master);

            oscillator.start(now);
            oscillator.stop(now + duration);
        }

        playJump() {
            this.tone(360, 0.08, "triangle", 0.07, 510);
        }

        playBoost() {
            this.tone(420, 0.22, "sawtooth", 0.08, 900);
        }

        playJetpack() {
            this.tone(180, 0.16, "square", 0.05, 260);
        }

        playGameOver() {
            this.tone(260, 0.12, "triangle", 0.08, 160);
            this.tone(180, 0.24, "sine", 0.06, 100);
        }

        playButton() {
            this.tone(520, 0.06, "triangle", 0.06, 690);
        }
    }

    class InputController {
        constructor() {
            this.left = false;
            this.right = false;
            this.pauseRequested = false;
            this.restartRequested = false;
        }

        bind({ leftButton, rightButton }) {
            const setButtonState = (element, property, active) => {
                this[property] = active;
                if (element) {
                    element.classList.toggle("is-active", active);
                }
            };

            window.addEventListener("keydown", (event) => {
                if (["ArrowLeft", "a", "A"].includes(event.key)) {
                    this.left = true;
                }
                if (["ArrowRight", "d", "D"].includes(event.key)) {
                    this.right = true;
                }
                if (["p", "P", "Escape"].includes(event.key)) {
                    this.pauseRequested = true;
                }
                if (["r", "R", "Enter"].includes(event.key)) {
                    this.restartRequested = true;
                }
            });

            window.addEventListener("keyup", (event) => {
                if (["ArrowLeft", "a", "A"].includes(event.key)) {
                    this.left = false;
                }
                if (["ArrowRight", "d", "D"].includes(event.key)) {
                    this.right = false;
                }
            });

            const bindTouchControl = (element, property) => {
                if (!element) {
                    return;
                }

                const activate = (event) => {
                    event.preventDefault();
                    setButtonState(element, property, true);
                };

                const deactivate = (event) => {
                    event.preventDefault();
                    setButtonState(element, property, false);
                };

                element.addEventListener("pointerdown", activate);
                element.addEventListener("pointerup", deactivate);
                element.addEventListener("pointercancel", deactivate);
                element.addEventListener("pointerleave", (event) => {
                    if (event.buttons === 0) {
                        deactivate(event);
                    }
                });
            };

            bindTouchControl(leftButton, "left");
            bindTouchControl(rightButton, "right");
        }

        getAxis() {
            return (this.right ? 1 : 0) - (this.left ? 1 : 0);
        }

        consumePauseRequest() {
            const requested = this.pauseRequested;
            this.pauseRequested = false;
            return requested;
        }

        consumeRestartRequest() {
            const requested = this.restartRequested;
            this.restartRequested = false;
            return requested;
        }
    }

    class Player {
        constructor() {
            this.width = 40;
            this.height = 54;
            this.reset(CONFIG.width / 2, 130);
        }

        reset(x, y) {
            this.x = x;
            this.y = y;
            this.prevY = y;
            this.vx = 0;
            this.vy = CONFIG.jumpVelocity * 0.92;
            this.jetpackTimer = 0;
            this.bob = 0;
            this.facing = 1;
            this.squash = 0;
        }

        applyJetpack() {
            this.jetpackTimer = CONFIG.jetpackDuration;
            this.vy = CONFIG.jetpackVelocity;
        }

        bounce(velocity) {
            this.vy = velocity;
            this.squash = 1;
        }

        getBounds() {
            const left = this.x - this.width / 2;
            return {
                left,
                right: left + this.width,
                bottom: this.y,
                top: this.y + this.height,
            };
        }

        update(dt, input) {
            this.prevY = this.y;
            this.bob += dt * 8;

            const axis = input.getAxis();
            if (axis !== 0) {
                this.vx += axis * CONFIG.moveAcceleration * dt;
                this.facing = axis > 0 ? 1 : -1;
            } else {
                const frictionAmount = CONFIG.friction * dt;
                if (Math.abs(this.vx) <= frictionAmount) {
                    this.vx = 0;
                } else {
                    this.vx -= Math.sign(this.vx) * frictionAmount;
                }
            }

            this.vx = clamp(this.vx, -CONFIG.maxMoveSpeed, CONFIG.maxMoveSpeed);
            this.x += this.vx * dt;

            const wrapPadding = this.width / 2;
            if (this.x < -wrapPadding) {
                this.x = CONFIG.width + wrapPadding;
            }
            if (this.x > CONFIG.width + wrapPadding) {
                this.x = -wrapPadding;
            }

            if (this.jetpackTimer > 0) {
                this.jetpackTimer = Math.max(0, this.jetpackTimer - dt);
                this.vy = lerp(this.vy, CONFIG.jetpackVelocity, 0.24);
            } else {
                this.vy += CONFIG.gravity * dt;
            }

            this.y += this.vy * dt;
            this.squash = Math.max(0, this.squash - dt * 3.2);
        }

        draw(ctx, game) {
            const screenY = game.worldToScreenY(this.y);
            const bounceStretch = 1 + Math.max(0, this.vy) / 2800;
            const squashX = 1 + this.squash * 0.22;
            const squashY = 1 - this.squash * 0.16;

            ctx.save();
            ctx.translate(this.x, screenY - this.height * 0.58);
            ctx.scale(this.facing, 1);
            ctx.scale(squashX, squashY * clamp(bounceStretch, 0.94, 1.12));

            ctx.lineWidth = 3;
            ctx.strokeStyle = "#173150";

            ctx.fillStyle = "#82d66b";
            ctx.beginPath();
            ctx.ellipse(0, -6, 18, 22, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = "#fff";
            ctx.beginPath();
            ctx.arc(-6, -10, 4, 0, Math.PI * 2);
            ctx.arc(6, -10, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = "#173150";
            ctx.beginPath();
            ctx.arc(-6, -10, 1.8, 0, Math.PI * 2);
            ctx.arc(6, -10, 1.8, 0, Math.PI * 2);
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(9, -5);
            ctx.lineTo(18, -2);
            ctx.lineTo(7, 2);
            ctx.closePath();
            ctx.fillStyle = "#ffbb6e";
            ctx.fill();
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(-10, 17);
            ctx.lineTo(-18, 26);
            ctx.moveTo(10, 17);
            ctx.lineTo(18, 26);
            ctx.moveTo(-14, 4);
            ctx.lineTo(-22, 10);
            ctx.moveTo(14, 4);
            ctx.lineTo(24, 10);
            ctx.stroke();

            if (this.jetpackTimer > 0) {
                ctx.fillStyle = "#ff8c62";
                ctx.fillRect(-16, 0, 8, 18);
                ctx.fillRect(8, 0, 8, 18);
                ctx.fillStyle = "#ffd166";
                const flameLength = 12 + Math.sin(game.time * 36) * 6;
                ctx.beginPath();
                ctx.moveTo(-12, 18);
                ctx.lineTo(-16, 18 + flameLength);
                ctx.lineTo(-8, 18 + flameLength * 0.7);
                ctx.closePath();
                ctx.fill();

                ctx.beginPath();
                ctx.moveTo(12, 18);
                ctx.lineTo(8, 18 + flameLength);
                ctx.lineTo(16, 18 + flameLength * 0.7);
                ctx.closePath();
                ctx.fill();
            }

            ctx.restore();
        }
    }

    class Pickup {
        constructor(type, x, y, platform = null) {
            this.type = type;
            this.x = x;
            this.y = y;
            this.platform = platform;
            this.width = type === "jetpack" ? 28 : 24;
            this.height = type === "jetpack" ? 36 : 24;
            this.used = false;
            this.phase = randomRange(0, Math.PI * 2);
        }

        update(dt) {
            this.phase += dt * 3;
            if (this.platform) {
                this.x = this.platform.x + this.platform.width / 2;
                this.y = this.platform.y + 14;
                if (!this.platform.active) {
                    this.used = true;
                }
            }
        }

        getBounds() {
            return {
                left: this.x - this.width / 2,
                right: this.x + this.width / 2,
                bottom: this.y,
                top: this.y + this.height,
            };
        }

        draw(ctx, game) {
            if (this.used) {
                return;
            }

            const screenY = game.worldToScreenY(this.y);
            ctx.save();
            ctx.translate(this.x, screenY - this.height * 0.55 + Math.sin(this.phase) * 4);
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = "#173150";

            if (this.type === "spring") {
                ctx.beginPath();
                ctx.moveTo(-8, 12);
                ctx.lineTo(-4, 7);
                ctx.lineTo(0, 12);
                ctx.lineTo(4, 7);
                ctx.lineTo(8, 12);
                ctx.stroke();
                ctx.fillStyle = "#ffd166";
                ctx.fillRect(-11, 12, 22, 6);
                ctx.strokeRect(-11, 12, 22, 6);
            } else if (this.type === "jetpack") {
                ctx.fillStyle = "#ff8764";
                ctx.fillRect(-12, -4, 10, 24);
                ctx.strokeRect(-12, -4, 10, 24);
                ctx.fillRect(2, -4, 10, 24);
                ctx.strokeRect(2, -4, 10, 24);

                ctx.fillStyle = "#85daf4";
                ctx.fillRect(-8, -12, 16, 12);
                ctx.strokeRect(-8, -12, 16, 12);

                ctx.fillStyle = "#ffd166";
                ctx.beginPath();
                ctx.moveTo(-7, 20);
                ctx.lineTo(-12, 30);
                ctx.lineTo(-3, 27);
                ctx.closePath();
                ctx.fill();

                ctx.beginPath();
                ctx.moveTo(7, 20);
                ctx.lineTo(3, 30);
                ctx.lineTo(12, 27);
                ctx.closePath();
                ctx.fill();
            }

            ctx.restore();
        }
    }

    class Platform {
        constructor({ type, x, y, width, speed = 0 }) {
            this.type = type;
            this.x = x;
            this.y = y;
            this.width = width;
            this.height = CONFIG.platformThickness;
            this.speed = speed;
            this.active = true;
            this.life = 1;
            this.breakTimer = 0;
            this.fadeTimer = 0;
            this.pickup = null;
        }

        update(dt) {
            if (this.type === "moving") {
                this.x += this.speed * dt;
                if (this.x <= CONFIG.worldPadding || this.x + this.width >= CONFIG.width - CONFIG.worldPadding) {
                    this.speed *= -1;
                    this.x = clamp(this.x, CONFIG.worldPadding, CONFIG.width - CONFIG.worldPadding - this.width);
                }
            }

            if (this.breakTimer > 0) {
                this.breakTimer = Math.max(0, this.breakTimer - dt);
                this.life = this.breakTimer / 0.35;
            }

            if (this.fadeTimer > 0) {
                this.fadeTimer = Math.max(0, this.fadeTimer - dt);
                this.life = this.fadeTimer / 0.45;
            }
        }

        canLand(player) {
            if (!this.active) {
                return false;
            }

            const bounds = player.getBounds();
            const prevBottom = player.prevY;
            const currentBottom = bounds.bottom;
            const overlap = Math.min(bounds.right, this.x + this.width) - Math.max(bounds.left, this.x);

            return (
                player.vy <= 0 &&
                prevBottom >= this.y + this.height &&
                currentBottom <= this.y + this.height &&
                overlap > 16
            );
        }

        onLand(game, player) {
            if (!this.active) {
                return false;
            }

            player.y = this.y + this.height;

            let bounceVelocity = CONFIG.jumpVelocity;
            let specialLabel = "";

            if (this.type === "boost") {
                bounceVelocity = CONFIG.boostVelocity;
                specialLabel = "BOOST!";
            } else if (this.type === "break") {
                bounceVelocity = CONFIG.breakVelocity;
                specialLabel = "CRACK!";
                this.breakTimer = 0.35;
                this.active = false;
            } else if (this.type === "ghost") {
                bounceVelocity = CONFIG.jumpVelocity * 1.03;
                specialLabel = "FADE!";
                this.fadeTimer = 0.45;
                this.active = false;
            } else if (this.type === "moving") {
                specialLabel = "DRIFT!";
            }

            if (this.pickup && !this.pickup.used && this.pickup.type === "spring") {
                this.pickup.used = true;
                bounceVelocity = Math.max(bounceVelocity, CONFIG.springVelocity);
                specialLabel = "SPRING!";
            }

            player.bounce(bounceVelocity);
            game.onPlayerBounce(this, bounceVelocity, specialLabel);
            return true;
        }

        draw(ctx, game) {
            if (!this.active && this.life <= 0) {
                return;
            }

            const screenY = game.worldToScreenY(this.y);
            const opacity = clamp(this.life, 0, 1);
            const colors = {
                normal: "#8ddf95",
                moving: "#73ccff",
                break: "#ffd166",
                ghost: "#cab8ff",
                boost: "#ff9a92",
            };

            ctx.save();
            ctx.globalAlpha = opacity;
            ctx.translate(this.x, screenY - this.height);
            ctx.lineWidth = 3;
            ctx.strokeStyle = "#173150";
            ctx.fillStyle = colors[this.type] || colors.normal;

            ctx.beginPath();
            ctx.roundRect(0, 0, this.width, this.height, 10);
            ctx.fill();
            ctx.stroke();

            if (this.type === "moving") {
                ctx.beginPath();
                ctx.moveTo(14, this.height / 2);
                ctx.lineTo(24, this.height / 2 - 4);
                ctx.moveTo(14, this.height / 2);
                ctx.lineTo(24, this.height / 2 + 4);
                ctx.moveTo(this.width - 14, this.height / 2);
                ctx.lineTo(this.width - 24, this.height / 2 - 4);
                ctx.moveTo(this.width - 14, this.height / 2);
                ctx.lineTo(this.width - 24, this.height / 2 + 4);
                ctx.stroke();
            }

            if (this.type === "break") {
                ctx.beginPath();
                ctx.moveTo(this.width * 0.18, 4);
                ctx.lineTo(this.width * 0.42, this.height - 2);
                ctx.lineTo(this.width * 0.57, 5);
                ctx.lineTo(this.width * 0.81, this.height - 2);
                ctx.stroke();
            }

            if (this.type === "ghost") {
                ctx.setLineDash([5, 5]);
                ctx.strokeRect(6, 3, this.width - 12, this.height - 6);
            }

            if (this.type === "boost") {
                ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
                ctx.beginPath();
                ctx.moveTo(14, this.height - 3);
                ctx.lineTo(this.width / 2, 3);
                ctx.lineTo(this.width - 14, this.height - 3);
                ctx.stroke();
            }

            ctx.restore();
        }
    }

    class Enemy {
        constructor(x, y) {
            this.x = x;
            this.y = y;
            this.width = 42;
            this.height = 34;
            this.speed = randomRange(32, 68) * sign();
            this.phase = randomRange(0, Math.PI * 2);
            this.counted = false;
        }

        update(dt) {
            this.phase += dt * 2.2;
            this.x += this.speed * dt;

            if (this.x < 22 || this.x + this.width > CONFIG.width - 22) {
                this.speed *= -1;
                this.x = clamp(this.x, 22, CONFIG.width - this.width - 22);
            }
        }

        getBounds() {
            return {
                left: this.x,
                right: this.x + this.width,
                bottom: this.y,
                top: this.y + this.height,
            };
        }

        collides(player) {
            const a = this.getBounds();
            const b = player.getBounds();

            return (
                a.left < b.right &&
                a.right > b.left &&
                a.bottom < b.top - 8 &&
                a.top > b.bottom + 4
            );
        }

        draw(ctx, game) {
            const screenY = game.worldToScreenY(this.y);
            const bob = Math.sin(this.phase) * 5;

            ctx.save();
            ctx.translate(this.x + this.width / 2, screenY - this.height / 2 + bob);
            ctx.lineWidth = 3;
            ctx.strokeStyle = "#173150";
            ctx.fillStyle = "#ff799d";

            ctx.beginPath();
            ctx.ellipse(0, 0, 20, 15, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = "#fff";
            ctx.beginPath();
            ctx.arc(-7, -2, 4, 0, Math.PI * 2);
            ctx.arc(7, -2, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = "#173150";
            ctx.beginPath();
            ctx.arc(-7, -2, 2, 0, Math.PI * 2);
            ctx.arc(7, -2, 2, 0, Math.PI * 2);
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(-11, 9);
            ctx.lineTo(-7, 15);
            ctx.lineTo(-1, 9);
            ctx.lineTo(5, 15);
            ctx.lineTo(11, 9);
            ctx.stroke();

            ctx.restore();
        }
    }

    class Game {
        constructor() {
            this.canvas = document.getElementById("gameCanvas");
            this.ctx = this.canvas.getContext("2d");

            this.elements = {
                hudScore: document.getElementById("hudScore"),
                hudHeight: document.getElementById("hudHeight"),
                hudBest: document.getElementById("hudBest"),
                hudStreak: document.getElementById("hudStreak"),
                finalScore: document.getElementById("finalScore"),
                finalHeight: document.getElementById("finalHeight"),
                finalStreak: document.getElementById("finalStreak"),
                startScreen: document.getElementById("startScreen"),
                pauseScreen: document.getElementById("pauseScreen"),
                gameOverScreen: document.getElementById("gameOverScreen"),
                startButton: document.getElementById("startButton"),
                resumeButton: document.getElementById("resumeButton"),
                restartButton: document.getElementById("restartButton"),
                pauseButton: document.getElementById("pauseButton"),
                soundToggle: document.getElementById("soundToggle"),
                leftButton: document.getElementById("leftButton"),
                rightButton: document.getElementById("rightButton"),
            };

            this.audio = new AudioSystem();
            this.input = new InputController();
            this.player = new Player();
            this.platforms = [];
            this.pickups = [];
            this.enemies = [];
            this.particles = [];
            this.floatingTexts = [];
            this.clouds = [];
            this.stars = [];
            this.state = "start";
            this.cameraBottom = 0;
            this.maxHeight = 0;
            this.score = 0;
            this.bestScore = 0;
            this.bestHeight = 0;
            this.startHeight = 0;
            this.styleStreak = 0;
            this.maxStyleStreak = 0;
            this.styleTimer = 0;
            this.bonusScore = 0;
            this.landings = 0;
            this.time = 0;
            this.lastFrameTime = 0;
            this.highestPlatformY = 0;
            this.highestCloudY = 0;
            this.highestStarY = 0;
            this.spawnGuideX = CONFIG.width / 2;
            this.spawnIndex = 0;

            this.loadSave();
            this.audio.setMuted(this.muted);
            this.input.bind({
                leftButton: this.elements.leftButton,
                rightButton: this.elements.rightButton,
            });
            this.bindUi();
            this.syncHud(true);
        }

        bindUi() {
            this.elements.startButton.addEventListener("click", () => {
                this.audio.ensureContext();
                this.audio.playButton();
                this.startRun();
            });

            this.elements.resumeButton.addEventListener("click", () => {
                this.audio.ensureContext();
                this.audio.playButton();
                this.resume();
            });

            this.elements.restartButton.addEventListener("click", () => {
                this.audio.ensureContext();
                this.audio.playButton();
                this.startRun();
            });

            this.elements.pauseButton.addEventListener("click", () => {
                this.audio.ensureContext();
                this.audio.playButton();
                if (this.state === "playing") {
                    this.pause();
                } else if (this.state === "paused") {
                    this.resume();
                } else if (this.state === "start" || this.state === "gameOver") {
                    this.startRun();
                }
            });

            this.elements.soundToggle.addEventListener("click", () => {
                this.audio.ensureContext();
                this.muted = !this.muted;
                this.audio.setMuted(this.muted);
                if (!this.muted) {
                    this.audio.playButton();
                }
                this.persist();
                this.syncHud();
            });
        }

        init() {
            this.resetRun();
            this.setState("start");
            this.lastFrameTime = performance.now();
            requestAnimationFrame((time) => this.frame(time));
        }

        loadSave() {
            this.muted = true;

            try {
                const raw = window.localStorage.getItem(STORAGE_KEY);
                if (!raw) {
                    return;
                }

                const data = JSON.parse(raw);
                this.bestScore = Number(data.bestScore) || 0;
                this.bestHeight = Number(data.bestHeight) || 0;
                this.muted = data.muted !== undefined ? Boolean(data.muted) : true;
            } catch (_error) {
                this.bestScore = 0;
                this.bestHeight = 0;
                this.muted = true;
            }
        }

        persist() {
            try {
                window.localStorage.setItem(
                    STORAGE_KEY,
                    JSON.stringify({
                        bestScore: this.bestScore,
                        bestHeight: this.bestHeight,
                        muted: this.muted,
                    }),
                );
            } catch (_error) {
                // Ignore storage failures.
            }
        }

        setState(nextState) {
            this.state = nextState;
            this.elements.startScreen.classList.toggle("is-hidden", nextState !== "start");
            this.elements.pauseScreen.classList.toggle("is-hidden", nextState !== "paused");
            this.elements.gameOverScreen.classList.toggle("is-hidden", nextState !== "gameOver");

            const pauseLabel = nextState === "paused" ? "Resume" : nextState === "playing" ? "Pause" : "Play";
            this.elements.pauseButton.textContent = pauseLabel;
        }

        startRun() {
            this.resetRun();
            this.setState("playing");
        }

        pause() {
            if (this.state === "playing") {
                this.setState("paused");
            }
        }

        resume() {
            if (this.state === "paused") {
                this.setState("playing");
            }
        }

        endRun() {
            this.bestScore = Math.max(this.bestScore, this.score);
            this.bestHeight = Math.max(this.bestHeight, this.heightToMeters(this.getRunHeight()));
            this.persist();

            this.elements.finalScore.textContent = this.score.toLocaleString();
            this.elements.finalHeight.textContent = `${this.heightToMeters(this.getRunHeight()).toLocaleString()} m`;
            this.elements.finalStreak.textContent = `x${this.maxStyleStreak}`;
            this.audio.playGameOver();
            this.setState("gameOver");
            this.syncHud();
        }

        resetRun() {
            this.player.reset(CONFIG.width / 2, 120);
            this.startHeight = this.player.y;
            this.platforms = [];
            this.pickups = [];
            this.enemies = [];
            this.particles = [];
            this.floatingTexts = [];
            this.clouds = [];
            this.stars = [];
            this.cameraBottom = 0;
            this.maxHeight = this.player.y;
            this.score = 0;
            this.styleStreak = 0;
            this.maxStyleStreak = 0;
            this.styleTimer = 0;
            this.bonusScore = 0;
            this.landings = 0;
            this.highestPlatformY = 0;
            this.highestCloudY = 0;
            this.highestStarY = 0;
            this.spawnGuideX = CONFIG.width / 2;
            this.spawnIndex = 0;

            const basePlatform = new Platform({
                type: "normal",
                x: CONFIG.width / 2 - 56,
                y: 62,
                width: 112,
            });
            this.platforms.push(basePlatform);
            this.highestPlatformY = basePlatform.y;

            for (let index = 0; index < 8; index += 1) {
                this.generateNextPlatform(true);
            }

            this.ensureWorldFilled();
            this.syncHud(true);
        }

        frame(timestamp) {
            const dt = Math.min(CONFIG.maxDelta, (timestamp - this.lastFrameTime) / 1000 || 0);
            this.lastFrameTime = timestamp;
            this.time += dt;

            if (this.input.consumePauseRequest()) {
                if (this.state === "playing") {
                    this.pause();
                } else if (this.state === "paused") {
                    this.resume();
                } else if (this.state === "start" || this.state === "gameOver") {
                    this.startRun();
                }
            }

            if (this.input.consumeRestartRequest() && (this.state === "start" || this.state === "gameOver")) {
                this.startRun();
            }

            if (this.state === "playing") {
                this.update(dt);
            } else {
                this.updateIdle(dt);
            }

            this.render();
            requestAnimationFrame((time) => this.frame(time));
        }

        updateIdle(dt) {
            this.player.bob += dt * 2;
            this.ensureWorldFilled();

            for (const cloud of this.clouds) {
                cloud.phase += dt * cloud.speed;
            }
        }

        update(dt) {
            this.styleTimer = Math.max(0, this.styleTimer - dt);
            if (this.styleTimer === 0) {
                this.styleStreak = 0;
            }

            for (const platform of this.platforms) {
                platform.update(dt);
            }

            for (const pickup of this.pickups) {
                pickup.update(dt);
            }

            for (const enemy of this.enemies) {
                enemy.update(dt);
            }

            for (const cloud of this.clouds) {
                cloud.phase += dt * cloud.speed;
            }

            this.player.update(dt, this.input);

            if (this.player.jetpackTimer > 0) {
                if (chance(0.55)) {
                    this.spawnParticle({
                        x: this.player.x + randomRange(-8, 8),
                        y: this.player.y + 6,
                        vx: randomRange(-24, 24),
                        vy: randomRange(-220, -110),
                        life: 0.42,
                        color: chance(0.5) ? "#ffd166" : "#ff8f66",
                        size: randomRange(4, 8),
                    });
                }
                if (chance(0.08)) {
                    this.audio.playJetpack();
                }
            }

            for (const pickup of this.pickups) {
                if (pickup.used || pickup.type !== "jetpack") {
                    continue;
                }
                if (this.boundsOverlap(this.player.getBounds(), pickup.getBounds())) {
                    pickup.used = true;
                    this.player.applyJetpack();
                    this.bonusScore += 250;
                    this.bumpStyleStreak(2);
                    this.spawnFloatingText("JETPACK!", this.player.x, this.player.y + 90, "#ff8f66");
                    this.emitBurst(this.player.x, this.player.y + 40, 18, ["#ffd166", "#ff8f66", "#85daf4"]);
                    this.audio.playBoost();
                }
            }

            if (this.player.vy <= 0 && this.player.jetpackTimer <= 0) {
                for (let index = this.platforms.length - 1; index >= 0; index -= 1) {
                    if (this.platforms[index].canLand(this.player)) {
                        this.platforms[index].onLand(this, this.player);
                        break;
                    }
                }
            }

            this.maxHeight = Math.max(this.maxHeight, this.player.y);
            this.cameraBottom = Math.max(this.cameraBottom, this.player.y - CONFIG.cameraFollowHeight);

            for (const enemy of this.enemies) {
                if (!enemy.counted && enemy.y + 40 < this.maxHeight) {
                    enemy.counted = true;
                    this.bonusScore += 30;
                }

                if (enemy.collides(this.player)) {
                    this.endRun();
                    return;
                }
            }

            if (this.player.y < this.cameraBottom - CONFIG.deathBuffer) {
                this.endRun();
                return;
            }

            this.updateParticles(dt);
            this.updateFloatingTexts(dt);
            this.cleanupWorld();
            this.ensureWorldFilled();
            this.updateScore();
            this.syncHud();
        }

        updateParticles(dt) {
            this.particles = this.particles.filter((particle) => {
                particle.life -= dt;
                particle.x += particle.vx * dt;
                particle.y += particle.vy * dt;
                particle.vy += CONFIG.gravity * 0.14 * dt;
                particle.size = Math.max(0.5, particle.size - dt * 7);
                return particle.life > 0;
            });
        }

        updateFloatingTexts(dt) {
            this.floatingTexts = this.floatingTexts.filter((item) => {
                item.life -= dt;
                item.y += item.vy * dt;
                item.opacity = clamp(item.life / item.totalLife, 0, 1);
                return item.life > 0;
            });
        }

        cleanupWorld() {
            const lowerBound = this.cameraBottom - 140;
            const upperBound = this.cameraBottom + CONFIG.height + 800;

            this.platforms = this.platforms.filter((platform) => platform.y > lowerBound && platform.y < upperBound);
            this.pickups = this.pickups.filter((pickup) => !pickup.used && pickup.y > lowerBound && pickup.y < upperBound);
            this.enemies = this.enemies.filter((enemy) => enemy.y > lowerBound && enemy.y < upperBound);
            this.clouds = this.clouds.filter((cloud) => cloud.y > this.cameraBottom - 220);
            this.stars = this.stars.filter((star) => star.y > this.cameraBottom - 120);
        }

        updateScore() {
            const runHeight = this.getRunHeight();
            this.score = Math.max(
                0,
                Math.floor(runHeight * 0.68 + this.bonusScore + this.landings * 4 + this.maxStyleStreak * 18),
            );
        }

        onPlayerBounce(platform, bounceVelocity, specialLabel) {
            this.landings += 1;

            const special = ["boost", "ghost", "break", "moving"].includes(platform.type) || bounceVelocity > CONFIG.jumpVelocity + 40;
            if (special) {
                this.bumpStyleStreak(1);
                this.bonusScore += platform.type === "boost" ? 90 : 45;
            } else {
                this.styleStreak = Math.max(0, this.styleStreak - 1);
                this.styleTimer = 1.4;
            }

            this.spawnParticle({
                x: this.player.x,
                y: platform.y + 8,
                vx: randomRange(-60, 60),
                vy: randomRange(80, 180),
                life: 0.28,
                color: "#ffffff",
                size: randomRange(3, 6),
            });
            this.emitBurst(this.player.x, platform.y + 10, 8, ["#8ddf95", "#85daf4", "#ffd166"]);

            if (specialLabel) {
                this.spawnFloatingText(specialLabel, this.player.x, this.player.y + 60, "#ff8f66");
            }

            if (bounceVelocity >= CONFIG.boostVelocity) {
                this.audio.playBoost();
            } else {
                this.audio.playJump();
            }
        }

        bumpStyleStreak(amount) {
            this.styleStreak += amount;
            this.maxStyleStreak = Math.max(this.maxStyleStreak, this.styleStreak);
            this.styleTimer = 2.8;
        }

        emitBurst(x, y, count, palette) {
            for (let index = 0; index < count; index += 1) {
                this.spawnParticle({
                    x,
                    y,
                    vx: randomRange(-130, 130),
                    vy: randomRange(50, 240),
                    life: randomRange(0.2, 0.65),
                    color: palette[randomInt(0, palette.length - 1)],
                    size: randomRange(2, 5),
                });
            }
        }

        spawnParticle(particle) {
            this.particles.push(particle);
        }

        spawnFloatingText(text, x, y, color) {
            this.floatingTexts.push({
                text,
                x,
                y,
                vy: 46,
                life: 0.9,
                totalLife: 0.9,
                opacity: 1,
                color,
            });
        }

        ensureWorldFilled() {
            while (this.highestPlatformY < this.cameraBottom + CONFIG.height + 700) {
                this.generateNextPlatform();
            }

            while (this.highestCloudY < this.cameraBottom + CONFIG.height + CONFIG.cloudBuffer) {
                this.clouds.push({
                    x: randomRange(30, CONFIG.width - 30),
                    y: this.highestCloudY + randomRange(120, 200),
                    scale: randomRange(0.7, 1.4),
                    speed: randomRange(0.1, 0.3),
                    phase: randomRange(0, Math.PI * 2),
                });
                this.highestCloudY = this.clouds[this.clouds.length - 1].y;
            }

            while (this.highestStarY < this.cameraBottom + CONFIG.height + 600) {
                const starY = this.highestStarY + randomRange(30, 90);
                this.highestStarY = starY;
                if (starY > 980) {
                    this.stars.push({
                        x: randomRange(20, CONFIG.width - 20),
                        y: starY,
                        size: randomRange(1.5, 3.6),
                    });
                }
            }
        }

        generateNextPlatform(forceEasy = false) {
            const difficulty = clamp(this.getRunHeight() / 3600, 0, 1);
            const yGap = forceEasy ? randomRange(72, 92) : randomRange(78, lerp(110, 154, difficulty));
            const nextY = this.highestPlatformY + yGap;

            let type = "normal";
            if (!forceEasy) {
                const roll = Math.random();
                if (difficulty > 0.7 && roll < 0.08) {
                    type = "boost";
                } else if (difficulty > 0.4 && roll < 0.2) {
                    type = "ghost";
                } else if (difficulty > 0.22 && roll < 0.34) {
                    type = "break";
                } else if (difficulty > 0.08 && roll < 0.54) {
                    type = "moving";
                }
            }

            const widthMap = {
                normal: randomRange(78, 112),
                moving: randomRange(76, 104),
                break: randomRange(82, 106),
                ghost: randomRange(76, 100),
                boost: randomRange(78, 96),
            };

            const width = widthMap[type];
            const maxShift = forceEasy ? 70 : lerp(90, 160, difficulty);
            const targetX = clamp(
                this.spawnGuideX + randomRange(-maxShift, maxShift) - width / 2,
                CONFIG.worldPadding,
                CONFIG.width - CONFIG.worldPadding - width,
            );

            const speed = type === "moving" ? randomRange(38, 82) * sign() : 0;
            const platform = new Platform({ type, x: targetX, y: nextY, width, speed });
            this.platforms.push(platform);
            this.highestPlatformY = nextY;
            this.spawnGuideX = targetX + width / 2;
            this.spawnIndex += 1;

            if (chance(forceEasy ? 0.04 : 0.09 + difficulty * 0.08) && type !== "break") {
                const spring = new Pickup("spring", platform.x + platform.width / 2, platform.y + 14, platform);
                platform.pickup = spring;
                this.pickups.push(spring);
            } else if (!forceEasy && nextY > 900 && chance(0.025 + difficulty * 0.06)) {
                this.pickups.push(
                    new Pickup(
                        "jetpack",
                        platform.x + platform.width / 2,
                        platform.y + randomRange(52, 78),
                    ),
                );
            }

            if (!forceEasy && nextY > 1150 && chance(0.045 + difficulty * 0.12)) {
                this.enemies.push(
                    new Enemy(
                        clamp(platform.x + platform.width / 2 - 21, 20, CONFIG.width - 62),
                        platform.y + randomRange(64, 92),
                    ),
                );
            }
        }

        boundsOverlap(a, b) {
            return a.left < b.right && a.right > b.left && a.bottom < b.top && a.top > b.bottom;
        }

        worldToScreenY(y) {
            return CONFIG.height - (y - this.cameraBottom);
        }

        getRunHeight() {
            return Math.max(0, this.maxHeight - this.startHeight);
        }

        heightToMeters(height) {
            return Math.max(0, Math.floor(height * 0.36));
        }

        syncHud(force = false) {
            const scoreText = this.score.toLocaleString();
            const heightText = `${this.heightToMeters(this.getRunHeight()).toLocaleString()} m`;
            const bestText = this.bestScore.toLocaleString();
            const streakText = `x${this.styleStreak}`;
            const soundText = this.muted ? "Sound: Off" : "Sound: On";

            if (
                force ||
                this.elements.hudScore.textContent !== scoreText ||
                this.elements.hudHeight.textContent !== heightText ||
                this.elements.hudBest.textContent !== bestText ||
                this.elements.hudStreak.textContent !== streakText ||
                this.elements.soundToggle.textContent !== soundText
            ) {
                this.elements.hudScore.textContent = scoreText;
                this.elements.hudHeight.textContent = heightText;
                this.elements.hudBest.textContent = bestText;
                this.elements.hudStreak.textContent = streakText;
                this.elements.soundToggle.textContent = soundText;
                this.elements.soundToggle.setAttribute("aria-pressed", String(!this.muted));
            }
        }

        drawBackground() {
            const ctx = this.ctx;
            ctx.clearRect(0, 0, CONFIG.width, CONFIG.height);

            const altitudeTint = clamp(this.cameraBottom / 2400, 0, 1);
            const sky = ctx.createLinearGradient(0, 0, 0, CONFIG.height);
            sky.addColorStop(0, `rgb(${Math.round(214 - altitudeTint * 28)}, ${Math.round(241 - altitudeTint * 38)}, 255)`);
            sky.addColorStop(0.55, `rgb(${Math.round(233 - altitudeTint * 22)}, ${Math.round(249 - altitudeTint * 30)}, ${Math.round(255 - altitudeTint * 10)})`);
            sky.addColorStop(1, `rgb(${Math.round(255 - altitudeTint * 18)}, ${Math.round(250 - altitudeTint * 26)}, ${Math.round(238 + altitudeTint * 6)})`);
            ctx.fillStyle = sky;
            ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);

            ctx.save();
            ctx.globalAlpha = 0.22;
            ctx.strokeStyle = "#7aa7d9";
            ctx.lineWidth = 1;
            const lineOffset = (this.cameraBottom * 0.4) % 42;
            for (let y = -42; y <= CONFIG.height + 42; y += 42) {
                ctx.beginPath();
                ctx.moveTo(0, y + lineOffset);
                ctx.lineTo(CONFIG.width, y + lineOffset);
                ctx.stroke();
            }

            ctx.strokeStyle = "rgba(255, 123, 141, 0.26)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(54, 0);
            ctx.lineTo(54, CONFIG.height);
            ctx.stroke();
            ctx.restore();

            if (this.cameraBottom > 980) {
                ctx.save();
                ctx.globalAlpha = clamp((this.cameraBottom - 900) / 1400, 0, 0.78);
                ctx.fillStyle = "#fef5c4";
                for (const star of this.stars) {
                    const screenY = this.worldToScreenY(star.y);
                    if (screenY < -10 || screenY > CONFIG.height + 10) {
                        continue;
                    }
                    ctx.beginPath();
                    ctx.arc(star.x, screenY, star.size, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
            }

            const sunX = CONFIG.width - 70;
            const sunY = 90 + Math.sin(this.time * 0.35) * 8;
            ctx.save();
            ctx.fillStyle = "rgba(255, 236, 150, 0.74)";
            ctx.beginPath();
            ctx.arc(sunX, sunY, 34, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        drawClouds() {
            const ctx = this.ctx;
            ctx.save();

            for (const cloud of this.clouds) {
                const screenY = this.worldToScreenY(cloud.y);
                if (screenY < -80 || screenY > CONFIG.height + 80) {
                    continue;
                }

                const drift = Math.sin(cloud.phase) * 18;
                ctx.save();
                ctx.translate(cloud.x + drift, screenY);
                ctx.scale(cloud.scale, cloud.scale);
                ctx.globalAlpha = 0.72;
                ctx.fillStyle = "rgba(255, 255, 255, 0.82)";
                ctx.strokeStyle = "rgba(23, 49, 80, 0.18)";
                ctx.lineWidth = 2;

                ctx.beginPath();
                ctx.arc(-24, 8, 16, 0, Math.PI * 2);
                ctx.arc(-6, 0, 18, 0, Math.PI * 2);
                ctx.arc(16, 7, 14, 0, Math.PI * 2);
                ctx.arc(34, 10, 12, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                ctx.restore();
            }

            ctx.restore();
        }

        drawParticles() {
            const ctx = this.ctx;

            for (const particle of this.particles) {
                const screenY = this.worldToScreenY(particle.y);
                ctx.save();
                ctx.globalAlpha = clamp(particle.life * 2, 0, 1);
                ctx.fillStyle = particle.color;
                ctx.beginPath();
                ctx.arc(particle.x, screenY, particle.size, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }

        drawFloatingTexts() {
            const ctx = this.ctx;

            for (const text of this.floatingTexts) {
                const screenY = this.worldToScreenY(text.y);
                ctx.save();
                ctx.globalAlpha = text.opacity;
                ctx.fillStyle = text.color;
                ctx.strokeStyle = "rgba(255,255,255,0.9)";
                ctx.lineWidth = 4;
                ctx.font = '700 22px "Baloo 2"';
                ctx.textAlign = "center";
                ctx.strokeText(text.text, text.x, screenY);
                ctx.fillText(text.text, text.x, screenY);
                ctx.restore();
            }
        }

        render() {
            this.drawBackground();
            this.drawClouds();

            for (const platform of this.platforms) {
                platform.draw(this.ctx, this);
            }

            for (const pickup of this.pickups) {
                pickup.draw(this.ctx, this);
            }

            for (const enemy of this.enemies) {
                enemy.draw(this.ctx, this);
            }

            this.player.draw(this.ctx, this);
            this.drawParticles();
            this.drawFloatingTexts();
        }

        getSnapshot() {
            return {
                state: this.state,
                score: this.score,
                maxHeight: this.maxHeight,
                playerY: this.player.y,
                platforms: this.platforms.length,
                pickups: this.pickups.length,
                enemies: this.enemies.length,
            };
        }
    }

    const game = new Game();
    window.skyboundGame = game;
    window.addEventListener("DOMContentLoaded", () => game.init());
})();
