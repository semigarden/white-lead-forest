export const CHUNK_SIZE = 24;
export const DEFAULT_VISIBLE_CHUNK_RADIUS = 2;
export const AUTHORED_BOUNDS_MARGIN = 18;

export const chunkCoord = (value) => Math.floor(value / CHUNK_SIZE);

export const chunkKey = (chunkX, chunkZ) => `${chunkX}:${chunkZ}`;

export const parseChunkKey = (key) => {
    const [chunkX, chunkZ] = String(key).split(":").map(Number);
    return { chunkX, chunkZ };
};

export const withChunkFields = (plant) => {
    const x = Number.isFinite(plant?.x) ? plant.x : 0;
    const z = Number.isFinite(plant?.z) ? plant.z : 0;
    const chunkX = chunkCoord(x);
    const chunkZ = chunkCoord(z);

    return {
        ...plant,
        x,
        z,
        chunkX,
        chunkZ,
    };
};

export const groupPlantsByChunk = (plants = []) => {
    const groups = new Map();

    plants.forEach((plant) => {
        if (!plant?.text) return;

        const spatialPlant = withChunkFields(plant);
        const key = chunkKey(spatialPlant.chunkX, spatialPlant.chunkZ);
        const group = groups.get(key) ?? [];
        group.push(spatialPlant);
        groups.set(key, group);
    });

    return groups;
};

export const visibleChunkKeys = (
    position = { x: 0, z: 0 },
    radius = DEFAULT_VISIBLE_CHUNK_RADIUS
) => {
    const centerX = chunkCoord(position.x ?? 0);
    const centerZ = chunkCoord(position.z ?? 0);
    const keys = new Set();

    for (let z = centerZ - radius; z <= centerZ + radius; z++) {
        for (let x = centerX - radius; x <= centerX + radius; x++) {
            keys.add(chunkKey(x, z));
        }
    }

    return keys;
};

export const computeAuthoredBounds = (
    plants = [],
    margin = AUTHORED_BOUNDS_MARGIN
) => {
    const spatialPlants = plants.filter(
        (plant) => Number.isFinite(plant?.x) && Number.isFinite(plant?.z)
    );

    if (spatialPlants.length === 0) {
        return {
            minX: -margin,
            maxX: margin,
            minZ: -margin,
            maxZ: margin,
        };
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    spatialPlants.forEach((plant) => {
        minX = Math.min(minX, plant.x);
        maxX = Math.max(maxX, plant.x);
        minZ = Math.min(minZ, plant.z);
        maxZ = Math.max(maxZ, plant.z);
    });

    return {
        minX: minX - margin,
        maxX: maxX + margin,
        minZ: minZ - margin,
        maxZ: maxZ + margin,
    };
};

export const clampPointToBounds = (point, bounds) => {
    if (!bounds) return point;

    point.x = Math.max(bounds.minX, Math.min(bounds.maxX, point.x));
    point.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, point.z));
    return point;
};
