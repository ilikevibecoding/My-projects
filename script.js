const suiteData = {
    language: {
        eyebrow: "Language adaptation",
        title: "Instruction following that survives goal drift",
        description:
            "Language tasks begin with clean instructions and gradually introduce ambiguity, style drift, compressed context windows, and contradictory retrieval cues. Strong agents adapt while preserving earlier instruction hierarchies and formatting behavior.",
        pills: ["retrieval drift", "context compression", "multi-step repair", "memory recall probes"],
        notes: [
            {
                title: "Representative tasks",
                body: "Summarization under changing rubric weights, retrieval-conditioned writing, preference shifts, and long-horizon instruction repair."
            },
            {
                title: "Failure mode exposed",
                body: "Models that improve on the latest prompt style but quietly forget earlier formatting and retrieval conventions."
            },
            {
                title: "Primary metric",
                body: "Retention-weighted success after language policy changes and delayed recall checkpoints."
            }
        ]
    },
    tools: {
        eyebrow: "Tool use adaptation",
        title: "Policies that keep working after the interface changes",
        description:
            "Tool-use tracks swap parameter schemas, response latency, observability limits, and error semantics. The best systems recover quickly and preserve prior operational competence even when the same objective requires a different interaction pattern.",
        pills: ["API schema swap", "latency spikes", "hidden retries", "degraded observability"],
        notes: [
            {
                title: "Representative tasks",
                body: "Search-and-cite workflows, calculator chains, data cleaning pipelines, and chained browsing actions under revised tool contracts."
            },
            {
                title: "Failure mode exposed",
                body: "Agents that memorize one happy-path API surface and fail as soon as argument order, tool names, or retry semantics move."
            },
            {
                title: "Primary metric",
                body: "Median episodes to recover task completion with penalties for irreversible tool misuse."
            }
        ]
    },
    vision: {
        eyebrow: "Vision adaptation",
        title: "Perception that remains stable under sensory drift",
        description:
            "Vision tasks introduce lighting shifts, crop noise, symbol remapping, and object co-occurrence changes. Continuum checks whether perception improves on new conditions without erasing earlier recognition behavior.",
        pills: ["lighting shift", "camera jitter", "symbol remap", "rare object replay"],
        notes: [
            {
                title: "Representative tasks",
                body: "Scene classification, chart reading, OCR repair, and object grounding under repeated perturbation waves."
            },
            {
                title: "Failure mode exposed",
                body: "Specialists that tune to the latest visual distribution but lose robustness on previously solved sensory conditions."
            },
            {
                title: "Primary metric",
                body: "Cross-shift accuracy area under the retention curve, weighted by replay difficulty."
            }
        ]
    },
    agents: {
        eyebrow: "Agentic control",
        title: "Long-horizon control with memory, planning, and recovery",
        description:
            "Agentic control sequences test whether a system can maintain plans when constraints change mid-episode. Memory budgets shrink, subgoals reorder, and partial observability increases while older route patterns still matter.",
        pills: ["memory pressure", "goal reorder", "sparse reward", "hidden resets"],
        notes: [
            {
                title: "Representative tasks",
                body: "Web navigation, workflow automation, embodied grid planning, and multi-stage repair tasks under interrupted state."
            },
            {
                title: "Failure mode exposed",
                body: "Agents that relearn every perturbation from scratch instead of carrying over useful structure from previous control policies."
            },
            {
                title: "Primary metric",
                body: "Composite score blending adaptation latency, final success, and recall on previously mastered control routines."
            }
        ]
    }
};

const leaderboardData = [
    {
        rank: "#1",
        name: "Northstar-XL",
        tagline: "Balanced frontier model with strong replay retention",
        score: "84.6",
        metrics: [
            { label: "Retention", value: "92%", score: "92%" },
            { label: "Adaptation", value: "88", score: "88%" },
            { label: "Transfer", value: "81", score: "81%" },
            { label: "Robustness", value: "76", score: "76%" }
        ]
    },
    {
        rank: "#2",
        name: "Helix-Agent",
        tagline: "Fast recovery under tool drift, moderate memory stability",
        score: "79.3",
        metrics: [
            { label: "Retention", value: "84%", score: "84%" },
            { label: "Adaptation", value: "91", score: "91%" },
            { label: "Transfer", value: "73", score: "73%" },
            { label: "Robustness", value: "68", score: "68%" }
        ]
    },
    {
        rank: "#3",
        name: "StaticMax-Pro",
        tagline: "Excellent on frozen tasks, weaker under repeated shifts",
        score: "67.9",
        metrics: [
            { label: "Retention", value: "69%", score: "69%" },
            { label: "Adaptation", value: "62", score: "62%" },
            { label: "Transfer", value: "58", score: "58%" },
            { label: "Robustness", value: "66", score: "66%" }
        ]
    }
];

function renderSuitePanel(tabKey) {
    const panel = document.getElementById("suitePanel");
    const tab = suiteData[tabKey];

    if (!panel || !tab) {
        return;
    }

    panel.innerHTML = `
        <div class="tab-panel-grid">
            <div class="tab-panel-copy">
                <span class="panel-kicker">${tab.eyebrow}</span>
                <h3>${tab.title}</h3>
                <p>${tab.description}</p>
                <div class="pill-row">
                    ${tab.pills.map((pill) => `<span>${pill}</span>`).join("")}
                </div>
            </div>
            <div class="suite-sidebar">
                ${tab.notes
                    .map(
                        (note) => `
                            <div class="suite-note">
                                <strong>${note.title}</strong>
                                <span>${note.body}</span>
                            </div>
                        `
                    )
                    .join("")}
            </div>
        </div>
    `;
}

function renderLeaderboard() {
    const grid = document.getElementById("leaderboardGrid");

    if (!grid) {
        return;
    }

    grid.innerHTML = leaderboardData
        .map(
            (entry) => `
                <article class="leaderboard-card glass-panel reveal is-visible">
                    <span class="leaderboard-rank">${entry.rank}</span>
                    <h3>${entry.name}</h3>
                    <p>${entry.tagline}</p>
                    <div class="leaderboard-score">
                        <strong>${entry.score}</strong>
                        <span>composite score</span>
                    </div>
                    <div class="score-bars">
                        ${entry.metrics
                            .map(
                                (metric) => `
                                    <div class="score-bar">
                                        <div class="score-bar-head">
                                            <span>${metric.label}</span>
                                            <span>${metric.value}</span>
                                        </div>
                                        <div class="score-bar-track">
                                            <div class="score-bar-fill" style="--score: ${metric.score}"></div>
                                        </div>
                                    </div>
                                `
                            )
                            .join("")}
                    </div>
                </article>
            `
        )
        .join("");
}

function initCounters() {
    const counters = document.querySelectorAll("[data-count]");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    counters.forEach((counter) => {
        const target = Number(counter.dataset.count);
        const decimals = String(target).includes(".") ? 1 : 0;

        if (reducedMotion) {
            counter.textContent = target.toFixed(decimals);
            return;
        }

        let current = 0;
        const duration = 1100;
        const start = performance.now();

        const tick = (timestamp) => {
            const progress = Math.min(1, (timestamp - start) / duration);
            const eased = 1 - Math.pow(1 - progress, 3);
            current = target * eased;
            counter.textContent = current.toFixed(decimals).replace(/\.0$/, "");

            if (progress < 1) {
                requestAnimationFrame(tick);
            }
        };

        requestAnimationFrame(tick);
    });
}

function initRevealAnimations() {
    const items = document.querySelectorAll(".reveal");

    const revealInViewport = () => {
        items.forEach((item) => {
            const rect = item.getBoundingClientRect();
            const isNearViewport = rect.top < window.innerHeight * 0.92 && rect.bottom > 0;

            if (isNearViewport) {
                item.classList.add("is-visible");
            }
        });
    };

    if (!("IntersectionObserver" in window)) {
        items.forEach((item) => item.classList.add("is-visible"));
        return;
    }

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("is-visible");
                    observer.unobserve(entry.target);
                }
            });
        },
        { threshold: 0.18 }
    );

    items.forEach((item) => observer.observe(item));
    revealInViewport();
    window.addEventListener("hashchange", revealInViewport);

    setTimeout(() => {
        revealInViewport();
    }, 250);
}

function initTabs() {
    const buttons = document.querySelectorAll(".tab-button");

    if (!buttons.length) {
        return;
    }

    buttons.forEach((button) => {
        button.addEventListener("click", () => {
            buttons.forEach((item) => {
                item.classList.remove("active");
                item.setAttribute("aria-selected", "false");
            });

            button.classList.add("active");
            button.setAttribute("aria-selected", "true");
            renderSuitePanel(button.dataset.tab);
        });
    });

    renderSuitePanel("language");
}

function initFaq() {
    document.querySelectorAll(".faq-trigger").forEach((trigger) => {
        trigger.addEventListener("click", () => {
            const item = trigger.closest(".faq-item");
            const expanded = trigger.getAttribute("aria-expanded") === "true";

            item.classList.toggle("open", !expanded);
            trigger.setAttribute("aria-expanded", String(!expanded));
        });
    });
}

function initScrollSpy() {
    const links = Array.from(document.querySelectorAll(".nav-links a"));
    const sections = links
        .map((link) => {
            const id = link.getAttribute("href");
            return id ? document.querySelector(id) : null;
        })
        .filter(Boolean);

    if (!sections.length || !("IntersectionObserver" in window)) {
        return;
    }

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) {
                    return;
                }

                links.forEach((link) => {
                    const isActive = link.getAttribute("href") === `#${entry.target.id}`;
                    link.classList.toggle("active", isActive);
                });
            });
        },
        {
            rootMargin: "-35% 0px -45% 0px",
            threshold: 0.05
        }
    );

    sections.forEach((section) => observer.observe(section));
}

document.addEventListener("DOMContentLoaded", () => {
    renderLeaderboard();
    initTabs();
    initCounters();
    initRevealAnimations();
    initFaq();
    initScrollSpy();
});
