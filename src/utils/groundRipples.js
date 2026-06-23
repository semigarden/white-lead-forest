import * as THREE from "three";

const POOL_SIZE = 64;
const FIELD_RADIUS = 34;
const RIPPLE_Y = 0.035;
const MAX_GROUND_DISTANCE = 32;
const MIN_GROUND_DISTANCE = 0.35;

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const cameraOrigin = new THREE.Vector3();

const GROUND_NDC = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
    [-1, 0],
    [1, 0],
    [0, -0.2],
    [0, 0.45],
];

const createRingMesh = () => {
    const geometry = new THREE.RingGeometry(0.94, 1, 48);
    const material = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    return mesh;
};

const clampToField = (x, z, fieldRadius = FIELD_RADIUS) => {
    const dist = Math.hypot(x, z);
    if (dist <= fieldRadius) {
        return { x, z };
    }

    const scale = fieldRadius / dist;
    return { x: x * scale, z: z * scale };
};

const createGroundSampling = ({ unbounded = false } = {}) => {
    const constrainPoint = (x, z) =>
        unbounded ? { x, z } : clampToField(x, z);

    const intersectGround = (camera, x, y) => {
        ndc.set(x, y);
        raycaster.setFromCamera(ndc, camera);

        const { origin, direction } = raycaster.ray;
        if (direction.y >= -0.008) return null;

        const t = -origin.y / direction.y;
        if (t < MIN_GROUND_DISTANCE) return null;

        const hitX = origin.x + direction.x * t;
        const hitZ = origin.z + direction.z * t;
        const dist = Math.hypot(hitX - origin.x, hitZ - origin.z);
        if (dist > MAX_GROUND_DISTANCE) return null;

        return constrainPoint(hitX, hitZ);
    };

    const buildVisibleGround = (camera) => {
        const hits = GROUND_NDC.map(([x, y]) =>
            intersectGround(camera, x, y)
        ).filter(Boolean);

        if (hits.length === 0) {
            return null;
        }

        const bl = intersectGround(camera, -1, -1);
        const br = intersectGround(camera, 1, -1);
        const tr = intersectGround(camera, 1, 1);
        const tl = intersectGround(camera, -1, 1);

        return { hits, bl, br, tr, tl };
    };

    const randomVisibleGroundPoint = (camera, visibleGround) => {
        const { hits, bl, br, tr, tl } = visibleGround;

        if (bl && br && tr && tl) {
            const u = Math.random();
            const v = Math.random();
            const bottom = {
                x: bl.x + (br.x - bl.x) * u,
                z: bl.z + (br.z - bl.z) * u,
            };
            const top = {
                x: tl.x + (tr.x - tl.x) * u,
                z: tl.z + (tr.z - tl.z) * u,
            };
            return {
                x: bottom.x + (top.x - bottom.x) * v,
                z: bottom.z + (top.z - bottom.z) * v,
            };
        }

        if (hits.length >= 3) {
            const anchor = hits[Math.floor(Math.random() * hits.length)];
            const partner = hits[Math.floor(Math.random() * hits.length)];
            const blend = Math.random();
            const point = {
                x: anchor.x + (partner.x - anchor.x) * blend,
                z: anchor.z + (partner.z - anchor.z) * blend,
            };
            const jitter = Math.random() * 1.4;
            const angle = Math.random() * Math.PI * 2;

            return {
                x: point.x + Math.cos(angle) * jitter,
                z: point.z + Math.sin(angle) * jitter,
            };
        }

        for (let attempt = 0; attempt < 10; attempt += 1) {
            const point = intersectGround(
                camera,
                Math.random() * 2 - 1,
                Math.random() * 1.4 - 1
            );
            if (point) return point;
        }

        camera.getWorldPosition(cameraOrigin);
        return constrainPoint(cameraOrigin.x, cameraOrigin.z + 2);
    };

    return { buildVisibleGround, randomVisibleGroundPoint };
};

export const createGroundRipples = (
    scene,
    { unbounded = false, sampleGroundHeight = null } = {}
) => {
    const { buildVisibleGround, randomVisibleGroundPoint } =
        createGroundSampling({ unbounded });
    const root = new THREE.Group();
    const ripples = [];

    for (let index = 0; index < POOL_SIZE; index += 1) {
        const mesh = createRingMesh();
        root.add(mesh);
        ripples.push({
            mesh,
            active: false,
            birth: 0,
            duration: 1,
            maxScale: 0.3,
            x: 0,
            z: 0,
        });
    }

    scene.add(root);

    let nextSpawnAt = 0;

    const spawnRipple = (elapsed, point, options = {}) => {
        const slot = ripples.find((ripple) => !ripple.active);
        if (!slot) return;

        const {
            delay = 0,
            maxScale = 0.1 + Math.random() * 0.22,
            duration = 0.7 + Math.random() * 0.8,
        } = options;

        slot.active = true;
        slot.birth = elapsed + delay;
        slot.duration = duration;
        slot.maxScale = maxScale;
        slot.x = point.x;
        slot.z = point.z;
        const groundY = sampleGroundHeight?.(point.x, point.z) ?? 0;
        slot.mesh.position.set(point.x, groundY + RIPPLE_Y, point.z);
        slot.mesh.scale.setScalar(0.01);
        slot.mesh.material.opacity = 0;
        slot.mesh.visible = true;
    };

    const spawnDrop = (elapsed, camera, visibleGround) => {
        const point = randomVisibleGroundPoint(camera, visibleGround);
        spawnRipple(elapsed, point);

        if (Math.random() < 0.35) {
            spawnRipple(
                elapsed,
                randomVisibleGroundPoint(camera, visibleGround),
                {
                    delay: 0.04 + Math.random() * 0.08,
                    maxScale: 0.08 + Math.random() * 0.16,
                    duration: 0.55 + Math.random() * 0.65,
                }
            );
        }
    };

    const update = (elapsed, camera) => {
        if (camera && elapsed >= nextSpawnAt) {
            const visibleGround = buildVisibleGround(camera);

            if (visibleGround) {
                const burstCount = 1 + Math.floor(Math.random() * 2);

                for (let index = 0; index < burstCount; index += 1) {
                    spawnDrop(elapsed, camera, visibleGround);
                }
            }

            nextSpawnAt = elapsed + 0.4 + Math.random() * 0.7;
        }

        ripples.forEach((ripple) => {
            if (!ripple.active) return;

            const progress = (elapsed - ripple.birth) / ripple.duration;

            if (progress >= 1) {
                ripple.active = false;
                ripple.mesh.visible = false;
                ripple.mesh.material.opacity = 0;
                return;
            }

            const eased = 1 - (1 - progress) ** 2;
            const scale = Math.max(0.01, eased * ripple.maxScale);
            const opacity = (1 - progress) ** 1.5 * 0.26;

            ripple.mesh.scale.set(scale, scale, scale);
            ripple.mesh.material.opacity = opacity;
        });
    };

    const dispose = () => {
        ripples.forEach((ripple) => {
            ripple.mesh.geometry.dispose();
            ripple.mesh.material.dispose();
        });
        scene.remove(root);
    };

    return { root, update, dispose };
};
