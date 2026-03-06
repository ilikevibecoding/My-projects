const trackData = {
    language: {
        kicker: "Language drift track",
        title: "Prompt formats mutate while objectives stay constant.",
        description:
            "Relay's language track shifts tone, retrieval structure, formatting contracts, and context availability. Strong systems preserve prior instruction-following habits while learning new prompt conventions quickly.",
        pills: ["retrieval reordering", "format drift", "compressed context", "delayed replay"],
        notes: [
            {
                title: "Representative tasks",
                body: "Long-form synthesis, grounded summarization, instruction repair, and rubric changes under memory limits."
            },
            {
                title: "What it exposes",
                body: "Models that get better at the newest prompt style but quietly forget earlier output contracts."
            },
            {
                title: "Primary signal",
                body: "Retention-weighted task success after repeated prompt schema changes."
            }
        ]
    },
    tools: {
        kicker: "Tool adaptation track",
        title: "Tools keep the same purpose, but not the same shape.",
        description:
            "API contracts, latency, error semantics, and output fields shift over time. Relay measures whether an agent can repair its tool policy without losing older workflows that used the original interface.",
        pills: ["schema swaps", "latency drift", "degraded observability", "retry penalties"],
        notes: [
            {
                title: "Representative tasks",
                body: "Search-and-cite chains, data cleanup flows, spreadsheet edits, and retrieval pipelines under revised tool contracts."
            },
            {
                title: "What it exposes",
                body: "Agents that memorize one happy path and collapse when arguments, retries, or output structure move."
            },
            {
                title: "Primary signal",
                body: "Median recovery rounds plus irreversible tool-misuse penalties."
            }
        ]
    },
    perception: {
        kicker: "Perception track",
        title: "Visual conditions drift before the semantics do.",
        description:
            "Perception tasks add lighting changes, symbol remaps, crop jitter, and background clutter. Systems must absorb new sensory conditions while preserving earlier recognition behavior.",
        pills: ["lighting shifts", "symbol remaps", "rare object replay", "sensor noise"],
        notes: [
            {
                title: "Representative tasks",
                body: "Chart reading, OCR repair, scene labeling, and visual grounding under repeated perturbation waves."
            },
            {
                title: "What it exposes",
                body: "Policies that overfit to the latest visual domain and lose performance on older but still relevant scenes."
            },
            {
                title: "Primary signal",
                body: "Area under the cross-shift retention curve across replay checkpoints."
            }
        ]
    },
    control: {
        kicker: "Long-horizon control track",
        title: "Plans are interrupted, reordered, and forced to recover.",
        description:
            "The control track evaluates web automation, multi-stage workflows, and planning loops where goals reorder mid-run and memory budgets shrink. Learning has to survive interruption.",
        pills: ["goal reordering", "sparse rewards", "hidden resets", "state truncation"],
        notes: [
            {
                title: "Representative tasks",
                body: "Web navigation, workflow recovery, sequential tool orchestration, and stateful planning with interrupted episodes."
            },
            {
                title: "What it exposes",
                body: "Agents that relearn every perturbation from scratch and forget previously stable routines."
            },
            {
                title: "Primary signal",
                body: "Composite of recovery speed, final success rate, and replay recall under constrained memory."
            }
        ]
    }
};

const scoreboardData = [
    {
        rank: "#1",
        name: "Relay-One XL",
        tagline: "Fast recovery with unusually strong replay retention",
        score: "88.2",
        metrics: [
            { label: "Retention", value: "94%" },
            { label: "Recovery", value: "86%" },
            { label: "Transfer", value: "84%" },
            { label: "Robustness", value: "77%" }
        ]
    },
    {
        rank: "#2",
        name: "Signal Weave",
        tagline: "Excellent under tool drift, slightly weaker on delayed replay",
        score: "82.7",
        metrics: [
            { label: "Retention", value: "87%" },
            { label: "Recovery", value: "90%" },
            { label: "Transfer", value: "79%" },
            { label: "Robustness", value: "72%" }
        ]
    },
    {
        rank: "#3",
        name: "Archive-3",
        tagline: "Stable memory profile, slower to regain competence after major shifts",
        score: "76.9",
        metrics: [
            { label: "Retention", value: "90%" },
            { label: "Recovery", value: "68%" },
            { label: "Transfer", value: "70%" },
            { label: "Robustness", value: "69%" }
        ]
    }
];

function renderTrackPanel(key) {
    const panel = document.getElementById("trackPanel");
    const track = trackData[key];

    if (!panel || !track) {
        return;
    }

    panel.innerHTML = `
        <div class="track-layout">
            <div class="track-copy">
                <span class="track-kicker">${track.kicker}</span>
                <h3>${track.title}</h3>
                <p>${track.description}</p>
                <div class="track-pills">
                    ${track.pills.map((pill) => `<span>${pill}</span>`).join("")}
                </div>
            </div>
            <div class="track-rail">
                ${track.notes
                    .map(
                        (note) => `
                            <div class="track-meta">
                                <strong>${note.title}</strong>
                                <p>${note.body}</p>
                            </div>
                        `
                    )
                    .join("")}
            </div>
        </div>
    `;
}

function renderScoreboard() {
    const grid = document.getElementById("scoreboardGrid");

    if (!grid) {
        return;
    }

    grid.innerHTML = scoreboardData
        .map(
            (entry) => `
                <article class="scoreboard-card reveal is-visible">
                    <span class="score-tag">${entry.rank}</span>
                    <h3>${entry.name}</h3>
                    <p>${entry.tagline}</p>
                    <div class="score-number">
                        <strong>${entry.score}</strong>
                        <span>Relay index</span>
                    </div>
                    <div class="score-meta">
                        ${entry.metrics
                            .map(
                                (metric) => `
                                    <div class="score-meta-row">
                                        <span>${metric.label}</span>
                                        <div class="score-mini-bar">
                                            <span style="--value: ${metric.value}"></span>
                                        </div>
                                        <strong>${metric.value}</strong>
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

    counters.forEach((counter) => {
        const target = Number(counter.dataset.count);
        counter.textContent = String(target);
    });
}

function initRevealAnimations() {
    const items = document.querySelectorAll(".reveal");

    const revealVisibleItems = () => {
        items.forEach((item) => {
            const rect = item.getBoundingClientRect();
            const inRange = rect.top < window.innerHeight * 0.92 && rect.bottom > 0;

            if (inRange) {
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
        { threshold: 0.16 }
    );

    items.forEach((item) => observer.observe(item));
    revealVisibleItems();
    window.addEventListener("hashchange", revealVisibleItems);

    setTimeout(() => {
        revealVisibleItems();
    }, 250);
}

function initTrackTabs() {
    const buttons = document.querySelectorAll(".track-tab");

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
            renderTrackPanel(button.dataset.track);
        });
    });

    renderTrackPanel("language");
}

function initFaq() {
    document.querySelectorAll(".faq-trigger").forEach((trigger) => {
        trigger.addEventListener("click", () => {
            const card = trigger.closest(".faq-card");
            const expanded = trigger.getAttribute("aria-expanded") === "true";

            trigger.setAttribute("aria-expanded", String(!expanded));
            card.classList.toggle("open", !expanded);
        });
    });
}

function initScrollSpy() {
    const links = Array.from(document.querySelectorAll(".nav-links a"));
    const sections = links
        .map((link) => {
            const href = link.getAttribute("href");
            return href ? document.querySelector(href) : null;
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
                    const active = link.getAttribute("href") === `#${entry.target.id}`;
                    link.classList.toggle("active", active);
                });
            });
        },
        {
            rootMargin: "-35% 0px -50% 0px",
            threshold: 0.05
        }
    );

    sections.forEach((section) => observer.observe(section));
}

document.addEventListener("DOMContentLoaded", () => {
    renderScoreboard();
    initTrackTabs();
    initCounters();
    initRevealAnimations();
    initFaq();
    initScrollSpy();
});
