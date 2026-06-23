import * as THREE from "three";
import { effectiveGrowProgressForShrink } from "@/utils/plantGrowth";
import {
    updateAtlasPlantTexture,
    updateSpritePlantTexture,
} from "@/utils/plantTextureAnimation";
import { setAtlasInstancePosition } from "@/utils/plantAtlasBillboard";

export const PLANT_GROW_DURATION_MS = 6500;
export const PLANT_SHRINK_DURATION_MS = 6500;

const easeOutCubic = (t) => 1 - (1 - t) ** 3;

export const plantGrowFactor = (startedAt, now = performance.now()) => {
    if (!Number.isFinite(startedAt)) return 1;

    const progress = Math.min(1, (now - startedAt) / PLANT_GROW_DURATION_MS);
    return easeOutCubic(progress);
};

export const plantShrinkFactor = (
    { startedAt, initialGrow = 1 },
    now = performance.now()
) => {
    if (!Number.isFinite(startedAt)) return 0;

    const progress = Math.min(1, (now - startedAt) / PLANT_SHRINK_DURATION_MS);
    return initialGrow * (1 - easeOutCubic(progress));
};

const cameraRight = new THREE.Vector3();
const cameraUp = new THREE.Vector3();
const sortWorldPos = new THREE.Vector3();

export const splitCameraFollowPlants = (plants = []) => {
    const worldPlants = [];
    const followPlants = [];

    plants.forEach((plant) => {
        if (!plant?.text) return;

        if (plant.followsCamera) {
            followPlants.push(plant);
            return;
        }

        worldPlants.push(plant);
    });

    return { worldPlants, followPlants };
};

export const syncCameraFollowPlants = (
    plantRoot,
    camera,
    followPlants = [],
    logicalPosition = null,
    sampleGroundHeight = null
) => {
    if (!plantRoot || !camera || followPlants.length === 0) return;

    const followIds = new Set(followPlants.map((plant) => plant.id));
    const x = logicalPosition?.x ?? camera.position.x;
    const z = logicalPosition?.z ?? camera.position.z;

    plantRoot.traverse((child) => {
        if (!child.userData?.plantAtlas) return;

        const plantId = child.userData.plantId;
        if (!plantId || !followIds.has(plantId)) return;

        setAtlasInstancePosition(child, 0, x, z, sampleGroundHeight);
    });
};

const sortPlantBillboards = (plantRoot, camera) => {
    if (!plantRoot || !camera) return;

    const entries = [];

    plantRoot.traverse((child) => {
        if (!child.userData?.plantAtlas) return;

        child.getWorldPosition(sortWorldPos);
        const grow = child.material?.uniforms?.instanceGrow?.value ?? 1;
        const height = (child.material?.uniforms?.instanceScale?.value?.y ?? 0) * grow;
        sortWorldPos.y += height * 0.5;

        entries.push({
            child,
            distance: sortWorldPos.distanceToSquared(camera.position),
        });
    });

    entries.sort((left, right) => right.distance - left.distance);

    entries.forEach(({ child }, index) => {
        child.renderOrder = index;
    });
};

const updatePlantAtlases = (plantRoot, elapsed, camera) => {
    if (!camera) return;

    cameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    cameraUp.set(0, 1, 0).applyQuaternion(camera.quaternion);

    plantRoot.traverse((child) => {
        if (!child.userData?.plantAtlas) return;

        const uniforms = child.material?.uniforms;
        if (!uniforms) return;

        uniforms.time.value = elapsed;
        uniforms.cameraRight.value.copy(cameraRight);
        uniforms.cameraUp.value.copy(cameraUp);
    });
};

const completePlantShrink = (shrinkingPlants, plantId, shrinking) => {
    shrinkingPlants.delete(plantId);
    shrinking.onComplete?.();
};

const animatePlantTexture = (child, plantId, globalProgress) => {
    if (child.userData?.plantAtlas) {
        return updateAtlasPlantTexture(child, plantId, globalProgress);
    }

    if (child.userData?.plantId === plantId) {
        return updateSpritePlantTexture(child, globalProgress);
    }

    return false;
};

export const updatePlantGrow = (
    plantRoot,
    growingPlants,
    shrinkingPlants = null,
    now = performance.now()
) => {
    if (!plantRoot) return;
    if (!growingPlants?.size && !shrinkingPlants?.size) return;

    plantRoot.traverse((child) => {
        if (child.userData?.plantAtlas) {
            const plantId = child.userData.plantId;
            if (!plantId) return;

            const shrinking = shrinkingPlants?.get(plantId);
            if (shrinking) {
                const progress = Math.min(
                    1,
                    (now - shrinking.startedAt) / PLANT_SHRINK_DURATION_MS
                );
                const globalProgress = effectiveGrowProgressForShrink(
                    plantShrinkFactor(shrinking, now),
                    shrinking.initialGrow
                );
                animatePlantTexture(child, plantId, globalProgress);

                if (progress >= 1) {
                    completePlantShrink(shrinkingPlants, plantId, shrinking);
                }
                return;
            }

            const startedAt = growingPlants?.get(plantId);
            if (!startedAt) return;

            const globalProgress = plantGrowFactor(startedAt, now);
            const isComplete = globalProgress >= 1;
            animatePlantTexture(
                child,
                plantId,
                isComplete ? 1 : globalProgress
            );

            if (isComplete) {
                growingPlants.delete(plantId);
            }
            return;
        }

        const plantId = child.userData?.plantId;
        if (!plantId) return;

        const shrinking = shrinkingPlants?.get(plantId);
        if (shrinking) {
            const progress = Math.min(
                1,
                (now - shrinking.startedAt) / PLANT_SHRINK_DURATION_MS
            );
            const globalProgress = effectiveGrowProgressForShrink(
                plantShrinkFactor(shrinking, now),
                shrinking.initialGrow
            );
            animatePlantTexture(child, plantId, globalProgress);

            if (progress >= 1) {
                completePlantShrink(shrinkingPlants, plantId, shrinking);
            }
            return;
        }

        const startedAt = growingPlants?.get(plantId);
        if (!startedAt) return;

        const globalProgress = plantGrowFactor(startedAt, now);
        const isComplete = globalProgress >= 1;
        animatePlantTexture(child, plantId, isComplete ? 1 : globalProgress);

        if (isComplete) {
            growingPlants.delete(plantId);
        }
    });
};

const projectWorldToScreen = (worldPos, camera, target) => {
    target.copy(worldPos).project(camera);
    target.x = target.x * 0.5 + 0.5;
    target.y = target.y * 0.5 + 0.5;
    return target;
};

const plantSwayOffset = () => ({ x: 0, z: 0 });

const plantMotionHeight = (plant, growingPlants, shrinkingPlants) => {
    const plantId = plant.id;
    const shrinking = shrinkingPlants?.get(plantId);

    if (shrinking) {
        return 0.25 + plantShrinkFactor(shrinking) * 0.75;
    }

    const growingStartedAt = growingPlants?.get(plantId);
    if (growingStartedAt) {
        return 0.25 + plantGrowFactor(growingStartedAt) * 0.75;
    }

    return 0.85;
};

export const createPlantScreenMotionTracker = () => {
    const prevScreen = new Map();
    const worldPos = new THREE.Vector3();
    const screenPos = new THREE.Vector3();

    const reset = () => {
        prevScreen.clear();
    };

    const measure = (
        plants = [],
        camera,
        elapsed,
        { growingPlants = null, shrinkingPlants = null, plantScaleMultiplier = 1 } = {}
    ) => {
        if (!camera || plants.length === 0) {
            return { strength: 0, trailX: 0, trailY: 0 };
        }

        const activeIds = new Set([
            ...(growingPlants?.keys() ?? []),
            ...(shrinkingPlants?.keys() ?? []),
        ]);
        const animatingCount = activeIds.size;

        let weightedDx = 0;
        let weightedDy = 0;
        let weightSum = 0;
        let peakMotion = 0;
        const seenIds = new Set();

        plants.forEach((plant) => {
            const plantId = plant.id;
            if (!plantId || seenIds.has(plantId)) return;
            seenIds.add(plantId);

            const sway = plantSwayOffset(plant, elapsed, plantScaleMultiplier);
            worldPos.set(
                plant.x + sway.x,
                plantMotionHeight(plant, growingPlants, shrinkingPlants),
                plant.z + sway.z
            );
            projectWorldToScreen(worldPos, camera, screenPos);

            const prev = prevScreen.get(plantId);
            const weight = activeIds.has(plantId) ? 2.4 : 1;

            if (prev) {
                const dx = screenPos.x - prev.x;
                const dy = screenPos.y - prev.y;
                const motion = Math.hypot(dx, dy);

                weightedDx += dx * weight;
                weightedDy += dy * weight;
                weightSum += weight;
                peakMotion = Math.max(peakMotion, motion * weight);
            }

            prevScreen.set(plantId, {
                x: screenPos.x,
                y: screenPos.y,
            });
        });

        prevScreen.forEach((_, plantId) => {
            if (!seenIds.has(plantId)) {
                prevScreen.delete(plantId);
            }
        });

        const motionStrength = Math.min(1, peakMotion * 18);
        const animStrength = Math.min(1, animatingCount * 0.42);
        const strength = Math.min(1, motionStrength + animStrength);

        return {
            strength,
            trailX:
                weightSum > 0
                    ? THREE.MathUtils.clamp(weightedDx / weightSum, -0.05, 0.05)
                    : 0,
            trailY:
                weightSum > 0
                    ? THREE.MathUtils.clamp(weightedDy / weightSum, -0.05, 0.05)
                    : 0,
        };
    };

    return { measure, reset };
};

export const updatePlantSway = (
    plantRoot,
    elapsed,
    camera,
    growingPlants = null,
    shrinkingPlants = null
) => {
    if (!plantRoot) return;

    sortPlantBillboards(plantRoot, camera);
    updatePlantGrow(plantRoot, growingPlants, shrinkingPlants);
    updatePlantAtlases(plantRoot, elapsed, camera);
};
