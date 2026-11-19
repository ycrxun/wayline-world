import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";

const BEACON_COLORS = [0x60eadc, 0x758cff, 0xc2f56d];
// The Kenney vehicle points along +Z. Wayline drives along local -Z, so the
// imported body needs a half turn while all gameplay logic keeps one convention.
const VEHICLE_MODEL_YAW = Math.PI;
const WORLD_RADIUS = 74;
const ROAD_LATERAL_LIMIT = 1.75;
const WORLD_ROAD_COORDINATES = [
    [-38, 40],
    [-15, 46],
    [12, 42],
    [31, 28],
    [36, 11],
    [24, -3],
    [4, -8],
    [-17, -1],
    [-33, -12],
    [-37, -27],
    [-25, -40],
    [-5, -45],
    [17, -39],
    [29, -51],
];

const WORLD_ROAD_DISTANCE_SAMPLES = new THREE.CatmullRomCurve3(
    WORLD_ROAD_COORDINATES.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    false,
    "catmullrom",
    0.38,
).getSpacedPoints(280);

const distanceToRoad = (x, z, clearance = 0) => {
    let nearest = Infinity;
    for (const point of WORLD_ROAD_DISTANCE_SAMPLES) {
        nearest = Math.min(nearest, Math.hypot(x - point.x, z - point.z));
    }
    return nearest - clearance;
};

const createTextSprite = (text, color, subtitle = "点击探索") => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 192;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.beginPath();
    context.roundRect(6, 6, 628, 180, 26);
    context.fillStyle = "#fff9e9";
    context.fill();
    context.lineWidth = 4;
    context.strokeStyle = color;
    context.stroke();

    context.fillStyle = "#17343a";
    context.font = "600 52px 'LXGW WenKai', 'Noto Sans SC', sans-serif";
    context.fillText(text, 34, 82);
    context.fillStyle = color;
    context.font = "700 18px Menlo, monospace";
    context.fillText(subtitle, 36, 132);
    context.fillStyle = "rgba(23, 52, 58, 0.52)";
    context.font = "600 17px 'Noto Sans SC', sans-serif";
    context.fillText("CLICK TO EXPLORE", 36, 163);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(4.8, 1.44, 1);
    return sprite;
};

const createWaypointLabel = ({ title, date, color }) => {
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    const paint = color;

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.beginPath();
    context.roundRect(8, 8, 752, 240, 30);
    context.fillStyle = "#fff9e9";
    context.fill();
    context.lineWidth = 4;
    context.strokeStyle = paint;
    context.stroke();

    context.fillStyle = paint;
    context.font = "700 22px Menlo, monospace";
    context.fillText(`SIGNAL ${date || "WAYLINE"}`, 38, 58);

    let displayTitle = title || "未命名内容";
    context.font = "600 38px 'Noto Sans SC', sans-serif";
    while (displayTitle.length > 8 && context.measureText(displayTitle).width > 676) {
        displayTitle = `${displayTitle.slice(0, -2)}…`;
    }
    context.fillStyle = "#17343a";
    context.fillText(displayTitle, 38, 130);

    context.fillStyle = paint;
    context.beginPath();
    context.roundRect(38, 171, 182, 42, 21);
    context.fill();
    context.fillStyle = "#fffaf0";
    context.font = "700 19px Menlo, monospace";
    context.fillText("CLICK TO READ", 52, 199);

    context.fillStyle = "rgba(23, 52, 58, 0.55)";
    context.font = "600 18px 'Noto Sans SC', sans-serif";
    context.fillText("点击标记 / E 阅读", 238, 200);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        fog: false,
        opacity: 1,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(5.8, 1.93, 1);
    return sprite;
};

const createContactShadowTexture = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    const gradient = context.createRadialGradient(128, 128, 18, 128, 128, 122);
    gradient.addColorStop(0, "rgba(2, 6, 8, 0.78)");
    gradient.addColorStop(0.52, "rgba(2, 6, 8, 0.5)");
    gradient.addColorStop(1, "rgba(2, 6, 8, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 256);
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
};

export const createWorld = ({
    canvas,
    onReady,
    onTimelineChange,
    onDiscovery,
    onDrive,
    onInteract,
    carUrl,
    treeUrl,
    skyUrl,
    data = {},
}) => {
    const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
    });
    const compactQuality =
        window.matchMedia("(max-width: 760px)").matches ||
        (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, compactQuality ? 1.35 : 1.8));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = !compactQuality;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xa8ddec);
    scene.fog = new THREE.FogExp2(0xc4e2df, 0.0042);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 280);
    const timer = new THREE.Timer();
    timer.connect(document);
    const root = new THREE.Group();
    scene.add(root);

    const sky = new THREE.Mesh(
        new THREE.SphereGeometry(250, 40, 20),
        new THREE.ShaderMaterial({
            side: THREE.BackSide,
            depthWrite: false,
            uniforms: {
                topColor: { value: new THREE.Color(0x111226) },
                bottomColor: { value: new THREE.Color(0xf7ddbb) },
            },
            vertexShader: `
                varying vec3 vPosition;
                void main() {
                    vPosition = position;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 topColor;
                uniform vec3 bottomColor;
                varying vec3 vPosition;
                void main() {
                    float h = smoothstep(-0.45, 0.7, normalize(vPosition).y);
                    gl_FragColor = vec4(mix(bottomColor, topColor, h), 1.0);
                }
            `,
        }),
    );
    scene.add(sky);

    sky.material.uniforms.topColor.value.set(0x68bfdd);
    sky.material.uniforms.bottomColor.value.set(0xf7ddbb);

    scene.add(new THREE.HemisphereLight(0xf7ffff, 0x6e7164, 1.45));
    const keyLight = new THREE.DirectionalLight(0xfff2d5, 2.55);
    keyLight.position.set(-10, 18, 12);
    if (!compactQuality) {
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.set(1536, 1536);
        keyLight.shadow.camera.left = -28;
        keyLight.shadow.camera.right = 28;
        keyLight.shadow.camera.top = 28;
        keyLight.shadow.camera.bottom = -28;
        keyLight.shadow.camera.far = 110;
    }
    scene.add(keyLight, keyLight.target);

    const cyanLight = new THREE.PointLight(0x60eadc, 8, 18, 1.8);
    cyanLight.position.set(-6, 5, -5);
    scene.add(cyanLight);
    const blueLight = new THREE.PointLight(0x557cff, 6, 20, 1.8);
    blueLight.position.set(7, 4, 5);
    scene.add(blueLight);

    const rawTerrainHeightAt = (x, z) =>
        Math.sin(x * 0.085) * 1.18 +
        Math.cos(z * 0.076) * 0.92 +
        Math.sin((x + z) * 0.043) * 0.56 +
        Math.cos(x * 0.19 + z * 0.16) * 0.16;

    const terrainHeightAt = (x, z) => {
        const roadDistance = distanceToRoad(x, z);
        const roadValley = 1 - THREE.MathUtils.smoothstep(roadDistance, 4.2, 15);
        return rawTerrainHeightAt(x, z) * (1 - roadValley * 0.8);
    };

    const createTerrainGeometry = (radius, rings, sectors) => {
        const positions = [0, terrainHeightAt(0, 0), 0];
        for (let ring = 1; ring <= rings; ring += 1) {
            const ringRadius = (ring / rings) * radius;
            for (let sector = 0; sector < sectors; sector += 1) {
                const angle = (sector / sectors) * Math.PI * 2;
                const x = Math.cos(angle) * ringRadius;
                const z = Math.sin(angle) * ringRadius;
                positions.push(x, terrainHeightAt(x, z), z);
            }
        }

        const indices = [];
        for (let sector = 0; sector < sectors; sector += 1) {
            indices.push(0, 1 + ((sector + 1) % sectors), 1 + sector);
        }
        for (let ring = 1; ring < rings; ring += 1) {
            const currentStart = 1 + (ring - 1) * sectors;
            const nextStart = currentStart + sectors;
            for (let sector = 0; sector < sectors; sector += 1) {
                const nextSector = (sector + 1) % sectors;
                const a = currentStart + sector;
                const b = currentStart + nextSector;
                const c = nextStart + sector;
                const d = nextStart + nextSector;
                indices.push(a, b, c, b, d, c);
            }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        return geometry;
    };

    const terrainGeometry = createTerrainGeometry(
        WORLD_RADIUS + 2,
        compactQuality ? 34 : 48,
        compactQuality ? 96 : 144,
    );
    terrainGeometry.computeVertexNormals();

    const terrain = new THREE.Mesh(
        terrainGeometry,
        new THREE.MeshStandardMaterial({
            color: 0x79a86d,
            metalness: 0.02,
            roughness: 0.92,
            flatShading: true,
        }),
    );
    terrain.receiveShadow = !compactQuality;
    root.add(terrain);

    const wireframe = new THREE.LineSegments(
        new THREE.WireframeGeometry(terrainGeometry),
        new THREE.LineBasicMaterial({
            color: 0xb6d9c0,
            transparent: true,
            opacity: 0.05,
        }),
    );
    wireframe.position.y = 0.025;
    root.add(wireframe);

    const grid = new THREE.GridHelper(148, 74, 0x60eadc, 0x173b48);
    grid.position.y = 0.04;
    grid.material.transparent = true;
    grid.material.opacity = 0.035;
    root.add(grid);

    const platformRing = new THREE.Mesh(
        new THREE.TorusGeometry(WORLD_RADIUS + 1.5, 0.06, 8, 260),
        new THREE.MeshBasicMaterial({
            color: 0x60eadc,
            transparent: true,
            opacity: 0.72,
        }),
    );
    platformRing.rotation.x = Math.PI / 2;
    platformRing.position.y = 0.42;
    root.add(platformRing);

    const starCount = compactQuality ? 560 : 1000;
    const starPositions = new Float32Array(starCount * 3);
    for (let index = 0; index < starCount; index += 1) {
        starPositions[index * 3] = (Math.random() - 0.5) * 210;
        starPositions[index * 3 + 1] = Math.random() * 24 + 2;
        starPositions[index * 3 + 2] = (Math.random() - 0.5) * 210;
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    const stars = new THREE.Points(
        starGeometry,
        new THREE.PointsMaterial({
            color: 0x829dff,
            size: 0.045,
            transparent: true,
            opacity: 0.65,
        }),
    );
    scene.add(stars);

    const islandBase = new THREE.Mesh(
        new THREE.CylinderGeometry(WORLD_RADIUS + 2, 52, 8, 96),
        new THREE.MeshStandardMaterial({
            color: 0x718765,
            metalness: 0.16,
            roughness: 0.88,
        }),
    );
    islandBase.position.y = -3.8;
    root.add(islandBase);

    const water = new THREE.Mesh(
        new THREE.RingGeometry(WORLD_RADIUS + 1.8, 112, 128),
        new THREE.MeshPhysicalMaterial({
            color: 0x5eb5d3,
            transparent: true,
            opacity: 0.72,
            roughness: 0.24,
            metalness: 0.08,
        }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.02;
    root.add(water);

    const sun = new THREE.Mesh(
        new THREE.SphereGeometry(7, 24, 16),
        new THREE.MeshBasicMaterial({ color: 0xffefbf }),
    );
    sun.position.set(-86, 58, -154);
    scene.add(sun);

    const mountainColors = [0x6a8f78, 0x78977d, 0x588879, 0x8aa385];
    const mountainCapMaterial = new THREE.MeshStandardMaterial({
        color: 0xe5eee9,
        roughness: 0.9,
    });
    const mountainCount = compactQuality ? 18 : 26;
    for (let index = 0; index < mountainCount; index += 1) {
        const angle = (index / mountainCount) * Math.PI * 2 + Math.random() * 0.14;
        const radius = WORLD_RADIUS - 4 + Math.random() * 16;
        const height = 9 + Math.random() * 11;
        const baseRadius = 5 + Math.random() * 6;
        const mountain = new THREE.Mesh(
            new THREE.ConeGeometry(baseRadius, height, 7),
            new THREE.MeshStandardMaterial({
                color: mountainColors[index % mountainColors.length],
                roughness: 0.95,
                flatShading: true,
            }),
        );
        mountain.position.set(
            Math.cos(angle) * radius,
            terrainHeightAt(Math.cos(angle) * radius, Math.sin(angle) * radius) + height / 2 - 0.15,
            Math.sin(angle) * radius,
        );
        mountain.rotation.y = Math.random() * Math.PI;
        root.add(mountain);

        const cap = new THREE.Mesh(
            new THREE.ConeGeometry(baseRadius * 0.35, height * 0.22, 7),
            mountainCapMaterial,
        );
        cap.position.set(mountain.position.x, mountain.position.y + height * 0.39, mountain.position.z);
        cap.rotation.y = mountain.rotation.y;
        root.add(cap);
    }

    const clouds = [];
    const cloudMaterial = new THREE.MeshBasicMaterial({
        color: 0xf7fbf7,
        transparent: true,
        opacity: 0.72,
    });
    const cloudCount = compactQuality ? 4 : 8;
    for (let index = 0; index < cloudCount; index += 1) {
        const cloud = new THREE.Group();
        const puffCount = 3 + Math.floor(Math.random() * 3);
        for (let puffIndex = 0; puffIndex < puffCount; puffIndex += 1) {
            const puff = new THREE.Mesh(
                new THREE.IcosahedronGeometry(0.7 + Math.random() * 0.7, 1),
                cloudMaterial,
            );
            puff.position.set(puffIndex * 0.8, Math.random() * 0.3, (Math.random() - 0.5) * 0.5);
            cloud.add(puff);
        }
        cloud.position.set(
            -82 + Math.random() * 164,
            20 + Math.random() * 14,
            -92 + Math.random() * 150,
        );
        cloud.scale.setScalar(2.2 + Math.random() * 1.8);
        clouds.push(cloud);
        scene.add(cloud);
    }

    const foliageColors = [0x2f9c8e, 0x67c779, 0xc75f80, 0x8d74d8];
    const obstacleColliders = [];
    const treeTrunkMaterial = new THREE.MeshStandardMaterial({
        color: 0x493934,
        roughness: 0.9,
    });
    const proceduralTrees = new THREE.Group();
    const treePlacements = [];
    root.add(proceduralTrees);
    const treeCount = compactQuality ? 88 : 148;
    let placedTrees = 0;
    let treeAttempts = 0;
    while (placedTrees < treeCount && treeAttempts < treeCount * 14) {
        treeAttempts += 1;
        const angle = Math.random() * Math.PI * 2;
        const radius = 10 + Math.sqrt(Math.random()) * (WORLD_RADIUS - 18);
        const treeX = Math.cos(angle) * radius;
        const treeZ = Math.sin(angle) * radius;
        if (distanceToRoad(treeX, treeZ, 9) < 0) continue;
        const scale = 0.48 + Math.random() * 0.7;
        const tree = new THREE.Group();
        tree.position.set(treeX, 0, treeZ);
        tree.position.y = terrainHeightAt(treeX, treeZ);
        tree.scale.setScalar(scale);
        treePlacements.push({
            position: tree.position.clone(),
            scale,
            rotation: Math.random() * Math.PI * 2,
        });
        obstacleColliders.push({
            x: tree.position.x,
            z: tree.position.z,
            radius: 0.34 + scale * 0.16,
        });

        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.15, 1.05, 6), treeTrunkMaterial);
        trunk.position.y = 0.55;
        trunk.castShadow = !compactQuality;
        tree.add(trunk);

        const crownMaterial = new THREE.MeshStandardMaterial({
            color: foliageColors[placedTrees % foliageColors.length],
            emissive: foliageColors[placedTrees % foliageColors.length],
            emissiveIntensity: 0.04,
            roughness: 0.72,
            metalness: 0.05,
        });
        const lowerCrown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.58, 0), crownMaterial);
        lowerCrown.position.y = 1.28;
        lowerCrown.castShadow = !compactQuality;
        tree.add(lowerCrown);
        const upperCrown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), crownMaterial);
        upperCrown.position.set(0.12, 1.76, -0.05);
        upperCrown.castShadow = !compactQuality;
        tree.add(upperCrown);
        proceduralTrees.add(tree);
        placedTrees += 1;
    }

    const rockCount = compactQuality ? 42 : 78;
    for (let index = 0; index < rockCount; index += 1) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 10 + Math.sqrt(Math.random()) * (WORLD_RADIUS - 18);
        const rockX = Math.cos(angle) * radius;
        const rockZ = Math.sin(angle) * radius;
        if (distanceToRoad(rockX, rockZ, 8) < 0) continue;
        const rock = new THREE.Mesh(
            new THREE.DodecahedronGeometry(0.2 + Math.random() * 0.38, 0),
            new THREE.MeshStandardMaterial({
                color: index % 3 === 0 ? 0x263b42 : 0x162830,
                roughness: 0.82,
            }),
        );
        rock.position.set(rockX, terrainHeightAt(rockX, rockZ) + 0.08, rockZ);
        rock.rotation.set(Math.random(), Math.random(), Math.random());
        rock.castShadow = !compactQuality;
        obstacleColliders.push({
            x: rock.position.x,
            z: rock.position.z,
            radius: 0.22,
        });
        root.add(rock);
    }

    const particleCount = compactQuality ? 280 : 520;
    const groundParticles = new Float32Array(particleCount * 3);
    for (let index = 0; index < particleCount; index += 1) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 7 + Math.sqrt(Math.random()) * (WORLD_RADIUS - 12);
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        groundParticles[index * 3] = x;
        groundParticles[index * 3 + 1] = terrainHeightAt(x, z) + 0.3 + Math.random() * 3.2;
        groundParticles[index * 3 + 2] = z;
    }
    const groundParticleGeometry = new THREE.BufferGeometry();
    groundParticleGeometry.setAttribute("position", new THREE.BufferAttribute(groundParticles, 3));
    const fireflies = new THREE.Points(
        groundParticleGeometry,
        new THREE.PointsMaterial({
            color: 0xc2f56d,
            size: 0.055,
            transparent: true,
            opacity: 0.65,
            blending: THREE.AdditiveBlending,
        }),
    );
    root.add(fireflies);

    const overviewGroup = new THREE.Group();
    root.add(overviewGroup);
    const overviewClickable = [];
    const beaconRings = [];
    const beaconLabels = [];
    const beaconDefinitions = [
        {
            label: "归档",
            subtitle: `${data.archive?.length || 0} STORIES · 时间线`,
            section: "archive",
            color: BEACON_COLORS[0],
            available: Boolean(data.archive?.length),
        },
        {
            label: "影像",
            subtitle: `${data.gallery?.length || 0} FRAMES · 照片日志`,
            section: "gallery",
            color: BEACON_COLORS[1],
            available: Boolean(data.gallery?.length),
        },
        {
            label: "关于",
            subtitle: "JOURNEY · 关于我",
            section: "about",
            color: BEACON_COLORS[2],
            available: Boolean(data.about?.length),
        },
    ].filter((beacon) => beacon.available);
    const beaconSpacing = beaconDefinitions.length === 2 ? 12 : 7;
    const beacons = beaconDefinitions.map((beacon, index) => {
        const offset = (index - (beaconDefinitions.length - 1) / 2) * beaconSpacing;
        return {
            ...beacon,
            x: 0.752 * offset,
            z: -2 - 0.659 * offset,
        };
    });

    beacons.forEach((beacon, index) => {
        const group = new THREE.Group();
        group.position.set(
            beacon.x,
            terrainHeightAt(beacon.x, beacon.z) + 0.2,
            beacon.z,
        );

        const stoneMaterial = new THREE.MeshStandardMaterial({
            color: 0xf1e5cb,
            roughness: 0.78,
            metalness: 0.04,
        });
        const darkMaterial = new THREE.MeshStandardMaterial({
            color: 0x17323a,
            roughness: 0.42,
            metalness: 0.28,
        });
        const accentMaterial = new THREE.MeshStandardMaterial({
            color: beacon.color,
            emissive: beacon.color,
            emissiveIntensity: 0.42,
            roughness: 0.34,
            metalness: 0.18,
        });

        const base = new THREE.Mesh(
            new RoundedBoxGeometry(3.1, 0.34, 2.55, 3, 0.18),
            stoneMaterial,
        );
        base.position.y = 0.17;
        group.add(base);

        const groundRing = new THREE.Mesh(
            new THREE.RingGeometry(1.82, 1.9, 64),
            new THREE.MeshBasicMaterial({
                color: beacon.color,
                transparent: true,
                opacity: 0.62,
                side: THREE.DoubleSide,
            }),
        );
        groundRing.rotation.x = -Math.PI / 2;
        groundRing.position.y = 0.36;
        group.add(groundRing);

        const orbitRing = new THREE.Mesh(
            new THREE.TorusGeometry(1.5, 0.035, 8, 80),
            new THREE.MeshBasicMaterial({
                color: beacon.color,
                transparent: true,
                opacity: 0.68,
            }),
        );
        orbitRing.position.y = 3.55;
        group.add(orbitRing);
        beaconRings.push(orbitRing);

        if (beacon.section === "archive") {
            [0, 1, 2].forEach((slabIndex) => {
                const slab = new THREE.Mesh(
                    new RoundedBoxGeometry(
                        1.95 - slabIndex * 0.3,
                        0.34,
                        1.25 - slabIndex * 0.16,
                        2,
                        0.12,
                    ),
                    slabIndex === 1 ? accentMaterial : stoneMaterial,
                );
                slab.position.y = 0.55 + slabIndex * 0.42;
                slab.rotation.y = (slabIndex - 1) * 0.32;
                group.add(slab);
            });
            const page = new THREE.Mesh(
                new RoundedBoxGeometry(1.18, 1.48, 0.1, 2, 0.08),
                new THREE.MeshStandardMaterial({
                    color: 0xfffbee,
                    emissive: beacon.color,
                    emissiveIntensity: 0.09,
                    roughness: 0.58,
                }),
            );
            page.position.y = 2.42;
            page.rotation.set(0.06, -0.22, -0.06);
            group.add(page);
        } else if (beacon.section === "gallery") {
            [-0.55, 0, 0.55].forEach((offset, frameIndex) => {
                const frame = new THREE.Mesh(
                    new RoundedBoxGeometry(1.25, 0.9, 0.11, 2, 0.06),
                    darkMaterial,
                );
                frame.position.set(offset * 1.8, 1.15 + frameIndex * 0.68, offset * -0.55);
                frame.rotation.y = offset * 1.35;
                frame.rotation.z = offset * 0.18;
                group.add(frame);
                const photo = new THREE.Mesh(
                    new THREE.PlaneGeometry(1.03, 0.65),
                    new THREE.MeshBasicMaterial({
                        color: frameIndex === 1 ? 0xffd39b : beacon.color,
                    }),
                );
                photo.position.z = 0.065;
                frame.add(photo);
            });
        } else {
            const globe = new THREE.Mesh(
                new THREE.IcosahedronGeometry(1.02, 1),
                new THREE.MeshStandardMaterial({
                    color: 0xf8edcf,
                    emissive: beacon.color,
                    emissiveIntensity: 0.12,
                    roughness: 0.48,
                    metalness: 0.08,
                }),
            );
            globe.position.y = 2.08;
            group.add(globe);
            [-0.7, 0.7].forEach((rotation) => {
                const pathRing = new THREE.Mesh(
                    new THREE.TorusGeometry(1.42, 0.025, 6, 72),
                    accentMaterial,
                );
                pathRing.position.y = 2.08;
                pathRing.rotation.set(Math.PI / 2, rotation, rotation * 0.4);
                group.add(pathRing);
                beaconRings.push(pathRing);
            });
            [0, 1, 2].forEach((satelliteIndex) => {
                const angle = (satelliteIndex / 3) * Math.PI * 2;
                const satellite = new THREE.Mesh(
                    new THREE.SphereGeometry(0.12, 12, 8),
                    accentMaterial,
                );
                satellite.position.set(Math.cos(angle) * 1.42, 2.08, Math.sin(angle) * 1.42);
                group.add(satellite);
            });
        }

        const beaconLight = new THREE.PointLight(beacon.color, 7, 7, 2);
        beaconLight.position.y = 2.5;
        group.add(beaconLight);

        const label = createTextSprite(
            beacon.label,
            `#${beacon.color.toString(16).padStart(6, "0")}`,
            beacon.subtitle,
        );
        label.position.set(0, 4.85, 0);
        group.add(label);
        beaconLabels.push({ group, label });

        group.traverse((object) => {
            object.userData.worldSection = beacon.section;
            if (object.isMesh || object.isSprite) overviewClickable.push(object);
        });
        group.userData.index = index;
        overviewGroup.add(group);
    });

    const rover = new THREE.Group();
    rover.position.set(0, 0.25, 0.5);
    const roverMaterial = new THREE.MeshStandardMaterial({
        color: 0xff7968,
        emissive: 0x6e1d16,
        emissiveIntensity: 0.16,
        metalness: 0.42,
        roughness: 0.34,
    });
    const accentMaterial = new THREE.MeshStandardMaterial({
        color: 0x60eadc,
        emissive: 0x60eadc,
        emissiveIntensity: 0.5,
        metalness: 0.48,
        roughness: 0.24,
    });
    const cabinMaterial = new THREE.MeshStandardMaterial({
        color: 0xf3e5d1,
        metalness: 0.16,
        roughness: 0.45,
    });
    const darkMaterial = new THREE.MeshStandardMaterial({
        color: 0x10151a,
        metalness: 0.42,
        roughness: 0.64,
    });

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.48, 1.32, 5, 12), roverMaterial);
    body.rotation.x = Math.PI / 2;
    body.position.y = 0.5;
    body.scale.set(1.22, 1, 0.9);
    body.castShadow = !compactQuality;
    rover.add(body);
    const cabin = new THREE.Mesh(new THREE.CapsuleGeometry(0.33, 0.42, 4, 10), cabinMaterial);
    cabin.rotation.x = Math.PI / 2;
    cabin.position.set(0, 0.94, -0.05);
    cabin.scale.set(1.22, 1, 0.9);
    cabin.castShadow = !compactQuality;
    rover.add(cabin);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.62), darkMaterial);
    roof.position.set(0, 1.13, -0.05);
    rover.add(roof);
    const rearLight = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.08, 0.06), accentMaterial);
    rearLight.position.set(0, 0.55, 1.04);
    rover.add(rearLight);
    const frontBar = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.1, 0.08), accentMaterial);
    frontBar.position.set(0, 0.48, -1.08);
    rover.add(frontBar);

    const headlightMaterial = new THREE.MeshStandardMaterial({
        color: 0xeaffb7,
        emissive: 0xc2f56d,
        emissiveIntensity: 2.2,
    });
    [-0.37, 0.37].forEach((x) => {
        const headlight = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), headlightMaterial);
        headlight.position.set(x, 0.5, -1.13);
        rover.add(headlight);
    });

    const antenna = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.015, 0.58, 6),
        new THREE.MeshBasicMaterial({ color: 0x8ea5a8 }),
    );
    antenna.position.set(0.38, 1.24, 0.48);
    rover.add(antenna);
    const antennaTip = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0x60eadc }),
    );
    antennaTip.position.set(0.38, 1.54, 0.48);
    rover.add(antennaTip);
    const roverGlow = new THREE.PointLight(0x60eadc, 3.8, 4.5, 2);
    roverGlow.position.set(0, 0.24, 0);
    rover.add(roverGlow);
    const headlightBeam = new THREE.SpotLight(0xffedca, 10, 14, 0.48, 0.65, 1.2);
    headlightBeam.position.set(0, 0.62, -0.9);
    headlightBeam.target.position.set(0, 0.1, -8);
    rover.add(headlightBeam, headlightBeam.target);

    const wheels = [];
    [
        [-0.8, 0.15, -0.68],
        [0.8, 0.15, -0.68],
        [-0.8, 0.15, 0.7],
        [0.8, 0.15, 0.7],
    ].forEach(([x, y, z]) => {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 18), darkMaterial);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, y, z);
        wheel.castShadow = !compactQuality;
        wheels.push(wheel);
        rover.add(wheel);

        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.25, 12), accentMaterial);
        hub.rotation.z = Math.PI / 2;
        hub.position.set(x, y, z);
        rover.add(hub);
    });
    root.add(rover);
    const roverShadow = new THREE.Mesh(
        new THREE.PlaneGeometry(2.55, 3.45),
        new THREE.MeshBasicMaterial({
            map: createContactShadowTexture(),
            transparent: true,
            opacity: 0.3,
            depthWrite: false,
        }),
    );
    roverShadow.rotation.x = -Math.PI / 2;
    roverShadow.position.y = 0.003;
    rover.add(roverShadow);
    const roverHalo = new THREE.Mesh(
        new THREE.RingGeometry(1.34, 1.43, 48),
        new THREE.MeshBasicMaterial({
            color: 0x60eadc,
            transparent: true,
            opacity: 0.34,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        }),
    );
    roverHalo.rotation.x = -Math.PI / 2;
    roverHalo.position.y = 0.012;
    rover.add(roverHalo);

    const assetLoader = new GLTFLoader();
    const assetPromises = [];
    let environmentTexture = null;
    if (skyUrl) {
        assetPromises.push(
            new Promise((resolve) => {
                const pmremGenerator = new THREE.PMREMGenerator(renderer);
                const hdrLoader = new HDRLoader();
                hdrLoader.load(
                    skyUrl,
                    (texture) => {
                        texture.mapping = THREE.EquirectangularReflectionMapping;
                        environmentTexture = pmremGenerator.fromEquirectangular(texture).texture;
                        scene.environment = environmentTexture;
                        scene.background = environmentTexture;
                        scene.environmentIntensity = 0.9;
                        scene.backgroundIntensity = 0.96;
                        scene.backgroundBlurriness = 0.08;
                        sky.visible = false;
                        stars.visible = false;
                        sun.visible = false;
                        texture.dispose();
                        pmremGenerator.dispose();
                        resolve();
                    },
                    undefined,
                    () => {
                        pmremGenerator.dispose();
                        resolve();
                    },
                );
            }),
        );
    }
    let importedWheels = [];
    if (carUrl) {
        assetPromises.push(
            new Promise((resolve) => {
                assetLoader.load(
                    carUrl,
                    (gltf) => {
                        const model = gltf.scene;
                        model.updateMatrixWorld(true);
                        let modelBox = new THREE.Box3().setFromObject(model);
                        let modelSize = modelBox.getSize(new THREE.Vector3());
                        let normalizedYaw = 0;
                        if (modelSize.x > modelSize.z * 1.15) {
                            normalizedYaw = Math.PI / 2;
                        }
                        model.rotation.y = normalizedYaw + VEHICLE_MODEL_YAW;
                        model.updateMatrixWorld(true);
                        modelBox = new THREE.Box3().setFromObject(model);
                        modelSize = modelBox.getSize(new THREE.Vector3());
                        const scale = 2.9 / Math.max(modelSize.x, modelSize.z, 1);
                        model.scale.setScalar(scale);
                        model.updateMatrixWorld(true);
                        modelBox = new THREE.Box3().setFromObject(model);
                        const center = modelBox.getCenter(new THREE.Vector3());
                        model.position.x -= center.x;
                        model.position.z -= center.z;
                        model.position.y -= modelBox.min.y;
                        importedWheels = [];
                        model.traverse((object) => {
                            if (object.isMesh) {
                                object.castShadow = !compactQuality;
                                object.receiveShadow = !compactQuality;
                            }
                            if (object.name.startsWith("wheel-")) {
                                importedWheels.push(object);
                            }
                        });
                        rover.children
                            .filter((child) => child.isMesh)
                            .forEach((child) => {
                                child.visible = false;
                            });
                        rover.add(model);
                        resolve();
                    },
                    undefined,
                    resolve,
                );
            }),
        );
    }
    if (treeUrl) {
        assetPromises.push(
            new Promise((resolve) => {
                assetLoader.load(
                    treeUrl,
                    (gltf) => {
                        const source = gltf.scene;
                        source.updateMatrixWorld(true);
                        const sourceBox = new THREE.Box3().setFromObject(source);
                        const sourceSize = sourceBox.getSize(new THREE.Vector3());
                        const baseScale = 2.8 / Math.max(sourceSize.y, 1);
                        proceduralTrees.visible = false;
                        treePlacements.forEach(({ position, scale, rotation }) => {
                            const tree = source.clone(true);
                            tree.scale.setScalar(baseScale * scale);
                            tree.rotation.y = rotation;
                            tree.position.set(
                                position.x,
                                position.y - sourceBox.min.y * baseScale * scale,
                                position.z,
                            );
                            tree.traverse((object) => {
                                if (object.isMesh) object.castShadow = !compactQuality;
                            });
                            root.add(tree);
                        });
                        resolve();
                    },
                    undefined,
                    resolve,
                );
            }),
        );
    }

    const keyState = new Set();
    const keyMap = new Map([
        ["KeyW", "forward"],
        ["ArrowUp", "forward"],
        ["KeyS", "backward"],
        ["ArrowDown", "backward"],
        ["KeyA", "left"],
        ["ArrowLeft", "left"],
        ["KeyD", "right"],
        ["ArrowRight", "right"],
        ["ShiftLeft", "boost"],
        ["ShiftRight", "boost"],
        ["KeyE", "interact"],
        ["Enter", "interact"],
    ]);
    let active = true;
    let interactionEnabled = true;
    let ready = false;
    let firstFrameDrawn = false;
    let assetsSettled = assetPromises.length === 0;
    let dragging = false;
    let pointerStart = null;
    let pointerMoved = false;
    let yaw = 0.72;
    let pitch = 0.24;
    let cameraHoldUntil = 0;
    let distance = window.innerWidth < 700 ? 18.5 : 17;
    let timelineMode = "overview";
    let timelineNodes = [];
    let timelineClickable = [];
    let timelineLabels = [];
    let activeTimelineIndex = -1;
    let discovered = new Set();
    let speed = 0;
    let lastDriveValue = -1;
    let currentRoadCurve = null;
    let roadFrames = [];
    const timelineGroup = new THREE.Group();
    timelineGroup.visible = false;
    root.add(timelineGroup);
    const textureLoader = new THREE.TextureLoader();
    const timelineColors = {
        archive: 0x60eadc,
        gallery: 0x758cff,
        about: 0xc2f56d,
    };

    const disposeGroup = (group) => {
        group.traverse((object) => {
            object.geometry?.dispose?.();
            if (object.material) {
                const materials = Array.isArray(object.material) ? object.material : [object.material];
                materials.forEach((material) => {
                    material.map?.dispose?.();
                    material.dispose?.();
                });
            }
        });
        group.clear();
    };

    const createRoadRibbon = (curve, width, color, yOffset) => {
        const segments = THREE.MathUtils.clamp(Math.ceil(curve.getLength() * 1.2), 220, 560);
        const positions = [];
        const indices = [];
        const uvs = [];
        for (let index = 0; index <= segments; index += 1) {
            const t = index / segments;
            const point = curve.getPointAt(t);
            const tangent = curve.getTangentAt(t).normalize();
            const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
            [-1, 1].forEach((side) => {
                positions.push(
                    point.x + normal.x * width * 0.5 * side,
                    point.y + yOffset,
                    point.z + normal.z * width * 0.5 * side,
                );
                uvs.push(side === -1 ? 0 : 1, t * 12);
            });
            if (index < segments) {
                const base = index * 2;
                indices.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
            }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        const mesh = new THREE.Mesh(
            geometry,
            new THREE.MeshStandardMaterial({
                color,
                roughness: 0.9,
                metalness: 0.02,
                side: THREE.DoubleSide,
            }),
        );
        mesh.receiveShadow = !compactQuality;
        return mesh;
    };

    const createRoadEdge = (curve, width, color, yOffset) => {
        const points = [];
        const segments = THREE.MathUtils.clamp(Math.ceil(curve.getLength() * 1.2), 220, 560);
        for (let index = 0; index <= segments; index += 1) {
            const point = curve.getPointAt(index / segments);
            const tangent = curve.getTangentAt(index / segments).normalize();
            const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
            points.push(
                new THREE.Vector3(
                    point.x + normal.x * width,
                    point.y + yOffset,
                    point.z + normal.z * width,
                ),
            );
        }
        return new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(points),
            new THREE.LineBasicMaterial({
                color,
                transparent: true,
                opacity: 0.72,
            }),
        );
    };

    const createRoadsidePosts = (curve) => {
        const spacing = 4.6;
        const count = Math.max(8, Math.floor(curve.getLength() / spacing));
        const postMaterial = new THREE.MeshStandardMaterial({
            color: 0xf2ead6,
            roughness: 0.82,
        });
        const reflectorMaterial = new THREE.MeshStandardMaterial({
            color: 0xffc56e,
            emissive: 0xe78f37,
            emissiveIntensity: 0.7,
            roughness: 0.35,
        });
        const posts = new THREE.InstancedMesh(
            new THREE.CylinderGeometry(0.035, 0.052, 0.72, 7),
            postMaterial,
            count * 2,
        );
        const reflectors = new THREE.InstancedMesh(
            new THREE.SphereGeometry(0.064, 8, 6),
            reflectorMaterial,
            count * 2,
        );
        const transform = new THREE.Object3D();
        let postIndex = 0;
        for (let index = 0; index < count; index += 1) {
            const t = (index + 0.5) / count;
            const point = curve.getPointAt(t);
            const tangent = curve.getTangentAt(t).normalize();
            const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
            [-1, 1].forEach((side) => {
                const x = point.x + normal.x * 2.9 * side;
                const z = point.z + normal.z * 2.9 * side;
                transform.position.set(x, point.y + 0.37, z);
                transform.rotation.set(0, 0, 0);
                transform.updateMatrix();
                posts.setMatrixAt(postIndex, transform.matrix);
                transform.position.y = point.y + 0.72;
                transform.updateMatrix();
                reflectors.setMatrixAt(postIndex, transform.matrix);
                postIndex += 1;
            });
        }
        posts.instanceMatrix.needsUpdate = true;
        reflectors.instanceMatrix.needsUpdate = true;
        posts.castShadow = !compactQuality;
        return new THREE.Group().add(posts, reflectors);
    };

    const nearestRoadFrame = (x, z) => {
        if (!roadFrames.length) return null;
        let nearest = roadFrames[0];
        let nearestDistance = Infinity;
        roadFrames.forEach((frame) => {
            const distance = Math.hypot(x - frame.point.x, z - frame.point.z);
            if (distance < nearestDistance) {
                nearest = frame;
                nearestDistance = distance;
            }
        });
        return { ...nearest, distance: nearestDistance };
    };

    const constrainToRoad = (x, z) => {
        const frame = nearestRoadFrame(x, z);
        if (!frame || frame.distance <= ROAD_LATERAL_LIMIT) {
            return { x, z };
        }
        const lateral =
            (x - frame.point.x) * frame.normal.x +
            (z - frame.point.z) * frame.normal.z;
        const side = lateral < 0 ? -1 : 1;
        return {
            x: frame.point.x + frame.normal.x * ROAD_LATERAL_LIMIT * side,
            z: frame.point.z + frame.normal.z * ROAD_LATERAL_LIMIT * side,
        };
    };

    const announceTimeline = (index, discover = true) => {
        const node = timelineNodes[index];
        if (!node) return;
        const isNewDiscovery = discover && !discovered.has(index);
        if (discover) discovered.add(index);
        onTimelineChange?.({
            mode: timelineMode,
            item: node.item,
            index,
            total: timelineNodes.length,
            discovered: discovered.size,
        });
        if (isNewDiscovery) {
            onDiscovery?.({
                item: node.item,
                index,
                total: timelineNodes.length,
                discovered: discovered.size,
            });
        }
    };

    const setTimelineIndex = (index, moveRover = true, discover = true) => {
        if (!timelineNodes.length) return;
        activeTimelineIndex = (index + timelineNodes.length) % timelineNodes.length;
        if (moveRover) {
            const node = timelineNodes[activeTimelineIndex];
            const tangent = node.tangent;
            rover.position.copy(node.roadPoint).addScaledVector(tangent, -1.4);
            rover.position.y = node.roadPoint.y + 0.08;
            rover.rotation.y = Math.atan2(-tangent.x, -tangent.z);
            yaw = rover.rotation.y + 0.24;
            cameraHoldUntil = 0;
            pitch = 0.32;
            distance = window.innerWidth < 700 ? 19 : 20;
        }
        announceTimeline(activeTimelineIndex, discover);
    };

    const setMode = (mode) => {
        const items = Array.isArray(data[mode]) ? data[mode] : [];
        if (mode !== "overview" && !items.length) mode = "overview";

        timelineMode = mode;
        keyState.clear();
        disposeGroup(timelineGroup);
        timelineNodes = [];
        timelineClickable = [];
        timelineLabels = [];
        roadFrames = [];
        activeTimelineIndex = -1;
        discovered = new Set();
        overviewGroup.visible = mode === "overview";
        timelineGroup.visible = mode !== "overview";

        if (mode === "overview") {
            rover.position.set(0, terrainHeightAt(0, 0.5) + 0.25, 0.5);
            rover.rotation.y = 0;
            yaw = 0.72;
            pitch = 0.22;
            cameraHoldUntil = 0;
            distance = window.innerWidth < 700 ? 36 : 40;
            onTimelineChange?.(null);
            updateCamera(0, true);
            return;
        }

        const color = timelineColors[mode] || 0x60eadc;
        const routeGuide = new THREE.CatmullRomCurve3(
            WORLD_ROAD_COORDINATES.map(([x, z]) => new THREE.Vector3(x, 0, z)),
            false,
            "catmullrom",
            0.38,
        );
        const routePoints = routeGuide.getSpacedPoints(340).map((point) => {
            return new THREE.Vector3(point.x, terrainHeightAt(point.x, point.z) + 0.56, point.z);
        });
        currentRoadCurve = new THREE.CatmullRomCurve3(routePoints, false, "catmullrom", 0.18);
        const roadFrameCount = THREE.MathUtils.clamp(
            Math.ceil(currentRoadCurve.getLength() * 1.15),
            220,
            420,
        );
        roadFrames = Array.from({ length: roadFrameCount + 1 }, (_, index) => {
            const t = index / roadFrameCount;
            const point = currentRoadCurve.getPointAt(t);
            const tangent = currentRoadCurve.getTangentAt(t).normalize();
            const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
            return { point, tangent, normal };
        });
        timelineGroup.add(createRoadRibbon(currentRoadCurve, 6.8, 0xd9d2b5, 0.023));
        timelineGroup.add(createRoadRibbon(currentRoadCurve, 5.85, 0x3d5353, 0.048));
        timelineGroup.add(createRoadRibbon(currentRoadCurve, 5.42, 0x66726c, 0.058));
        timelineGroup.add(createRoadEdge(currentRoadCurve, 2.55, 0xfff1c8, 0.075));
        timelineGroup.add(createRoadEdge(currentRoadCurve, -2.55, 0xfff1c8, 0.075));
        timelineGroup.add(createRoadsidePosts(currentRoadCurve));
        const centerLinePoints = currentRoadCurve
            .getSpacedPoints(
                THREE.MathUtils.clamp(Math.ceil(currentRoadCurve.getLength() * 1.2), 220, 560),
            )
            .map((point) => new THREE.Vector3(point.x, point.y + 0.08, point.z));
        const centerLine = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(centerLinePoints),
            new THREE.LineDashedMaterial({
                color: 0xfff7df,
                dashSize: 0.45,
                gapSize: 0.35,
                transparent: true,
                opacity: 0.8,
            }),
        );
        centerLine.computeLineDistances();
        timelineGroup.add(centerLine);

        items.forEach((item, index) => {
            const t = items.length === 1 ? 0.5 : (index + 0.5) / items.length;
            const roadPoint = currentRoadCurve.getPointAt(t);
            const tangent = currentRoadCurve.getTangentAt(t).normalize();
            const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
            const side = index % 2 === 0 ? -1 : 1;
            const group = new THREE.Group();
            group.position.set(
                roadPoint.x + normal.x * 3.1 * side,
                roadPoint.y + 0.04,
                roadPoint.z + normal.z * 3.1 * side,
            );
            group.rotation.y = Math.atan2(-normal.x * side, -normal.z * side);

            const base = new THREE.Mesh(
                new THREE.CylinderGeometry(0.34, 0.48, 0.18, 12),
                new THREE.MeshStandardMaterial({
                    color: 0x0c1d26,
                    emissive: color,
                    emissiveIntensity: 0.08,
                    metalness: 0.45,
                    roughness: 0.38,
                }),
            );
            group.add(base);

            const marker = new THREE.Mesh(
                new THREE.CylinderGeometry(0.06, 0.06, 1.35, 10),
                new THREE.MeshBasicMaterial({
                    color,
                    transparent: true,
                    opacity: 0.78,
                }),
            );
            marker.position.y = 0.78;
            group.add(marker);

            const halo = new THREE.Mesh(
                new THREE.TorusGeometry(0.52, 0.025, 6, 40),
                new THREE.MeshBasicMaterial({
                    color,
                    transparent: true,
                    opacity: 0.7,
                }),
            );
            halo.rotation.x = Math.PI / 2;
            halo.position.y = 1.45;
            group.add(halo);

            if (mode === "gallery" && item.image) {
                const frame = new THREE.Mesh(
                    new THREE.BoxGeometry(2.55, 1.72, 0.08),
                    new THREE.MeshStandardMaterial({
                        color: 0x0d1820,
                        metalness: 0.35,
                        roughness: 0.45,
                    }),
                );
                frame.position.y = 2.05;
                group.add(frame);

                const texture = textureLoader.load(item.image);
                texture.colorSpace = THREE.SRGBColorSpace;
                const photo = new THREE.Mesh(
                    new THREE.PlaneGeometry(2.38, 1.55),
                    new THREE.MeshBasicMaterial({ map: texture }),
                );
                photo.position.set(0, 2.05, 0.05);
                group.add(photo);
            } else {
                const glyph = new THREE.Mesh(
                    mode === "about"
                        ? new THREE.BoxGeometry(0.82, 0.82, 0.82)
                        : new THREE.OctahedronGeometry(0.56, 0),
                    new THREE.MeshStandardMaterial({
                        color: 0x102833,
                        emissive: color,
                        emissiveIntensity: 0.5,
                        metalness: 0.52,
                        roughness: 0.24,
                    }),
                );
                glyph.position.y = 1.82;
                group.add(glyph);
            }

            const waypointLabel = createWaypointLabel({
                title: item.title,
                date: item.date,
                color: `#${color.toString(16).padStart(6, "0")}`,
            });
            waypointLabel.position.set(0, mode === "gallery" ? 3.5 : 3.25, 0);
            waypointLabel.visible = false;
            group.add(waypointLabel);
            timelineLabels.push({
                sprite: waypointLabel,
                index,
                baseY: waypointLabel.position.y,
            });

            group.traverse((object) => {
                object.userData.timelineIndex = index;
                if (object.isMesh || object.isSprite) timelineClickable.push(object);
            });
            timelineGroup.add(group);
            timelineNodes.push({ group, item, halo, roadPoint, tangent });
        });
        const start = currentRoadCurve.getPointAt(0);
        rover.position.set(start.x, terrainHeightAt(start.x, start.z) + 0.25, start.z);
        rover.rotation.y = 0;
        yaw = 0.24;
        pitch = 0.32;
        distance = window.innerWidth < 700 ? 19 : 20;
        setTimelineIndex(0, true, false);
        updateCamera(0, true);
    };

    const pointerFromEvent = (event) => {
        const rect = canvas.getBoundingClientRect();
        return new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1,
        );
    };
    const raycaster = new THREE.Raycaster();

    const handleKeyDown = (event) => {
        if (!active || !interactionEnabled) return;
        const action = keyMap.get(event.code);
        if (!action) return;
        event.preventDefault();
        if (action === "interact") {
            if (!event.repeat && timelineMode !== "overview" && timelineNodes[activeTimelineIndex]) {
                onInteract?.(timelineNodes[activeTimelineIndex].item);
            }
            return;
        }
        keyState.add(action);
    };
    const handleKeyUp = (event) => {
        const action = keyMap.get(event.code);
        if (action) keyState.delete(action);
    };
    const handlePointerDown = (event) => {
        if (!interactionEnabled) return;
        dragging = true;
        pointerMoved = false;
        pointerStart = { x: event.clientX, y: event.clientY };
        canvas.setPointerCapture?.(event.pointerId);
    };
    const handlePointerMove = (event) => {
        if (!dragging || !pointerStart) return;
        const deltaX = event.clientX - pointerStart.x;
        const deltaY = event.clientY - pointerStart.y;
        if (Math.abs(deltaX) + Math.abs(deltaY) > 3) pointerMoved = true;
        yaw -= deltaX * 0.005;
        pitch = THREE.MathUtils.clamp(pitch + deltaY * 0.004, 0.12, 1.05);
        cameraHoldUntil = performance.now() + 1600;
        pointerStart = { x: event.clientX, y: event.clientY };
    };
    const handlePointerUp = (event) => {
        if (!dragging) return;
        dragging = false;
        if (pointerMoved) return;

        raycaster.setFromCamera(pointerFromEvent(event), camera);
        const targets = timelineMode === "overview" ? overviewClickable : timelineClickable;
        const hit = raycaster.intersectObjects(targets, false)[0];
        if (!hit) return;
        if (timelineMode === "overview" && hit.object.userData.worldSection) {
            setMode(hit.object.userData.worldSection);
        } else if (Number.isInteger(hit.object.userData.timelineIndex)) {
            const nextIndex = hit.object.userData.timelineIndex;
            setTimelineIndex(nextIndex);
            window.setTimeout(() => {
                onInteract?.(timelineNodes[nextIndex].item);
            }, 140);
        }
    };
    const handleWheel = (event) => {
        if (!active || !interactionEnabled) return;
        event.preventDefault();
        distance = THREE.MathUtils.clamp(distance + event.deltaY * 0.012, 10, 52);
    };

    const touchControls = [...document.querySelectorAll("[data-world-control]")];
    const releaseTouchControl = (button) => {
        keyState.delete(button.dataset.worldControl);
        button.removeAttribute("data-active");
    };
    touchControls.forEach((button) => {
        button.addEventListener("pointerdown", (event) => {
            if (!interactionEnabled) return;
            event.preventDefault();
            button.setPointerCapture?.(event.pointerId);
            keyState.add(button.dataset.worldControl);
            button.setAttribute("data-active", "true");
        });
        ["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => {
            button.addEventListener(eventName, () => releaseTouchControl(button));
        });
    });

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointercancel", handlePointerUp);
    canvas.addEventListener("wheel", handleWheel, { passive: false });

    const resize = () => {
        const width = Math.max(canvas.clientWidth, 1);
        const height = Math.max(canvas.clientHeight, 1);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();

    const cameraTarget = new THREE.Vector3(0, 0.8, 0);
    const desiredCamera = new THREE.Vector3();
    const updateCamera = (delta, immediate = false) => {
        const followDistance = distance + Math.min(Math.abs(speed) * 0.12, 1.2);
        const horizontalDistance = Math.cos(pitch) * followDistance;
        desiredCamera.set(
            rover.position.x + Math.sin(yaw) * horizontalDistance,
            rover.position.y + Math.sin(pitch) * followDistance,
            rover.position.z + Math.cos(yaw) * horizontalDistance,
        );
        const smoothing = immediate ? 1 : 1 - Math.pow(0.002, delta);
        camera.position.lerp(desiredCamera, smoothing);
        cameraTarget.lerp(
            new THREE.Vector3(rover.position.x, rover.position.y + 0.75, rover.position.z),
            smoothing,
        );
        camera.lookAt(cameraTarget);
    };

    camera.position.set(
        Math.sin(yaw) * Math.cos(pitch) * distance,
        Math.sin(pitch) * distance,
        Math.cos(yaw) * Math.cos(pitch) * distance,
    );
    camera.lookAt(cameraTarget);

    const animate = (timestamp) => {
        if (!active) return;
        timer.update(timestamp);
        const delta = Math.min(timer.getDelta(), 0.05);
        const turn = (keyState.has("left") ? 1 : 0) - (keyState.has("right") ? 1 : 0);
        const movement = (keyState.has("forward") ? 1 : 0) - (keyState.has("backward") ? 1 : 0);
        const boosting = keyState.has("boost") && movement > 0;
        const targetSpeed = movement > 0 ? (boosting ? 7.2 : 4.2) : movement < 0 ? -2.4 : 0;
        speed = THREE.MathUtils.damp(speed, targetSpeed, movement ? 3.4 : 5.2, delta);

        rover.rotation.y +=
            turn *
            delta *
            (0.7 + Math.min(Math.abs(speed), 6) * 0.18) *
            (speed < 0 ? -1 : 1);
        if (Math.abs(speed) > 0.015) {
            const travel = speed * delta;
            const candidateX = rover.position.x - Math.sin(rover.rotation.y) * travel;
            const candidateZ = rover.position.z - Math.cos(rover.rotation.y) * travel;
            const constrained =
                timelineMode === "overview"
                    ? { x: candidateX, z: candidateZ }
                    : constrainToRoad(candidateX, candidateZ);
            const nextX = constrained.x;
            const nextZ = constrained.z;
            const collides = obstacleColliders.some((obstacle) => {
                return Math.hypot(nextX - obstacle.x, nextZ - obstacle.z) < obstacle.radius + 0.56;
            });
            if (Math.hypot(nextX, nextZ) < WORLD_RADIUS - 4 && !collides) {
                rover.position.x = nextX;
                rover.position.z = nextZ;
            } else {
                speed *= -0.2;
            }
            [...wheels, ...importedWheels].forEach((wheel) => {
                wheel.rotation.x += travel * 9;
            });
        }
        const roadFrame =
            timelineMode === "overview"
                ? null
                : nearestRoadFrame(rover.position.x, rover.position.z);
        const surfaceY =
            roadFrame && roadFrame.distance < 2.2
                ? roadFrame.point.y + 0.06
                : terrainHeightAt(rover.position.x, rover.position.z) + 0.08;
        rover.position.y = THREE.MathUtils.damp(
            rover.position.y,
            surfaceY + (timelineMode === "overview" ? 0.17 : 0.012),
            10,
            delta,
        );
        rover.rotation.z = THREE.MathUtils.damp(
            rover.rotation.z,
            -turn * Math.min(Math.abs(speed) * 0.018, 0.09),
            8,
            delta,
        );
        roverHalo.material.opacity = boosting ? 0.72 : 0.34;
        keyLight.position.set(rover.position.x - 18, rover.position.y + 30, rover.position.z + 20);
        keyLight.target.position.set(rover.position.x, rover.position.y, rover.position.z);
        keyLight.target.updateMatrixWorld();

        const driveValue = Math.round(Math.abs(speed) * 12 + (boosting ? 4 : 0));
        if (driveValue !== lastDriveValue || boosting) {
            lastDriveValue = driveValue;
            onDrive?.({ speed: driveValue, boost: boosting });
        }

        const elapsed = timer.getElapsed();
        if (timelineMode !== "overview" && performance.now() > cameraHoldUntil) {
            yaw = THREE.MathUtils.damp(yaw, rover.rotation.y + 0.24, 3.2, delta);
        }
        beaconRings.forEach((ring, index) => {
            ring.rotation.z = elapsed * (0.22 + index * 0.06);
            ring.scale.setScalar(1 + Math.sin(elapsed * 1.2 + index) * 0.045);
        });
        if (timelineMode === "overview") {
            beaconLabels.forEach(({ group, label }) => {
                const distanceToBeacon = rover.position.distanceTo(group.position);
                label.visible = true;
                label.material.opacity = THREE.MathUtils.clamp(1 - distanceToBeacon / 66, 0.58, 0.96);
            });
        } else if (timelineNodes.length) {
            let nearestIndex = 0;
            let nearestDistance = Infinity;
            timelineNodes.forEach((node, index) => {
                const distanceToNode = rover.position.distanceTo(node.group.position);
                if (distanceToNode < nearestDistance) {
                    nearestDistance = distanceToNode;
                    nearestIndex = index;
                }
            });
            if (nearestIndex !== activeTimelineIndex && nearestDistance < 4.2) {
                activeTimelineIndex = nearestIndex;
                announceTimeline(activeTimelineIndex);
            }
            timelineNodes.forEach((node, index) => {
                const activeNode = index === activeTimelineIndex;
                node.group.scale.setScalar(activeNode ? 1.16 : 1);
                node.halo.rotation.z = elapsed * (activeNode ? 1.1 : 0.35);
                if (timelineMode !== "gallery" && activeNode) {
                    node.group.rotation.y += delta * 0.35;
                }
            });
            timelineLabels.forEach(({ sprite, index, baseY }) => {
                const node = timelineNodes[index];
                const distanceToNode = rover.position.distanceTo(node.group.position);
                const activeNode = index === activeTimelineIndex;
                sprite.visible = activeNode;
                if (!sprite.visible) return;
                const labelScale = THREE.MathUtils.clamp(distanceToNode * 0.4, 3.6, 5.3);
                sprite.scale.set(labelScale, labelScale / 3, 1);
                sprite.material.opacity = 0.96;
                sprite.position.y = baseY + Math.sin(elapsed * 1.8 + index) * 0.07;
            });
        }
        stars.rotation.y = elapsed * 0.006;
        fireflies.rotation.y = -elapsed * 0.008;
        fireflies.position.y = Math.sin(elapsed * 0.35) * 0.16;
        clouds.forEach((cloud, index) => {
            cloud.position.x += delta * (0.18 + index * 0.012);
            if (cloud.position.x > 92) cloud.position.x = -92;
        });
        antennaTip.scale.setScalar(1 + Math.sin(elapsed * 4.2) * 0.22);
        roverGlow.intensity = boosting ? 7 : 3.8;
        headlightBeam.intensity = boosting ? 16 : 10;
        platformRing.material.opacity = 0.56 + Math.sin(elapsed * 0.9) * 0.14;
        updateCamera(delta);
        renderer.render(scene, camera);

        if (!ready) {
            firstFrameDrawn = true;
            if (assetsSettled) {
                ready = true;
                onReady?.();
            }
        }
        requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
    if (!assetsSettled) {
        Promise.allSettled(assetPromises).then(() => {
            assetsSettled = true;
            if (firstFrameDrawn && !ready) {
                ready = true;
                onReady?.();
            }
        });
    }

    return {
        setMode,
        setInteractionEnabled(enabled) {
            interactionEnabled = enabled;
            if (!enabled) {
                keyState.clear();
                speed = 0;
                onDrive?.({ speed: 0, boost: false });
            }
        },
        step(delta) {
            if (timelineMode === "overview") return;
            setTimelineIndex(activeTimelineIndex + delta);
        },
        pause() {
            active = false;
            keyState.clear();
        },
        resume() {
            if (active) return;
            active = true;
            timer.reset();
            requestAnimationFrame(animate);
        },
        dispose() {
            active = false;
            timer.dispose();
            resizeObserver.disconnect();
            document.removeEventListener("keydown", handleKeyDown);
            document.removeEventListener("keyup", handleKeyUp);
            canvas.removeEventListener("pointerdown", handlePointerDown);
            canvas.removeEventListener("pointermove", handlePointerMove);
            canvas.removeEventListener("pointerup", handlePointerUp);
            canvas.removeEventListener("pointercancel", handlePointerUp);
            canvas.removeEventListener("wheel", handleWheel);
            root.traverse((object) => {
                object.geometry?.dispose?.();
                if (object.material) {
                    const materials = Array.isArray(object.material) ? object.material : [object.material];
                    materials.forEach((material) => {
                        material.map?.dispose?.();
                        material.dispose?.();
                    });
                }
            });
            environmentTexture?.dispose();
            renderer.dispose();
        },
    };
};
