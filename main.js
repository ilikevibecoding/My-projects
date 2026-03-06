import * as THREE from "three";
import { ImprovedNoise } from "./node_modules/three/examples/jsm/math/ImprovedNoise.js";

const app = document.getElementById("app");
const overlay = document.getElementById("overlay");
const startButton = document.getElementById("startButton");

const ui = {
    depthValue: document.getElementById("depthValue"),
    oxygenValue: document.getElementById("oxygenValue"),
    discoveriesValue: document.getElementById("discoveriesValue"),
    headingValue: document.getElementById("headingValue"),
    biomeValue: document.getElementById("biomeValue"),
    signalValue: document.getElementById("signalValue"),
    speedValue: document.getElementById("speedValue"),
    objectiveTitle: document.getElementById("objectiveTitle"),
    objectiveCopy: document.getElementById("objectiveCopy"),
    objectiveRange: document.getElementById("objectiveRange"),
    objectiveHint: document.getElementById("objectiveHint"),
    statusPill: document.getElementById("statusPill"),
    sonarLabel: document.getElementById("sonarLabel"),
    pingPrimary: document.getElementById("pingPrimary"),
    pingSecondary: document.getElementById("pingSecondary"),
    scanPanel: document.getElementById("scanPanel"),
    scanTitle: document.getElementById("scanTitle"),
    scanFill: document.getElementById("scanFill"),
    scanCopy: document.getElementById("scanCopy"),
    focusLabel: document.getElementById("focusLabel"),
    logFeed: document.getElementById("logFeed")
};

const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance"
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x041b2c);
scene.fog = new THREE.FogExp2(0x08334c, 0.012);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 2600);
camera.position.set(0, 1.4, 0);

const yawPivot = new THREE.Object3D();
const pitchPivot = new THREE.Object3D();
pitchPivot.add(camera);
yawPivot.add(pitchPivot);
scene.add(yawPivot);

const noise = new ImprovedNoise();
const world = {
    size: 1500,
    halfSize: 750,
    surfaceY: 18,
    minDepth: -210,
    floorClearance: 2.8,
    ceilingClearance: 1.8
};

const state = {
    started: false,
    pointerLocked: false,
    lastTime: 0,
    keys: {},
    velocity: new THREE.Vector3(),
    oxygen: 100,
    scanProgress: 0,
    discoveries: 0,
    currentObjective: 0,
    rescueCooldown: 0,
    feed: []
};

const runtime = {
    terrain: null,
    surface: null,
    surfaceBase: null,
    causticPlane: null,
    beams: [],
    sways: [],
    glowLights: [],
    particleSystem: null,
    particleBase: null,
    particleDrift: null,
    schools: [],
    plumes: [],
    scanTargets: [],
    lifepod: null,
    manta: null
};

const tempVecA = new THREE.Vector3();
const tempVecB = new THREE.Vector3();
const tempVecC = new THREE.Vector3();
const cameraWorldPosition = new THREE.Vector3();

const textures = {
    sand: createSandTexture(),
    caustics: createCausticTexture(),
    beam: createBeamTexture(),
    particle: createParticleTexture()
};

textures.sand.wrapS = THREE.RepeatWrapping;
textures.sand.wrapT = THREE.RepeatWrapping;
textures.sand.repeat.set(9, 9);

textures.caustics.wrapS = THREE.RepeatWrapping;
textures.caustics.wrapT = THREE.RepeatWrapping;
textures.caustics.repeat.set(7, 7);

buildScene();
bindEvents();
seedInitialFeed();
updateHud(0);
animate(0);

function buildScene() {
    const hemisphere = new THREE.HemisphereLight(0x8ff6ff, 0x04111d, 1.65);
    scene.add(hemisphere);

    const sunLight = new THREE.DirectionalLight(0xd7fcff, 1.85);
    sunLight.position.set(220, 250, 30);
    scene.add(sunLight);

    const fillLight = new THREE.PointLight(0x52ffe0, 0.6, 260, 2);
    fillLight.position.set(-120, -18, 90);
    scene.add(fillLight);

    runtime.terrain = createTerrain();
    scene.add(runtime.terrain);

    const surfaceData = createSurface();
    runtime.surface = surfaceData.mesh;
    runtime.surfaceBase = surfaceData.base;
    scene.add(runtime.surface);

    runtime.causticPlane = createCausticPlane();
    scene.add(runtime.causticPlane);

    scene.add(createLightBeams());
    scene.add(createRockScatter(90));
    scene.add(createCoralField(150));
    createSchools();
    createSpecialLandmarks();
    createPlankton();

    const startX = -90;
    const startZ = 110;
    yawPivot.position.set(startX, sampleTerrainHeight(startX, startZ) + 9.5, startZ);
    yawPivot.rotation.y = Math.PI * 0.1;
}

function bindEvents() {
    window.addEventListener("resize", onResize);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("pointerlockchange", onPointerLockChange);
    renderer.domElement.addEventListener("click", () => {
        if (state.started && !state.pointerLocked) {
            document.body.requestPointerLock();
        }
    });
    startButton.addEventListener("click", beginDive);
}

function beginDive() {
    state.started = true;
    overlay.classList.add("hidden");
    startButton.textContent = "Resume Dive";
    document.body.requestPointerLock();
    addFeed("Dive systems online. Scan beacons to chart the reef.", "info");
}

function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onKeyDown(event) {
    const key = event.key.toLowerCase();
    state.keys[key] = true;
    if (!state.started && (key === "enter" || key === " ")) {
        event.preventDefault();
        beginDive();
    }
    if (key === " ") {
        event.preventDefault();
    }
}

function onKeyUp(event) {
    state.keys[event.key.toLowerCase()] = false;
}

function onMouseMove(event) {
    if (!state.pointerLocked) {
        return;
    }

    yawPivot.rotation.y -= event.movementX * 0.0021;
    pitchPivot.rotation.x = clamp(
        pitchPivot.rotation.x - event.movementY * 0.0018,
        -Math.PI / 2.3,
        Math.PI / 2.3
    );
}

function onPointerLockChange() {
    state.pointerLocked = document.pointerLockElement === document.body;
    if (state.pointerLocked) {
        overlay.classList.add("hidden");
        ui.focusLabel.textContent = "Scanner seeking target";
    } else if (state.started) {
        overlay.classList.remove("hidden");
        ui.focusLabel.textContent = "Pointer released";
    }
}

function seedInitialFeed() {
    addFeed("Surface glow stable. Lifepod beacon online.", "info");
    addFeed("Hold E on marked specimens to complete scans.", "warn");
    addFeed("Stay shallow to refill oxygen.", "warn");
}

function addFeed(text, tone = "info") {
    state.feed.unshift({ text, tone });
    state.feed = state.feed.slice(0, 5);
    ui.logFeed.innerHTML = state.feed
        .map((entry) => `<div class="log-entry ${entry.tone}">${entry.text}</div>`)
        .join("");
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function lerp(start, end, alpha) {
    return start + (end - start) * alpha;
}

function smoothstep(edge0, edge1, value) {
    const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
}

function createTexture(draw, width = 512, height = 512) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    draw(ctx, width, height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

function createSandTexture() {
    return createTexture((ctx, width, height) => {
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, "#7aa4a5");
        gradient.addColorStop(0.35, "#6d8f89");
        gradient.addColorStop(0.7, "#926f54");
        gradient.addColorStop(1, "#5d6e7f");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        for (let i = 0; i < 4200; i += 1) {
            const x = Math.random() * width;
            const y = Math.random() * height;
            const size = Math.random() * 2.4 + 0.3;
            const alpha = Math.random() * 0.09;
            ctx.fillStyle = `rgba(255, 246, 205, ${alpha})`;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }

        for (let i = 0; i < 90; i += 1) {
            const y = (i / 90) * height;
            ctx.strokeStyle = `rgba(255,255,255,${Math.random() * 0.03})`;
            ctx.lineWidth = Math.random() * 2 + 0.5;
            ctx.beginPath();
            ctx.moveTo(0, y + Math.sin(i * 0.7) * 5);
            ctx.bezierCurveTo(
                width * 0.25,
                y + Math.sin(i) * 16,
                width * 0.75,
                y - Math.cos(i * 0.8) * 18,
                width,
                y + Math.sin(i * 0.5) * 6
            );
            ctx.stroke();
        }
    });
}

function createCausticTexture() {
    return createTexture((ctx, width, height) => {
        ctx.fillStyle = "#1a3d4e";
        ctx.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = "screen";
        for (let i = 0; i < 180; i += 1) {
            const x = Math.random() * width;
            const y = Math.random() * height;
            const radius = Math.random() * 70 + 24;
            const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
            gradient.addColorStop(0, "rgba(190, 255, 255, 0.72)");
            gradient.addColorStop(0.45, "rgba(125, 233, 255, 0.14)");
            gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.globalCompositeOperation = "source-over";
        for (let i = 0; i < 140; i += 1) {
            const startX = Math.random() * width;
            const startY = Math.random() * height;
            ctx.strokeStyle = `rgba(214,255,255,${Math.random() * 0.22 + 0.06})`;
            ctx.lineWidth = Math.random() * 2.6 + 0.8;
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.bezierCurveTo(
                startX + Math.random() * 40,
                startY - Math.random() * 60,
                startX + Math.random() * 120,
                startY + Math.random() * 40,
                startX + Math.random() * 160,
                startY + Math.random() * 30
            );
            ctx.stroke();
        }
    });
}

function createBeamTexture() {
    return createTexture((ctx, width, height) => {
        const gradient = ctx.createLinearGradient(width / 2, 0, width / 2, height);
        gradient.addColorStop(0, "rgba(210, 255, 255, 0)");
        gradient.addColorStop(0.12, "rgba(210, 255, 255, 0.22)");
        gradient.addColorStop(0.42, "rgba(126, 234, 255, 0.5)");
        gradient.addColorStop(0.8, "rgba(80, 192, 255, 0.08)");
        gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        const radial = ctx.createRadialGradient(width / 2, height * 0.3, 10, width / 2, height * 0.3, width * 0.46);
        radial.addColorStop(0, "rgba(255,255,255,0.75)");
        radial.addColorStop(0.38, "rgba(160,240,255,0.16)");
        radial.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = radial;
        ctx.fillRect(0, 0, width, height);
    }, 256, 1024);
}

function createParticleTexture() {
    return createTexture((ctx, width, height) => {
        const gradient = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width / 2);
        gradient.addColorStop(0, "rgba(255,255,255,1)");
        gradient.addColorStop(0.35, "rgba(188, 244, 255, 0.85)");
        gradient.addColorStop(1, "rgba(188, 244, 255, 0)");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
    }, 64, 64);
}

function sampleTerrainHeight(x, z) {
    const broad = noise.noise(x * 0.0026 + 42.3, z * 0.0026 - 17.4, 0.12) * 36;
    const ridge = Math.abs(noise.noise(x * 0.0057 - 13.2, z * 0.0057 + 22.8, 0.22)) * 22;
    const ripples = noise.noise(x * 0.013, z * 0.013, 0.4) * 6;
    const shelf = Math.cos((x + 160) * 0.0042) * 8 + Math.sin((z - 120) * 0.0051) * 10;
    const trench = -Math.exp(-((x - 230) ** 2) / 92000 - ((z + 230) ** 2) / 76000) * 72;
    return clamp(-84 + broad + ridge + ripples + shelf + trench, world.minDepth, 6);
}

function createTerrain() {
    const segments = 220;
    const geometry = new THREE.PlaneGeometry(world.size, world.size, segments, segments);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position;
    const colors = [];
    const color = new THREE.Color();

    for (let i = 0; i < positions.count; i += 1) {
        const x = positions.getX(i);
        const z = positions.getZ(i);
        const y = sampleTerrainHeight(x, z);
        const warmth = noise.noise(x * 0.006 + 4.2, z * 0.006 - 3.1, 0.28) * 0.5 + 0.5;
        const depthMix = smoothstep(-168, -24, y);
        const r = lerp(0.08, 0.42, depthMix) + warmth * 0.07;
        const g = lerp(0.17, 0.54, depthMix) + warmth * 0.06;
        const b = lerp(0.27, 0.42, depthMix);
        positions.setY(i, y);
        color.setRGB(r, g, b);
        colors.push(color.r, color.g, color.b);
    }

    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        map: textures.sand,
        emissiveMap: textures.caustics,
        emissive: new THREE.Color(0x3fd5ff),
        emissiveIntensity: 0.26,
        roughness: 0.94,
        metalness: 0.02
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = 0;
    return mesh;
}

function createSurface() {
    const geometry = new THREE.PlaneGeometry(world.size * 1.65, world.size * 1.65, 110, 110);
    geometry.rotateX(-Math.PI / 2);
    const base = Float32Array.from(geometry.attributes.position.array);
    const material = new THREE.MeshPhysicalMaterial({
        color: 0x42dfff,
        emissive: new THREE.Color(0x26a8cf),
        emissiveIntensity: 0.24,
        roughness: 0.08,
        metalness: 0,
        transparent: true,
        opacity: 0.38,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = world.surfaceY;
    return { mesh, base };
}

function createCausticPlane() {
    const material = new THREE.MeshBasicMaterial({
        map: textures.caustics,
        color: 0x84ffff,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    const geometry = new THREE.PlaneGeometry(world.size * 1.55, world.size * 1.55, 1, 1);
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = world.surfaceY - 1.6;
    return mesh;
}

function createLightBeams() {
    const group = new THREE.Group();
    const geometry = new THREE.PlaneGeometry(130, 360);
    for (let i = 0; i < 9; i += 1) {
        const material = new THREE.MeshBasicMaterial({
            map: textures.beam,
            color: i % 2 === 0 ? 0x7cf3ff : 0x99f2ff,
            transparent: true,
            opacity: 0.22,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const beam = new THREE.Mesh(geometry, material);
        beam.position.set(
            -240 + Math.random() * 520,
            -70 + Math.random() * 40,
            -220 + Math.random() * 520
        );
        beam.scale.setScalar(0.8 + Math.random() * 1.5);
        beam.rotation.z = (Math.random() - 0.5) * 0.15;
        runtime.beams.push({
            mesh: beam,
            phase: Math.random() * Math.PI * 2,
            speed: 0.28 + Math.random() * 0.34
        });
        group.add(beam);
    }
    return group;
}

function createRockScatter(count) {
    const group = new THREE.Group();
    const rockGeometry = new THREE.IcosahedronGeometry(1, 1);
    const rockMaterial = new THREE.MeshStandardMaterial({
        color: 0x20384a,
        roughness: 1,
        metalness: 0,
        flatShading: true
    });

    for (let i = 0; i < count; i += 1) {
        const x = Math.random() * (world.size - 120) - (world.halfSize - 60);
        const z = Math.random() * (world.size - 120) - (world.halfSize - 60);
        const y = sampleTerrainHeight(x, z);
        const rock = new THREE.Mesh(rockGeometry, rockMaterial);
        const scale = 5 + Math.random() * 17;
        rock.position.set(x, y + scale * 0.38, z);
        rock.scale.set(
            scale * (0.8 + Math.random() * 0.7),
            scale * (0.6 + Math.random() * 0.8),
            scale * (0.9 + Math.random() * 0.9)
        );
        rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        group.add(rock);
    }

    return group;
}

function createCoralField(count) {
    const group = new THREE.Group();
    for (let i = 0; i < count; i += 1) {
        const x = Math.random() * (world.size - 140) - (world.halfSize - 70);
        const z = Math.random() * (world.size - 140) - (world.halfSize - 70);
        const y = sampleTerrainHeight(x, z);
        const shallowBias = smoothstep(-145, -20, y);
        const selector = Math.random();
        let coral;
        if (selector < 0.36) {
            coral = createTubeCoralCluster(shallowBias);
        } else if (selector < 0.68) {
            coral = createKelpCluster(shallowBias);
        } else {
            coral = createGlowBulbCluster(shallowBias);
        }
        coral.position.set(x, y, z);
        coral.rotation.y = Math.random() * Math.PI * 2;
        group.add(coral);
    }
    return group;
}

function createTubeCoralCluster(shallowBias) {
    const group = new THREE.Group();
    const stemMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.06 + Math.random() * 0.08, 0.68, 0.52),
        emissive: new THREE.Color(0xff8648),
        emissiveIntensity: 0.1 + shallowBias * 0.16,
        roughness: 0.86,
        metalness: 0
    });
    for (let i = 0; i < 5 + Math.floor(Math.random() * 4); i += 1) {
        const height = 5 + Math.random() * 14;
        const radius = 0.55 + Math.random() * 1.1;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.75, radius, height, 10), stemMaterial);
        stem.position.set((Math.random() - 0.5) * 10, height * 0.5, (Math.random() - 0.5) * 10);
        stem.rotation.z = (Math.random() - 0.5) * 0.16;
        group.add(stem);

        const cap = new THREE.Mesh(
            new THREE.SphereGeometry(radius * 0.72, 12, 12),
            new THREE.MeshStandardMaterial({
                color: 0xffc07d,
                emissive: 0xff8a55,
                emissiveIntensity: 0.16 + shallowBias * 0.22,
                roughness: 0.5
            })
        );
        cap.position.copy(stem.position);
        cap.position.y += height * 0.5;
        group.add(cap);
    }
    return group;
}

function createKelpCluster(shallowBias) {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.42, 0.45, 0.3 + shallowBias * 0.18),
        emissive: new THREE.Color(0x2cf5b1),
        emissiveIntensity: 0.08 + shallowBias * 0.08,
        transparent: true,
        opacity: 0.92,
        roughness: 0.9,
        side: THREE.DoubleSide
    });

    for (let i = 0; i < 4 + Math.floor(Math.random() * 3); i += 1) {
        const height = 16 + Math.random() * 26;
        const pivot = new THREE.Group();
        const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.42, height, 7, 7, true), material);
        blade.position.y = height * 0.5;
        pivot.position.set((Math.random() - 0.5) * 8, 0, (Math.random() - 0.5) * 8);
        blade.rotation.z = (Math.random() - 0.5) * 0.08;
        pivot.add(blade);
        group.add(pivot);
        runtime.sways.push({
            object: pivot,
            phase: Math.random() * Math.PI * 2,
            amplitude: 0.08 + Math.random() * 0.08,
            speed: 0.8 + Math.random() * 0.6
        });
    }

    return group;
}

function createGlowBulbCluster(shallowBias) {
    const group = new THREE.Group();
    const stemMaterial = new THREE.MeshStandardMaterial({
        color: 0x214b51,
        roughness: 0.95
    });

    for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i += 1) {
        const height = 6 + Math.random() * 12;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, height, 8), stemMaterial);
        stem.position.set((Math.random() - 0.5) * 10, height * 0.5, (Math.random() - 0.5) * 10);
        group.add(stem);

        const bulbColor = i % 2 === 0 ? 0x79f7ff : 0xffa857;
        const bulb = new THREE.Mesh(
            new THREE.SphereGeometry(1.2 + Math.random() * 1.2, 12, 12),
            new THREE.MeshStandardMaterial({
                color: bulbColor,
                emissive: bulbColor,
                emissiveIntensity: 1.05 + shallowBias * 0.4,
                roughness: 0.35
            })
        );
        bulb.position.copy(stem.position);
        bulb.position.y += height * 0.52;
        group.add(bulb);

        const light = new THREE.PointLight(bulbColor, 0.7 + shallowBias * 0.7, 48, 2);
        light.position.copy(bulb.position);
        group.add(light);
        runtime.glowLights.push({
            light,
            base: light.intensity,
            phase: Math.random() * Math.PI * 2,
            speed: 1.2 + Math.random()
        });
    }

    return group;
}

function createSchools() {
    const schoolConfigs = [
        { center: new THREE.Vector3(-140, -32, -40), radius: 55, color: 0x8ef6ff, count: 16, speed: 0.52 },
        { center: new THREE.Vector3(120, -76, -160), radius: 82, color: 0xffb368, count: 12, speed: 0.36 },
        { center: new THREE.Vector3(260, -46, 90), radius: 68, color: 0x8bffd4, count: 15, speed: 0.44 },
        { center: new THREE.Vector3(-260, -54, 210), radius: 74, color: 0xc5d6ff, count: 14, speed: 0.41 }
    ];

    schoolConfigs.forEach((config) => {
        const school = {
            center: config.center.clone(),
            radius: config.radius,
            speed: config.speed,
            fish: []
        };
        for (let i = 0; i < config.count; i += 1) {
            const fish = createFish(config.color);
            scene.add(fish.mesh);
            school.fish.push({
                mesh: fish.mesh,
                orbitOffset: (i / config.count) * Math.PI * 2,
                verticalOffset: Math.random() * Math.PI * 2,
                radiusOffset: 0.55 + Math.random() * 0.7
            });
        }
        runtime.schools.push(school);
    });
}

function createFish(color) {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.25,
        roughness: 0.45,
        metalness: 0
    });
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.8, 5), material);
    body.rotation.z = -Math.PI / 2;
    group.add(body);

    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.44, 1.1, 3), material);
    tail.position.x = -1.3;
    tail.rotation.z = Math.PI / 2;
    group.add(tail);

    group.scale.setScalar(0.85 + Math.random() * 0.65);
    return { mesh: group };
}

function createSpecialLandmarks() {
    const lifepod = createLifepod(-110, 120);
    runtime.lifepod = lifepod.group;
    scene.add(lifepod.group);
    runtime.scanTargets.push({
        name: "Crash Lifepod",
        description: "Calibrate your scanner by recording the emergency pod and beacon assembly.",
        hint: "Follow the bright white hull and cyan beacon plume.",
        object: lifepod.scanAnchor,
        lockRange: 52,
        scanTime: 1.7,
        completed: false,
        tone: 0x79eeff
    });

    const coralArch = createSolarFanArch(180, -120);
    scene.add(coralArch.group);
    runtime.scanTargets.push({
        name: "Solar Fan Coral",
        description: "Scan the warm-blooming coral arch in the shallow shimmer shelf.",
        hint: "Look for amber emission under the strongest caustic beams.",
        object: coralArch.scanAnchor,
        lockRange: 76,
        scanTime: 2.1,
        completed: false,
        tone: 0xffb56c
    });

    const ventBloom = createVentBloom(290, -320);
    scene.add(ventBloom.group);
    runtime.scanTargets.push({
        name: "Vent Bloom",
        description: "Descend into the thermal garden and capture a live vent plume reading.",
        hint: "The trench is deeper and cooler. Watch your oxygen on the way down.",
        object: ventBloom.scanAnchor,
        lockRange: 74,
        scanTime: 2.35,
        completed: false,
        tone: 0x85ffe0
    });

    const manta = createRayback();
    runtime.manta = manta;
    scene.add(manta.group);
    runtime.scanTargets.push({
        name: "Rayback Juvenile",
        description: "Track the migrating ray and hold a stable line of sight for a live motion scan.",
        hint: "Lead the target slightly and stay above the trench wall.",
        object: manta.scanAnchor,
        lockRange: 68,
        scanTime: 2.8,
        completed: false,
        tone: 0xc5d6ff
    });

    runtime.scanTargets.forEach((target) => {
        const beacon = createBeacon(target.tone);
        target.object.add(beacon);
        target.beacon = beacon;
    });
}

function createLifepod(x, z) {
    const group = new THREE.Group();
    const y = sampleTerrainHeight(x, z);
    group.position.set(x, y + 7, z);

    const shellMaterial = new THREE.MeshStandardMaterial({
        color: 0xe8f4ff,
        emissive: 0x2d5268,
        emissiveIntensity: 0.06,
        roughness: 0.52,
        metalness: 0.1
    });
    const shell = new THREE.Mesh(new THREE.CapsuleGeometry(5.2, 13, 6, 12), shellMaterial);
    shell.rotation.z = Math.PI / 2;
    group.add(shell);

    const cockpit = new THREE.Mesh(
        new THREE.SphereGeometry(3.2, 16, 16),
        new THREE.MeshStandardMaterial({
            color: 0x8eefff,
            emissive: 0x79eeff,
            emissiveIntensity: 0.7,
            roughness: 0.18
        })
    );
    cockpit.scale.set(1, 0.65, 0.6);
    cockpit.position.set(6.2, 1.2, 0);
    group.add(cockpit);

    for (let i = 0; i < 3; i += 1) {
        const leg = new THREE.Mesh(
            new THREE.CylinderGeometry(0.28, 0.45, 8, 8),
            new THREE.MeshStandardMaterial({ color: 0x6f8d98, roughness: 0.8 })
        );
        const angle = (i / 3) * Math.PI * 2;
        leg.position.set(Math.cos(angle) * 4.4 - 1.5, -5, Math.sin(angle) * 4.4);
        leg.rotation.z = Math.cos(angle) * 0.35;
        leg.rotation.x = Math.sin(angle) * 0.2;
        group.add(leg);
    }

    const beaconLight = new THREE.PointLight(0x79eeff, 1.5, 110, 2);
    beaconLight.position.set(-7, 7, 0);
    group.add(beaconLight);
    runtime.glowLights.push({
        light: beaconLight,
        base: beaconLight.intensity,
        phase: Math.PI * 0.25,
        speed: 1.4
    });

    const scanAnchor = new THREE.Object3D();
    scanAnchor.position.set(0, 8, 0);
    group.add(scanAnchor);

    return { group, scanAnchor };
}

function createSolarFanArch(x, z) {
    const group = new THREE.Group();
    const y = sampleTerrainHeight(x, z);
    group.position.set(x, y + 2, z);

    const archMaterial = new THREE.MeshStandardMaterial({
        color: 0xff944d,
        emissive: 0xff8d52,
        emissiveIntensity: 0.32,
        roughness: 0.76,
        metalness: 0
    });

    const arch = new THREE.Mesh(new THREE.TorusGeometry(17, 2.7, 12, 48, Math.PI * 1.08), archMaterial);
    arch.rotation.z = Math.PI / 2;
    arch.rotation.y = Math.PI * 0.15;
    arch.position.y = 15;
    group.add(arch);

    for (let i = 0; i < 12; i += 1) {
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.2, 6 + Math.random() * 8, 8), archMaterial);
        const angle = (i / 12) * Math.PI * 1.05 - Math.PI * 0.52;
        tube.position.set(Math.cos(angle) * 16, 15 + Math.sin(angle) * 16, Math.sin(i * 1.4) * 3.2);
        tube.rotation.z = angle + Math.PI / 2;
        group.add(tube);
    }

    const accentLight = new THREE.PointLight(0xffb56c, 1.2, 80, 2);
    accentLight.position.set(0, 18, 0);
    group.add(accentLight);
    runtime.glowLights.push({
        light: accentLight,
        base: accentLight.intensity,
        phase: Math.PI,
        speed: 0.8
    });

    const scanAnchor = new THREE.Object3D();
    scanAnchor.position.set(0, 18, 0);
    group.add(scanAnchor);

    return { group, scanAnchor };
}

function createVentBloom(x, z) {
    const group = new THREE.Group();
    const y = sampleTerrainHeight(x, z);
    group.position.set(x, y + 1, z);

    const rockMaterial = new THREE.MeshStandardMaterial({
        color: 0x29465d,
        roughness: 1,
        flatShading: true
    });
    const glowMaterial = new THREE.MeshStandardMaterial({
        color: 0x83ffe2,
        emissive: 0x83ffe2,
        emissiveIntensity: 0.6,
        roughness: 0.3
    });

    const chimney = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 6.8, 18, 9), rockMaterial);
    chimney.position.y = 9;
    group.add(chimney);

    const bloom = new THREE.Mesh(new THREE.SphereGeometry(4.5, 16, 16), glowMaterial);
    bloom.position.y = 19;
    bloom.scale.set(1.3, 0.55, 1.3);
    group.add(bloom);

    const ventLight = new THREE.PointLight(0x85ffe0, 1.45, 95, 2);
    ventLight.position.set(0, 19, 0);
    group.add(ventLight);
    runtime.glowLights.push({
        light: ventLight,
        base: ventLight.intensity,
        phase: Math.PI * 1.4,
        speed: 1.7
    });

    const plumeCount = 90;
    const positions = new Float32Array(plumeCount * 3);
    const speeds = new Float32Array(plumeCount);
    for (let i = 0; i < plumeCount; i += 1) {
        positions[i * 3] = (Math.random() - 0.5) * 4.4;
        positions[i * 3 + 1] = Math.random() * 30;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 4.4;
        speeds[i] = 5 + Math.random() * 7;
    }

    const plumeGeometry = new THREE.BufferGeometry();
    plumeGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const plumeMaterial = new THREE.PointsMaterial({
        color: 0xb6ffff,
        size: 3.2,
        map: textures.particle,
        transparent: true,
        opacity: 0.28,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true
    });
    const plume = new THREE.Points(plumeGeometry, plumeMaterial);
    plume.position.y = 10;
    group.add(plume);

    runtime.plumes.push({ points: plume, speeds, base: Float32Array.from(positions) });

    const scanAnchor = new THREE.Object3D();
    scanAnchor.position.set(0, 18, 0);
    group.add(scanAnchor);

    return { group, scanAnchor };
}

function createRayback() {
    const group = new THREE.Group();
    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: 0x4d6f92,
        emissive: 0xb9d6ff,
        emissiveIntensity: 0.18,
        roughness: 0.56
    });

    const body = new THREE.Mesh(new THREE.SphereGeometry(4.6, 18, 16), bodyMaterial);
    body.scale.set(2.2, 0.45, 1.55);
    group.add(body);

    const wingGeometry = new THREE.ConeGeometry(4.6, 13, 3);
    const leftWing = new THREE.Mesh(wingGeometry, bodyMaterial);
    leftWing.rotation.z = -Math.PI / 2;
    leftWing.rotation.x = Math.PI;
    leftWing.position.set(-5.8, -0.2, 0);
    leftWing.scale.set(1.15, 0.28, 1.2);
    group.add(leftWing);

    const rightWing = leftWing.clone();
    rightWing.rotation.x = 0;
    rightWing.position.x = 5.8;
    group.add(rightWing);

    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, 10, 8), bodyMaterial);
    tail.rotation.z = Math.PI / 2;
    tail.position.set(-10, -0.15, 0);
    group.add(tail);

    const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(5.4, 0.2, 0.7),
        new THREE.MeshStandardMaterial({
            color: 0xdef2ff,
            emissive: 0xdef2ff,
            emissiveIntensity: 0.72,
            roughness: 0.24
        })
    );
    stripe.position.set(0.8, 0.22, 0);
    group.add(stripe);

    const scanAnchor = new THREE.Object3D();
    scanAnchor.position.set(0, 0.4, 0);
    group.add(scanAnchor);

    group.position.set(180, -78, -250);
    return {
        group,
        scanAnchor,
        clock: 0
    };
}

function createBeacon(color) {
    const group = new THREE.Group();
    const ringMaterial = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const columnMaterial = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.14,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    const lowerRing = new THREE.Mesh(new THREE.TorusGeometry(4.4, 0.12, 8, 48), ringMaterial);
    lowerRing.rotation.x = Math.PI / 2;
    lowerRing.position.y = 1.8;
    group.add(lowerRing);

    const upperRing = lowerRing.clone();
    upperRing.scale.setScalar(0.7);
    upperRing.position.y = 9;
    group.add(upperRing);

    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 18, 12, 1, true), columnMaterial);
    column.position.y = 9;
    group.add(column);

    group.userData.rings = [lowerRing, upperRing];
    return group;
}

function createPlankton() {
    const count = 1800;
    const positions = new Float32Array(count * 3);
    const base = new Float32Array(count * 3);
    const drift = new Float32Array(count);

    for (let i = 0; i < count; i += 1) {
        const x = Math.random() * world.size - world.halfSize;
        const y = Math.random() * (world.surfaceY - world.minDepth) + world.minDepth;
        const z = Math.random() * world.size - world.halfSize;
        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;
        base[i * 3] = x;
        base[i * 3 + 1] = y;
        base[i * 3 + 2] = z;
        drift[i] = 0.6 + Math.random() * 1.8;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
        color: 0xc8f6ff,
        size: 1.55,
        map: textures.particle,
        transparent: true,
        opacity: 0.48,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true
    });

    runtime.particleSystem = new THREE.Points(geometry, material);
    runtime.particleBase = base;
    runtime.particleDrift = drift;
    scene.add(runtime.particleSystem);
}

function updateMovement(dt) {
    if (!state.pointerLocked) {
        state.velocity.multiplyScalar(Math.exp(-3 * dt));
        return;
    }

    const forward = tempVecA;
    const right = tempVecB;
    const move = tempVecC;

    camera.getWorldDirection(forward);
    forward.normalize();
    right.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
    move.set(0, 0, 0);

    if (state.keys.w) {
        move.add(forward);
    }
    if (state.keys.s) {
        move.sub(forward);
    }
    if (state.keys.d) {
        move.add(right);
    }
    if (state.keys.a) {
        move.sub(right);
    }
    if (state.keys[" "]) {
        move.y += 1;
    }
    if (state.keys.shift) {
        move.y -= 1;
    }

    if (move.lengthSq() > 0) {
        move.normalize();
        state.velocity.addScaledVector(move, 29 * dt);
    }

    state.velocity.multiplyScalar(Math.exp(-2.3 * dt));
    const maxSpeed = 17.5;
    if (state.velocity.length() > maxSpeed) {
        state.velocity.setLength(maxSpeed);
    }

    yawPivot.position.addScaledVector(state.velocity, dt);
    yawPivot.position.x = clamp(yawPivot.position.x, -world.halfSize + 24, world.halfSize - 24);
    yawPivot.position.z = clamp(yawPivot.position.z, -world.halfSize + 24, world.halfSize - 24);

    const floor = sampleTerrainHeight(yawPivot.position.x, yawPivot.position.z) + world.floorClearance;
    const ceiling = world.surfaceY - world.ceilingClearance;
    yawPivot.position.y = clamp(yawPivot.position.y, floor, ceiling);
}

function updateOxygen(dt) {
    const depth = Math.max(0, world.surfaceY - getCameraPosition(cameraWorldPosition).y);
    if (depth < 7) {
        state.oxygen = clamp(state.oxygen + 32 * dt, 0, 100);
    } else {
        state.oxygen = clamp(state.oxygen - (2 + depth * 0.016) * dt, 0, 100);
    }

    state.rescueCooldown = Math.max(0, state.rescueCooldown - dt);
    if (state.oxygen <= 0 && state.rescueCooldown === 0) {
        rescuePlayer();
    }
}

function rescuePlayer() {
    const targetPosition = new THREE.Vector3(-82, sampleTerrainHeight(-82, 118) + 9, 118);
    yawPivot.position.copy(targetPosition);
    state.velocity.set(0, 0, 0);
    state.oxygen = 100;
    state.scanProgress = 0;
    state.rescueCooldown = 5;
    addFeed("Emergency recovery triggered. Lifepod returned you to the shelf.", "danger");
}

function updateSurface(time) {
    if (!runtime.surface || !runtime.surfaceBase) {
        return;
    }

    const positions = runtime.surface.geometry.attributes.position;
    for (let i = 0; i < positions.count; i += 1) {
        const baseX = runtime.surfaceBase[i * 3];
        const baseZ = runtime.surfaceBase[i * 3 + 2];
        const wave =
            Math.sin(baseX * 0.012 + time * 0.55) * 1.4 +
            Math.cos(baseZ * 0.01 - time * 0.42) * 1.2 +
            Math.sin((baseX + baseZ) * 0.006 + time * 0.7) * 0.8;
        positions.setY(i, wave);
    }
    positions.needsUpdate = true;
    runtime.surface.geometry.computeVertexNormals();

    runtime.causticPlane.material.map.offset.x = time * 0.012;
    runtime.causticPlane.material.map.offset.y = time * 0.018;
}

function updateBeams(time) {
    const cameraPosition = getCameraPosition(cameraWorldPosition);
    runtime.beams.forEach((beamData, index) => {
        const { mesh, phase, speed } = beamData;
        mesh.lookAt(cameraPosition.x, mesh.position.y, cameraPosition.z);
        mesh.material.opacity = 0.12 + (Math.sin(time * speed + phase) * 0.5 + 0.5) * 0.16;
        mesh.position.y = -86 + Math.sin(time * 0.28 + index) * 12;
    });
}

function updateSways(time) {
    runtime.sways.forEach((entry) => {
        entry.object.rotation.z = Math.sin(time * entry.speed + entry.phase) * entry.amplitude;
    });

    runtime.glowLights.forEach((entry) => {
        entry.light.intensity = entry.base * (0.82 + (Math.sin(time * entry.speed + entry.phase) * 0.5 + 0.5) * 0.42);
    });
}

function updateSchools(time) {
    runtime.schools.forEach((school, schoolIndex) => {
        const schoolDrift = Math.sin(time * 0.11 + schoolIndex) * 22;
        school.center.x += Math.sin(time * 0.03 + schoolIndex) * 0.02;
        school.center.z += Math.cos(time * 0.02 + schoolIndex) * 0.02;

        school.fish.forEach((fish, fishIndex) => {
            const angle = time * school.speed + fish.orbitOffset;
            const radius = school.radius * fish.radiusOffset;
            const x = school.center.x + Math.cos(angle) * radius;
            const z = school.center.z + Math.sin(angle) * radius * 0.8;
            const y =
                school.center.y +
                Math.sin(angle * 2.3 + fish.verticalOffset) * 10 +
                Math.sin(time * 0.8 + fishIndex) * 2 +
                schoolDrift * 0.03;
            fish.mesh.position.set(x, y, z);

            const nextAngle = angle + 0.02;
            fish.mesh.lookAt(
                school.center.x + Math.cos(nextAngle) * radius,
                y + Math.cos(angle * 2.3) * 4,
                school.center.z + Math.sin(nextAngle) * radius * 0.8
            );
        });
    });
}

function updatePlumes(dt, time) {
    runtime.plumes.forEach((plume) => {
        const positions = plume.points.geometry.attributes.position.array;
        for (let i = 0; i < plume.speeds.length; i += 1) {
            const baseX = plume.base[i * 3];
            const baseZ = plume.base[i * 3 + 2];
            positions[i * 3] = baseX + Math.sin(time * 1.1 + i) * 0.8;
            positions[i * 3 + 1] += plume.speeds[i] * dt;
            positions[i * 3 + 2] = baseZ + Math.cos(time * 0.9 + i * 0.5) * 0.8;
            if (positions[i * 3 + 1] > 38) {
                positions[i * 3 + 1] = 0;
            }
        }
        plume.points.geometry.attributes.position.needsUpdate = true;
    });
}

function updateParticles(dt, time) {
    if (!runtime.particleSystem) {
        return;
    }
    const positions = runtime.particleSystem.geometry.attributes.position.array;
    for (let i = 0; i < runtime.particleDrift.length; i += 1) {
        positions[i * 3 + 1] += runtime.particleDrift[i] * dt;
        positions[i * 3] = runtime.particleBase[i * 3] + Math.sin(time * 0.18 + i) * 2.4;
        positions[i * 3 + 2] = runtime.particleBase[i * 3 + 2] + Math.cos(time * 0.15 + i * 0.7) * 2.2;
        if (positions[i * 3 + 1] > world.surfaceY) {
            positions[i * 3 + 1] = world.minDepth;
        }
    }
    runtime.particleSystem.geometry.attributes.position.needsUpdate = true;
}

function updateManta(time) {
    if (!runtime.manta) {
        return;
    }

    runtime.manta.clock += 0.008;
    const angle = time * 0.14;
    const x = 220 + Math.cos(angle) * 180;
    const z = -250 + Math.sin(angle * 1.2) * 130;
    const y = sampleTerrainHeight(x, z) + 28 + Math.sin(time * 0.9) * 7;
    runtime.manta.group.position.set(x, y, z);

    const wingWave = Math.sin(time * 3.1) * 0.18;
    runtime.manta.group.children[1].rotation.y = wingWave;
    runtime.manta.group.children[2].rotation.y = -wingWave;

    runtime.manta.group.lookAt(
        x + Math.cos(angle + 0.08) * 180,
        y + Math.cos(time * 0.7) * 3,
        z + Math.sin((angle + 0.08) * 1.2) * 130
    );
}

function getCameraPosition(target) {
    return camera.getWorldPosition(target);
}

function getCurrentObjective() {
    return runtime.scanTargets[state.currentObjective] || null;
}

function completeScan(target) {
    target.completed = true;
    state.discoveries += 1;
    state.scanProgress = 0;
    addFeed(`Scan complete: ${target.name}.`, "info");
    state.currentObjective += 1;
    if (state.currentObjective >= runtime.scanTargets.length) {
        addFeed("All beacon scans complete. Free dive unlocked.", "warn");
    }
}

function updateScanning(dt) {
    const target = getCurrentObjective();
    if (!target) {
        ui.scanPanel.classList.remove("visible");
        ui.focusLabel.textContent = "All scans complete";
        ui.scanFill.style.width = "100%";
        ui.scanTitle.textContent = "Expedition complete";
        ui.scanCopy.textContent = "Keep exploring the reef or return to the surface glow.";
        return;
    }

    const targetPosition = target.object.getWorldPosition(tempVecA);
    const cameraPosition = getCameraPosition(cameraWorldPosition);
    const toTarget = tempVecB.copy(targetPosition).sub(cameraPosition);
    const distance = toTarget.length();
    toTarget.normalize();
    camera.getWorldDirection(tempVecC);
    const alignment = tempVecC.normalize().dot(toTarget);
    const lock = distance < target.lockRange && alignment > 0.968;

    ui.scanPanel.classList.add("visible");
    ui.scanTitle.textContent = target.name;

    if (lock) {
        ui.focusLabel.textContent = `Hold E to scan ${target.name}`;
        ui.scanCopy.textContent = `${Math.round(distance)}m • stable lock required`;
        if (state.keys.e) {
            state.scanProgress = clamp(state.scanProgress + dt / target.scanTime, 0, 1);
        } else {
            state.scanProgress = clamp(state.scanProgress - dt * 0.4, 0, 1);
        }
        if (state.scanProgress >= 1) {
            completeScan(target);
        }
    } else {
        state.scanProgress = clamp(state.scanProgress - dt * 0.9, 0, 1);
        ui.focusLabel.textContent = distance < target.lockRange * 1.45 ? `Center ${target.name}` : "Scanner seeking target";
        ui.scanCopy.textContent = `${Math.round(distance)}m • keep the marker centered`;
    }

    ui.scanFill.style.width = `${state.scanProgress * 100}%`;
}

function updateObjectiveBeacons(time) {
    runtime.scanTargets.forEach((target, index) => {
        if (!target.beacon) {
            return;
        }
        const active = index === state.currentObjective && !target.completed;
        target.beacon.visible = !target.completed;
        target.beacon.userData.rings.forEach((ring, ringIndex) => {
            ring.rotation.z += 0.012 + ringIndex * 0.006;
            ring.material.opacity = active ? 0.9 : 0.26;
            ring.scale.setScalar(active ? 1 + Math.sin(time * 2 + ringIndex) * 0.06 : 0.88);
        });
        target.beacon.children[2].material.opacity = active ? 0.16 : 0.06;
    });
}

function getHeadingText() {
    const angle = ((-yawPivot.rotation.y * THREE.MathUtils.RAD2DEG) % 360 + 360) % 360;
    const cardinal = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(angle / 45) % 8];
    return `${String(Math.round(angle)).padStart(3, "0")} ${cardinal}`;
}

function getBiomeName(position) {
    const depth = world.surfaceY - position.y;
    if (position.x > 180 && position.z < -170) {
        return "Vent Garden";
    }
    if (depth > 120) {
        return "Twilight Trench";
    }
    if (position.x < -120 && position.z > 80) {
        return "Beacon Shelf";
    }
    return "Shimmer Shelf";
}

function updateHud(time) {
    const cameraPosition = getCameraPosition(cameraWorldPosition);
    const depth = Math.max(0, Math.round(world.surfaceY - cameraPosition.y));
    const speed = state.velocity.length();
    const objective = getCurrentObjective();

    ui.depthValue.textContent = `${depth}m`;
    ui.oxygenValue.textContent = `${Math.round(state.oxygen)}%`;
    ui.discoveriesValue.textContent = `${state.discoveries} / ${runtime.scanTargets.length}`;
    ui.headingValue.textContent = getHeadingText();
    ui.biomeValue.textContent = getBiomeName(cameraPosition);
    ui.speedValue.textContent = `${speed.toFixed(1)} m/s`;

    const nearbyContacts = runtime.schools.filter((school) => school.center.distanceTo(cameraPosition) < 220).length + (objective ? 1 : 0);
    ui.sonarLabel.textContent = `${nearbyContacts} contacts`;

    const pulse = 42 + Math.sin(time * 2.4) * 8;
    ui.pingPrimary.style.left = `${44 + Math.sin(time * 0.6) * 14}%`;
    ui.pingPrimary.style.top = `${36 + Math.cos(time * 0.5) * 12}%`;
    ui.pingSecondary.style.left = `${62 + Math.cos(time * 0.9) * 10}%`;
    ui.pingSecondary.style.top = `${60 + Math.sin(time * 0.8) * 9}%`;
    ui.pingPrimary.style.boxShadow = `0 0 ${pulse}px rgba(121, 238, 255, 0.55)`;

    if (objective) {
        const range = Math.round(objective.object.getWorldPosition(tempVecA).distanceTo(cameraPosition));
        ui.objectiveTitle.textContent = objective.name;
        ui.objectiveCopy.textContent = objective.description;
        ui.objectiveRange.textContent = `Range: ${range}m`;
        ui.objectiveHint.textContent = `Hint: ${objective.hint}`;
        ui.signalValue.textContent = `${objective.name} locked`;
    } else {
        ui.objectiveTitle.textContent = "Free dive";
        ui.objectiveCopy.textContent = "All critical scans are complete. Enjoy the reef, the trench, and the surface light.";
        ui.objectiveRange.textContent = "Range: open water";
        ui.objectiveHint.textContent = "Hint: surface to refill oxygen";
        ui.signalValue.textContent = "Expedition archived";
    }

    if (state.oxygen < 20) {
        ui.statusPill.textContent = "Status: Critical oxygen";
    } else if (depth > 120) {
        ui.statusPill.textContent = "Status: High pressure";
    } else if (speed > 10) {
        ui.statusPill.textContent = "Status: Fast glide";
    } else {
        ui.statusPill.textContent = "Status: Calm";
    }

    ui.oxygenValue.style.color = state.oxygen < 25 ? "var(--danger)" : "var(--text)";
}

function update(dt, time) {
    updateMovement(dt);
    updateOxygen(dt);
    updateSurface(time);
    updateBeams(time);
    updateSways(time);
    updateSchools(time);
    updatePlumes(dt, time);
    updateParticles(dt, time);
    updateManta(time);
    updateScanning(dt);
    updateObjectiveBeacons(time);
    updateHud(time);
}

function animate(timestamp) {
    const time = timestamp * 0.001;
    const dt = Math.min(0.033, (timestamp - state.lastTime) * 0.001 || 0.016);
    state.lastTime = timestamp;

    if (state.started) {
        update(dt, time);
    } else {
        updateSurface(time);
        updateBeams(time);
        updateSways(time);
        updateSchools(time);
        updatePlumes(dt, time);
        updateParticles(dt, time);
        updateManta(time);
        updateObjectiveBeacons(time);
        updateHud(time);
    }

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
}
