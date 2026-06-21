import { Tree, TreePreset } from "@/utils/tree";
import * as THREE from "three";
import { hashString } from "@/utils/lSystem";

export const TREE_TARGET_WORLD_HEIGHT = 10;

export const FOREST_PRESETS = [
    "Oak Medium",
    "Oak Large",
    "Pine Medium",
    "Pine Large",
    "Ash Medium",
    "Ash Large",
    "Aspen Medium",
    "Aspen Large",
];

export const FOREST_PRESET_ASPECT = {
    "Oak Medium": 0.74,
    "Oak Large": 0.86,
    "Pine Medium": 0.56,
    "Pine Large": 0.62,
    "Ash Medium": 0.68,
    "Ash Large": 0.76,
    "Aspen Medium": 0.64,
    "Aspen Large": 0.7,
};

export const treePresetForPlant = (text, seed = "") => {
    const hash = hashString(`${text}:${seed}`);
    return FOREST_PRESETS[hash % FOREST_PRESETS.length];
};

const tintLuma = (tint) => {
    const r = (tint >> 16) & 0xff;
    const g = (tint >> 8) & 0xff;
    const b = tint & 0xff;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const grayTint = (luma) => {
    const channel = Math.max(0, Math.min(255, Math.round(luma)));
    return (channel << 16) | (channel << 8) | channel;
};

const applyMonochromeTints = (options, phenotype) => {
    const barkLuma = tintLuma(options.bark.tint);
    const leafLuma = tintLuma(options.leaves.tint);
    const brightness = Number.isFinite(phenotype?.lightness)
        ? phenotype.lightness / 84
        : 1;

    options.bark.tint = grayTint(barkLuma * brightness);
    options.leaves.tint = grayTint(leafLuma * brightness);
};

const scaleBranchLengths = (options, factor) => {
    Object.keys(options.branch.length).forEach((key) => {
        options.branch.length[key] *= factor;
    });
    Object.keys(options.branch.radius).forEach((key) => {
        options.branch.radius[key] *= factor;
    });
};

const fitTreeToHeight = (tree, targetHeight) => {
    const bounds = new THREE.Box3().setFromObject(tree);
    const size = bounds.getSize(new THREE.Vector3());
    if (size.y <= 0) return bounds;

    tree.scale.setScalar(targetHeight / size.y);
    bounds.setFromObject(tree);
    tree.position.set(-bounds.getCenter(new THREE.Vector3()).x, -bounds.min.y, 0);

    return new THREE.Box3().setFromObject(tree);
};

export const createTreeForPlant = (text, seed = "", phenotype = null) => {
    const presetName = treePresetForPlant(text, seed);
    const hash = hashString(`${text}:${seed}`);
    const options = structuredClone(TreePreset[presetName]);

    options.seed = hash % 2147483647;
    options.leaves.count = Math.max(
        4,
        Math.floor(options.leaves.count * 0.72)
    );

    const sizeScale =
        phenotype?.sizeScale ?? 0.68 + ((hash >> 16) % 88) / 100;
    scaleBranchLengths(options, 0.85 + sizeScale * 0.12);
    applyMonochromeTints(options, phenotype);

    const tree = new Tree();
    tree.loadFromJson(options);

    const bounds = fitTreeToHeight(tree, TREE_TARGET_WORLD_HEIGHT * sizeScale);

    return {
        tree,
        sizeScale,
        bounds,
    };
};

export const disposeTree = (tree) => {
    if (!tree) return;

    tree.traverse((node) => {
        if (node.geometry) node.geometry.dispose();

        if (node.material) {
            const materials = Array.isArray(node.material)
                ? node.material
                : [node.material];
            materials.forEach((material) => material.dispose?.());
        }
    });
};
