import { useEffect, useRef, useState } from "react";
import ForestDarkControls from "@/components/ForestDarkControls";
import ForestExhaustControls from "@/components/ForestExhaustControls";
import ForestRiverSystem from "@/components/ForestRiverSystem";
import { createForestDarkSystem } from "@/utils/forestDark";
import { createForestExhaustSystem } from "@/utils/forestExhaust";
import { createForestRiverSystem } from "@/utils/forestRiver";
import { finiteNumber, initForestAudioUnlock } from "@/utils/forestAudio";
import { createForestCollisionSystem } from "@/utils/forestCollision";
import { createForestCollapseSystem } from "@/utils/forestCollapse";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createPlantAtlasBillboards } from "@/utils/plantAtlasBillboard";
import {
    createPlantScreenMotionTracker,
    plantGrowFactor,
    plantShrinkFactor,
    splitCameraFollowPlants,
    syncCameraFollowPlants,
    updatePlantSway,
} from "@/utils/plantMotion";
import { effectiveGrowProgressForShrink } from "@/utils/plantGrowth";
import { createGrassField } from "@/utils/grassField";
import {
    attachGardenWalkControls,
    attachScrollWalk,
} from "@/utils/gardenNavigation";
import {
    DEFAULT_VISIBLE_CHUNK_RADIUS,
    clampPointToBounds,
    computeAuthoredBounds,
    groupPlantsByChunk,
    visibleChunkKeys,
    chunkCoord,
} from "@/utils/gardenChunks";
import { createProceduralForestManager, collectInitialChunkKeys, DEFAULT_PROCEDURAL_FOREST_CONFIG, headingBucket } from "@/utils/proceduralForest";
import {
    createGardenComposer,
    FOREST_POST_PROCESSING_PRESET,
} from "@/utils/gardenPostProcessing";
import {
    createGardenRenderer,
    gardenPixelRatio,
    setGardenTextureRenderer,
} from "@/utils/gardenRenderer";
import { createGroundRipples } from "@/utils/groundRipples";
import { createForestTerrain } from "@/utils/forestTerrain";
import { createWorldOriginController } from "@/utils/worldOrigin";
import {
    createWalkPositionSaver,
    loadWalkPosition,
} from "@/api/walkPosition";

const SHOW_LOADING_SCREEN = true;
const SHOW_UI = false;

const disposeObject = (object) => {
    const disposeMaterial = (material) => {
        if (material.map) material.map.dispose();
        Object.values(material.uniforms ?? {}).forEach((uniform) => {
            if (uniform?.value?.isTexture) uniform.value.dispose();
        });
        material.dispose();
    };

    object.traverse((node) => {
        if (node.geometry) node.geometry.dispose();
        if (node.material) {
            if (Array.isArray(node.material)) {
                node.material.forEach(disposeMaterial);
            } else {
                disposeMaterial(node.material);
            }
        }
    });
};

const normalizePlants = (plants) =>
    Array.isArray(plants) ? plants.filter((plant) => plant?.text) : [];

const mergeShrinkingPlants = (plants, shrinkingPlants) => {
    const base = normalizePlants(plants);
    const baseIds = new Set(base.map((plant) => plant.id));
    const ghosts = [];

    shrinkingPlants.forEach((entry) => {
        const plant = entry.plant;
        if (plant?.id && !baseIds.has(plant.id)) {
            ghosts.push(plant);
        }
    });

    if (ghosts.length === 0) return base;

    return [...base, ...ghosts].sort((a, b) => a.id.localeCompare(b.id));
};

const computeMovementTerritory = (plants, movementBounds = null) => {
    if (movementBounds) {
        return { bounds: movementBounds };
    }

    return {
        bounds: computeAuthoredBounds(normalizePlants(plants)),
    };
};

const isWalkPositionInBounds = (position, bounds) =>
    position &&
    bounds &&
    position.x >= bounds.minX &&
    position.x <= bounds.maxX &&
    position.z >= bounds.minZ &&
    position.z <= bounds.maxZ;

const resolveProceduralForestConfig = (value) => {
    if (!value || value.enabled === false) return null;
    if (value === true) return { ...DEFAULT_PROCEDURAL_FOREST_CONFIG };
    return { ...DEFAULT_PROCEDURAL_FOREST_CONFIG, ...value };
};

const plantPosition = (plant) => ({
    x: Number.isFinite(plant?.x) ? plant.x : 0,
    z: Number.isFinite(plant?.z) ? plant.z : 0,
});

const createChunkContent = ({
    plants,
    getInitialGrow = () => 1,
    plantScaleMultiplier = 1,
    sampleGroundHeight = null,
}) => {
    const gardenPlants = normalizePlants(plants);
    const group = new THREE.Group();
    const plantGroup = new THREE.Group();
    const positions = gardenPlants.map(plantPosition);

    plantGroup.add(
        createPlantAtlasBillboards(gardenPlants, {
            getInitialGrow,
            plantScaleMultiplier,
            sampleGroundHeight,
        })
    );
    group.add(plantGroup);

    const grass = createGrassField(gardenPlants, positions, {
        includeBaseGrass: false,
        sampleGroundHeight,
    });
    group.add(grass);

    return group;
};

const computeDesiredChunkKeys = ({
    plants,
    authoredChunks = null,
    cameraPosition,
    chunkRadius = DEFAULT_VISIBLE_CHUNK_RADIUS,
    proceduralForest = null,
}) => {
    const chunks = authoredChunks ?? groupPlantsByChunk(plants);
    const visibleKeys = visibleChunkKeys(cameraPosition, chunkRadius);
    const desiredKeys = new Set();

    visibleKeys.forEach((key) => {
        const authored = chunks.get(key) ?? [];
        const procedural = proceduralForest?.getChunkPlants(key) ?? [];

        if (proceduralForest) {
            if (authored.length > 0 || procedural.length > 0) {
                desiredKeys.add(key);
            }
            return;
        }

        if (authored.length > 0) {
            desiredKeys.add(key);
        }
    });

    return { chunks, desiredKeys };
};

const pruneStalePlantChunks = ({
    plantRoot,
    loadedChunks,
    desiredKeys,
}) => {
    loadedChunks.forEach((chunk, key) => {
        if (desiredKeys.has(key)) return;

        plantRoot.remove(chunk.group);
        disposeObject(chunk.group);
        loadedChunks.delete(key);
    });
};

const buildPlantChunk = ({
    key,
    plantRoot,
    loadedChunks,
    chunks,
    proceduralForest = null,
    getInitialGrow = () => 1,
    plantScaleMultiplier = 1,
    sampleGroundHeight = null,
    onNewPlants = null,
}) => {
    const chunkPlants = [
        ...(chunks.get(key) ?? []),
        ...(proceduralForest?.getChunkPlants(key) ?? []),
    ];
    const existing = loadedChunks.get(key);
    const plantIds = `${plantScaleMultiplier}:${chunkPlants
        .map((plant) => plant.id)
        .join("|")}`;

    if (existing?.plantIds === plantIds) return false;

    if (existing) {
        plantRoot.remove(existing.group);
        disposeObject(existing.group);
        loadedChunks.delete(key);
    }

    onNewPlants?.(chunkPlants);

    const group = createChunkContent({
        plants: chunkPlants,
        getInitialGrow,
        plantScaleMultiplier,
        sampleGroundHeight,
    });
    plantRoot.add(group);
    loadedChunks.set(key, { group, plantIds });
    return true;
};

const chunkHasPlants = (key, chunks, proceduralForest) => {
    const authored = chunks.get(key) ?? [];
    const procedural = proceduralForest?.getChunkPlants(key) ?? [];

    if (proceduralForest) {
        return authored.length > 0 || procedural.length > 0;
    }

    return authored.length > 0;
};

const warmupPlantMeshes = async ({
    plantRoot,
    loadedChunks,
    plants,
    authoredChunks = null,
    cameraPosition,
    chunkRadius = DEFAULT_VISIBLE_CHUNK_RADIUS,
    chunkKeys = null,
    getInitialGrow = () => 1,
    plantScaleMultiplier = 1,
    proceduralForest = null,
    sampleGroundHeight = null,
    onNewPlants = null,
    onProgress,
    isCancelled = () => false,
}) => {
    if (!plantRoot) {
        onProgress?.(1);
        return;
    }

    const chunks = authoredChunks ?? groupPlantsByChunk(plants);
    let desiredKeys;

    if (chunkKeys) {
        desiredKeys = new Set(
            chunkKeys.filter((key) => chunkHasPlants(key, chunks, proceduralForest))
        );
    } else {
        ({ desiredKeys } = computeDesiredChunkKeys({
            plants,
            authoredChunks: chunks,
            cameraPosition,
            chunkRadius,
            proceduralForest,
        }));
    }

    pruneStalePlantChunks({ plantRoot, loadedChunks, desiredKeys });

    const pending = [...desiredKeys].filter((key) => {
        const chunkPlants = [
            ...(chunks.get(key) ?? []),
            ...(proceduralForest?.getChunkPlants(key) ?? []),
        ];
        const plantIds = `${plantScaleMultiplier}:${chunkPlants
            .map((plant) => plant.id)
            .join("|")}`;
        return loadedChunks.get(key)?.plantIds !== plantIds;
    });
    const total = Math.max(pending.length, 1);

    if (pending.length === 0) {
        onProgress?.(1);
        return;
    }

    for (let index = 0; index < pending.length; index += 1) {
        if (isCancelled()) return;

        buildPlantChunk({
            key: pending[index],
            plantRoot,
            loadedChunks,
            chunks,
            proceduralForest,
            getInitialGrow,
            plantScaleMultiplier,
            sampleGroundHeight,
            onNewPlants,
        });
        onProgress?.((index + 1) / total);
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
};

const syncPlantChunks = ({
    plantRoot,
    loadedChunks,
    plants,
    authoredChunks = null,
    cameraPosition,
    chunkRadius = DEFAULT_VISIBLE_CHUNK_RADIUS,
    getInitialGrow = () => 1,
    plantScaleMultiplier = 1,
    proceduralForest = null,
    sampleGroundHeight = null,
    onNewPlants = null,
}) => {
    if (!plantRoot) return;

    const { chunks, desiredKeys } = computeDesiredChunkKeys({
        plants,
        authoredChunks,
        cameraPosition,
        chunkRadius,
        proceduralForest,
    });

    pruneStalePlantChunks({ plantRoot, loadedChunks, desiredKeys });

    desiredKeys.forEach((key) => {
        buildPlantChunk({
            key,
            plantRoot,
            loadedChunks,
            chunks,
            proceduralForest,
            getInitialGrow,
            plantScaleMultiplier,
            sampleGroundHeight,
            onNewPlants,
        });
    });
};

const syncFollowPlants = ({
    followRoot,
    followState,
    followPlants,
    getInitialGrow = () => 1,
    plantScaleMultiplier = 1,
    sampleGroundHeight = null,
}) => {
    if (!followRoot || !followState) return;

    const plantKey = `${plantScaleMultiplier}:${followPlants
        .map((plant) => `${plant.id}:${plant.text}`)
        .join("|")}`;

    if (followState.plantKey === plantKey && followState.group) return;

    if (followState.group) {
        followRoot.remove(followState.group);
        disposeObject(followState.group);
        followState.group = null;
    }

    followState.plantKey = plantKey;

    if (followPlants.length === 0) return;

    const group = createChunkContent({
        plants: followPlants,
        getInitialGrow,
        plantScaleMultiplier,
        sampleGroundHeight,
    });

    group.traverse((child) => {
        if (child.isMesh || child.isSprite) {
            child.renderOrder = 10000;
        }
    });

    followRoot.add(group);
    followState.group = group;
};

const Forest = ({
    plants = [],
    interactive = true,
    cameraOffset = { x: 0, y: 7, z: 11 },
    cameraTarget = { x: 0, y: 2.5, z: 0 },
    minDistance = 3,
    maxDistance = 32,
    scrollWalk = true,
    walkSpeed = 0.004,
    walkNavigation = false,
    unboundedMovement = false,
    walkPositionKey = "forest",
    movementBounds = null,
    plantScaleMultiplier = 1,
    visibleChunkRadius = DEFAULT_VISIBLE_CHUNK_RADIUS,
    onWalkStateChange = null,
    forestActionsRef = null,
    postProcessingPreset = null,
    postProcessingRef = null,
    proceduralForest = null,
}) => {
    const mountRef = useRef(null);
    const sceneRef = useRef(null);
    const cameraRef = useRef(null);
    const plantRootRef = useRef(null);
    const followPlantRootRef = useRef(null);
    const followPlantStateRef = useRef({ plantKey: null, group: null });
    const loadedChunksRef = useRef(new Map());
    const authoredChunksRef = useRef(new Map());
    const proceduralForestRef = useRef(null);
    const worldOriginRef = useRef(null);
    const walkStateRef = useRef(null);
    const needsChunkSyncRef = useRef(true);
    const lastSyncChunkRef = useRef(null);
    const lastSyncHeadingRef = useRef(null);
    const trackPlantMotionRef = useRef(true);
    const movementTerritoryRef = useRef(
        computeMovementTerritory(plants, movementBounds)
    );
    const plantsRef = useRef(plants);
    const plantScaleMultiplierRef = useRef(plantScaleMultiplier);
    const visibleChunkRadiusRef = useRef(visibleChunkRadius);
    const knownPlantIdsRef = useRef(new Set());
    const growingPlantsRef = useRef(new Map());
    const shrinkingPlantsRef = useRef(new Map());
    const plantMotionTrackerRef = useRef(createPlantScreenMotionTracker());
    const hasInitializedPlantsRef = useRef(false);
    const initialLoadCompleteRef = useRef(false);
    const darkSystemRef = useRef(null);
    const exhaustSystemRef = useRef(null);
    const riverSystemRef = useRef(null);
    const riverSystemMetricsRef = useRef(null);
    const collisionSystemRef = useRef(null);
    const sampleGroundHeightRef = useRef(null);
    const [ready, setReady] = useState(false);
    const [loadProgress, setLoadProgress] = useState(0);
    const [darkAmount, setDarkAmount] = useState(0);
    const [exhaustAmount, setExhaustAmount] = useState(0);

    const getPlantMotionFactor = (plant) => {
        const shrinking = shrinkingPlantsRef.current.get(plant.id);
        if (shrinking) {
            return effectiveGrowProgressForShrink(
                plantShrinkFactor(shrinking),
                shrinking.initialGrow
            );
        }

        const startedAt = growingPlantsRef.current.get(plant.id);
        return startedAt ? plantGrowFactor(startedAt) : 1;
    };

    const getInitialGrow = (plant) => getPlantMotionFactor(plant);

    const getRenderablePlants = () =>
        mergeShrinkingPlants(
            plantsRef.current,
            shrinkingPlantsRef.current
        );

    const getScenePlantSets = () => {
        const renderable = normalizePlants(getRenderablePlants());
        return splitCameraFollowPlants(renderable);
    };

    const registerNewChunkPlants = (chunkPlants) => {
        chunkPlants.forEach((plant) => {
            if (!plant?.id || knownPlantIdsRef.current.has(plant.id)) return;

            if (hasInitializedPlantsRef.current && !plant.procedural) {
                growingPlantsRef.current.set(plant.id, performance.now());
            }

            knownPlantIdsRef.current.add(plant.id);
        });
    };

    const runChunkSync = () => {
        const plantRoot = plantRootRef.current;
        const camera = cameraRef.current;
        const worldOrigin = worldOriginRef.current;
        if (!plantRoot || !camera) return;

        const manager = proceduralForestRef.current;
        const authored = normalizePlants(plantsRef.current);
        const walkState = walkStateRef.current;
        let yaw = walkState?.yaw;

        const logicalCamera =
            walkState &&
            Number.isFinite(walkState.x) &&
            Number.isFinite(walkState.z)
                ? { x: walkState.x, z: walkState.z }
                : worldOrigin?.getLogicalXZ(
                      camera.position.x,
                      camera.position.z
                  ) ?? { x: camera.position.x, z: camera.position.z };

        if (!Number.isFinite(yaw) && camera) {
            const euler = new THREE.Euler().setFromQuaternion(
                camera.quaternion,
                "YXZ"
            );
            yaw = euler.y;
        }

        if (manager) {
            manager.sync(
                {
                    x: logicalCamera.x,
                    z: logicalCamera.z,
                    yaw,
                },
                authored
            );
        }

        const { worldPlants, followPlants } = getScenePlantSets();
        const renderChunkRadius =
            manager?.settings?.visibleRadius ?? visibleChunkRadiusRef.current;

        syncPlantChunks({
            plantRoot,
            loadedChunks: loadedChunksRef.current,
            plants: worldPlants,
            authoredChunks: authoredChunksRef.current,
            cameraPosition: logicalCamera,
            chunkRadius: renderChunkRadius,
            getInitialGrow,
            plantScaleMultiplier: plantScaleMultiplierRef.current,
            proceduralForest: manager,
            sampleGroundHeight: sampleGroundHeightRef.current,
            onNewPlants: registerNewChunkPlants,
        });
        syncFollowPlants({
            followRoot: followPlantRootRef.current,
            followState: followPlantStateRef.current,
            followPlants,
            getInitialGrow,
            plantScaleMultiplier: plantScaleMultiplierRef.current,
            sampleGroundHeight: sampleGroundHeightRef.current,
        });
        syncCameraFollowPlants(
            followPlantRootRef.current,
            camera,
            followPlants,
            logicalCamera,
            sampleGroundHeightRef.current
        );

        lastSyncChunkRef.current = `${chunkCoord(logicalCamera.x)}:${chunkCoord(logicalCamera.z)}`;
        lastSyncHeadingRef.current = headingBucket(yaw ?? 0);
        needsChunkSyncRef.current = false;

        collisionSystemRef.current?.syncChunks({
            position: logicalCamera,
            radius: renderChunkRadius + 1,
            authoredChunks: authoredChunksRef.current,
            proceduralForest: manager,
        });
    };

    plantsRef.current = plants;
    plantScaleMultiplierRef.current = plantScaleMultiplier;
    visibleChunkRadiusRef.current = visibleChunkRadius;
    authoredChunksRef.current = groupPlantsByChunk(normalizePlants(plants));
    const proceduralForestConfig = resolveProceduralForestConfig(proceduralForest);
    trackPlantMotionRef.current = proceduralForestConfig
        ? Boolean(proceduralForestConfig.trackPlantMotion)
        : true;
    movementTerritoryRef.current = computeMovementTerritory(
        plants,
        movementBounds
    );

    useEffect(() => {
        const mount = mountRef.current;
        if (!mount) return;

        let cancelled = false;
        let cleanup = () => {};

        setReady(false);
        setLoadProgress(0);
        initialLoadCompleteRef.current = false;
        hasInitializedPlantsRef.current = false;
        growingPlantsRef.current.clear();

        const setupScene = async () => {
        const loadedPosition = walkNavigation
            ? await loadWalkPosition(walkPositionKey)
            : null;
        const savedPosition =
            movementBounds &&
            loadedPosition &&
            !isWalkPositionInBounds(loadedPosition, movementBounds)
                ? null
                : loadedPosition;
        if (cancelled) return;

        setLoadProgress(0.05);

        const positionSaver = walkNavigation
            ? createWalkPositionSaver(450, walkPositionKey)
            : null;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xffffff);
        scene.fog = new THREE.Fog(0xffffff, 32, 80);

        const worldOrigin = createWorldOriginController();
        worldOriginRef.current = worldOrigin;
        scene.add(worldOrigin.anchor);

        const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
        camera.position.set(cameraOffset.x, cameraOffset.y, cameraOffset.z);
        cameraRef.current = camera;
        initForestAudioUnlock(camera);

        const renderer = createGardenRenderer();
        renderer.setPixelRatio(gardenPixelRatio());
        setGardenTextureRenderer(renderer);
        mount.appendChild(renderer.domElement);

        const postProcessing = createGardenComposer(
            renderer,
            scene,
            camera,
            postProcessingPreset ?? undefined
        );
        if (postProcessingRef) {
            postProcessingRef.current = postProcessing.effects;
        }

        let controls = null;
        let walkControls = null;
        let detachScrollWalk = null;
        const collisionSystem = createForestCollisionSystem();
        collisionSystemRef.current = collisionSystem;

        const terrain = createForestTerrain();
        sampleGroundHeightRef.current = terrain.sampleHeight;
        terrain.updateForOrigin(
            worldOrigin.origin.x,
            worldOrigin.origin.z
        );
        worldOrigin.anchor.add(terrain.mesh);

        const constrainPosition = (state, motion) => {
            if (!unboundedMovement) {
                clampPointToBounds(state, movementTerritoryRef.current.bounds);
            }
            return collisionSystem.constrainPosition(state, motion);
        };
        const handleWalkPositionChange = (state) => {
            walkStateRef.current = state;
            positionSaver?.schedule(state);
            onWalkStateChange?.(state);
        };

        if (walkNavigation) {
            walkControls = attachGardenWalkControls({
                camera,
                domElement: renderer.domElement,
                cameraY: cameraOffset.y,
                sampleGroundHeight: terrain.sampleHeight,
                groundMeshes: [terrain.mesh],
                worldAnchor: worldOrigin.anchor,
                initialOffset: cameraOffset,
                lookTarget: cameraTarget,
                groundLookTarget: cameraTarget,
                savedState: savedPosition,
                onPositionChange: handleWalkPositionChange,
                constrainPosition,
                enabled: interactive,
                pinchSpeed: walkSpeed * 3.5,
                worldOrigin: worldOrigin.origin,
            });

            if (scrollWalk) {
                detachScrollWalk = attachScrollWalk({
                    camera,
                    domElement: renderer.domElement,
                    speed: walkSpeed,
                    onMove: (move) => {
                        walkControls.cancelMoveTarget?.();
                        const state = walkControls.getState();
                        state.x += move.x;
                        state.z += move.z;
                        if (!walkControls.applyPositionConstraint?.()) {
                            walkControls.applyCamera();
                        }
                    },
                });
            }
        } else {
            controls = new OrbitControls(camera, renderer.domElement);
            controls.enabled = interactive;
            controls.enableDamping = true;
            controls.dampingFactor = 0.06;
            controls.rotateSpeed = -0.8;
            controls.enablePan = true;
            controls.screenSpacePanning = true;
            controls.minDistance = minDistance;
            controls.maxDistance = maxDistance;
            controls.enableZoom = !scrollWalk;
            controls.target.set(cameraTarget.x, cameraTarget.y, cameraTarget.z);

            if (scrollWalk) {
                const target = controls.target;
                detachScrollWalk = attachScrollWalk({
                    camera,
                    domElement: renderer.domElement,
                    speed: walkSpeed,
                    onMove: (move) => {
                        camera.position.add(move);
                        target.add(move);

                        if (!unboundedMovement) {
                            clampPointToBounds(
                                camera.position,
                                movementTerritoryRef.current.bounds
                            );
                            clampPointToBounds(
                                target,
                                movementTerritoryRef.current.bounds
                            );
                        }
                    },
                });
            }
        }

        const darkSystem = createForestDarkSystem({
            scene,
            camera,
            fog: scene.fog,
            groundMaterial: terrain.mesh.material,
            composer: postProcessing.composer,
            bloomPass: postProcessing.bloomPass,
            glitchPass: postProcessing.glitchPass,
            onAmountChange: setDarkAmount,
        });
        darkSystemRef.current = darkSystem;

        const exhaustSystem = createForestExhaustSystem({
            camera,
            warpPass: postProcessing.warpPass,
            warpRipple: FOREST_POST_PROCESSING_PRESET.warpRipple,
            warpSwirl: FOREST_POST_PROCESSING_PRESET.warpSwirl,
            onAmountChange: setExhaustAmount,
        });
        exhaustSystemRef.current = exhaustSystem;

        const groundRipples = createGroundRipples(
            walkNavigation ? worldOrigin.anchor : scene,
            {
                unbounded: unboundedMovement,
                sampleGroundHeight: terrain.sampleHeight,
                walkTrail: walkNavigation,
                ambientRipples: !walkNavigation,
            }
        );

        const sceneLight = new THREE.Group();
        const keyLight = new THREE.DirectionalLight(0x505050, 0.62);
        keyLight.position.set(16, 42, -24);
        keyLight.target.position.set(0, 0, 0);
        sceneLight.add(keyLight);
        sceneLight.add(keyLight.target);
        sceneLight.add(new THREE.AmbientLight(0x181818, 0.28));
        scene.add(sceneLight);

        sceneRef.current = scene;

        const plantRoot = new THREE.Group();
        const followPlantRoot = new THREE.Group();
        worldOrigin.anchor.add(plantRoot);
        worldOrigin.anchor.add(followPlantRoot);
        plantRootRef.current = plantRoot;
        followPlantRootRef.current = followPlantRoot;

        let manager = null;
        if (proceduralForestConfig) {
            manager = createProceduralForestManager(proceduralForestConfig);
            proceduralForestRef.current = manager;
            manager.setOnChunksChanged(() => {
                if (initialLoadCompleteRef.current) {
                    needsChunkSyncRef.current = true;
                }
            });
        } else {
            proceduralForestRef.current = null;
        }

        const walkState = walkControls?.getState?.() ?? walkStateRef.current;
        if (worldOrigin.rebaseIfNeeded(camera, controls?.target)) {
            terrain.updateForOrigin(worldOrigin.origin.x, worldOrigin.origin.z);
        }
        const initialView = {
            x: walkState?.x ?? worldOrigin.getLogicalXZ(camera.position.x, camera.position.z).x,
            z: walkState?.z ?? worldOrigin.getLogicalXZ(camera.position.x, camera.position.z).z,
            yaw: walkState?.yaw ?? 0,
        };
        const spawnState = walkControls?.getState?.()
            ? {
                  x: walkControls.getState().x,
                  z: walkControls.getState().z,
                  yaw: walkControls.getState().y,
                  pitch: walkControls.getState().pitch,
              }
            : {
                  x: initialView.x,
                  z: initialView.z,
                  yaw: initialView.yaw,
                  pitch: 0,
              };

        const collapseSystem = createForestCollapseSystem({
            mount,
            getDarkAmount: () => darkSystem.getAmount(),
            darkSystem,
            exhaustSystem,
            walkControls,
            worldOrigin,
            terrain,
            groundRipples,
            positionSaver,
            getSpawnState: () => spawnState,
            onReset: (spawn) => {
                walkStateRef.current = spawn;
                setDarkAmount(0);
                setExhaustAmount(0);
                needsChunkSyncRef.current = true;
            },
            runChunkSync,
        });

        const riverSystem = createForestRiverSystem({
            camera,
            anchor: worldOrigin.anchor,
            originX: initialView.x,
            originZ: initialView.z,
            sampleGroundHeight: terrain.sampleHeight,
        });
        riverSystemRef.current = riverSystem;
        riverSystem.syncWorldOrigin(worldOrigin.origin);

        const initialChunkKeys = manager
            ? collectInitialChunkKeys(initialView, manager.settings)
            : null;

        if (manager) {
            await manager.warmupInitialChunks(
                initialView,
                normalizePlants(plantsRef.current),
                (progress) => {
                    if (!cancelled) {
                        setLoadProgress(0.05 + progress * 0.45);
                    }
                }
            );
        } else if (!cancelled) {
            setLoadProgress(0.5);
        }
        if (cancelled) return;

        const { worldPlants, followPlants } = getScenePlantSets();
        const renderChunkRadius =
            manager?.settings?.visibleRadius ?? visibleChunkRadiusRef.current;

        await warmupPlantMeshes({
            plantRoot,
            loadedChunks: loadedChunksRef.current,
            plants: worldPlants,
            authoredChunks: authoredChunksRef.current,
            cameraPosition: initialView,
            chunkRadius: renderChunkRadius,
            chunkKeys: initialChunkKeys,
            getInitialGrow,
            plantScaleMultiplier: plantScaleMultiplierRef.current,
            proceduralForest: manager,
            sampleGroundHeight: terrain.sampleHeight,
            onNewPlants: registerNewChunkPlants,
            onProgress: (progress) => {
                if (!cancelled) {
                    setLoadProgress(0.5 + progress * 0.5);
                }
            },
            isCancelled: () => cancelled,
        });
        if (cancelled) return;

        syncFollowPlants({
            followRoot: followPlantRoot,
            followState: followPlantStateRef.current,
            followPlants,
            getInitialGrow,
            plantScaleMultiplier: plantScaleMultiplierRef.current,
            sampleGroundHeight: terrain.sampleHeight,
        });
        syncCameraFollowPlants(
            followPlantRoot,
            camera,
            followPlants,
            initialView,
            terrain.sampleHeight
        );

        lastSyncChunkRef.current = `${chunkCoord(initialView.x)}:${chunkCoord(initialView.z)}`;
        lastSyncHeadingRef.current = headingBucket(initialView.yaw);
        needsChunkSyncRef.current = false;

        const resize = () => {
            const width = mount.clientWidth;
            const height = mount.clientHeight;
            if (!width || !height) return;

            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            postProcessing.resize(width, height);
            walkControls?.onViewportResize?.();
        };

        const timer = new THREE.Timer();
        timer.connect(document);
        let frame = 0;
        const animate = (timestamp) => {
            frame = requestAnimationFrame(animate);
            timer.update(timestamp);
            controls?.update();
            const delta = timer.getDelta();
            const elapsed = timer.getElapsed();
            walkControls?.update(delta);
            collapseSystem.update(delta);
            const collapsing = collapseSystem.isActive();
            if (worldOrigin.rebaseIfNeeded(camera, controls?.target)) {
                terrain.updateForOrigin(
                    worldOrigin.origin.x,
                    worldOrigin.origin.z
                );
                walkControls?.onWorldRebase?.();
            }
            riverSystem.syncWorldOrigin(worldOrigin.origin);

            const logicalCamera = worldOrigin.getLogicalXZ(
                camera.position.x,
                camera.position.z
            );
            const playerX = finiteNumber(logicalCamera.x);
            const playerZ = finiteNumber(logicalCamera.z);

            riverSystemMetricsRef.current = riverSystem.updateNavigation(
                playerX,
                playerZ,
                camera
            );

            if (!collapsing) {
                darkSystem.updateProximity(
                    delta,
                    riverSystemMetricsRef.current?.distance ??
                        Number.POSITIVE_INFINITY
                );
            }

            const chunkCenter = `${chunkCoord(logicalCamera.x)}:${chunkCoord(logicalCamera.z)}`;
            const nextHeadingBucket = proceduralForestRef.current
                ? headingBucket(walkStateRef.current?.yaw ?? 0)
                : null;
            if (
                needsChunkSyncRef.current ||
                chunkCenter !== lastSyncChunkRef.current ||
                (nextHeadingBucket !== null &&
                    nextHeadingBucket !== lastSyncHeadingRef.current)
            ) {
                runChunkSync();
            }

            updatePlantSway(
                plantRoot,
                elapsed,
                camera,
                growingPlantsRef.current,
                shrinkingPlantsRef.current
            );
            updatePlantSway(
                followPlantRootRef.current,
                elapsed,
                camera,
                growingPlantsRef.current,
                shrinkingPlantsRef.current
            );
            const plantMotion = trackPlantMotionRef.current
                ? plantMotionTrackerRef.current.measure(
                      getScenePlantSets().worldPlants,
                      camera,
                      elapsed,
                      {
                          growingPlants: growingPlantsRef.current,
                          shrinkingPlants: shrinkingPlantsRef.current,
                          plantScaleMultiplier: plantScaleMultiplierRef.current,
                      }
                  )
                : { strength: 0, trailX: 0, trailY: 0 };
            if (!collapsing) {
                groundRipples.update(elapsed, camera, logicalCamera);
                exhaustSystem.updateMovement(
                    delta,
                    logicalCamera.x,
                    logicalCamera.z
                );
            }
            postProcessing.update(elapsed, { plants: plantMotion });
            exhaustSystem.applyFrame(elapsed);
            postProcessing.composer.render();
        };

        const resizeObserver = new ResizeObserver(() => resize());
        resizeObserver.observe(mount);
        requestAnimationFrame(() => resize());

        const onPageHide = () => {
            positionSaver?.flush();
        };

        window.addEventListener("pagehide", onPageHide);

        if (forestActionsRef) {
            forestActionsRef.current = {
                lookAt: (x, y, z, duration) => {
                    walkControls?.startLookAt?.(x, y, z, duration);
                },
                shrinkPlant: (plant, onComplete) => {
                    const plantId = plant?.id;
                    if (!plantId || shrinkingPlantsRef.current.has(plantId)) {
                        return;
                    }

                    let initialGrow = 1;
                    const growingStartedAt =
                        growingPlantsRef.current.get(plantId);
                    if (growingStartedAt) {
                        initialGrow = plantGrowFactor(growingStartedAt);
                        growingPlantsRef.current.delete(plantId);
                    }

                    shrinkingPlantsRef.current.set(plantId, {
                        plant,
                        startedAt: performance.now(),
                        initialGrow,
                        onComplete,
                    });
                },
            };
        }

        initialLoadCompleteRef.current = true;
        hasInitializedPlantsRef.current = true;
        growingPlantsRef.current.clear();
        setLoadProgress(1);
        setReady(true);
        animate();

        cleanup = () => {
            initialLoadCompleteRef.current = false;
            hasInitializedPlantsRef.current = false;
            growingPlantsRef.current.clear();
            setReady(false);
            setLoadProgress(0);
            if (forestActionsRef) {
                forestActionsRef.current = null;
            }
            window.removeEventListener("pagehide", onPageHide);
            positionSaver?.flush();
            timer.dispose();
            cancelAnimationFrame(frame);
            resizeObserver.disconnect();
            detachScrollWalk?.();
            walkControls?.dispose();
            controls?.dispose();
            loadedChunksRef.current.forEach((chunk) => {
                plantRoot.remove(chunk.group);
                disposeObject(chunk.group);
            });
            loadedChunksRef.current.clear();
            proceduralForestRef.current?.dispose();
            proceduralForestRef.current = null;
            worldOriginRef.current = null;
            if (followPlantStateRef.current.group) {
                followPlantRoot?.remove(followPlantStateRef.current.group);
                disposeObject(followPlantStateRef.current.group);
                followPlantStateRef.current.group = null;
                followPlantStateRef.current.plantKey = null;
            }
            groundRipples.dispose();
            collapseSystem.dispose();
            terrain.dispose();
            collisionSystem.dispose();
            darkSystem.dispose();
            exhaustSystem.dispose();
            riverSystem.dispose();
            darkSystemRef.current = null;
            exhaustSystemRef.current = null;
            riverSystemRef.current = null;
            collisionSystemRef.current = null;
            sampleGroundHeightRef.current = null;
            scene.remove(sceneLight);
            disposeObject(scene);
            if (postProcessingRef) {
                postProcessingRef.current = null;
            }
            postProcessing.dispose();
            renderer.dispose();
            sceneRef.current = null;
            cameraRef.current = null;
            plantRootRef.current = null;
            followPlantRootRef.current = null;
            setGardenTextureRenderer(null);
            if (mount.contains(renderer.domElement)) {
                mount.removeChild(renderer.domElement);
            }
        };
        };

        setupScene();

        return () => {
            cancelled = true;
            cleanup();
        };
    }, [
        interactive,
        scrollWalk,
        walkSpeed,
        walkNavigation,
        unboundedMovement,
        cameraOffset.x,
        cameraOffset.y,
        cameraOffset.z,
        cameraTarget.x,
        cameraTarget.y,
        cameraTarget.z,
        minDistance,
        maxDistance,
        walkPositionKey,
        movementBounds?.minX,
        movementBounds?.maxX,
        movementBounds?.minZ,
        movementBounds?.maxZ,
        plantScaleMultiplier,
        visibleChunkRadius,
        onWalkStateChange,
        forestActionsRef,
        postProcessingPreset,
        postProcessingRef,
        proceduralForest,
    ]);

    useEffect(() => {
        movementTerritoryRef.current = computeMovementTerritory(
            plants,
            movementBounds
        );

        const currentPlantIds = new Set(
            normalizePlants(plants).map((plant) => plant.id)
        );

        knownPlantIdsRef.current.forEach((plantId) => {
            if (currentPlantIds.has(plantId)) return;

            knownPlantIdsRef.current.delete(plantId);
            growingPlantsRef.current.delete(plantId);
        });

        normalizePlants(plants).forEach((plant) => {
            if (plant.followsCamera) return;
            if (knownPlantIdsRef.current.has(plant.id)) return;

            if (hasInitializedPlantsRef.current && !plant.procedural) {
                growingPlantsRef.current.set(plant.id, performance.now());
            }

            knownPlantIdsRef.current.add(plant.id);
        });

        if (!initialLoadCompleteRef.current) return;

        plantMotionTrackerRef.current.reset();
        needsChunkSyncRef.current = true;
        runChunkSync();
    }, [plants, movementBounds]);

    return (
        <div
            className={`forest${
                ready || !SHOW_LOADING_SCREEN ? " forest--ready" : ""
            }`}
        >
            <div ref={mountRef} className="canvas" />
            {SHOW_LOADING_SCREEN && !ready && (
                <div className="forest-loader" aria-busy="true" aria-live="polite">
                    <div className="forest-loader__content">
                        <p className="forest-loader__label">Loading...</p>
                        <div
                            className="forest-loader__track"
                            role="progressbar"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={Math.round(loadProgress * 100)}
                        >
                            <div
                                className="forest-loader__bar"
                                style={{ width: `${Math.round(loadProgress * 100)}%` }}
                            />
                        </div>
                    </div>
                </div>
            )}
            {SHOW_UI && (
                <>
                    <ForestRiverSystem
                        metricsRef={riverSystemMetricsRef}
                        ready={ready}
                    />
                    <div
                        className={`forest-controls${
                            ready ? " forest-controls--ready" : ""
                        }`}
                    >
                        <ForestExhaustControls value={exhaustAmount} ready={ready} />
                        <ForestDarkControls value={darkAmount} ready={ready} />
                    </div>
                </>
            )}
        </div>
    );
};

export default Forest;
