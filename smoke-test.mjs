import { writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

const CDP_URL = "http://127.0.0.1:9222";

async function waitForDebugger() {
    for (let attempt = 0; attempt < 40; attempt += 1) {
        try {
            const response = await fetch(`${CDP_URL}/json/version`);
            if (response.ok) {
                return;
            }
        } catch (_error) {
            // Retry.
        }
        await delay(250);
    }
    throw new Error("Chrome remote debugger did not become available.");
}

class CdpClient {
    constructor(socketUrl) {
        this.socket = new WebSocket(socketUrl);
        this.nextId = 1;
        this.pending = new Map();
        this.events = new Map();
    }

    async connect() {
        await new Promise((resolve, reject) => {
            this.socket.addEventListener("open", resolve, { once: true });
            this.socket.addEventListener("error", reject, { once: true });
        });

        this.socket.addEventListener("message", (event) => {
            const message = JSON.parse(event.data);
            if (message.id) {
                const pending = this.pending.get(message.id);
                if (!pending) {
                    return;
                }
                this.pending.delete(message.id);
                if (message.error) {
                    pending.reject(new Error(message.error.message));
                } else {
                    pending.resolve(message.result);
                }
                return;
            }

            const listeners = this.events.get(message.method) || [];
            for (const listener of listeners) {
                listener(message.params);
            }
        });
    }

    send(method, params = {}) {
        const id = this.nextId++;
        this.socket.send(JSON.stringify({ id, method, params }));
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
        });
    }

    once(method) {
        return new Promise((resolve) => {
            const handler = (params) => {
                const listeners = this.events.get(method) || [];
                this.events.set(method, listeners.filter((listener) => listener !== handler));
                resolve(params);
            };
            this.on(method, handler);
        });
    }

    on(method, listener) {
        const listeners = this.events.get(method) || [];
        listeners.push(listener);
        this.events.set(method, listeners);
    }

    async evaluate(expression) {
        const result = await this.send("Runtime.evaluate", {
            expression,
            awaitPromise: true,
            returnByValue: true,
        });
        return result.result?.value;
    }

    async screenshot(path) {
        const response = await this.send("Page.captureScreenshot", { format: "png" });
        await writeFile(path, Buffer.from(response.data, "base64"));
    }
}

async function main() {
    await waitForDebugger();
    const targets = await fetch(`${CDP_URL}/json/list`).then((response) => response.json());
    const pageTarget = targets.find((target) => target.type === "page");
    if (!pageTarget) {
        throw new Error("No page target available.");
    }

    const client = new CdpClient(pageTarget.webSocketDebuggerUrl);
    await client.connect();

    const consoleMessages = [];
    const pageErrors = [];

    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Log.enable");

    client.on("Runtime.consoleAPICalled", (params) => {
        consoleMessages.push(params.args?.map((arg) => arg.value).filter(Boolean).join(" ") || params.type);
    });
    client.on("Runtime.exceptionThrown", (params) => {
        pageErrors.push(params.exceptionDetails?.text || "Runtime exception");
    });
    client.on("Log.entryAdded", (params) => {
        if (params.entry.level === "error") {
            pageErrors.push(params.entry.text);
        }
    });

    const loadPromise = client.once("Page.loadEventFired");
    await client.send("Page.navigate", { url: "http://127.0.0.1:8000" });
    await loadPromise;

    await client.evaluate(`
        new Promise((resolve) => {
            const check = () => {
                const button = document.getElementById("startButton");
                const game = window.doodleJumpParody;
                if (button && !button.disabled && game && game.state === "start") {
                    resolve(true);
                    return;
                }
                setTimeout(check, 100);
            };
            check();
        })
    `);

    const initial = await client.evaluate(`(() => ({
        title: document.querySelector("h1")?.textContent ?? null,
        startVisible: !document.getElementById("startScreen")?.classList.contains("is-hidden"),
        scoreTopLeft: (() => {
            const scoreRect = document.getElementById("hudScore")?.getBoundingClientRect();
            const canvasRect = document.getElementById("gameCanvas")?.getBoundingClientRect();
            if (!scoreRect || !canvasRect) return false;
            return scoreRect.left < canvasRect.left + 48 && scoreRect.top < canvasRect.top + 40;
        })(),
        soundToggle: document.getElementById("soundToggle")?.textContent ?? null,
        buttonText: document.getElementById("startButton")?.textContent ?? null,
        starButtonText: document.getElementById("startStarButton")?.textContent ?? null,
        assetCount: Object.values(window.doodleJumpParody.assets).filter(Boolean).length
    }))()`);

    await client.screenshot("/workspace/doodle-parody-start-01.png");

    await client.evaluate(`document.getElementById("startButton").click()`);
    await delay(500);

    await client.evaluate(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "p" }))`);
    await delay(200);
    const pausedState = await client.evaluate(`window.doodleJumpParody.state`);

    await client.evaluate(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "p" }))`);
    await delay(200);
    const resumedState = await client.evaluate(`window.doodleJumpParody.state`);

    const brownPlatformTest = await client.evaluate(`(() => {
        const game = window.doodleJumpParody;
        game.resetWorld();
        game.state = "playing";
        game.platforms = [{
            x: 216,
            y: 220,
            width: 82,
            type: "brown",
            active: true,
            vx: 0,
            brokenTimer: 0,
            vanishTimer: 0,
            pickup: null
        }];
        game.monsters = [];
        game.player.x = 216;
        game.player.prevY = 250;
        game.player.y = 210;
        game.player.vy = -180;
        game.player.boostTimer = 0;
        game.handlePlatformCollisions();
        const afterImpactVy = game.player.vy;
        const breakTimer = game.platforms[0]?.brokenTimer ?? 0;
        game.updatePlatforms(0.3);
        game.cleanupWorld();
        return {
            afterImpactVy,
            platformActiveAfterImpact: game.platforms[0]?.active ?? false,
            breakTimerStarted: breakTimer > 0,
            removedAfterCleanup: game.platforms.length === 0
        };
    })()`);

    const monsterStompTest = await client.evaluate(`(() => {
        const game = window.doodleJumpParody;
        game.resetWorld();
        game.state = "playing";
        game.monsters = [{
            x: 216,
            y: 240,
            width: 62,
            height: 42,
            vx: 0,
            dead: false
        }];
        game.player.x = 216;
        game.player.prevY = 282;
        game.player.y = 274;
        game.player.vy = -160;
        game.handleMonsterCollisions();
        return {
            state: game.state,
            playerVy: game.player.vy,
            monsterCount: game.monsters.length
        };
    })()`);

    const whitePlatformTest = await client.evaluate(`(() => {
        const game = window.doodleJumpParody;
        game.resetWorld();
        game.state = "playing";
        game.platforms = [{
            x: 216,
            y: 220,
            width: 82,
            type: "white",
            active: true,
            vx: 0,
            brokenTimer: 0,
            vanishTimer: 0,
            pickup: null
        }];
        game.monsters = [];
        game.player.x = 216;
        game.player.prevY = 250;
        game.player.y = 210;
        game.player.vy = -180;
        game.player.boostTimer = 0;
        game.handlePlatformCollisions();
        const afterBounceVy = game.player.vy;
        const vanishTimer = game.platforms[0]?.vanishTimer ?? 0;
        game.updatePlatforms(0.1);
        game.cleanupWorld();
        return {
            afterBounceVy,
            platformActiveAfterBounce: game.platforms[0]?.active ?? false,
            vanishTimerStarted: vanishTimer > 0,
            removedAfterCleanup: game.platforms.length === 0
        };
    })()`);

    const boostProtectionTest = await client.evaluate(`(() => {
        const game = window.doodleJumpParody;
        game.resetWorld();
        game.state = "playing";
        game.monsters = [{
            x: 216,
            y: 250,
            width: 62,
            height: 42,
            vx: 0,
            dead: false
        }];
        game.player.x = 216;
        game.player.y = 230;
        game.player.prevY = 228;
        game.player.vy = 980;
        game.player.boostType = "jetpack";
        game.player.boostTimer = 1.1;
        game.player.boostInvulnerableTimer = 1.5;
        game.handleMonsterCollisions();
        return {
            state: game.state,
            monsterCount: game.monsters.length,
            playerBoostTimer: game.player.boostTimer,
            playerBoostInvulnerableTimer: game.player.boostInvulnerableTimer
        };
    })()`);

    const supportSpacingTest = await client.evaluate(`(() => {
        const game = window.doodleJumpParody;
        game.resetWorld();
        game.platforms = [];
        game.monsters = [];
        game.highestPlatformY = 1400;
        game.spawnAnchorX = 216;
        const hazards = [];
        let hazardConflictCount = 0;
        for (let i = 0; i < 120; i += 1) {
            game.platforms = [];
            game.monsters = [];
            game.spawnNextPlatform(false);
            const hazard = game.platforms.find((platform) => platform.type === "brown" || platform.type === "white");
            if (!hazard) continue;
            hazards.push(hazard.type);
            hazardConflictCount += game.platforms.filter((platform) =>
                platform !== hazard &&
                platform.type === "green" &&
                Math.abs(platform.x - hazard.x) < 72 &&
                Math.abs(platform.y - hazard.y) < 64,
            ).length;
        }
        return { hazardCount: hazards.length, hazardConflictCount };
    })()`);

    const starWarsTransitionTest = await client.evaluate(`(() => {
        const game = window.doodleJumpParody;
        game.startRun('starwars');
        game.spawnPortalLine();
        const portal = game.platforms.find((platform) => platform.type === 'portalLine');
        if (!portal) {
            return { hasPortal: false };
        }
        game.player.x = portal.x;
        game.player.prevY = portal.y + 30;
        game.player.y = portal.y - 2;
        game.player.vy = -120;
        game.handlePlatformCollisions();
        const stateAfterLand = game.state;
        const doorActive = Boolean(game.portalDoor?.active);
        game.enterStarDoor();
        return {
            hasPortal: true,
            stateAfterLand,
            doorActive,
            stateAfterEnter: game.state,
            hudMode: document.getElementById('hudMode')?.textContent ?? null
        };
    })()`);

    await client.evaluate(`(() => {
        const game = window.doodleJumpParody;
        game.resetWorld();
        game.state = "playing";
        game.platforms = [
            { x: 170, y: 240, width: 82, type: "green", active: true, vx: 0, brokenTimer: 0, vanishTimer: 0, pickup: { type: "propeller", x: 170, used: false } },
            { x: 280, y: 360, width: 82, type: "green", active: true, vx: 0, brokenTimer: 0, vanishTimer: 0, pickup: { type: "jetpack", x: 280, used: false } }
        ];
        game.monsters = [];
        game.player.x = 220;
        game.player.y = 150;
        game.player.prevY = 150;
        game.player.vy = 0;
        game.cameraY = 0;
    })()`);
    await delay(200);
    await client.screenshot("/workspace/doodle-parody-pickups-01.png");

    await client.evaluate(`window.doodleJumpParody.resetWorld()`);

    await client.evaluate(`
        (() => {
            const shortestDx = (from, to, width) => {
                const direct = to - from;
                const wrappedPositive = direct + width;
                const wrappedNegative = direct - width;
                return [direct, wrappedPositive, wrappedNegative].sort((a, b) => Math.abs(a) - Math.abs(b))[0];
            };

            window.__doodlePilot = setInterval(() => {
                const game = window.doodleJumpParody;
                if (!game || game.state !== "playing") {
                    return;
                }

                const player = game.player;
                const candidates = game.platforms
                    .filter((platform) => platform.active && platform.y > player.y + 6 && platform.y < player.y + 220)
                    .sort((a, b) => {
                        const rank = (platform) => {
                            let bonus = 0;
                            if (platform.pickup?.type === "spring") bonus += 60;
                            if (platform.pickup?.type === "propeller") bonus += 130;
                            if (platform.pickup?.type === "jetpack") bonus += 180;
                            if (platform.type === "green") bonus += 40;
                            if (platform.type === "blue") bonus += 30;
                            if (platform.type === "brown") bonus -= 15;
                            if (platform.type === "white") bonus -= 20;
                            return bonus + (platform.y - player.y) * 1.8 - Math.abs(platform.x - player.x) * 0.9;
                        };
                        return rank(b) - rank(a);
                    });

                const target = candidates[0];
                const targetX = target ? target.x : game.canvas.width / 2;
                const dx = shortestDx(player.x, targetX, game.canvas.width);
                game.input.left = dx < -10;
                game.input.right = dx > 10;

                const monsterAhead = game.monsters.find((monster) => {
                    const vertical = monster.y > player.y + 40 && monster.y < player.y + 340;
                    const aligned = Math.abs(monster.x - player.x) < 22;
                    return vertical && aligned;
                });
                game.input.shoot = Boolean(monsterAhead);
            }, 24);
        })()
    `);

    await delay(3500);
    await client.screenshot("/workspace/doodle-parody-live-01.png");
    const midRun = await client.evaluate(`(() => {
        const game = window.doodleJumpParody;
        const typeCounts = game.platforms.reduce((acc, platform) => {
            acc[platform.type] = (acc[platform.type] || 0) + 1;
            return acc;
        }, {});
        return {
            state: game.state,
            score: game.score,
            cameraY: Math.floor(game.cameraY),
            monsters: game.monsters.length,
            bullets: game.bullets.length,
            pickups: game.platforms.filter((platform) => platform.pickup && !platform.pickup.used).map((platform) => platform.pickup.type),
            typeCounts
        };
    })()`);

    await delay(15000);
    await client.screenshot("/workspace/doodle-parody-play-01.png");
    const runtime = await client.evaluate(`(() => {
        const game = window.doodleJumpParody;
        const typeCounts = game.platforms.reduce((acc, platform) => {
            acc[platform.type] = (acc[platform.type] || 0) + 1;
            return acc;
        }, {});
        return {
            state: game.state,
            score: game.score,
            bestScore: game.bestScore,
            monstersVisible: game.monsters.length,
            bulletsVisible: game.bullets.length,
            pickupsVisible: game.platforms.filter((platform) => platform.pickup && !platform.pickup.used).length,
            typeCounts
        };
    })()`);

    await client.evaluate(`
        (() => {
            clearInterval(window.__doodlePilot);
            const game = window.doodleJumpParody;
            game.input.left = false;
            game.input.right = false;
            game.input.shoot = false;
            game.gameOver();
        })()
    `);
    await delay(400);
    await client.screenshot("/workspace/doodle-parody-gameover-01.png");

    const gameOverSummary = await client.evaluate(`(() => ({
        state: window.doodleJumpParody.state,
        finalScore: document.getElementById("finalScore")?.textContent ?? null,
        finalBest: document.getElementById("finalBest")?.textContent ?? null
    }))()`);

    const reloadPromise = client.once("Page.loadEventFired");
    await client.send("Page.reload");
    await reloadPromise;
    await client.evaluate(`
        new Promise((resolve) => {
            const check = () => {
                const button = document.getElementById("startButton");
                const game = window.doodleJumpParody;
                if (button && !button.disabled && game && game.state === "start") {
                    resolve(true);
                    return;
                }
                setTimeout(check, 100);
            };
            check();
        })
    `);

    const persisted = await client.evaluate(`(() => ({
        bestScore: window.doodleJumpParody.bestScore,
        soundToggle: document.getElementById("soundToggle")?.textContent ?? null,
        startVisible: !document.getElementById("startScreen")?.classList.contains("is-hidden")
    }))()`);

    console.log(JSON.stringify({
        initial,
        pausedState,
        resumedState,
        brownPlatformTest,
        monsterStompTest,
        whitePlatformTest,
        boostProtectionTest,
        supportSpacingTest,
        starWarsTransitionTest,
        midRun,
        runtime,
        gameOverSummary,
        persisted,
        consoleMessages,
        pageErrors
    }, null, 2));

    client.socket.close();
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
