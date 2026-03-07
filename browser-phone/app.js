const homePagesData = [
  [
    { name: "FaceTime", glyph: "FT", bg: "#33bf74", type: "text" },
    { name: "Calendar", glyph: "14", bg: "#ee3d43", type: "calendar" },
    { name: "Photos", glyph: "PH", bg: "#f6a82f", type: "text" },
    { name: "Camera", glyph: "CAM", bg: "#23252d", type: "camera" },
    { name: "Mail", glyph: "M", bg: "#1f87fa", type: "text" },
    { name: "Clock", glyph: "CLK", bg: "#101319", type: "text" },
    { name: "Maps", glyph: "MAP", bg: "#3abf7e", type: "text" },
    { name: "Weather", glyph: "SUN", bg: "#4f8eff", type: "text" },
    { name: "Notes", glyph: "N", bg: "#f3d83f", type: "notes", fg: "#1d2230" },
    { name: "Reminders", glyph: "DO", bg: "#f7f7fb", type: "text", fg: "#1d2230" },
    { name: "App Store", glyph: "A", bg: "#167efb", type: "appstore", action: "store" },
    { name: "Settings", glyph: "SET", bg: "#8a909b", type: "text" },
    { name: "TikTok", glyph: "TT", bg: "#101114", type: "tiktok" },
    { name: "Music", glyph: "MUS", bg: "#f43a7f", type: "text" },
    { name: "Messages", glyph: "MSG", bg: "#26c457", type: "messages" },
    { name: "Safari", glyph: "SAF", bg: "#31a5ff", type: "text" }
  ],
  [
    { name: "Health", glyph: "H", bg: "#ff6677", type: "text" },
    { name: "Wallet", glyph: "W", bg: "#12151d", type: "text" },
    { name: "Books", glyph: "BK", bg: "#f78c43", type: "text" },
    { name: "Files", glyph: "FL", bg: "#4d90ff", type: "text" },
    { name: "Fitness", glyph: "FIT", bg: "#de4bb0", type: "text" },
    { name: "Clips", glyph: "CC", bg: "#8d3cff", type: "text" },
    { name: "Calculator", glyph: "CAL", bg: "#17191f", type: "text" },
    { name: "Translate", glyph: "TR", bg: "#fafafd", type: "text", fg: "#1d2230" },
    { name: "Podcasts", glyph: "PC", bg: "#7e43ff", type: "text" },
    { name: "TV", glyph: "TV", bg: "#111216", type: "text" },
    { name: "Journal", glyph: "JR", bg: "#4c86f5", type: "text" },
    { name: "Contacts", glyph: "CT", bg: "#c4c7d0", type: "text", fg: "#1d2230" },
    { name: "Shortcuts", glyph: "SC", bg: "#eb7832", type: "text" },
    { name: "Find My", glyph: "FM", bg: "#1ed18f", type: "text" },
    { name: "Tips", glyph: "!", bg: "#f4d33b", type: "text", fg: "#1d2230" },
    { name: "Stocks", glyph: "ST", bg: "#17191f", type: "text" }
  ],
  [
    { name: "Memories", glyph: "ME", bg: "#f686ac", type: "text" },
    { name: "Dreams", glyph: "DR", bg: "#7c60ff", type: "text" },
    { name: "Gallery", glyph: "GL", bg: "#46a5ff", type: "text" },
    { name: "Love", glyph: "L", bg: "#ff648d", type: "text" },
    { name: "Games", glyph: "GM", bg: "#7d4cff", type: "text" },
    { name: "Food", glyph: "FD", bg: "#ff9c38", type: "text" },
    { name: "Reels", glyph: "RL", bg: "#20232b", type: "text" },
    { name: "Photos 2", glyph: "P2", bg: "#ef5ab8", type: "text" },
    { name: "Wishlist", glyph: "WL", bg: "#2ec76f", type: "text" },
    { name: "Trips", glyph: "TRP", bg: "#55a8ff", type: "text" },
    { name: "Mood", glyph: "MD", bg: "#8e6fff", type: "text" },
    { name: "Magic", glyph: "MG", bg: "#ffb44a", type: "text" },
    { name: "Memes", glyph: "MM", bg: "#1f2230", type: "text" },
    { name: "Snacks", glyph: "SN", bg: "#f47945", type: "text" },
    { name: "Date", glyph: "DT", bg: "#ff74a5", type: "text" },
    { name: "Secret", glyph: "?", bg: "#167efb", type: "text" }
  ]
];

const dockApps = [
  { name: "Phone", glyph: "TEL", bg: "#29c65b", type: "text" },
  { name: "Safari", glyph: "SAF", bg: "#31a5ff", type: "text" },
  { name: "Music", glyph: "MUS", bg: "#f43a7f", type: "text" },
  { name: "Messages", glyph: "MSG", bg: "#26c457", type: "messages" }
];

const storeRows = [
  {
    title: "Cooking game 1",
    subtitle: "temporary favorite placeholder",
    glyph: "CG",
    bg: "#f8a95f",
    type: "text"
  },
  {
    title: "Cooking game 2",
    subtitle: "temporary favorite placeholder",
    glyph: "CG",
    bg: "#ff7f6d",
    type: "text"
  },
  {
    title: "Cooking game 3",
    subtitle: "temporary favorite placeholder",
    glyph: "CG",
    bg: "#f676b7",
    type: "text"
  },
  {
    title: "TikTok",
    subtitle: "for the current mood board",
    glyph: "TT",
    bg: "#111216",
    type: "tiktok"
  }
];

const tickets = [
  {
    tag: "TICKET 01",
    title: "Cozy kitchen pick",
    code: "AMZ-KITCHEN-LOVE-01",
    note: "Swap this placeholder for a real Amazon code or item note later.",
    colors: ["#ff9a6b", "#ffd070"],
    scratch: ["#ff9e67", "#ff6c68"]
  },
  {
    tag: "TICKET 02",
    title: "Self-care wishlist pick",
    code: "AMZ-SWEET-GLOW-02",
    note: "This is another placeholder that is easy to replace with the real surprise.",
    colors: ["#ff75c1", "#c588ff"],
    scratch: ["#ff8bc8", "#8f6bff"]
  },
  {
    tag: "TICKET 03",
    title: "Cute date-night pick",
    code: "AMZ-DATE-NIGHT-03",
    note: "Replace this text with the final reveal for the third ticket whenever you are ready.",
    colors: ["#58b6ff", "#55ecb8"],
    scratch: ["#4eb4ff", "#53e2ef"]
  }
];

const screenElements = {
  lock: document.querySelector('[data-screen="lock"]'),
  home: document.querySelector('[data-screen="home"]'),
  store: document.querySelector('[data-screen="store"]'),
  game: document.querySelector('[data-screen="game"]')
};

const lockTime = document.querySelector("[data-lock-time]");
const lockDate = document.querySelector("[data-lock-date]");
const statusClock = document.querySelector("[data-clock-time]");
const unlockSlider = document.querySelector("[data-unlock-slider]");
const unlockCopy = document.querySelector("[data-unlock-copy]");
const phoneScreen = document.querySelector(".phone-screen");
const sideButton = document.querySelector("[data-side-button]");
const homePages = document.querySelector("[data-home-pages]");
const pageDots = document.querySelector("[data-page-dots]");
const dock = document.querySelector("[data-dock]");
const installButton = document.querySelector("[data-install-button]");
const installCard = document.querySelector("[data-install-card]");
const installLabel = document.querySelector("[data-install-label]");
const installArrow = document.querySelector("[data-install-arrow]");
const featureStatus = document.querySelector("[data-feature-status]");
const progressRing = document.querySelector("[data-progress-ring]");
const storeList = document.querySelector("[data-store-list]");
const ticketList = document.querySelector("[data-ticket-list]");
const finalReveal = document.querySelector("[data-final-reveal]");

let activeScreen = "lock";
let currentPage = 0;
let homeScroller = null;
let unlockResetFrame = null;
let isSleeping = false;

const installState = {
  installed: false,
  installing: false,
  progress: 0
};

function updateClock() {
  const now = new Date();
  const time = now.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
  const date = now.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric"
  });

  lockTime.textContent = time;
  lockDate.textContent = date;
  statusClock.textContent = time;
}

function showScreen(name) {
  if (!screenElements[name] || isSleeping) {
    return;
  }

  activeScreen = name;
  Object.entries(screenElements).forEach(([screenName, element]) => {
    element.classList.toggle("is-visible", screenName === name);
    if (screenName === name && (screenName === "store" || screenName === "game")) {
      element.scrollTop = 0;
    }
  });
}

function resetUnlockSlider() {
  cancelAnimationFrame(unlockResetFrame);
  unlockSlider.value = "0";
  unlockCopy.style.opacity = "1";
}

function setSleeping(value) {
  isSleeping = value;
  phoneScreen.classList.toggle("is-sleeping", value);
}

function lockPhone() {
  resetUnlockSlider();
  showScreen("lock");
}

function animateUnlockReset() {
  cancelAnimationFrame(unlockResetFrame);

  const step = () => {
    const value = Number(unlockSlider.value);
    if (value <= 0) {
      unlockSlider.value = "0";
      unlockCopy.style.opacity = "1";
      return;
    }

    const next = Math.max(0, value - 5);
    unlockSlider.value = String(next);
    unlockCopy.style.opacity = `${1 - next / 100}`;
    unlockResetFrame = requestAnimationFrame(step);
  };

  unlockResetFrame = requestAnimationFrame(step);
}

function handleUnlockInput() {
  const value = Number(unlockSlider.value);
  unlockCopy.style.opacity = `${1 - value / 100}`;

  if (value < 96) {
    return;
  }

  unlockSlider.value = "100";
  unlockCopy.style.opacity = "0";
  setTimeout(() => {
    resetUnlockSlider();
    showScreen("home");
  }, 120);
}

function createGlyph(icon) {
  switch (icon.type) {
    case "appstore":
      return `
        <div class="glyph-appstore">
          <i></i><i></i><i></i>
        </div>
      `;
    case "messages":
      return `
        <div class="glyph-messages">
          <span class="bubble"></span>
          <span class="tail"></span>
          <span class="dot one"></span>
          <span class="dot two"></span>
          <span class="dot three"></span>
        </div>
      `;
    case "notes":
      return `
        <div class="glyph-notes">
          <span class="sheet"></span>
          <span class="line one"></span>
          <span class="line two"></span>
          <span class="line three"></span>
        </div>
      `;
    case "calendar":
      return `
        <div class="glyph-calendar">
          <span class="sheet"></span>
          <span class="day">14</span>
        </div>
      `;
    case "camera":
      return `
        <div class="glyph-camera">
          <span class="body"></span>
          <span class="lens"></span>
          <span class="flash"></span>
        </div>
      `;
    case "tiktok":
      return `
        <div class="glyph-tiktok">
          <i class="cyan-stem"></i>
          <i class="cyan-bar"></i>
          <i class="pink-stem"></i>
          <i class="pink-bar"></i>
          <i class="white-stem"></i>
          <i class="white-bar"></i>
          <i class="pink-dot"></i>
          <i class="white-dot"></i>
        </div>
      `;
    default: {
      const isSmall = icon.glyph.length > 2 ? "small" : "";
      return `<div class="app-icon-glyph text ${isSmall}">${icon.glyph}</div>`;
    }
  }
}

function buildIconMarkup(icon) {
  const iconWrap = document.createElement("div");
  iconWrap.className = "app-icon-wrap";
  iconWrap.innerHTML = `
    <span class="app-icon-shadow"></span>
    <div
      class="app-icon"
      style="--icon-bg:${icon.bg}; --icon-fg:${icon.fg || "#fff"}"
    >
      ${createGlyph(icon)}
    </div>
  `;
  return iconWrap;
}

function buildAppTile(icon, isDockIcon = false) {
  const tile =
    icon.action === "store"
      ? document.createElement("button")
      : document.createElement(isDockIcon ? "div" : "div");
  tile.className = `app-tile${icon.action ? " buttonish" : ""}`;

  if (icon.action === "store") {
    tile.type = "button";
    tile.addEventListener("click", () => showScreen("store"));
  }

  tile.append(buildIconMarkup(icon));

  if (!isDockIcon) {
    const label = document.createElement("span");
    label.className = "app-label";
    label.textContent = icon.name;
    tile.append(label);
  }

  return tile;
}

function buildHomePages() {
  const track = document.createElement("div");
  track.className = "home-pages-track";

  homePagesData.forEach((page) => {
    const pageElement = document.createElement("div");
    pageElement.className = "home-page";
    page.forEach((app) => {
      pageElement.append(buildAppTile(app));
    });
    track.append(pageElement);
  });

  homePages.append(track);
  homeScroller = homePages;

  homePagesData.forEach((_, index) => {
    const dot = document.createElement("span");
    dot.className = index === 0 ? "active" : "";
    pageDots.append(dot);
  });

  dockApps.forEach((icon) => {
    dock.append(buildAppTile(icon, true));
  });

  let scrollFrame = null;
  homeScroller.addEventListener("scroll", () => {
    if (scrollFrame) {
      cancelAnimationFrame(scrollFrame);
    }

    scrollFrame = requestAnimationFrame(() => {
      const pageWidth = homeScroller.clientWidth || 1;
      const nextPage = Math.round(homeScroller.scrollLeft / pageWidth);
      if (nextPage !== currentPage) {
        currentPage = nextPage;
        syncPageDots();
      }
    });
  });
}

function syncPageDots() {
  [...pageDots.children].forEach((dot, index) => {
    dot.classList.toggle("active", index === currentPage);
  });
}

function buildStoreRows() {
  storeRows.forEach((item) => {
    const row = document.createElement("article");
    row.className = "store-row";

    const icon = buildIconMarkup(item);
    icon.classList.add("store-icon");

    const meta = document.createElement("div");
    meta.className = "store-meta";
    meta.innerHTML = `<h4>${item.title}</h4><p>${item.subtitle}</p>`;

    const get = document.createElement("div");
    get.className = "row-get";
    get.textContent = "GET";

    row.append(icon, meta, get);
    storeList.append(row);
  });
}

function refreshInstallUi() {
  installButton.classList.toggle("is-open", installState.installed);
  installButton.classList.toggle("is-busy", installState.installing);
  installButton.style.setProperty("--progress", installState.progress.toFixed(3));
  progressRing.style.setProperty("--progress", installState.progress.toFixed(3));

  if (installState.installing) {
    installLabel.textContent = "";
    featureStatus.textContent = `Downloading surprise... ${Math.round(installState.progress * 100)}%`;
    return;
  }

  if (installState.installed) {
    installLabel.textContent = "OPEN";
    installArrow.hidden = true;
    featureStatus.textContent = "Installed. Tap open to launch Eva Scratchers.";
    return;
  }

  installLabel.textContent = "GET";
  installArrow.hidden = false;
  featureStatus.textContent = "A custom mini-game hidden inside the phone.";
}

function startInstallFlow() {
  if (installState.installing) {
    return;
  }

  if (installState.installed) {
    showScreen("game");
    return;
  }

  installState.installing = true;
  installState.progress = 0;
  installArrow.hidden = false;
  refreshInstallUi();

  const duration = 2600;
  const started = performance.now();

  const tick = (now) => {
    const progress = Math.min(1, (now - started) / duration);
    const eased = 1 - (1 - progress) * (1 - progress);
    installState.progress = eased;
    refreshInstallUi();

    if (progress < 1) {
      requestAnimationFrame(tick);
      return;
    }

    installState.installing = false;
    installState.installed = true;
    installState.progress = 1;
    refreshInstallUi();
    featureStatus.textContent = "Installed. Opening Eva Scratchers...";
    setTimeout(() => showScreen("game"), 420);
  };

  requestAnimationFrame(tick);
}

class ScratchCard {
  constructor({ canvas, colors, onReveal }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { willReadFrequently: true });
    this.colors = colors;
    this.onReveal = onReveal;
    this.isDrawing = false;
    this.revealed = false;
    this.brushRadius = 22;

    this.resize();
    this.drawCover();
    this.bind();
  }

  resize() {
    const bounds = this.canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.floor(bounds.width * ratio));
    this.canvas.height = Math.max(1, Math.floor(bounds.height * ratio));
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(ratio, ratio);
  }

  drawCover() {
    const { width, height } = this.canvas.getBoundingClientRect();
    const gradient = this.ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, this.colors[0]);
    gradient.addColorStop(1, this.colors[1]);

    this.ctx.globalCompositeOperation = "source-over";
    this.ctx.clearRect(0, 0, width, height);
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, width, height);

    for (let i = 0; i < 180; i += 1) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const alpha = 0.05 + Math.random() * 0.09;
      const radius = 0.8 + Math.random() * 2.8;
      this.ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      this.ctx.beginPath();
      this.ctx.arc(x, y, radius, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  bind() {
    this.canvas.addEventListener("pointerdown", (event) => {
      if (this.revealed) {
        return;
      }

      this.isDrawing = true;
      this.canvas.setPointerCapture(event.pointerId);
      this.erase(event);
    });

    this.canvas.addEventListener("pointermove", (event) => {
      if (!this.isDrawing || this.revealed) {
        return;
      }

      this.erase(event);
    });

    const stopDrawing = async () => {
      this.isDrawing = false;
      await this.checkReveal();
    };

    this.canvas.addEventListener("pointerup", stopDrawing);
    this.canvas.addEventListener("pointercancel", stopDrawing);
    window.addEventListener("resize", () => {
      if (this.revealed) {
        return;
      }

      this.resize();
      this.drawCover();
    });
  }

  erase(event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    this.ctx.globalCompositeOperation = "destination-out";
    this.ctx.beginPath();
    this.ctx.arc(x, y, this.brushRadius, 0, Math.PI * 2);
    this.ctx.fill();
  }

  async checkReveal() {
    if (this.revealed) {
      return;
    }

    const bounds = this.canvas.getBoundingClientRect();
    const sampleWidth = Math.max(1, Math.floor(bounds.width));
    const sampleHeight = Math.max(1, Math.floor(bounds.height));
    const sample = this.ctx.getImageData(0, 0, sampleWidth, sampleHeight).data;
    let transparent = 0;
    let total = 0;

    for (let i = 3; i < sample.length; i += 24) {
      total += 1;
      if (sample[i] < 40) {
        transparent += 1;
      }
    }

    if (transparent / total < 0.38) {
      return;
    }

    this.revealed = true;
    this.canvas.parentElement.classList.add("revealed");
    this.onReveal();
  }
}

function buildTickets() {
  let revealedCount = 0;

  tickets.forEach((ticket) => {
    const card = document.createElement("article");
    card.className = "ticket";
    card.style.setProperty("--ticket-a", ticket.colors[0]);
    card.style.setProperty("--ticket-b", ticket.colors[1]);

    card.innerHTML = `
      <div class="ticket-background"></div>
      <div class="ticket-content">
        <div class="ticket-topline">
          <span class="ticket-tag">${ticket.tag}</span>
          <span class="ticket-badge">locked</span>
        </div>
        <h3>${ticket.title}</h3>
        <div class="ticket-label">Amazon code</div>
        <div class="ticket-code">${ticket.code}</div>
        <div class="ticket-note">${ticket.note}</div>
      </div>
      <div class="ticket-overlay">
        <canvas></canvas>
        <div class="overlay-copy">
          <div>
            <strong>SCRATCH TO REVEAL</strong>
            <span>three hidden gifts inside</span>
          </div>
        </div>
      </div>
    `;

    const badge = card.querySelector(".ticket-badge");
    const canvas = card.querySelector("canvas");
    ticketList.append(card);

    new ScratchCard({
      canvas,
      colors: ticket.scratch,
      onReveal: () => {
        badge.textContent = "open";
        revealedCount += 1;
        if (revealedCount === tickets.length) {
          finalReveal.classList.add("is-visible");
        }
      }
    });
  });
}

function bindNav() {
  document.querySelectorAll("[data-go-home]").forEach((button) => {
    button.addEventListener("click", () => showScreen("home"));
  });

  document.querySelector("[data-go-store]").addEventListener("click", () => {
    showScreen("store");
  });

  installButton.addEventListener("click", (event) => {
    event.stopPropagation();
    startInstallFlow();
  });

  installCard.addEventListener("click", startInstallFlow);

  sideButton.addEventListener("click", () => {
    if (isSleeping) {
      setSleeping(false);
      lockPhone();
      return;
    }

    if (activeScreen !== "lock") {
      lockPhone();
      return;
    }

    setSleeping(true);
  });
}

function init() {
  updateClock();
  setInterval(updateClock, 30000);

  buildHomePages();
  buildStoreRows();
  buildTickets();
  bindNav();
  refreshInstallUi();

  unlockSlider.addEventListener("input", handleUnlockInput);
  ["mouseup", "touchend", "pointerup", "keyup"].forEach((eventName) => {
    unlockSlider.addEventListener(eventName, () => {
      if (Number(unlockSlider.value) < 96) {
        animateUnlockReset();
      }
    });
  });
}

init();
