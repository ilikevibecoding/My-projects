const realIcons = {
  facetime:
    "https://commons.wikimedia.org/wiki/Special:FilePath/FaceTime_iOS.svg",
  calendar:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Apple_Calendar_(iOS).svg",
  photos:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Foto_(iOS).png",
  camera:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Fotocamera_(iOS).png",
  mail:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Mail_(iOS).svg",
  clock:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Clock_(iOS).png",
  maps:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Apple%20Maps%20iOS%2026%20icon.png",
  messages:
    "https://commons.wikimedia.org/wiki/Special:FilePath/IMessage_icon.png",
  appstore:
    "https://commons.wikimedia.org/wiki/Special:FilePath/App_Store_(iOS,_2024).svg",
  settings:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Settings_(iOS).png",
  safari:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Safari-icon-1024.png",
  music:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Apple_Music_icon_iOS_26.svg",
  phone:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Phone_iOS.png"
};

const homePagesData = [
  [
    { name: "FaceTime", glyph: "FT", bg: "#33bf74", type: "facetime", src: realIcons.facetime },
    { name: "Calendar", glyph: "14", bg: "#ee3d43", type: "calendar", src: realIcons.calendar },
    { name: "Photos", glyph: "PH", bg: "#ffffff", type: "photos", fg: "#1d2230", src: realIcons.photos },
    { name: "Camera", glyph: "CAM", bg: "#23252d", type: "camera", src: realIcons.camera },
    { name: "Mail", glyph: "M", bg: "#1f87fa", type: "mail", src: realIcons.mail },
    { name: "Clock", glyph: "CLK", bg: "#101319", type: "clock", src: realIcons.clock },
    { name: "Maps", glyph: "MAP", bg: "#ffffff", type: "maps", fg: "#1d2230", src: realIcons.maps },
    { name: "Weather", glyph: "SUN", bg: "#59a8ff", type: "weather" },
    { name: "Notes", glyph: "N", bg: "#f3d83f", type: "notes", fg: "#1d2230" },
    { name: "Reminders", glyph: "DO", bg: "#f7f7fb", type: "text", fg: "#1d2230" },
    { name: "App Store", glyph: "A", bg: "#167efb", type: "appstore", action: "store", src: realIcons.appstore },
    { name: "Settings", glyph: "SET", bg: "#b9bec8", type: "settings", fg: "#ffffff", src: realIcons.settings },
    { name: "TikTok", glyph: "TT", bg: "#101114", type: "tiktok" },
    { name: "Music", glyph: "MUS", bg: "#f43a7f", type: "music", src: realIcons.music },
    { name: "Messages", glyph: "MSG", bg: "#26c457", type: "messages", src: realIcons.messages },
    { name: "Safari", glyph: "SAF", bg: "#ffffff", type: "safari", fg: "#1d2230", src: realIcons.safari }
  ],
  [
    { name: "Health", glyph: "H", bg: "#ffffff", type: "health", fg: "#1d2230" },
    { name: "Wallet", glyph: "W", bg: "#141821", type: "wallet" },
    { name: "Books", glyph: "BK", bg: "#f78c43", type: "books" },
    { name: "Files", glyph: "FL", bg: "#4d90ff", type: "text" },
    { name: "Fitness", glyph: "FIT", bg: "#121316", type: "fitness" },
    { name: "Clips", glyph: "CC", bg: "#8d3cff", type: "text" },
    { name: "Calculator", glyph: "CAL", bg: "#17191f", type: "calculator" },
    { name: "Translate", glyph: "TR", bg: "#fafafd", type: "text", fg: "#1d2230" },
    { name: "Podcasts", glyph: "PC", bg: "#7e43ff", type: "podcasts" },
    { name: "TV", glyph: "TV", bg: "#111216", type: "tv" },
    { name: "Journal", glyph: "JR", bg: "#4c86f5", type: "journal" },
    { name: "Contacts", glyph: "CT", bg: "#f3f5f8", type: "contacts", fg: "#1d2230" },
    {
      name: "Eva Scratchers",
      glyph: "E",
      bg: "#ff75a7",
      type: "text",
      action: "game",
      hiddenUntilInstalled: true,
      installedApp: true
    },
    { name: "Shortcuts", glyph: "SC", bg: "#eb7832", type: "text" },
    { name: "Find My", glyph: "FM", bg: "#1ed18f", type: "text" },
    { name: "Tips", glyph: "!", bg: "#f4d33b", type: "tips", fg: "#1d2230" }
  ]
];

const dockApps = [
  { name: "Phone", glyph: "TEL", bg: "#29c65b", type: "phone", src: realIcons.phone },
  { name: "Safari", glyph: "SAF", bg: "#ffffff", type: "safari", fg: "#1d2230", src: realIcons.safari },
  { name: "Music", glyph: "MUS", bg: "#f43a7f", type: "music", src: realIcons.music },
  { name: "Messages", glyph: "MSG", bg: "#26c457", type: "messages", src: realIcons.messages }
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
let homeTrack = null;
let unlockResetFrame = null;
let isSleeping = false;
let installedAppTile = null;

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

function goToPage(index, smooth = true) {
  if (!homeScroller) {
    return;
  }

  currentPage = Math.max(0, Math.min(homePagesData.length - 1, index));
  syncPageDots();
  homeScroller.scrollTo({
    left: homeScroller.clientWidth * currentPage,
    behavior: smooth ? "smooth" : "auto"
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
  const svg = (markup, viewBox = "0 0 64 64") =>
    `<svg class="icon-svg" viewBox="${viewBox}" aria-hidden="true">${markup}</svg>`;

  switch (icon.type) {
    case "facetime":
      return svg(`
        <rect x="14" y="18" width="28" height="28" rx="9" fill="#fff"/>
        <path d="M42 26.5 51 21c1.4-.8 3 .2 3 1.8v18.4c0 1.6-1.6 2.6-3 1.8L42 37.5Z" fill="#fff"/>
      `);
    case "photos":
      return svg(`
        <circle cx="32" cy="17" r="7.2" fill="#ff4f74"/>
        <circle cx="43.3" cy="21.7" r="7.2" fill="#ff9d2f"/>
        <circle cx="47" cy="33" r="7.2" fill="#ffd93b"/>
        <circle cx="43.3" cy="44.3" r="7.2" fill="#55d16e"/>
        <circle cx="32" cy="49" r="7.2" fill="#28c9d7"/>
        <circle cx="20.7" cy="44.3" r="7.2" fill="#3e8cff"/>
        <circle cx="17" cy="33" r="7.2" fill="#7a68ff"/>
        <circle cx="20.7" cy="21.7" r="7.2" fill="#d365ff"/>
        <circle cx="32" cy="33" r="7" fill="#fff"/>
      `);
    case "appstore":
      return `
        <div class="glyph-appstore">
          <i></i><i></i><i></i>
        </div>
      `;
    case "mail":
      return svg(`
        <path d="M14 18h36c2.2 0 4 1.8 4 4v20c0 2.2-1.8 4-4 4H14c-2.2 0-4-1.8-4-4V22c0-2.2 1.8-4 4-4Z" fill="#fff"/>
        <path d="M12 22 32 36 52 22" fill="none" stroke="#1f87fa" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      `);
    case "maps":
      return svg(`
        <rect x="10" y="10" width="44" height="44" rx="11" fill="#fff"/>
        <path d="M13 42c7-8 13-12 20-10 5 2 10 0 18-8" fill="none" stroke="#2c7efc" stroke-width="5" stroke-linecap="round"/>
        <path d="M15 46c8-8 15-11 21-8 7 3 12 1 17-3" fill="none" stroke="#45d26d" stroke-width="6" stroke-linecap="round"/>
        <path d="M33 16c-5.2 0-9.5 3.9-9.5 9.1 0 7.2 9.5 15.9 9.5 15.9s9.5-8.7 9.5-15.9c0-5.2-4.3-9.1-9.5-9.1Z" fill="#ff5a59"/>
        <circle cx="33" cy="25" r="3.8" fill="#fff"/>
      `);
    case "weather":
      return svg(`
        <circle cx="24" cy="24" r="10" fill="#ffd54a"/>
        <path d="M34 40c0-4.8 3.7-8.5 8.4-8.5 1.3 0 2.6.3 3.7.9 1.2-2.8 4-4.8 7.2-4.8 4.4 0 8 3.6 8 8 0 .3 0 .6-.1.9 1.7 1 2.8 2.8 2.8 4.9 0 3.1-2.5 5.6-5.6 5.6H39.7A5.7 5.7 0 0 1 34 40Z" fill="#fff" transform="translate(-12 0)"/>
      `);
    case "clock":
      return svg(`
        <circle cx="32" cy="32" r="18" fill="#fff"/>
        <circle cx="32" cy="32" r="2.8" fill="#101319"/>
        <path d="M32 32V21" stroke="#101319" stroke-width="3.8" stroke-linecap="round"/>
        <path d="m32 32 8.5 5.5" stroke="#ff623f" stroke-width="3.8" stroke-linecap="round"/>
      `);
    case "settings":
      return svg(`
        <circle cx="32" cy="32" r="11" fill="#f8fafc"/>
        <circle cx="32" cy="32" r="6.5" fill="#9fa6b5"/>
        <g stroke="#f8fafc" stroke-width="4" stroke-linecap="round">
          <path d="M32 12v6"/><path d="M32 46v6"/><path d="M12 32h6"/><path d="M46 32h6"/>
          <path d="m18.5 18.5 4.2 4.2"/><path d="m41.3 41.3 4.2 4.2"/>
          <path d="m45.5 18.5-4.2 4.2"/><path d="m22.7 41.3-4.2 4.2"/>
        </g>
      `);
    case "music":
      return svg(`
        <path d="M26 18v22.5a6.5 6.5 0 1 1-3.5-5.8V21l18-4v18.5a6.5 6.5 0 1 1-3.5-5.8V16Z" fill="#fff"/>
      `);
    case "safari":
      return svg(`
        <circle cx="32" cy="32" r="21" fill="#f3f8ff"/>
        <circle cx="32" cy="32" r="17.8" fill="#42a5ff"/>
        <circle cx="32" cy="32" r="13.8" fill="#7dc8ff"/>
        <path d="M32 17 37 31 32 47 27 33Z" fill="#ff5c55"/>
        <path d="M32 17 27 33 32 47 37 31Z" fill="#fff"/>
        <circle cx="32" cy="32" r="3.4" fill="#fff"/>
      `);
    case "phone":
      return svg(`
        <path d="M22.6 14.8c1.2-1.2 3-1.5 4.5-.7l4.2 2.4c1.7 1 2.4 3 1.6 4.8l-1.8 4c2.6 5.1 6.7 9.2 11.8 11.8l4-1.8c1.8-.8 3.8-.1 4.8 1.6l2.4 4.2c.8 1.5.5 3.3-.7 4.5l-2.8 2.8c-1.8 1.8-4.5 2.6-7 2.1-14.4-3.1-25.7-14.4-28.8-28.8-.5-2.5.3-5.2 2.1-7Z" fill="#fff"/>
      `);
    case "health":
      return svg(`
        <path d="M32 50s-16.5-9.9-16.5-22.6c0-6.2 4.6-10.8 10.6-10.8 3.2 0 5.2 1.2 5.9 2.1.7-.9 2.7-2.1 5.9-2.1 6 0 10.6 4.6 10.6 10.8C48.5 40.1 32 50 32 50Z" fill="#ff4f72"/>
      `);
    case "wallet":
      return svg(`
        <rect x="12" y="16" width="40" height="28" rx="8" fill="#1e232f"/>
        <rect x="17" y="12" width="28" height="10" rx="5" fill="#53a8ff"/>
        <rect x="20" y="19" width="28" height="10" rx="5" fill="#66df9d"/>
        <rect x="17" y="26" width="30" height="10" rx="5" fill="#ff9e49"/>
        <circle cx="43" cy="30.5" r="2.4" fill="#fff"/>
      `);
    case "books":
      return svg(`
        <path d="M16 17h15c4 0 7 3 7 7v23H21c-4 0-7-3-7-7V17Z" fill="#fff"/>
        <path d="M48 17H33c-4 0-7 3-7 7v23h17c4 0 7-3 7-7V17Z" fill="#fff" opacity=".92"/>
        <path d="M32 17v30" stroke="#f78c43" stroke-width="3"/>
      `);
    case "fitness":
      return svg(`
        <circle cx="25" cy="32" r="10" fill="none" stroke="#ff3b77" stroke-width="6"/>
        <circle cx="39" cy="32" r="10" fill="none" stroke="#b45cff" stroke-width="6"/>
      `);
    case "calculator":
      return svg(`
        <rect x="16" y="14" width="32" height="36" rx="8" fill="#2a2e36"/>
        <rect x="21" y="19" width="22" height="8" rx="3" fill="#8f949c"/>
        <g fill="#fff">
          <circle cx="24" cy="33" r="3"/><circle cx="32" cy="33" r="3"/><circle cx="40" cy="33" r="3"/>
          <circle cx="24" cy="41" r="3"/><circle cx="32" cy="41" r="3"/><circle cx="40" cy="41" r="3"/>
        </g>
        <circle cx="40" cy="49" r="3" fill="#ff9d2f"/>
      `);
    case "podcasts":
      return svg(`
        <circle cx="32" cy="32" r="4.5" fill="#fff"/>
        <rect x="29.5" y="37" width="5" height="10" rx="2.5" fill="#fff"/>
        <path d="M22 32a10 10 0 0 1 20 0" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
        <path d="M16 32a16 16 0 0 1 32 0" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".75"/>
      `);
    case "tv":
      return svg(`
        <rect x="15" y="18" width="34" height="24" rx="7" fill="#fff"/>
        <path d="M27 27.5v5l5-2.5Z" fill="#111216"/>
      `);
    case "journal":
      return svg(`
        <rect x="17" y="13" width="30" height="38" rx="7" fill="#fff"/>
        <path d="M25 19h14M25 25h14M25 31h10" stroke="#4c86f5" stroke-width="3" stroke-linecap="round"/>
        <rect x="21" y="13" width="4" height="38" rx="2" fill="#9cc0ff"/>
      `);
    case "contacts":
      return svg(`
        <circle cx="32" cy="25" r="8" fill="#9ca5b4"/>
        <path d="M18 46c1.9-6.4 7.4-10 14-10s12.1 3.6 14 10" fill="#9ca5b4"/>
      `);
    case "tips":
      return svg(`
        <path d="M32 16c-6.3 0-11.5 5.1-11.5 11.4 0 3.4 1.5 6.2 4 8.2 2 1.6 3.3 3.7 3.5 5.5h8c.2-1.8 1.5-3.9 3.5-5.5 2.5-2 4-4.8 4-8.2C43.5 21.1 38.3 16 32 16Z" fill="#fff"/>
        <rect x="26" y="43" width="12" height="4" rx="2" fill="#fff"/>
      `);
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
  const iconInner = icon.src
    ? `<img class="app-icon-image" src="${icon.src}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" />`
    : createGlyph(icon);
  iconWrap.innerHTML = `
    <span class="app-icon-shadow"></span>
    <div
      class="app-icon${icon.src ? " has-image" : ""}"
      style="--icon-bg:${icon.bg}; --icon-fg:${icon.fg || "#fff"}"
    >
      ${iconInner}
    </div>
  `;
  return iconWrap;
}

function buildAppTile(icon, isDockIcon = false) {
  const tile = icon.action ? document.createElement("button") : document.createElement("div");
  tile.className = `app-tile${icon.action ? " buttonish" : ""}${icon.hiddenUntilInstalled ? " is-hidden" : ""}${icon.installedApp ? " installed-app" : ""}`;

  if (icon.action) {
    tile.type = "button";
  }

  if (icon.action === "store") {
    tile.addEventListener("click", () => showScreen("store"));
  }

  if (icon.action === "game") {
    tile.addEventListener("click", () => {
      if (!installState.installed) {
        return;
      }

      showScreen("game");
    });
  }

  tile.append(buildIconMarkup(icon));

  if (!isDockIcon) {
    const label = document.createElement("span");
    label.className = "app-label";
    label.textContent = icon.name;
    tile.append(label);
  }

  if (icon.installedApp) {
    installedAppTile = tile;
  }

  return tile;
}

function buildHomePages() {
  const track = document.createElement("div");
  track.className = "home-pages-track";
  track.style.width = `${homePagesData.length * 100}%`;

  homePagesData.forEach((page) => {
    const pageElement = document.createElement("div");
    pageElement.className = "home-page";
    pageElement.style.width = `${100 / homePagesData.length}%`;
    pageElement.style.flex = `0 0 ${100 / homePagesData.length}%`;
    page.forEach((app) => {
      pageElement.append(buildAppTile(app));
    });
    track.append(pageElement);
  });

  homePages.append(track);
  homeScroller = homePages;
  homeTrack = track;

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

  let pointerId = null;
  let dragStartX = 0;
  let dragStartScrollLeft = 0;
  let moved = false;

  homeScroller.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    if (event.target.closest(".app-tile.buttonish")) {
      return;
    }

    pointerId = event.pointerId;
    dragStartX = event.clientX;
    dragStartScrollLeft = homeScroller.scrollLeft;
    moved = false;
    homeScroller.classList.add("is-dragging");
    homeScroller.setPointerCapture?.(event.pointerId);
  });

  homeScroller.addEventListener("pointermove", (event) => {
    if (pointerId !== event.pointerId) {
      return;
    }

    const delta = event.clientX - dragStartX;
    if (Math.abs(delta) > 4) {
      moved = true;
    }

    homeScroller.scrollLeft = dragStartScrollLeft - delta;
  });

  const finishDrag = (event) => {
    if (pointerId === null) {
      return;
    }

    if (event.pointerId !== undefined && pointerId !== event.pointerId) {
      return;
    }

    pointerId = null;
    homeScroller.classList.remove("is-dragging");
    const pageWidth = homeScroller.clientWidth || 1;
    const targetPage = moved ? Math.round(homeScroller.scrollLeft / pageWidth) : currentPage;
    goToPage(targetPage);
  };

  homeScroller.addEventListener("pointerup", finishDrag);
  homeScroller.addEventListener("pointercancel", finishDrag);
}

function syncPageDots() {
  [...pageDots.children].forEach((dot, index) => {
    dot.classList.toggle("active", index === currentPage);
  });
}

function revealInstalledApp() {
  if (!installedAppTile) {
    return;
  }

  installedAppTile.classList.remove("is-hidden");
  requestAnimationFrame(() => {
    installedAppTile.classList.add("is-installed");
  });

  window.setTimeout(() => {
    installedAppTile.classList.remove("is-installed");
  }, 900);
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
    revealInstalledApp();
    refreshInstallUi();
    featureStatus.textContent = "Installed. Eva Scratchers is now on page two.";
    setTimeout(() => {
      showScreen("home");
      goToPage(1);
    }, 420);
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
    gradient.addColorStop(0, "#e6ebf1");
    gradient.addColorStop(0.35, "#b8bec9");
    gradient.addColorStop(0.7, "#f4f7fb");
    gradient.addColorStop(1, "#9198a8");

    this.ctx.globalCompositeOperation = "source-over";
    this.ctx.clearRect(0, 0, width, height);
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, width, height);

    for (let i = 0; i < 260; i += 1) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const alpha = 0.03 + Math.random() * 0.1;
      const radius = 0.4 + Math.random() * 2.2;
      this.ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      this.ctx.beginPath();
      this.ctx.arc(x, y, radius, 0, Math.PI * 2);
      this.ctx.fill();
    }

    this.ctx.save();
    this.ctx.transform(1, 0.22, -0.18, 1, 0, 0);
    this.ctx.fillStyle = "rgba(255,255,255,0.09)";
    for (let i = -height; i < width + height; i += 18) {
      this.ctx.fillRect(i, -height, 6, height * 3);
    }
    this.ctx.restore();

    const sheen = this.ctx.createLinearGradient(0, 0, width, 0);
    sheen.addColorStop(0, "rgba(255,255,255,0)");
    sheen.addColorStop(0.5, "rgba(255,255,255,0.16)");
    sheen.addColorStop(1, "rgba(255,255,255,0)");
    this.ctx.fillStyle = sheen;
    this.ctx.fillRect(0, 0, width, height);
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
        <div class="ticket-prize-panel">
          <div class="ticket-label">Amazon code</div>
          <div class="ticket-code">${ticket.code}</div>
        </div>
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
  installCard.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      startInstallFlow();
    }
  });

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
  goToPage(0, false);

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
