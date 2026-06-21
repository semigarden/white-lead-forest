import { createPlantRenderAsset } from "@/utils/plantBillboard";

const MAX_CACHE_SIZE = 640;
const cache = new Map();

export const getCachedPlantRenderAsset = (text, id, options = {}) => {
    const progress = options.renderOptions?.globalProgress ?? 1;
    const cacheKey = `${id}:${text}:${progress}`;

    if (cache.has(cacheKey)) {
        const asset = cache.get(cacheKey);
        cache.delete(cacheKey);
        cache.set(cacheKey, asset);
        return asset;
    }

    const asset = createPlantRenderAsset(text, id, options);
    cache.set(cacheKey, asset);

    if (cache.size > MAX_CACHE_SIZE) {
        const oldestKey = cache.keys().next().value;
        cache.delete(oldestKey);
    }

    return asset;
};
