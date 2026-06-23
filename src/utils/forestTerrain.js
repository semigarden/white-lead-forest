import * as THREE from "three";
import { fbm2D } from "@/utils/forestNoise";

export const FOREST_TERRAIN_SEED = "forest-terrain-v1";

export const DEFAULT_TERRAIN_CONFIG = {
    seed: FOREST_TERRAIN_SEED,
    size: 384,
    segments: 128,
    macroScale: 0.0036,
    macroAmplitude: 6.5,
    microScale: 0.015,
    microAmplitude: 1.6,
    macroOctaves: 4,
    microOctaves: 3,
};

export const sampleTerrainHeight = (x, z, config = {}) => {
    const options = { ...DEFAULT_TERRAIN_CONFIG, ...config };
    const macro = fbm2D(x * options.macroScale, z * options.macroScale, `${options.seed}:macro`, {
        octaves: options.macroOctaves,
        gain: 0.52,
    });
    const micro = fbm2D(x * options.microScale, z * options.microScale, `${options.seed}:micro`, {
        octaves: options.microOctaves,
        gain: 0.48,
    });

    return macro * options.macroAmplitude + micro * options.microAmplitude;
};

export const sampleTerrainSlope = (
    x,
    z,
    sampleHeight = sampleTerrainHeight,
    epsilon = 0.45,
    config = {}
) => {
    const y = sampleHeight(x, z, config);
    const dhdx =
        (sampleHeight(x + epsilon, z, config) -
            sampleHeight(x - epsilon, z, config)) /
        (2 * epsilon);
    const dhdz =
        (sampleHeight(x, z + epsilon, config) -
            sampleHeight(x, z - epsilon, config)) /
        (2 * epsilon);

    return { y, dhdx, dhdz };
};

export const createForestTerrain = (config = {}) => {
    const options = { ...DEFAULT_TERRAIN_CONFIG, ...config };
    const geometry = new THREE.PlaneGeometry(
        options.size,
        options.size,
        options.segments,
        options.segments
    );
    geometry.rotateX(-Math.PI / 2);

    const updateForOrigin = (originX = 0, originZ = 0) => {
        const positions = geometry.attributes.position;

        for (let index = 0; index < positions.count; index += 1) {
            const localX = positions.getX(index);
            const localZ = positions.getZ(index);
            const logicalX = originX + localX;
            const logicalZ = originZ + localZ;

            positions.setY(
                index,
                sampleTerrainHeight(logicalX, logicalZ, options)
            );
        }

        positions.needsUpdate = true;
        geometry.computeVertexNormals();
    };

    updateForOrigin();

    const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "forest-terrain";
    mesh.receiveShadow = false;

    const sampleHeight = (x, z) => sampleTerrainHeight(x, z, options);

    return {
        mesh,
        sampleHeight,
        updateForOrigin,
        dispose: () => {
            geometry.dispose();
            material.dispose();
        },
    };
};
