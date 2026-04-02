const realIcons = {
  facetime:
    "https://commons.wikimedia.org/wiki/Special:FilePath/FaceTime_iOS.svg",
  calendar:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Apple_Calendar_(iOS).svg",
  notes:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Apple_Notes_(iOS).png",
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
  contacts:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Contacts_(iOS).png",
  news:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Apple_News_icon_(iOS).png",
  appstore:
    "https://commons.wikimedia.org/wiki/Special:FilePath/App_Store_(iOS,_2024).svg",
  settings:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Settings_(iOS).png",
  safari:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Safari-icon-1024.png",
  tv:
    "https://commons.wikimedia.org/wiki/Special:FilePath/AppleTVLogo.svg",
  music:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Apple_Music_icon_iOS_26.svg",
  phone:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Phone_iOS.png",
  shortcuts:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Shortcuts_(iOS_26)_app_icon.png"
};

const favoriteApps = [
  {
    name: "DreamyRoom",
    subtitle: "favorite cozy game",
    glyph: "DR",
    bg: "#8e73ff",
    type: "text",
    src: "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/ff/02/5d/ff025dfe-15b6-a30d-f7d4-8c968e5f0f21/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/512x512bb.jpg"
  },
  {
    name: "Cookingdom",
    subtitle: "favorite cozy game",
    glyph: "CD",
    bg: "#f0c96a",
    type: "text",
    src: "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/fd/c7/81/fdc781f5-ece0-45d3-14b9-bbe54dfc3901/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/512x512bb.jpg"
  },
  {
    name: "Satistory: TidyUp",
    subtitle: "favorite tidy game",
    glyph: "ST",
    bg: "#8be8ff",
    type: "text",
    src: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/d4/3e/02/d43e02e9-25a8-e0c7-75e1-a4994cda39a2/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/512x512bb.jpg"
  },
  {
    name: "CrimeRadar",
    subtitle: "favorite scanner app",
    glyph: "CR",
    bg: "#111216",
    type: "text",
    src: "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/af/65/36/af653650-c86d-e4d0-c444-196a064ac579/AppIconNewsBreak-0-0-1x_U007ephone-0-11-0-85-220.png/512x512bb.jpg"
  }
];

const homePagesData = [
  [
    { name: "Notes", glyph: "N", bg: "#f3d83f", type: "notes", fg: "#1d2230", src: realIcons.notes },
    { name: "Safari", glyph: "SAF", bg: "#ffffff", type: "safari", fg: "#1d2230" },
    { name: "FaceTime", glyph: "FT", bg: "#33bf74", type: "facetime", src: realIcons.facetime },
    { name: "Messages", glyph: "MSG", bg: "#26c457", type: "messages", src: realIcons.messages },
    { name: "App Store", glyph: "A", bg: "#167efb", type: "appstore", action: "store", src: realIcons.appstore },
    { name: "Voice Memos", glyph: "VM", bg: "#111216", type: "voicememos" },
    { name: "Apple TV", glyph: "TV", bg: "#111216", type: "tv", src: realIcons.tv },
    { name: "Calculator", glyph: "CAL", bg: "#17191f", type: "calculator" },
    { name: "Home", glyph: "HM", bg: "#ffffff", type: "homeapp", fg: "#1d2230" },
    { name: "Contacts", glyph: "CT", bg: "#f3f5f8", type: "contacts", fg: "#1d2230", src: realIcons.contacts },
    { name: "Maps", glyph: "MAP", bg: "#ffffff", type: "maps", fg: "#1d2230", src: realIcons.maps },
    { name: "Mail", glyph: "M", bg: "#1f87fa", type: "mail", src: realIcons.mail },
    { name: "Stocks", glyph: "ST", bg: "#111216", type: "stocks" },
    { name: "Calendar", glyph: "14", bg: "#ee3d43", type: "calendar", src: realIcons.calendar },
    { name: "Find My", glyph: "FM", bg: "#24d38e", type: "findmy" },
    { name: "Photos", glyph: "PH", bg: "#ffffff", type: "photos", fg: "#1d2230", src: realIcons.photos }
  ],
  [
    favoriteApps[0],
    favoriteApps[1],
    favoriteApps[2],
    favoriteApps[3],
    { name: "Phone", glyph: "TEL", bg: "#29c65b", type: "phone", src: realIcons.phone },
    { name: "Camera", glyph: "CAM", bg: "#23252d", type: "camera", src: realIcons.camera },
    { name: "Clock", glyph: "CLK", bg: "#101319", type: "clock", src: realIcons.clock },
    { name: "Settings", glyph: "SET", bg: "#b9bec8", type: "settings", fg: "#ffffff", src: realIcons.settings },
    { name: "Health", glyph: "H", bg: "#ffffff", type: "health", fg: "#1d2230" },
    { name: "Wallet", glyph: "W", bg: "#141821", type: "wallet" },
    { name: "Books", glyph: "BK", bg: "#f78c43", type: "books" },
    { name: "Podcasts", glyph: "PC", bg: "#7e43ff", type: "podcasts" },
    { name: "Translate", glyph: "TR", bg: "#fafafd", type: "text", fg: "#1d2230" },
    { name: "Files", glyph: "FL", bg: "#4d90ff", type: "text" },
    { name: "TikTok", glyph: "TT", bg: "#101114", type: "tiktok" },
    {
      name: "Eva Scratchers",
      glyph: "E",
      bg: "#ff75a7",
      type: "text",
      action: "game",
      hiddenUntilInstalled: true,
      installedApp: true
    }
  ]
];

const dockApps = [
  { name: "Phone", glyph: "TEL", bg: "#29c65b", type: "phone", src: realIcons.phone },
  { name: "Safari", glyph: "SAF", bg: "#ffffff", type: "safari", fg: "#1d2230" },
  { name: "Music", glyph: "MUS", bg: "#f43a7f", type: "music", src: realIcons.music },
  { name: "Messages", glyph: "MSG", bg: "#26c457", type: "messages", src: realIcons.messages }
];

const storeRows = [
  favoriteApps[0],
  favoriteApps[1],
  favoriteApps[2],
  favoriteApps[3]
];

const scratcherTickets = [
  {
    id: "cashword",
    kind: "cashword",
    tag: "TICKET 01",
    title: "Cashword Cutie",
    subtitle: "Scratch the board letter by letter",
    code: "AMZ-EVA-WORD-01",
    colors: ["#6a5cff", "#ff76b1"],
    scratch: ["#d8dde7", "#959db0"],
    words: ["EVA", "HAPPY", "BLUE", "BIRTHDAY"],
    grid: [
      "QBMNKEVABZ",
      "JITORCSWLP",
      "GROWTHIOUA",
      "ATBRPNYCED",
      "XHAPPYLOMV",
      "EDKEYCATQS",
      "QAXSMORETZ",
      "BYZQPHOTOX"
    ],
    letters: ["E", "Q", "V", "A", "X", "H", "P", "M", "Y", "B", "L", "O", "U", "I", "R", "G", "T", "D"]
  },
  {
    id: "tripler",
    kind: "tripler",
    tag: "TICKET 02",
    title: "7 11 21 Tripler",
    subtitle: "Scratch each game row",
    code: "AMZ-TRIPLER-LOVE-02",
    colors: ["#2443d7", "#7a34ff"],
    scratch: ["#d8dde7", "#959db0"],
    rows: [
      { symbol: "STAR", prize: "$25", result: "No win" },
      { symbol: "HEART", prize: "$50", result: "No win" },
      { symbol: "BELL", prize: "$10", result: "No win" },
      { symbol: "MOON", prize: "$100", result: "No win" }
    ]
  },
  {
    id: "prize-match",
    kind: "prizematch",
    tag: "TICKET 03",
    title: "Lucky Prize Match",
    subtitle: "Match 3 amounts to win",
    code: "AMZ-PRIZE-BDAY-03",
    colors: ["#35c0ff", "#56ebbf"],
    scratch: ["#d8dde7", "#959db0"],
    amounts: [
      "$2",
      "$5",
      "$10",
      "$25",
      "$50",
      "$100",
      "$500",
      "$1000",
      "$10,000"
    ]
  }
];

const screenElements = {
  lock: document.querySelector('[data-screen="lock"]'),
  home: document.querySelector('[data-screen="home"]'),
  "native-app": document.querySelector('[data-screen="native-app"]'),
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
const lightToggle = document.querySelector("[data-light-toggle]");
const flashlightOverlay = document.querySelector("[data-flashlight-overlay]");
const homeIndicator = document.querySelector(".home-indicator");
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
const ticketSelector = document.querySelector("[data-ticket-selector]");
const ticketStage = document.querySelector("[data-ticket-stage]");
const finalReveal = document.querySelector("[data-final-reveal]");
const notificationStack = document.querySelector("[data-notification-stack]");
const nativeAppContent = document.querySelector("[data-native-content]");

let activeScreen = "lock";
let currentPage = 0;
let homeScroller = null;
let homeTrack = null;
let unlockResetFrame = null;
let isSleeping = false;
let flashlightOn = false;
let installedAppTile = null;
let homeGesture = null;
let currentNativeAppId = null;
let faceTimeStream = null;
let activeScratcherTicketId = "cashword";

const installState = {
  installed: false,
  installing: false,
  progress: 0
};

const scratchAudio = {
  context: null,
  masterGain: null,
  filter: null,
  source: null,
  noiseBuffer: null,
  activePointers: 0
};

const scratcherState = {
  completed: {},
  cashword: {
    revealedCells: new Set(),
    revealedLetters: new Set(),
    revealedBank: new Set()
  },
  tripler: {
    revealed: {}
  },
  "prize-match": {
    revealed: {}
  }
};

const notificationState = {
  started: false,
  context: null
};

const christianMessages = [
  "dont forget to take your meds",
  "Love you(:"
];

const firstPageAppRoutes = {
  Notes: "notes",
  Safari: "safari",
  FaceTime: "facetime",
  Messages: "messages",
  "Voice Memos": "voicememos",
  "Apple TV": "tv",
  Calculator: "calculator",
  Home: "homeapp",
  Contacts: "contacts",
  Maps: "maps",
  Mail: "mail",
  Stocks: "stocks",
  Calendar: "calendar",
  "Find My": "findmy",
  Photos: "photos"
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

async function playUnlockSound() {
  const context = ensureNotificationAudioContext();
  if (!context) {
    return;
  }

  await context.resume();
  const now = context.currentTime;
  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.16, now + 0.015);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
  master.connect(context.destination);

  const tone = (type, frequency, start, duration, peak) => {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + duration + 0.04);
  };

  tone("triangle", 740, now, 0.16, 0.14);
  tone("sine", 987, now + 0.06, 0.22, 0.08);
  tone("sine", 1318, now + 0.12, 0.18, 0.05);
}

function stopFaceTimePreview() {
  if (!faceTimeStream) {
    return;
  }

  faceTimeStream.getTracks().forEach((track) => track.stop());
  faceTimeStream = null;
}

function setFlashlight(on) {
  flashlightOn = on;
  phoneScreen.classList.toggle("is-flashlight-on", on);
  if (lightToggle) {
    lightToggle.classList.toggle("is-active", on);
  }
  if (flashlightOverlay) {
    flashlightOverlay.setAttribute("aria-hidden", on ? "false" : "true");
  }
}

function showScreen(name) {
  if (!screenElements[name] || isSleeping) {
    return;
  }

  if (activeScreen === "native-app" && name !== "native-app") {
    stopFaceTimePreview();
  }

  activeScreen = name;
  Object.entries(screenElements).forEach(([screenName, element]) => {
    element.classList.toggle("is-visible", screenName === name);
    if (screenName === name && (screenName === "store" || screenName === "game" || screenName === "native-app")) {
      element.scrollTop = 0;
    }
  });
}

function getActiveAppScreen() {
  if (activeScreen === "store" || activeScreen === "game" || activeScreen === "native-app") {
    return screenElements[activeScreen];
  }

  return null;
}

function nativeAppLayout(title, bodyHtml, kicker = "") {
  return `
    <div class="native-app-header">
      <div class="native-app-header-left">
        <button class="native-app-close" type="button" data-native-home>Home</button>
      </div>
      <div class="native-app-title-group">
        ${kicker ? `<p class="native-app-kicker">${kicker}</p>` : ""}
        <h2 class="native-app-title">${title}</h2>
      </div>
      <div class="native-app-header-right">
        <div class="native-app-more">...</div>
      </div>
    </div>
    <div class="native-app-body">${bodyHtml}</div>
  `;
}

function buildCalendarMarkup() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startWeekday = first.getDay();
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const cells = [];

  for (let i = 0; i < startWeekday; i += 1) {
    cells.push(`<div class="calendar-day muted"></div>`);
  }

  for (let day = 1; day <= last.getDate(); day += 1) {
    const isToday = day === now.getDate();
    cells.push(`<div class="calendar-day${isToday ? " today" : ""}">${day}</div>`);
  }

  return `
    <div class="calendar-shell">
      <div class="native-section-title">${now.toLocaleDateString([], { month: "long", year: "numeric" })}</div>
      <div class="calendar-grid">
        ${weekdays.map((day) => `<div class="calendar-weekday">${day}</div>`).join("")}
        ${cells.join("")}
      </div>
    </div>
  `;
}

function getFaceTimeCallLog() {
  return Array.from({ length: 10 }, (_, index) => {
    const labels = ["Missed FaceTime Audio", "Missed FaceTime Video", "Christian called"];
    return `
      <article class="call-log-item">
        <strong>Christian</strong>
        <span class="call-log-meta">${labels[index % labels.length]}</span>
        <span class="call-log-meta" style="color:#ff5a5f;">Missed • ${index === 0 ? "Today" : `${index + 1}d ago`}</span>
      </article>
    `;
  }).join("");
}

function getMailLoveText() {
  return Array.from({ length: 10 }, () => "I love you").join(", ");
}

function renderNativeApp(appId) {
  if (!nativeAppContent) {
    return;
  }

  currentNativeAppId = appId;
  screenElements["native-app"].dataset.app = appId;

  const templates = {
    notes: nativeAppLayout("Notes", `<textarea class="notes-editor" placeholder=""></textarea>`, "iCloud"),
    safari: nativeAppLayout(
      "Safari",
      `
        <div class="safari-page">
          <div class="safari-bar">Search or enter website name</div>
          <div class="ios-card">
            <strong>Favorites</strong>
            <div class="safari-favorites" style="margin-top:0.9rem;">
              <div class="safari-favorite"><div class="safari-favorite-badge">C</div><div class="call-log-meta">Christian</div></div>
              <div class="safari-favorite"><div class="safari-favorite-badge">A</div><div class="call-log-meta">Amazon</div></div>
              <div class="safari-favorite"><div class="safari-favorite-badge">P</div><div class="call-log-meta">Photos</div></div>
              <div class="safari-favorite"><div class="safari-favorite-badge">L</div><div class="call-log-meta">Love</div></div>
            </div>
          </div>
          <div class="ios-card">
            <strong>Start Page</strong>
            <p class="call-log-meta" style="margin:0.45rem 0 0;">A little Safari space made for Eva.</p>
          </div>
        </div>
      `
    ),
    facetime: nativeAppLayout(
      "FaceTime",
      `
        <div class="facetime-preview-wrap">
          <video class="facetime-preview" data-facetime-video autoplay muted playsinline></video>
          <div class="facetime-preview-placeholder" data-facetime-placeholder>Tap allow camera access to preview FaceTime here.</div>
        </div>
        <div style="margin-top:1rem;" class="native-section-title">Recents</div>
        <div class="call-log-list" style="margin-top:0.85rem;">${getFaceTimeCallLog()}</div>
      `
    ),
    messages: nativeAppLayout(
      "Messages",
      `<div class="messages-thread"><div class="bubble-row"><div class="bubble">dont forget to take your meds</div></div><div class="bubble-row"><div class="bubble">Love you(:</div></div></div>`
    ),
    voicememos: nativeAppLayout(
      "Voice Memos",
      `<div class="ios-card"><div class="voice-wave">${Array.from({ length: 28 }, (_, i) => `<span style="height:${18 + ((i * 7) % 28)}px"></span>`).join("")}</div><div style="margin-top:0.9rem;"><strong>Christian Voice Note</strong></div><div class="call-log-meta">0:18 • saved</div></div>`
    ),
    tv: nativeAppLayout(
      "Apple TV",
      `<div class="tv-hero"><div class="tv-pill">Movie Night with Eva</div><h3 style="margin:0.7rem 0 0;">Haunted House</h3><p style="margin:0.45rem 0 0; opacity:0.82;">Queued up and ready to watch together.</p></div>`
    ),
    calculator: nativeAppLayout(
      "Calculator",
      `<div class="calculator-shell"><div class="calculator-display" data-calc-display>0</div><div class="calculator-grid" data-calc-grid><button class="calculator-key function" data-calc-action="clear">AC</button><button class="calculator-key function" data-calc-action="sign">+/-</button><button class="calculator-key function" data-calc-action="percent">%</button><button class="calculator-key operator" data-calc-op="/">/</button><button class="calculator-key" data-calc-digit="7">7</button><button class="calculator-key" data-calc-digit="8">8</button><button class="calculator-key" data-calc-digit="9">9</button><button class="calculator-key operator" data-calc-op="*">x</button><button class="calculator-key" data-calc-digit="4">4</button><button class="calculator-key" data-calc-digit="5">5</button><button class="calculator-key" data-calc-digit="6">6</button><button class="calculator-key operator" data-calc-op="-">-</button><button class="calculator-key" data-calc-digit="1">1</button><button class="calculator-key" data-calc-digit="2">2</button><button class="calculator-key" data-calc-digit="3">3</button><button class="calculator-key operator" data-calc-op="+">+</button><button class="calculator-key zero" data-calc-digit="0">0</button><button class="calculator-key" data-calc-action="decimal">.</button><button class="calculator-key operator" data-calc-action="equals">=</button></div></div>`
    ),
    homeapp: nativeAppLayout("Home", `<div class="ios-card"><strong>No Accessories Added</strong><p class="call-log-meta" style="margin:0.45rem 0 0;">This home is waiting for Eva's cozy setup.</p></div>`),
    contacts: nativeAppLayout("Contacts", `<div class="contacts-list"><article class="contact-item"><strong>Christian</strong><span class="contact-subtitle">favorite person</span></article><article class="contact-item"><strong>Billy</strong><span class="contact-subtitle">dog</span></article><article class="contact-item"><strong>Dexter</strong><span class="contact-subtitle">dog</span></article></div>`),
    maps: nativeAppLayout("Maps", `<div class="maps-hero"><div class="route-chip">Nearby</div><h3 style="margin:0.7rem 0 0;">Where to?</h3><p style="margin:0.45rem 0 0; opacity:0.9;">Home, date night, pharmacy, and snacks.</p></div><div class="ios-list" style="margin-top:1rem;"><div class="ios-card"><strong>Home</strong><div class="call-log-meta">12 min</div></div><div class="ios-card"><strong>Date Night</strong><div class="call-log-meta">18 min</div></div><div class="ios-card"><strong>Pharmacy</strong><div class="call-log-meta">8 min</div></div></div>`),
    mail: nativeAppLayout("Mail", `<div class="mail-list"><article class="mail-item"><strong>Christian</strong><span class="mail-subject">Subject: I love you</span><div class="mail-thread">${getMailLoveText()}</div></article></div>`),
    stocks: nativeAppLayout("Stocks", `<div class="stocks-hero"><div class="stock-pill">Love Index +99.9%</div><h3 style="margin:0.7rem 0 0;">Christian <span style="color:#4ee08f;">/ Eva</span></h3><p style="margin:0.45rem 0 0; opacity:0.82;">Steady upward trend all month.</p></div>`),
    calendar: nativeAppLayout("Calendar", buildCalendarMarkup()),
    findmy: nativeAppLayout("Find My", `<div class="findmy-list"><article class="findmy-item"><span class="findmy-dot"></span><div><strong>Eva's AirPods</strong><div class="findmy-status">With you</div></div><span class="findmy-status">Now</span></article><article class="findmy-item"><span class="findmy-dot"></span><div><strong>Eva's phone</strong><div class="findmy-status">Nearby</div></div><span class="findmy-status">Here</span></article><article class="findmy-item"><span class="findmy-dot"></span><div><strong>Eva's AirTag</strong><div class="findmy-status">Living room</div></div><span class="findmy-status">2m</span></article><article class="findmy-item lost"><span class="findmy-dot"></span><div><strong>Eva's vape</strong><div class="findmy-status">Probably in the couch</div></div><span class="findmy-status">Lost</span></article></div>`),
    photos: nativeAppLayout("Photos", `<div class="ios-empty"><div><img class="photos-empty-icon" src="${realIcons.photos}" alt="" referrerpolicy="no-referrer" /><h3>No Photos or Videos</h3><p>Nothing is in the library yet.</p></div></div>`)
  };

  nativeAppContent.innerHTML = templates[appId] || nativeAppLayout("App", `<div class="ios-card">Nothing here yet.</div>`);
  nativeAppContent.querySelectorAll("[data-native-home]").forEach((button) => {
    button.addEventListener("click", () => showScreen("home"));
  });

  if (appId === "calculator") {
    setupCalculator();
  }

  if (appId === "facetime") {
    startFaceTimePreview();
  }
}

function openNativeApp(appId) {
  stopFaceTimePreview();
  renderNativeApp(appId);
  showScreen("native-app");
}

async function startFaceTimePreview() {
  const video = nativeAppContent?.querySelector("[data-facetime-video]");
  const placeholder = nativeAppContent?.querySelector("[data-facetime-placeholder]");
  if (!video || !navigator.mediaDevices?.getUserMedia) {
    return;
  }

  try {
    faceTimeStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    video.srcObject = faceTimeStream;
    video.style.display = "block";
    if (placeholder) {
      placeholder.style.display = "none";
    }
  } catch (error) {
    video.style.display = "none";
    if (placeholder) {
      placeholder.textContent = "Camera access is blocked right now, but Christian definitely called.";
      placeholder.style.display = "grid";
    }
  }
}

function setupCalculator() {
  const display = nativeAppContent?.querySelector("[data-calc-display]");
  const grid = nativeAppContent?.querySelector("[data-calc-grid]");
  if (!display || !grid) {
    return;
  }

  const state = { display: "0", storedValue: null, operator: null, waitingForOperand: false };
  const updateDisplay = () => {
    display.textContent = state.display;
  };
  const inputDigit = (digit) => {
    if (state.waitingForOperand) {
      state.display = digit;
      state.waitingForOperand = false;
    } else {
      state.display = state.display === "0" ? digit : state.display + digit;
    }
    updateDisplay();
  };
  const inputDecimal = () => {
    if (state.waitingForOperand) {
      state.display = "0.";
      state.waitingForOperand = false;
    } else if (!state.display.includes(".")) {
      state.display += ".";
    }
    updateDisplay();
  };
  const perform = (first, second, operator) => {
    switch (operator) {
      case "+":
        return first + second;
      case "-":
        return first - second;
      case "*":
        return first * second;
      case "/":
        return second === 0 ? 0 : first / second;
      default:
        return second;
    }
  };
  const handleOperator = (nextOperator) => {
    const inputValue = Number(state.display);
    if (state.operator && state.waitingForOperand) {
      state.operator = nextOperator;
      return;
    }
    if (state.storedValue == null) {
      state.storedValue = inputValue;
    } else if (state.operator) {
      const result = perform(state.storedValue, inputValue, state.operator);
      state.display = `${parseFloat(result.toFixed(8))}`;
      state.storedValue = result;
      updateDisplay();
    }
    state.waitingForOperand = true;
    state.operator = nextOperator;
  };

  grid.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) {
      return;
    }
    if (button.dataset.calcDigit) {
      inputDigit(button.dataset.calcDigit);
      return;
    }
    if (button.dataset.calcOp) {
      handleOperator(button.dataset.calcOp);
      return;
    }
    switch (button.dataset.calcAction) {
      case "decimal":
        inputDecimal();
        break;
      case "clear":
        state.display = "0";
        state.storedValue = null;
        state.operator = null;
        state.waitingForOperand = false;
        updateDisplay();
        break;
      case "sign":
        state.display = `${Number(state.display) * -1}`;
        updateDisplay();
        break;
      case "percent":
        state.display = `${Number(state.display) / 100}`;
        updateDisplay();
        break;
      case "equals":
        if (state.operator == null) {
          return;
        }
        handleOperator(null);
        state.operator = null;
        state.storedValue = null;
        break;
      default:
        break;
    }
  });

  updateDisplay();
}

function resetActiveAppTransform(target) {
  if (!target) {
    return;
  }

  target.classList.remove("is-gesture-active");
  target.style.transform = "";
  target.style.borderRadius = "";
  target.style.filter = "";
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
  setFlashlight(false);
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
    playUnlockSound();
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
    case "voicememos":
      return svg(`
        <path d="M12 33h4M18 29v8M24 24v18M30 20v26M36 25v16M42 21v24M48 28v10M52 31h4" stroke="#ff525d" stroke-width="3.6" stroke-linecap="round"/>
        <path d="M30 32c0-6 4.4-10.3 10.3-10.3S50.6 26 50.6 32 46.2 42.3 40.3 42.3 30 38 30 32Z" fill="none" stroke="#4aa7ff" stroke-width="3"/>
      `);
    case "homeapp":
      return svg(`
        <path d="M14 31.5 32 17l18 14.5" fill="none" stroke="#f1a51a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M20 29h24v17H20Z" fill="#ffc647"/>
        <path d="M25 33h14v13H25Z" fill="#fff3d5"/>
        <path d="M28.5 38h7v8h-7Z" fill="#fff"/>
      `);
    case "maps":
      return svg(`
        <rect x="10" y="10" width="44" height="44" rx="11" fill="#fff"/>
        <path d="M13 42c7-8 13-12 20-10 5 2 10 0 18-8" fill="none" stroke="#2c7efc" stroke-width="5" stroke-linecap="round"/>
        <path d="M15 46c8-8 15-11 21-8 7 3 12 1 17-3" fill="none" stroke="#45d26d" stroke-width="6" stroke-linecap="round"/>
        <path d="M33 16c-5.2 0-9.5 3.9-9.5 9.1 0 7.2 9.5 15.9 9.5 15.9s9.5-8.7 9.5-15.9c0-5.2-4.3-9.1-9.5-9.1Z" fill="#ff5a59"/>
        <circle cx="33" cy="25" r="3.8" fill="#fff"/>
      `);
    case "stocks":
      return svg(`
        <path d="M10 48h44" stroke="#353a46" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M12 40 22 33l8 6 11-16 11 8" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="41" cy="23" r="2.2" fill="#46a8ff"/>
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
    case "findmy":
      return svg(`
        <circle cx="32" cy="32" r="17" fill="#2fe08e"/>
        <circle cx="32" cy="32" r="10" fill="#2f9dff"/>
        <circle cx="32" cy="32" r="4.6" fill="#fff"/>
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
  const defaultRoute = firstPageAppRoutes[icon.name];
  const isNativeRoute = Boolean(!icon.action && defaultRoute);
  const isButton = Boolean(icon.action || isNativeRoute);
  const tile = isButton ? document.createElement("button") : document.createElement("div");
  tile.className = `app-tile${isButton ? " buttonish" : ""}${icon.hiddenUntilInstalled ? " is-hidden" : ""}${icon.installedApp ? " installed-app" : ""}`;

  if (isButton) {
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

  if (isNativeRoute) {
    tile.addEventListener("click", () => openNativeApp(defaultRoute));
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
    meta.innerHTML = `<h4>${item.name || item.title}</h4><p>${item.subtitle}</p>`;

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

function ensureScratchAudio() {
  if (scratchAudio.context) {
    return scratchAudio.context;
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return null;
  }

  const context = new AudioContextClass();
  const buffer = context.createBuffer(1, context.sampleRate * 1.5, context.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < channel.length; i += 1) {
    channel[i] = (Math.random() * 2 - 1) * 0.9;
  }

  const filter = context.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1800;
  filter.Q.value = 0.9;

  const gain = context.createGain();
  gain.gain.value = 0;

  filter.connect(gain);
  gain.connect(context.destination);

  scratchAudio.context = context;
  scratchAudio.filter = filter;
  scratchAudio.masterGain = gain;
  scratchAudio.noiseBuffer = buffer;
  return context;
}

async function startScratchSound() {
  const context = ensureScratchAudio();
  if (!context || !scratchAudio.masterGain || !scratchAudio.filter || !scratchAudio.noiseBuffer) {
    return;
  }

  scratchAudio.activePointers += 1;
  if (scratchAudio.source) {
    const now = context.currentTime;
    scratchAudio.masterGain.gain.cancelScheduledValues(now);
    scratchAudio.masterGain.gain.linearRampToValueAtTime(0.055, now + 0.03);
    return;
  }

  await context.resume();

  const source = context.createBufferSource();
  source.buffer = scratchAudio.noiseBuffer;
  source.loop = true;
  source.playbackRate.value = 1.2;
  source.connect(scratchAudio.filter);
  source.start();
  scratchAudio.source = source;

  const now = context.currentTime;
  scratchAudio.masterGain.gain.cancelScheduledValues(now);
  scratchAudio.masterGain.gain.setValueAtTime(0, now);
  scratchAudio.masterGain.gain.linearRampToValueAtTime(0.055, now + 0.03);
}

function modulateScratchSound() {
  const context = scratchAudio.context;
  if (!context || !scratchAudio.filter || !scratchAudio.masterGain || !scratchAudio.source) {
    return;
  }

  const now = context.currentTime;
  scratchAudio.filter.frequency.setValueAtTime(1300 + Math.random() * 1400, now);
  scratchAudio.masterGain.gain.setValueAtTime(0.042 + Math.random() * 0.028, now);
}

function stopScratchSound() {
  if (!scratchAudio.context || !scratchAudio.masterGain) {
    return;
  }

  scratchAudio.activePointers = Math.max(0, scratchAudio.activePointers - 1);
  if (scratchAudio.activePointers > 0) {
    return;
  }

  const { context, masterGain, source } = scratchAudio;
  const now = context.currentTime;
  masterGain.gain.cancelScheduledValues(now);
  masterGain.gain.setValueAtTime(masterGain.gain.value, now);
  masterGain.gain.linearRampToValueAtTime(0, now + 0.06);

  if (source) {
    const currentSource = source;
    scratchAudio.source = null;
    window.setTimeout(() => {
      try {
        currentSource.stop();
      } catch (error) {
        // Ignore stop races from fast pointer sequences.
      }
    }, 90);
  }
}

function ensureNotificationAudioContext() {
  if (notificationState.context) {
    return notificationState.context;
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return null;
  }

  notificationState.context = new AudioContextClass();
  return notificationState.context;
}

async function playNotificationDing() {
  const context = ensureNotificationAudioContext();
  if (!context) {
    return;
  }

  await context.resume();
  const now = context.currentTime;
  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.22, now + 0.02);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
  master.connect(context.destination);

  const makeTone = (type, frequency, start, duration, peak) => {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + duration + 0.03);
  };

  makeTone("sine", 1318.5, now, 0.22, 0.18);
  makeTone("triangle", 1046.5, now + 0.018, 0.3, 0.11);
  makeTone("sine", 1567.98, now + 0.105, 0.18, 0.08);
  makeTone("triangle", 2093, now + 0.14, 0.12, 0.045);

  if (navigator.vibrate) {
    navigator.vibrate(18);
  }
}

function refreshNotificationStack() {
  if (!notificationStack) {
    return;
  }

  [...notificationStack.children].forEach((item, index) => {
    item.style.setProperty("--stack-index", String(index));
    item.classList.toggle("is-dimmed", index > 0);
  });
}

function pushNotification(message) {
  if (!notificationStack) {
    return;
  }

  const card = document.createElement("article");
  card.className = "message-notification";
  card.innerHTML = `
    <img class="message-notification-icon" src="${realIcons.messages}" alt="" referrerpolicy="no-referrer" />
    <div class="message-notification-copy">
      <div class="message-notification-topline">
        <span class="message-app-label">Messages</span>
        <span class="message-time">now</span>
      </div>
      <div class="message-sender">Christian</div>
      <div class="message-body">${message}</div>
    </div>
  `;

  notificationStack.prepend(card);
  refreshNotificationStack();

  while (notificationStack.children.length > 3) {
    notificationStack.lastElementChild.remove();
  }

  requestAnimationFrame(() => {
    card.classList.add("is-visible");
  });

  window.setTimeout(() => {
    card.classList.remove("is-visible");
    card.classList.add("is-dismissed");
    window.setTimeout(() => {
      if (card.parentElement) {
        card.remove();
        refreshNotificationStack();
      }
    }, 280);
  }, 3200);
}

function startChristianNotifications() {
  if (notificationState.started) {
    return;
  }

  notificationState.started = true;
  christianMessages.forEach((message, index) => {
    window.setTimeout(() => {
      pushNotification(message);
      playNotificationDing();
    }, 650 + index * 1100);
  });
}

class ScratchCard {
  constructor({ canvas, colors, onReveal, brushRadius = 22, threshold = 0.38, coverRenderer = null }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { willReadFrequently: true });
    this.colors = colors;
    this.onReveal = onReveal;
    this.coverRenderer = coverRenderer;
    this.isDrawing = false;
    this.revealed = false;
    this.brushRadius = brushRadius;
    this.threshold = threshold;

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
    if (this.coverRenderer) {
      this.ctx.globalCompositeOperation = "source-over";
      this.ctx.clearRect(0, 0, width, height);
      this.coverRenderer(this.ctx, width, height, this.colors);
      return;
    }

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
      startScratchSound();
      this.erase(event);
    });

    this.canvas.addEventListener("pointermove", (event) => {
      if (!this.isDrawing || this.revealed) {
        return;
      }

      modulateScratchSound();
      this.erase(event);
    });

    const stopDrawing = async () => {
      this.isDrawing = false;
      stopScratchSound();
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

    if (transparent / total < this.threshold) {
      return;
    }

    this.revealed = true;
    this.canvas.parentElement.classList.add("revealed");
    this.onReveal();
  }
}

function markTicketComplete(ticketId) {
  scratcherState.completed[ticketId] = true;
  renderTicketSelector();
  if (activeScratcherTicketId === ticketId) {
    renderActiveTicket();
  }
  if (scratcherTickets.every((ticket) => scratcherState.completed[ticket.id])) {
    finalReveal.classList.add("is-visible");
  }
}

function renderTicketSelector() {
  if (!ticketSelector) {
    return;
  }

  ticketSelector.innerHTML = "";
  scratcherTickets.forEach((ticket) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `ticket-chip${ticket.id === activeScratcherTicketId ? " is-active" : ""}${scratcherState.completed[ticket.id] ? " is-complete" : ""}`;
    button.innerHTML = `
      <span class="ticket-chip-tag">${ticket.tag}</span>
      <strong>${ticket.title}</strong>
      <span class="ticket-chip-subtitle">${scratcherState.completed[ticket.id] ? "Code unlocked" : ticket.subtitle}</span>
    `;
    button.addEventListener("click", () => openScratcherTicket(ticket.id));
    ticketSelector.append(button);
  });
}

function openScratcherTicket(ticketId) {
  activeScratcherTicketId = ticketId;
  renderTicketSelector();
  renderActiveTicket();
}

function renderSilverFoil(ctx, width, height) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#eef2f7");
  gradient.addColorStop(0.36, "#bcc3cf");
  gradient.addColorStop(0.7, "#ffffff");
  gradient.addColorStop(1, "#949cad");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.transform(1, 0.22, -0.18, 1, 0, 0);
  ctx.fillStyle = "rgba(255,255,255,0.11)";
  for (let i = -height; i < width + height; i += 18) {
    ctx.fillRect(i, -height, 6, height * 3);
  }
  ctx.restore();
}

function renderBlueFoil(ctx, width, height) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#1430b9");
  gradient.addColorStop(1, "#6434ff");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  for (let i = 0; i < 4; i += 1) {
    const y = 8 + i * (height / 4.5);
    ctx.fillRect(10, y, width - 20, 10);
  }
}

function renderCandyFoil(ctx, width, height) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#ff8fd1");
  gradient.addColorStop(0.5, "#a67cff");
  gradient.addColorStop(1, "#6de6ff");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < 16; i += 1) {
    ctx.fillStyle = `rgba(255,255,255,${0.06 + (i % 3) * 0.04})`;
    ctx.beginPath();
    ctx.arc(Math.random() * width, Math.random() * height, 6 + Math.random() * 8, 0, Math.PI * 2);
    ctx.fill();
  }
}

function getCashwordPlacements(ticket) {
  if (ticket.placements) {
    return ticket.placements;
  }

  const rows = ticket.grid;
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [-1, 1]
  ];

  ticket.placements = ticket.words.map((word) => {
    const letters = word.split("");
    for (let row = 0; row < rows.length; row += 1) {
      for (let col = 0; col < rows[row].length; col += 1) {
        for (const [dr, dc] of directions) {
          const coords = [];
          let matched = true;
          for (let index = 0; index < letters.length; index += 1) {
            const nextRow = row + dr * index;
            const nextCol = col + dc * index;
            if (
              nextRow < 0 ||
              nextRow >= rows.length ||
              nextCol < 0 ||
              nextCol >= rows[nextRow].length ||
              rows[nextRow][nextCol] !== letters[index]
            ) {
              matched = false;
              break;
            }
            coords.push(`${nextRow}-${nextCol}`);
          }
          if (matched) {
            return { word, coords };
          }
        }
      }
    }
    return { word, coords: [] };
  });

  return ticket.placements;
}

function getCashwordFoundWords(ticket) {
  return getCashwordPlacements(ticket)
    .filter((entry) =>
      entry.coords.length > 0 &&
      entry.coords.every((coord) => scratcherState.cashword.revealedCells.has(coord))
    )
    .map((entry) => entry.word);
}

function updateCashwordUi(ticket, root) {
  const foundWords = getCashwordFoundWords(ticket);
  const placements = getCashwordPlacements(ticket);
  const foundCoords = new Set(
    placements
      .filter((entry) => foundWords.includes(entry.word))
      .flatMap((entry) => entry.coords)
  );
  root.querySelectorAll("[data-cashword-cell]").forEach((cell) => {
    const char = cell.dataset.cashwordChar;
    const canvas = cell.querySelector("canvas");
    const unlocked = scratcherState.cashword.revealedLetters.has(char);
    cell.classList.toggle("is-unlocked", unlocked);
    cell.classList.toggle("is-locked", !unlocked);
    cell.classList.toggle(
      "is-revealed",
      scratcherState.cashword.revealedCells.has(cell.dataset.cashwordCell)
    );
    cell.classList.toggle("is-word-found", foundCoords.has(cell.dataset.cashwordCell));
    if (canvas && !scratcherState.cashword.revealedCells.has(cell.dataset.cashwordCell)) {
      canvas.style.opacity = unlocked ? "1" : "0";
      canvas.style.pointerEvents = unlocked ? "auto" : "none";
    }
  });
  root.querySelectorAll("[data-cashword-word]").forEach((item) => {
    const word = item.dataset.cashwordWord;
    const found = foundWords.includes(word);
    item.classList.toggle("is-found", found);
    item.textContent = found ? word : item.dataset.cashwordPlaceholder;
  });
  root.querySelectorAll("[data-cashword-bank]").forEach((item) => {
    item.classList.toggle(
      "is-revealed",
      scratcherState.cashword.revealedBank.has(item.dataset.cashwordIndex)
    );
  });
  const counter = root.querySelector("[data-cashword-counter]");
  if (counter) {
    counter.textContent = `${foundWords.length} / ${ticket.words.length} words found`;
  }
  if (foundWords.length === ticket.words.length) {
    markTicketComplete(ticket.id);
  }
}

function renderCashwordTicket(ticket) {
  if (!ticketStage) {
    return;
  }

  ticketStage.innerHTML = `
    <article class="scratch-stage-card cashword-ticket">
      <div class="cashword-hero">
        <div class="cashword-logo">CASHWORD</div>
        <div class="cashword-jackpot">WIN UP TO $10,000!</div>
      </div>
      <div class="cashword-board">
        <div class="cashword-grid">
          ${ticket.grid
            .map(
              (row, rowIndex) => `
                <div class="cashword-grid-row">
                  ${row
                    .split("")
                    .map(
                      (char, colIndex) => `
                        <button class="cashword-cell" type="button" data-cashword-cell="${rowIndex}-${colIndex}">
                          <span class="cashword-cell-value">${char}</span>
                          <canvas></canvas>
                        </button>`
                    )
                    .join("")}
                </div>`
            )
            .join("")}
        </div>
        <div class="cashword-sidebar">
          <div class="cashword-counter" data-cashword-counter>0 / ${ticket.words.length} words found</div>
          <div class="cashword-word-list">
            ${ticket.words
              .map(
                (word, index) =>
                  `<div class="cashword-word" data-cashword-word="${word}" data-cashword-placeholder="Mystery word ${index + 1}">Mystery word ${index + 1}</div>`
              )
              .join("")}
          </div>
          <div class="cashword-legend">
            <div class="cashword-legend-title">Prize legend</div>
            <div>1 word = $1</div>
            <div>2 words = $5</div>
            <div>3 words = $10</div>
            <div>4 words = Special Prize</div>
          </div>
        </div>
      </div>
      <div class="cashword-letters-title">Scratch your letters first</div>
      <div class="cashword-letters">
        ${ticket.letters
          .map(
            (letter, index) => `
              <button class="cashword-letter" type="button" data-cashword-bank data-cashword-index="${index}">
                <span class="cashword-letter-value">${letter}</span>
                <canvas data-cashword-letter="${letter}" data-cashword-index="${index}"></canvas>
              </button>`
          )
          .join("")}
      </div>
      <div class="scratcher-code-panel${scratcherState.completed[ticket.id] ? " is-visible" : ""}">
        <div class="scratcher-code-label">${scratcherState.completed[ticket.id] ? "Secret code unlocked" : "Complete ticket to reveal code"}</div>
        <div class="scratcher-code-value">${scratcherState.completed[ticket.id] ? ticket.code : "••••••••••••••"}</div>
      </div>
    </article>
  `;

  const root = ticketStage.firstElementChild;
  root.querySelectorAll("[data-cashword-cell]").forEach((cell) => {
    const coord = cell.dataset.cashwordCell;
    const char = cell.querySelector(".cashword-cell-value")?.textContent || "";
    cell.dataset.cashwordChar = char;
    const canvas = cell.querySelector("canvas");
    if (scratcherState.cashword.revealedCells.has(coord)) {
      cell.classList.add("is-revealed", "revealed");
      canvas.style.opacity = "0";
      canvas.style.pointerEvents = "none";
      return;
    }
    new ScratchCard({
      canvas,
      colors: ticket.scratch,
      brushRadius: 9,
      threshold: 0.22,
      coverRenderer: renderSilverFoil,
      onReveal: () => {
        scratcherState.cashword.revealedCells.add(coord);
        cell.classList.add("is-revealed", "revealed");
        updateCashwordUi(ticket, root);
      }
    });
  });

  root.querySelectorAll("[data-cashword-letter]").forEach((canvas) => {
    const stateKey = `bank-${canvas.dataset.cashwordIndex}`;
    const letter = canvas.dataset.cashwordLetter;
    if (scratcherState.cashword.revealedCells.has(stateKey)) {
      canvas.parentElement.classList.add("is-revealed", "revealed");
      canvas.style.opacity = "0";
      canvas.style.pointerEvents = "none";
      return;
    }
    new ScratchCard({
      canvas,
      colors: ticket.scratch,
      brushRadius: 12,
      threshold: 0.26,
      coverRenderer: renderSilverFoil,
      onReveal: () => {
        scratcherState.cashword.revealedCells.add(stateKey);
        scratcherState.cashword.revealedBank.add(canvas.dataset.cashwordIndex);
        scratcherState.cashword.revealedLetters.add(letter);
        canvas.parentElement.classList.add("is-revealed");
        canvas.parentElement.classList.add("revealed");
        updateCashwordUi(ticket, root);
      }
    });
  });

  updateCashwordUi(ticket, root);
}

function renderTriplerTicket(ticket) {
  if (!ticketStage) {
    return;
  }

  ticketStage.innerHTML = `
    <article class="scratch-stage-card tripler-ticket">
      <div class="tripler-head">
        <div class="tripler-price">$1</div>
        <div>
          <div class="tripler-title">7 . 11 . 21</div>
          <div class="tripler-subtitle">TRIPLER</div>
        </div>
        <div class="tripler-badge">${ticket.code}</div>
      </div>
      <div class="tripler-rules">Reveal a 7 to win, 11 to double, and 21 to triple the prize shown for that row.</div>
      <div class="tripler-plays">
        ${ticket.rows
          .map(
            (row, index) => `
              <div class="tripler-row" data-tripler-row="${index}">
                <div class="tripler-row-label">Game ${index + 1}</div>
                <div class="tripler-box">
                  <div class="tripler-hidden tripler-symbol">${row.symbol}</div>
                  <canvas data-tripler-scratch="${index}-symbol"></canvas>
                </div>
                <div class="tripler-box tripler-prize">
                  <div class="tripler-hidden">${row.prize}</div>
                  <canvas data-tripler-scratch="${index}-prize"></canvas>
                </div>
                <div class="tripler-row-result">${row.result}</div>
              </div>`
          )
          .join("")}
      </div>
      <div class="scratcher-code-panel${scratcherState.completed[ticket.id] ? " is-visible" : ""}">
        <div class="scratcher-code-label">${scratcherState.completed[ticket.id] ? "Loser ticket secret code" : "Finish all 4 games to reveal code"}</div>
        <div class="scratcher-code-value">${scratcherState.completed[ticket.id] ? ticket.code : "••••••••••••••"}</div>
      </div>
    </article>
  `;

  const root = ticketStage.firstElementChild;
  const rows = ticket.rows.length;
  root.querySelectorAll("[data-tripler-scratch]").forEach((canvas) => {
    const [rowIndexString, part] = canvas.dataset.triplerScratch.split("-");
    const rowIndex = Number(rowIndexString);
    if (scratcherState.tripler.revealed[`${rowIndex}-${part}`]) {
      canvas.parentElement.classList.add("revealed");
      canvas.style.opacity = "0";
      canvas.style.pointerEvents = "none";
      const row = root.querySelector(`[data-tripler-row="${rowIndex}"]`);
      if (
        scratcherState.tripler.revealed[`${rowIndex}-symbol`] &&
        scratcherState.tripler.revealed[`${rowIndex}-prize`]
      ) {
        row.classList.add("is-complete");
      }
      return;
    }
    new ScratchCard({
      canvas,
      colors: ticket.scratch,
      brushRadius: 16,
      threshold: 0.24,
      coverRenderer: renderBlueFoil,
      onReveal: () => {
        scratcherState.tripler.revealed[`${rowIndex}-${part}`] = true;
        canvas.parentElement.classList.add("is-revealed");
        const row = root.querySelector(`[data-tripler-row="${rowIndex}"]`);
        const done =
          scratcherState.tripler.revealed[`${rowIndex}-symbol`] &&
          scratcherState.tripler.revealed[`${rowIndex}-prize`];
        if (done) {
          row.classList.add("is-complete");
        }
        const completedRows = Array.from({ length: rows }, (_, i) =>
          scratcherState.tripler.revealed[`${i}-symbol`] &&
          scratcherState.tripler.revealed[`${i}-prize`]
        ).filter(Boolean).length;
        if (completedRows === rows) {
          markTicketComplete(ticket.id);
        }
      }
    });
  });
}

function updatePrizeMatchUi(ticket, root) {
  const counts = {};
  Object.values(scratcherState["prize-match"].revealed).forEach((value) => {
    counts[value] = (counts[value] || 0) + 1;
  });
  root.querySelectorAll("[data-prize-amount]").forEach((item) => {
    item.classList.toggle("is-found", (counts[item.dataset.prizeAmount] || 0) >= 3);
  });
  const revealedCount = Object.keys(scratcherState["prize-match"].revealed).length;
  const counter = root.querySelector("[data-prize-counter]");
  if (counter) {
    counter.textContent = `${revealedCount} / ${ticket.amounts.length} spots scratched • no 3 match yet`;
  }
  if (revealedCount === ticket.amounts.length) {
    markTicketComplete(ticket.id);
  }
}

function renderPrizeMatchTicket(ticket) {
  if (!ticketStage) {
    return;
  }

  ticketStage.innerHTML = `
    <article class="scratch-stage-card treat-ticket">
      <div class="treat-head">
        <div>
          <div class="treat-title">Lucky Prize Match</div>
          <div class="treat-subtitle">Scratch all 9 amounts. Match 3 to win.</div>
        </div>
        <div class="treat-code">${ticket.code}</div>
      </div>
      <div class="treat-grid">
        ${ticket.amounts
          .map(
            (amount, index) => `
              <button class="treat-cell" type="button">
                <div class="treat-cell-value">${amount}</div>
                <canvas data-treat-cell="${index}" data-prize-amount="${amount}"></canvas>
              </button>`
          )
          .join("")}
      </div>
      <div class="treat-summary">
        <div class="treat-counter" data-prize-counter>0 / ${ticket.amounts.length} spots scratched • no 3 match yet</div>
        <div class="treat-prizes">
          <div class="treat-prize" data-prize-amount="$25">$25</div>
          <div class="treat-prize" data-prize-amount="$100">$100</div>
          <div class="treat-prize" data-prize-amount="$10,000">$10,000</div>
        </div>
      </div>
      <div class="scratcher-code-panel${scratcherState.completed[ticket.id] ? " is-visible" : ""}">
        <div class="scratcher-code-label">${scratcherState.completed[ticket.id] ? "Loser ticket secret code" : "Scratch every amount to reveal code"}</div>
        <div class="scratcher-code-value">${scratcherState.completed[ticket.id] ? ticket.code : "••••••••••••••"}</div>
      </div>
    </article>
  `;

  const root = ticketStage.firstElementChild;
  root.querySelectorAll("[data-treat-cell]").forEach((canvas) => {
    const index = Number(canvas.dataset.treatCell);
    const value = canvas.dataset.prizeAmount;
    if (Object.prototype.hasOwnProperty.call(scratcherState["prize-match"].revealed, index)) {
      canvas.parentElement.classList.add("revealed");
      canvas.style.opacity = "0";
      canvas.style.pointerEvents = "none";
      return;
    }
    new ScratchCard({
      canvas,
      colors: ticket.scratch,
      brushRadius: 14,
      threshold: 0.24,
      coverRenderer: renderCandyFoil,
      onReveal: () => {
        scratcherState["prize-match"].revealed[index] = value;
        canvas.parentElement.classList.add("is-revealed");
        updatePrizeMatchUi(ticket, root);
      }
    });
  });

  updatePrizeMatchUi(ticket, root);
}

function renderActiveTicket() {
  const ticket = scratcherTickets.find((item) => item.id === activeScratcherTicketId);
  if (!ticket || !ticketStage) {
    return;
  }

  switch (ticket.kind) {
    case "cashword":
      renderCashwordTicket(ticket);
      break;
    case "tripler":
      renderTriplerTicket(ticket);
      break;
    case "prizematch":
      renderPrizeMatchTicket(ticket);
      break;
    default:
      ticketStage.innerHTML = "";
      break;
  }
}

function buildTickets() {
  renderTicketSelector();
  renderActiveTicket();
}

function bindHomeGesture() {
  if (!homeIndicator) {
    return;
  }

  homeIndicator.addEventListener("pointerdown", (event) => {
    const targetScreen = getActiveAppScreen();
    if (!targetScreen || isSleeping) {
      return;
    }

    homeGesture = {
      pointerId: event.pointerId,
      startY: event.clientY,
      targetScreen,
      progress: 0
    };

    screenElements.home.classList.add("is-visible");
    screenElements.home.style.pointerEvents = "none";
    targetScreen.classList.add("is-gesture-active");
    homeIndicator.setPointerCapture?.(event.pointerId);
  });

  homeIndicator.addEventListener("pointermove", (event) => {
    if (!homeGesture || homeGesture.pointerId !== event.pointerId) {
      return;
    }

    const delta = Math.max(0, homeGesture.startY - event.clientY);
    const progress = Math.max(0, Math.min(1, delta / 160));
    homeGesture.progress = progress;

    const translateY = -progress * 26;
    const scale = 1 - progress * 0.1;
    const radius = progress * 28;
    homeGesture.targetScreen.style.transform = `translateY(${translateY}px) scale(${scale})`;
    homeGesture.targetScreen.style.borderRadius = `${radius}px`;
    homeGesture.targetScreen.style.filter = `brightness(${1 - progress * 0.04})`;
  });

  const endGesture = (event) => {
    if (!homeGesture) {
      return;
    }

    if (event.pointerId !== undefined && homeGesture.pointerId !== event.pointerId) {
      return;
    }

    const { targetScreen, progress } = homeGesture;
    homeGesture = null;

    if (progress > 0.42) {
      resetActiveAppTransform(targetScreen);
      screenElements.home.style.pointerEvents = "";
      showScreen("home");
      return;
    }

    resetActiveAppTransform(targetScreen);
    screenElements.home.style.pointerEvents = "";
    showScreen(activeScreen);
  };

  homeIndicator.addEventListener("pointerup", endGesture);
  homeIndicator.addEventListener("pointercancel", endGesture);
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

  lightToggle?.addEventListener("click", () => {
    if (activeScreen !== "lock" || isSleeping) {
      return;
    }

    setFlashlight(!flashlightOn);
  });
}

function init() {
  updateClock();
  setInterval(updateClock, 30000);

  buildHomePages();
  buildStoreRows();
  buildTickets();
  bindHomeGesture();
  bindNav();
  refreshInstallUi();
  goToPage(0, false);

  const startNotificationsOnFirstInteraction = () => {
    ensureNotificationAudioContext()?.resume?.();
    startChristianNotifications();
    window.removeEventListener("pointerdown", startNotificationsOnFirstInteraction);
    window.removeEventListener("keydown", startNotificationsOnFirstInteraction);
  };

  window.addEventListener("pointerdown", startNotificationsOnFirstInteraction, { once: true });
  window.addEventListener("keydown", startNotificationsOnFirstInteraction, { once: true });

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
