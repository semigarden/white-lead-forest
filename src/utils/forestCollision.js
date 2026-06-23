import {
    chunkCoord,
    chunkKey,
    visibleChunkKeys,
} from "@/utils/gardenChunks";
import { plantCollisionRadius } from "@/utils/plantBillboard";

const DEFAULT_CONFIG = {
    playerRadius: 0.5,
    queryChunkMargin: 1,
    resolveIterations: 4,
    blockThreshold: 0.04,
    radiusScale: 1,
};

const plantToObstacle = (plant, options) => {
    if (!Number.isFinite(plant?.x) || !Number.isFinite(plant?.z)) {
        return null;
    }

    return {
        x: plant.x,
        z: plant.z,
        r:
            plantCollisionRadius(plant.text, plant.id ?? plant.text) *
            options.radiusScale,
    };
};

const collidesAt = (x, z, obstacles, playerRadius) => {
    for (const obstacle of obstacles) {
        const distance = Math.hypot(x - obstacle.x, z - obstacle.z);
        if (distance < playerRadius + obstacle.r - 0.001) {
            return true;
        }
    }

    return false;
};

const resolveOverlaps = (x, z, obstacles, playerRadius, iterations) => {
    let px = x;
    let pz = z;

    for (let iteration = 0; iteration < iterations; iteration += 1) {
        for (const obstacle of obstacles) {
            const dx = px - obstacle.x;
            const dz = pz - obstacle.z;
            const distSq = dx * dx + dz * dz;
            const minDist = playerRadius + obstacle.r;

            if (distSq >= minDist * minDist) continue;

            const distance = Math.sqrt(distSq) || 0.0001;
            const push = (minDist - distance) / distance;
            px += dx * push;
            pz += dz * push;
        }
    }

    return { x: px, z: pz };
};

const slideMovement = (
    fromX,
    fromZ,
    dx,
    dz,
    obstacles,
    playerRadius,
    options
) => {
    let x = fromX;
    let z = fromZ;

    const tryX = resolveOverlaps(
        fromX + dx,
        z,
        obstacles,
        playerRadius,
        options.resolveIterations
    );
    if (!collidesAt(tryX.x, tryX.z, obstacles, playerRadius)) {
        x = tryX.x;
        z = tryX.z;
    }

    const tryZ = resolveOverlaps(
        x,
        z + dz,
        obstacles,
        playerRadius,
        options.resolveIterations
    );
    if (!collidesAt(tryZ.x, tryZ.z, obstacles, playerRadius)) {
        x = tryZ.x;
        z = tryZ.z;
    }

    return resolveOverlaps(
        x,
        z,
        obstacles,
        playerRadius,
        options.resolveIterations
    );
};

export const createForestCollisionSystem = (config = {}) => {
    const options = { ...DEFAULT_CONFIG, ...config };
    const obstaclesByChunk = new Map();

    const setChunkObstacles = (key, plants = []) => {
        const obstacles = plants
            .map((plant) => plantToObstacle(plant, options))
            .filter(Boolean);

        if (obstacles.length > 0) {
            obstaclesByChunk.set(key, obstacles);
            return;
        }

        obstaclesByChunk.delete(key);
    };

    const clear = () => {
        obstaclesByChunk.clear();
    };

    const queryNearby = (x, z) => {
        const centerX = chunkCoord(x);
        const centerZ = chunkCoord(z);
        const margin = options.queryChunkMargin;
        const results = [];

        for (let chunkZ = centerZ - margin; chunkZ <= centerZ + margin; chunkZ += 1) {
            for (
                let chunkX = centerX - margin;
                chunkX <= centerX + margin;
                chunkX += 1
            ) {
                const chunk = obstaclesByChunk.get(chunkKey(chunkX, chunkZ));
                if (chunk) {
                    results.push(...chunk);
                }
            }
        }

        return results;
    };

    const syncChunks = ({
        position = { x: 0, z: 0 },
        radius = 2,
        authoredChunks = null,
        proceduralForest = null,
    } = {}) => {
        const keys = visibleChunkKeys(position, radius);
        const nextKeys = new Set(keys);

        obstaclesByChunk.forEach((_, key) => {
            if (!nextKeys.has(key)) {
                obstaclesByChunk.delete(key);
            }
        });

        keys.forEach((key) => {
            const plants = [
                ...(authoredChunks?.get(key) ?? []),
                ...(proceduralForest?.getChunkPlants(key) ?? []),
            ];
            setChunkObstacles(key, plants);
        });
    };

    const constrainPosition = (state, motion = null) => {
        const obstacles = queryNearby(state.x, state.z);
        if (obstacles.length === 0) return false;

        const intendedX = state.x;
        const intendedZ = state.z;
        const playerRadius = options.playerRadius;

        if (motion && (motion.dx !== 0 || motion.dz !== 0)) {
            const fromX = state.x - motion.dx;
            const fromZ = state.z - motion.dz;
            const resolved = slideMovement(
                fromX,
                fromZ,
                motion.dx,
                motion.dz,
                obstacles,
                playerRadius,
                options
            );
            state.x = resolved.x;
            state.z = resolved.z;
        } else {
            const resolved = resolveOverlaps(
                state.x,
                state.z,
                obstacles,
                playerRadius,
                options.resolveIterations
            );
            state.x = resolved.x;
            state.z = resolved.z;
        }

        if (!motion) return false;

        return (
            Math.hypot(state.x - intendedX, state.z - intendedZ) >
            options.blockThreshold
        );
    };

    return {
        syncChunks,
        constrainPosition,
        clear,
        dispose: clear,
    };
};
