import { hashString } from "@/utils/lSystem";
import {
    CHUNK_SIZE,
    chunkCoord,
    chunkKey,
    parseChunkKey,
    visibleChunkKeys,
    withChunkFields,
} from "@/utils/gardenChunks";
import {
    spacingBetweenPlants,
} from "@/utils/plantBillboard";
import {
    forestSpawnProbability,
    sampleForestDensity,
} from "@/utils/forestNoise";

export const PROCEDURAL_FOREST_SEED = "infinite-forest-v2";
export const PROCEDURAL_CELLS_PER_SIDE = 5;
export const PROCEDURAL_RENDER_RADIUS = 1;
export const PROCEDURAL_PREFETCH_DEPTH = 1;
export const PROCEDURAL_CACHE_RADIUS = PROCEDURAL_RENDER_RADIUS + 2;

export const DEFAULT_PROCEDURAL_FOREST_CONFIG = {
    worldSeed: PROCEDURAL_FOREST_SEED,
    visibleRadius: PROCEDURAL_RENDER_RADIUS,
    prefetchDepth: PROCEDURAL_PREFETCH_DEPTH,
    includeFlanks: true,
    cacheRadius: PROCEDURAL_CACHE_RADIUS,
    cellsPerSide: PROCEDURAL_CELLS_PER_SIDE,
    trackPlantMotion: false,
};

const FOREST_WORDS = [
    "forest",
    "memory",
    "signal",
    "root",
    "branch",
    "echo",
    "garden",
    "moon",
    "river",
    "stone",
    "light",
    "shadow",
    "growth",
    "pattern",
    "quiet",
    "bloom",
    "path",
    "wind",
    "seed",
    "canopy",
    "moss",
    "fern",
    "trail",
    "mist",
];

const hashUnit = (key) => hashString(key) / 0xffffffff;
const HEADING_BUCKET = Math.PI / 4;

const forwardChunkStep = (heading = 0) => {
    const stepX = Math.round(Math.sin(heading));
    const stepZ = Math.round(-Math.cos(heading));

    if (stepX === 0 && stepZ === 0) {
        return { stepX: 0, stepZ: -1 };
    }

    return { stepX, stepZ };
};

export const resolveMovementHeading = (view = {}, lastView = null) => {
    const dx = (view.x ?? 0) - (lastView?.x ?? view.x ?? 0);
    const dz = (view.z ?? 0) - (lastView?.z ?? view.z ?? 0);

    if (Math.hypot(dx, dz) > 0.35) {
        return Math.atan2(dx, -dz);
    }

    return Number.isFinite(view.yaw) ? view.yaw : 0;
};

export const movementSyncChunkKeys = (
    centerX,
    centerZ,
    heading = 0,
    { includeFlanks = true } = {}
) => {
    const { stepX, stepZ } = forwardChunkStep(heading);
    const keys = new Set([
        chunkKey(centerX, centerZ),
        chunkKey(centerX + stepX, centerZ + stepZ),
    ]);

    if (!includeFlanks) {
        return [...keys];
    }

    const perpX = stepZ;
    const perpZ = -stepX;

    keys.add(chunkKey(centerX + perpX, centerZ + perpZ));
    keys.add(chunkKey(centerX - perpX, centerZ - perpZ));
    keys.add(chunkKey(centerX + stepX + perpX, centerZ + stepZ + perpZ));
    keys.add(chunkKey(centerX + stepX - perpX, centerZ + stepZ - perpZ));

    return [...keys];
};

export const movementPrefetchChunkKeys = (
    centerX,
    centerZ,
    heading = 0,
    depth = 1,
    { includeFlanks = true } = {}
) => {
    const { stepX, stepZ } = forwardChunkStep(heading);
    const syncKeys = new Set(
        movementSyncChunkKeys(centerX, centerZ, heading, { includeFlanks })
    );
    const keys = [];

    for (let distance = 2; distance <= depth + 1; distance += 1) {
        const forwardKey = chunkKey(
            centerX + stepX * distance,
            centerZ + stepZ * distance
        );

        if (!syncKeys.has(forwardKey)) {
            keys.push(forwardKey);
        }

        if (!includeFlanks) continue;

        const perpX = stepZ;
        const perpZ = -stepX;
        const flankKeys = [
            chunkKey(
                centerX + stepX * distance + perpX,
                centerZ + stepZ * distance + perpZ
            ),
            chunkKey(
                centerX + stepX * distance - perpX,
                centerZ + stepZ * distance - perpZ
            ),
        ];

        flankKeys.forEach((key) => {
            if (!syncKeys.has(key)) {
                keys.push(key);
            }
        });
    }

    return keys;
};

export const headingBucket = (heading = 0) =>
    Math.round(heading / HEADING_BUCKET);

export const collectInitialChunkKeys = (view = {}, settings = {}) => {
    const merged = { ...DEFAULT_PROCEDURAL_FOREST_CONFIG, ...settings };
    const centerX = chunkCoord(view.x ?? 0);
    const centerZ = chunkCoord(view.z ?? 0);
    const heading = Number.isFinite(view.yaw)
        ? view.yaw
        : resolveMovementHeading(view, null);

    return [
        ...new Set([
            ...visibleChunkKeys(
                { x: view.x ?? 0, z: view.z ?? 0 },
                merged.cacheRadius
            ),
            ...movementSyncChunkKeys(centerX, centerZ, heading, {
                includeFlanks: merged.includeFlanks,
            }),
            ...movementPrefetchChunkKeys(
                centerX,
                centerZ,
                heading,
                merged.prefetchDepth,
                { includeFlanks: merged.includeFlanks }
            ),
        ]),
    ];
};

const createPlantSpatialIndex = () => {
    const byChunk = new Map();

    const setChunk = (key, plants = []) => {
        if (plants.length === 0) {
            byChunk.delete(key);
            return;
        }

        byChunk.set(key, plants);
    };

    const removeChunk = (key) => {
        byChunk.delete(key);
    };

    const queryNearby = (chunkX, chunkZ, marginChunks = 1) => {
        const results = [];

        for (let z = chunkZ - marginChunks; z <= chunkZ + marginChunks; z++) {
            for (let x = chunkX - marginChunks; x <= chunkX + marginChunks; x++) {
                results.push(...(byChunk.get(chunkKey(x, z)) ?? []));
            }
        }

        return results;
    };

    const clear = () => {
        byChunk.clear();
    };

    return { setChunk, removeChunk, queryNearby, clear };
};

export const proceduralPlantId = (chunkX, chunkZ, cellX, cellZ) =>
    `proc:${chunkX}:${chunkZ}:${cellX}:${cellZ}`;

export const proceduralPlantText = (
    plantId,
    worldSeed = PROCEDURAL_FOREST_SEED
) => {
    const hash = hashString(`${worldSeed}:text:${plantId}`);
    const wordA = FOREST_WORDS[hash % FOREST_WORDS.length];
    const wordB = FOREST_WORDS[(hash >> 8) % FOREST_WORDS.length];
    const wordC = FOREST_WORDS[(hash >> 16) % FOREST_WORDS.length];

    if (hash % 5 === 0) {
        return `${wordA} ${wordB}`;
    }

    if (hash % 3 === 0) {
        return `${wordA} ${wordC} ${wordB}`;
    }

    return wordA;
};

const hasSpacingConflict = (x, z, plant, existingPlants = []) => {
    for (const existing of existingPlants) {
        if (!Number.isFinite(existing?.x) || !Number.isFinite(existing?.z)) {
            continue;
        }

        const required = spacingBetweenPlants(plant, existing);
        const distance = Math.hypot(x - existing.x, z - existing.z);

        if (distance < required) {
            return true;
        }
    }

    return false;
};

export const collectNearbyPlants = (
    plants = [],
    chunkX,
    chunkZ,
    marginChunks = 1
) =>
    plants.filter((plant) => {
        if (!Number.isFinite(plant?.chunkX) || !Number.isFinite(plant?.chunkZ)) {
            return false;
        }

        return (
            Math.abs(plant.chunkX - chunkX) <= marginChunks &&
            Math.abs(plant.chunkZ - chunkZ) <= marginChunks
        );
    });

export const generateChunkPlants = (
    chunkX,
    chunkZ,
    existingPlants = [],
    {
        worldSeed = PROCEDURAL_FOREST_SEED,
        cellsPerSide = PROCEDURAL_CELLS_PER_SIDE,
    } = {}
) => {
    const chunkMinX = chunkX * CHUNK_SIZE;
    const chunkMinZ = chunkZ * CHUNK_SIZE;
    const cellSize = CHUNK_SIZE / cellsPerSide;
    const generated = [];

    for (let cellZ = 0; cellZ < cellsPerSide; cellZ += 1) {
        for (let cellX = 0; cellX < cellsPerSide; cellX += 1) {
            const baseX = chunkMinX + (cellX + 0.5) * cellSize;
            const baseZ = chunkMinZ + (cellZ + 0.5) * cellSize;
            const cellHash = hashString(
                `${worldSeed}:cell:${chunkX}:${chunkZ}:${cellX}:${cellZ}`
            );
            const jitterX =
                ((cellHash & 0xffff) / 0xffff - 0.5) * cellSize * 0.82;
            const jitterZ =
                (((cellHash >> 16) & 0xffff) / 0xffff - 0.5) * cellSize * 0.82;
            const x = baseX + jitterX;
            const z = baseZ + jitterZ;
            const density = sampleForestDensity(x, z, worldSeed);
            const spawnChance = forestSpawnProbability(density);
            if (spawnChance <= 0) continue;

            const spawnRoll = hashUnit(
                `${worldSeed}:spawn:${chunkX}:${chunkZ}:${cellX}:${cellZ}`
            );
            if (spawnRoll > spawnChance) continue;

            const id = proceduralPlantId(chunkX, chunkZ, cellX, cellZ);
            const plant = {
                id,
                text: proceduralPlantText(id, worldSeed),
                at: cellHash,
                procedural: true,
            };

            const spacingContext = [...existingPlants, ...generated];
            if (hasSpacingConflict(x, z, plant, spacingContext)) continue;

            generated.push(
                withChunkFields({
                    ...plant,
                    x,
                    z,
                })
            );
        }
    }

    return generated;
};

export const createProceduralForestManager = (config = {}) => {
    const settings = { ...DEFAULT_PROCEDURAL_FOREST_CONFIG, ...config };
    const chunkCache = new Map();
    const spatialIndex = createPlantSpatialIndex();
    let prefetchHandle = null;
    let lastCenterKey = null;
    let lastHeadingBucket = null;
    let lastView = null;
    let onChunksChanged = null;

    const loadChunk = (chunkX, chunkZ, authoredPlants = []) => {
        const key = chunkKey(chunkX, chunkZ);
        if (chunkCache.has(key)) {
            return chunkCache.get(key);
        }

        const nearby = [
            ...collectNearbyPlants(authoredPlants, chunkX, chunkZ, 1),
            ...spatialIndex.queryNearby(chunkX, chunkZ, 1),
        ];
        const generated = generateChunkPlants(chunkX, chunkZ, nearby, {
            worldSeed: settings.worldSeed,
            cellsPerSide: settings.cellsPerSide,
        });

        chunkCache.set(key, generated);
        spatialIndex.setChunk(key, generated);
        return generated;
    };

    const prune = (centerX, centerZ) => {
        chunkCache.forEach((_, key) => {
            const { chunkX, chunkZ } = parseChunkKey(key);
            if (
                Math.abs(chunkX - centerX) <= settings.cacheRadius &&
                Math.abs(chunkZ - centerZ) <= settings.cacheRadius
            ) {
                return;
            }

            chunkCache.delete(key);
            spatialIndex.removeChunk(key);
        });
    };

    const schedulePrefetch = (
        centerX,
        centerZ,
        heading,
        authoredPlants = []
    ) => {
        const syncKeys = new Set(
            movementSyncChunkKeys(centerX, centerZ, heading, {
                includeFlanks: settings.includeFlanks,
            })
        );
        const movementKeys = movementPrefetchChunkKeys(
            centerX,
            centerZ,
            heading,
            settings.prefetchDepth,
            { includeFlanks: settings.includeFlanks }
        );
        const visibleKeys = [
            ...visibleChunkKeys(
                { x: centerX * CHUNK_SIZE, z: centerZ * CHUNK_SIZE },
                settings.visibleRadius
            ),
        ];
        const keysToPrefetch = [...new Set([...movementKeys, ...visibleKeys])].filter(
            (key) => !chunkCache.has(key) && !syncKeys.has(key)
        );

        if (prefetchHandle !== null) {
            cancelIdleCallback(prefetchHandle);
            prefetchHandle = null;
        }

        if (keysToPrefetch.length === 0) return;

        let index = 0;

        const processNext = (deadline) => {
            while (
                index < keysToPrefetch.length &&
                (deadline?.timeRemaining?.() ?? 8) > 1
            ) {
                const { chunkX, chunkZ } = parseChunkKey(keysToPrefetch[index]);
                index += 1;
                loadChunk(chunkX, chunkZ, authoredPlants);
            }

            if (index < keysToPrefetch.length) {
                prefetchHandle = requestIdleCallback(processNext, { timeout: 120 });
                return;
            }

            prefetchHandle = null;
            onChunksChanged?.();
        };

        prefetchHandle = requestIdleCallback(processNext, { timeout: 120 });
    };

    const sync = (view = { x: 0, z: 0 }, authoredPlants = []) => {
        const centerX = chunkCoord(view.x ?? 0);
        const centerZ = chunkCoord(view.z ?? 0);
        const centerKey = chunkKey(centerX, centerZ);
        const heading = resolveMovementHeading(view, lastView);
        const nextHeadingBucket = headingBucket(heading);
        const centerChanged = centerKey !== lastCenterKey;
        const headingChanged = nextHeadingBucket !== lastHeadingBucket;

        lastView = {
            x: view.x ?? 0,
            z: view.z ?? 0,
            yaw: Number.isFinite(view.yaw) ? view.yaw : heading,
        };
        lastCenterKey = centerKey;
        lastHeadingBucket = nextHeadingBucket;

        let loadedNew = false;

        movementSyncChunkKeys(centerX, centerZ, heading, {
            includeFlanks: settings.includeFlanks,
        }).forEach((key) => {
            if (chunkCache.has(key)) return;

            const { chunkX, chunkZ } = parseChunkKey(key);
            loadChunk(chunkX, chunkZ, authoredPlants);
            loadedNew = true;
        });

        prune(centerX, centerZ);

        if (centerChanged || headingChanged || loadedNew) {
            schedulePrefetch(centerX, centerZ, heading, authoredPlants);
        }

        return centerChanged || headingChanged || loadedNew;
    };

    const getChunkPlants = (key) => chunkCache.get(key) ?? [];

    const setOnChunksChanged = (callback) => {
        onChunksChanged = callback;
    };

    const warmupInitialChunks = async (
        view = { x: 0, z: 0 },
        authoredPlants = [],
        onProgress
    ) => {
        if (prefetchHandle !== null) {
            cancelIdleCallback(prefetchHandle);
            prefetchHandle = null;
        }

        const keys = collectInitialChunkKeys(view, settings);
        const total = Math.max(keys.length, 1);

        for (let index = 0; index < keys.length; index += 1) {
            const key = keys[index];
            if (!chunkCache.has(key)) {
                const { chunkX, chunkZ } = parseChunkKey(key);
                loadChunk(chunkX, chunkZ, authoredPlants);
            }

            onProgress?.((index + 1) / total);
            await new Promise((resolve) => setTimeout(resolve, 0));
        }

        const heading = Number.isFinite(view.yaw)
            ? view.yaw
            : resolveMovementHeading(view, null);
        const centerX = chunkCoord(view.x ?? 0);
        const centerZ = chunkCoord(view.z ?? 0);

        lastView = {
            x: view.x ?? 0,
            z: view.z ?? 0,
            yaw: heading,
        };
        lastCenterKey = chunkKey(centerX, centerZ);
        lastHeadingBucket = headingBucket(heading);

        if (prefetchHandle !== null) {
            cancelIdleCallback(prefetchHandle);
            prefetchHandle = null;
        }
    };

    const dispose = () => {
        if (prefetchHandle !== null) {
            cancelIdleCallback(prefetchHandle);
            prefetchHandle = null;
        }

        chunkCache.clear();
        spatialIndex.clear();
        lastCenterKey = null;
        lastHeadingBucket = null;
        lastView = null;
        onChunksChanged = null;
    };

    return {
        sync,
        getChunkPlants,
        loadChunk,
        warmupInitialChunks,
        setOnChunksChanged,
        dispose,
        settings,
    };
};
