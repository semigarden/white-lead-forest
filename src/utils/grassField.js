import * as THREE from "three";
import { hashString } from "@/utils/lSystem";

const BASE_GRASS_COUNT = 1200;
const GRASS_PER_LINE_BASE = 64;
const FIELD_RADIUS = 38;
const BLADE_HALF_HEIGHT = 0.425;

const normalizePlantPositions = (plantPositions) => {
    if (!Array.isArray(plantPositions)) return [];

    return plantPositions.filter(
        (position) =>
            position &&
            Number.isFinite(position.x) &&
            Number.isFinite(position.z)
    );
};

const sampleFieldPosition = (hash) => {
    const angle = ((hash >> 4) % 628) / 100;
    const distance = Math.sqrt((hash % 10000) / 10000) * FIELD_RADIUS;
    return {
        x: Math.cos(angle) * distance,
        z: Math.sin(angle) * distance,
    };
};

const sampleBaseGrassPosition = (index, plantPositions) => {
    const hash = hashString(`grass:base:${index}`);
    const clusterBias = (hash % 100) / 100;
    const anchors = normalizePlantPositions(plantPositions);

    if (anchors.length > 0 && clusterBias < 0.45) {
        const anchor = anchors[(hash >> 6) % anchors.length];
        if (anchor) {
            const angle = ((hash >> 10) % 628) / 100;
            const distance = 0.35 + ((hash >> 16) % 320) / 100;
            return {
                x: anchor.x + Math.cos(angle) * distance,
                z: anchor.z + Math.sin(angle) * distance,
            };
        }
    }

    return sampleFieldPosition(hash);
};

export const grassBladeCountForLine = (text, seed = "") => {
    const hash = hashString(`${text}:${seed}:grass-count`);
    return GRASS_PER_LINE_BASE + (hash % 96);
};

export const createGrassTexture = (text = "", seed = "") => {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 64;

    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.lineCap = "round";

    const hash = hashString(`${text}:${seed}:grass-texture`);
    const bladeCount = text ? 2 + (hash % 2) : 3;
    const centerX = 16 + ((hash >> 4) % 7) - 3;

    for (let index = 0; index < bladeCount; index++) {
        const bladeHash = hashString(`${text}:${seed}:blade:${index}`);
        const lean = (((bladeHash >> 6) % 18) - 9) * (text ? 1 : 0.55);
        const x = centerX + (((bladeHash >> 2) % 13) - 6);
        const opacity = text
            ? 0.42 + ((bladeHash >> 10) % 45) / 100
            : 0.48 + (index * 0.12);
        const width = text
            ? 1.1 + ((bladeHash >> 14) % 12) / 10
            : 1.4 + index * 0.3;

        context.strokeStyle = `rgba(0, 0, 0, ${opacity})`;
        context.lineWidth = width;
        context.beginPath();
        context.moveTo(x, 58);
        context.quadraticCurveTo(
            x + lean * 0.55,
            28 + ((bladeHash >> 8) % 8),
            x + lean,
            5 + ((bladeHash >> 12) % 6)
        );
        context.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
};

const applyBladeInstance = (mesh, index, blade, sampleGroundHeight = null) => {
    const dummy = new THREE.Object3D();
    const groundY = sampleGroundHeight?.(blade.x, blade.z) ?? 0;
    dummy.position.set(blade.x, groundY + BLADE_HALF_HEIGHT * blade.height, blade.z);
    dummy.rotation.y = blade.rotationY;
    dummy.rotation.z = blade.rotationZ;
    dummy.scale.set(blade.scale, blade.height, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
};

const buildBaseBlade = (index, plantPositions) => {
    const hash = hashString(`grass:base:${index}`);
    const { x, z } = sampleBaseGrassPosition(index, plantPositions);

    return {
        x,
        z,
        height: 0.28 + ((hash >> 24) % 45) / 100,
        scale: 0.5 + ((hash >> 20) % 60) / 100,
        rotationY: ((hash >> 12) % 628) / 100,
        rotationZ: (((hash >> 18) % 40) - 20) / 200,
    };
};

const buildLineBlade = (plant, anchor, bladeIndex) => {
    const hash = hashString(`${plant.text}:${plant.id}:grass:${bladeIndex}`);
    const angle = ((hash >> 4) % 628) / 100;
    const distance = 0.12 + ((hash >> 10) % 260) / 100;
    const leanSpread = ((hash >> 16) % 40) - 20;

    return {
        x: anchor.x + Math.cos(angle) * distance + leanSpread / 200,
        z: anchor.z + Math.sin(angle) * distance,
        height: 0.32 + ((hash >> 20) % 110) / 100,
        scale: 0.52 + ((hash >> 24) % 85) / 100,
        rotationY: ((hash >> 8) % 628) / 100,
        rotationZ: (((hash >> 14) % 50) - 25) / 180,
    };
};

const createInstancedGrass = (texture, blades, sampleGroundHeight = null) => {
    const geometry = new THREE.PlaneGeometry(0.32, 0.85);
    const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: true,
        alphaTest: 0.08,
    });

    const mesh = new THREE.InstancedMesh(geometry, material, blades.length);
    blades.forEach((blade, index) =>
        applyBladeInstance(mesh, index, blade, sampleGroundHeight)
    );
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
};

const createBaseGrassMesh = (plantPositions = [], sampleGroundHeight = null) => {
    const blades = Array.from({ length: BASE_GRASS_COUNT }, (_, index) =>
        buildBaseBlade(index, plantPositions)
    );
    return createInstancedGrass(createGrassTexture(), blades, sampleGroundHeight);
};

const createLineGrassMesh = (plant, anchor, sampleGroundHeight = null) => {
    const bladeCount = grassBladeCountForLine(plant.text, plant.id);
    const blades = Array.from({ length: bladeCount }, (_, index) =>
        buildLineBlade(plant, anchor, index)
    );
    return createInstancedGrass(
        createGrassTexture(plant.text, plant.id),
        blades,
        sampleGroundHeight
    );
};

const normalizePlants = (plants) =>
    Array.isArray(plants) ? plants.filter((plant) => plant?.text) : [];

export const createGrassField = (
    plants = [],
    plantPositions = [],
    { includeBaseGrass = true, sampleGroundHeight = null } = {}
) => {
    const gardenPlants = normalizePlants(plants);
    const layout = normalizePlantPositions(plantPositions);
    const field = new THREE.Group();

    if (includeBaseGrass) {
        field.add(createBaseGrassMesh(layout, sampleGroundHeight));
    }

    gardenPlants.forEach((plant, index) => {
        const anchor = layout[index] ?? { x: 0, z: 0 };
        field.add(createLineGrassMesh(plant, anchor, sampleGroundHeight));
    });

    return field;
};

export const disposeGrassField = (grassField) => {
    if (!grassField) return;

    grassField.traverse((node) => {
        if (node.geometry) node.geometry.dispose();
        if (node.material) {
            if (node.material.map) node.material.map.dispose();
            node.material.dispose();
        }
    });
};

export const replaceGrassField = (previousField, plants = [], plantPositions = []) => {
    disposeGrassField(previousField);
    return createGrassField(plants, plantPositions);
};

export const appendPlantGrass = (field, plant, anchor) => {
    if (!field || !plant?.text) return;

    field.add(createLineGrassMesh(plant, anchor));
};

export const syncGrassField = (field, plants = [], plantPositions = []) => {
    const gardenPlants = normalizePlants(plants);
    const layout = normalizePlantPositions(plantPositions);

    if (!field) {
        const nextField = createGrassField(gardenPlants, layout);
        nextField.userData.plantIds = new Set(
            gardenPlants.map((plant) => plant.id)
        );
        return nextField;
    }

    const plantedIds = field.userData.plantIds ?? new Set();

    gardenPlants.forEach((plant, index) => {
        if (plantedIds.has(plant.id)) return;

        const anchor = layout[index] ?? { x: 0, z: 0 };
        appendPlantGrass(field, plant, anchor);
        plantedIds.add(plant.id);
    });

    field.userData.plantIds = plantedIds;
    return field;
};
