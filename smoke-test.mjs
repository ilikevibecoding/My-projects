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
        const payload = { id, method, params };
        this.socket.send(JSON.stringify(payload));
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
        });
    }

    once(method) {
        return new Promise((resolve) => {
            const handler = (params) => {
                const listeners = this.events.get(method) || [];
                this.events.set(
                    method,
                    listeners.filter((listener) => listener !== handler),
                );
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
        consoleMessages.push(
            params.args?.map((arg) => arg.value).filter(Boolean).join(" ") || params.type,
        );
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
    await delay(1500);

    const initial = await client.evaluate(`(() => ({
        title: document.querySelector("h1")?.textContent ?? null,
        hasCanvas: Boolean(document.getElementById("gameCanvas")),
        startVisible: !document.getElementById("startScreen")?.classList.contains("is-hidden"),
        hudScore: document.getElementById("hudScore")?.textContent ?? null,
        soundToggle: document.getElementById("soundToggle")?.textContent ?? null
    }))()`);

    await client.screenshot("/workspace/skybound-runtime-start.png");

    await client.evaluate(`document.getElementById("startButton").click()`);
    await delay(400);

    await client.evaluate(`
        (() => {
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "p" }));
            return window.skyboundGame.state;
        })()
    `);
    await delay(150);
    const pausedState = await client.evaluate(`window.skyboundGame.state`);

    await client.evaluate(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "p" }))`);
    await delay(150);
    const resumedState = await client.evaluate(`window.skyboundGame.state`);

    await client.evaluate(`
        (() => {
            const shortestDx = (from, to, width) => {
                const direct = to - from;
                const wrappedPositive = direct + width;
                const wrappedNegative = direct - width;
                return [direct, wrappedPositive, wrappedNegative].sort((a, b) => Math.abs(a) - Math.abs(b))[0];
            };

            window.__skyboundPilot = setInterval(() => {
                const game = window.skyboundGame;
                if (!game || game.state !== "playing") {
                    return;
                }

                const player = game.player;
                const candidates = game.platforms
                    .filter((platform) => platform.active && platform.y > player.y + 12 && platform.y < player.y + 250)
                    .sort((a, b) => {
                        const aScore = (a.type === "boost" ? 50 : 0) + (a.type === "moving" ? 18 : 0) + (a.y - player.y);
                        const bScore = (b.type === "boost" ? 50 : 0) + (b.type === "moving" ? 18 : 0) + (b.y - player.y);
                        return bScore - aScore;
                    });

                const target = candidates[0];
                const targetX = target ? target.x + target.width / 2 : game.canvas.width / 2;
                const dx = shortestDx(player.x, targetX, game.canvas.width);
                game.input.left = dx < -12;
                game.input.right = dx > 12;
            }, 24);
        })()
    `);

    await delay(3000);
    await client.screenshot("/workspace/skybound-runtime-live.png");
    const liveRuntime = await client.evaluate(`(() => ({
        state: window.skyboundGame.state,
        score: window.skyboundGame.score,
        heightMeters: Math.floor((window.skyboundGame.maxHeight - window.skyboundGame.startHeight) * 0.36),
        streak: window.skyboundGame.styleStreak
    }))()`);

    await delay(12000);
    await client.screenshot("/workspace/skybound-runtime-play.png");

    const runtime = await client.evaluate(`(() => {
        const game = window.skyboundGame;
        const typeCounts = game.platforms.reduce((acc, platform) => {
            acc[platform.type] = (acc[platform.type] || 0) + 1;
            return acc;
        }, {});
        return {
            state: game.state,
            score: game.score,
            maxHeightMeters: Math.floor((game.maxHeight - game.startHeight) * 0.36),
            streak: game.styleStreak,
            maxStreak: game.maxStyleStreak,
            enemiesVisible: game.enemies.length,
            pickupsVisible: game.pickups.length,
            typeCounts,
        };
    })()`);

    await client.evaluate(`
        (() => {
            clearInterval(window.__skyboundPilot);
            window.skyboundGame.input.left = false;
            window.skyboundGame.input.right = false;
            window.skyboundGame.endRun();
        })()
    `);
    await delay(400);
    await client.screenshot("/workspace/skybound-runtime-gameover.png");

    const gameOverSummary = await client.evaluate(`(() => ({
        state: window.skyboundGame.state,
        finalScore: document.getElementById("finalScore")?.textContent ?? null,
        finalHeight: document.getElementById("finalHeight")?.textContent ?? null,
        finalStreak: document.getElementById("finalStreak")?.textContent ?? null
    }))()`);

    const reloadPromise = client.once("Page.loadEventFired");
    await client.send("Page.reload");
    await reloadPromise;
    await delay(1000);

    const persisted = await client.evaluate(`(() => ({
        bestHud: document.getElementById("hudBest")?.textContent ?? null,
        startVisible: !document.getElementById("startScreen")?.classList.contains("is-hidden"),
        soundToggle: document.getElementById("soundToggle")?.textContent ?? null
    }))()`);

    console.log(
        JSON.stringify(
            {
                initial,
                pausedState,
                resumedState,
                liveRuntime,
                runtime,
                gameOverSummary,
                persisted,
                consoleMessages,
                pageErrors,
            },
            null,
            2,
        ),
    );

    client.socket.close();
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
