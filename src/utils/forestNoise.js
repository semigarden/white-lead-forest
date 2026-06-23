import { hashString } from "@/utils/lSystem";

const clamp01 = (value) => Math.max(0, Math.min(1, value));

const lerp = (a, b, t) => a + (b - a) * t;

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

const hashUnit = (key) => hashString(key) / 0xffffffff;

const grad2 = (hash, x, z) => {
    const h = hash & 7;
    const u = h < 4 ? x : z;
    const v = h < 4 ? z : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
};

const perlin2D = (x, z, seed) => {
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const xf = x - x0;
    const zf = z - z0;

    const n00 = grad2(Math.floor(hashUnit(`${seed}:${x0}:${z0}`) * 8), xf, zf);
    const n10 = grad2(
        Math.floor(hashUnit(`${seed}:${x0 + 1}:${z0}`) * 8),
        xf - 1,
        zf
    );
    const n01 = grad2(
        Math.floor(hashUnit(`${seed}:${x0}:${z0 + 1}`) * 8),
        xf,
        zf - 1
    );
    const n11 = grad2(
        Math.floor(hashUnit(`${seed}:${x0 + 1}:${z0 + 1}`) * 8),
        xf - 1,
        zf - 1
    );

    const u = fade(xf);
    const v = fade(zf);

    return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v);
};

export const fbm2D = (
    x,
    z,
    seed,
    { octaves = 4, lacunarity = 2, gain = 0.5 } = {}
) => {
    let sum = 0;
    let amplitude = 1;
    let frequency = 1;
    let norm = 0;

    for (let index = 0; index < octaves; index += 1) {
        sum += perlin2D(x * frequency, z * frequency, `${seed}:${index}`) * amplitude;
        norm += amplitude;
        amplitude *= gain;
        frequency *= lacunarity;
    }

    return norm > 0 ? sum / norm : 0;
};

const toUnit = (value) => clamp01(value * 0.5 + 0.5);

const smoothstep = (edge0, edge1, value) => {
    const t = clamp01((value - edge0) / Math.max(edge1 - edge0, 0.0001));
    return t * t * (3 - 2 * t);
};

export const sampleForestDensity = (x, z, seed = "forest-density") => {
    const warp = fbm2D(x * 0.011, z * 0.011, `${seed}:warp`, {
        octaves: 3,
        gain: 0.55,
    });
    const warpAngle = warp * Math.PI * 2;
    const warpStrength = 5 + toUnit(warp) * 9;
    const wx = x + Math.cos(warpAngle) * warpStrength;
    const wz = z + Math.sin(warpAngle) * warpStrength;

    const biome = toUnit(
        fbm2D(wx * 0.022, wz * 0.022, `${seed}:biome`, {
            octaves: 4,
            gain: 0.52,
        })
    );
    const local = toUnit(
        fbm2D(wx * 0.06, wz * 0.06, `${seed}:local`, {
            octaves: 3,
            gain: 0.5,
        })
    );
    const detail = toUnit(
        fbm2D(wx * 0.13, wz * 0.13, `${seed}:detail`, {
            octaves: 2,
            gain: 0.45,
        })
    );

    const forestMask = smoothstep(0.24, 0.5, biome);
    const cluster = local * 0.68 + detail * 0.32;

    return clamp01(forestMask * (0.28 + cluster * 0.72));
};

export const forestSpawnProbability = (density) => {
    if (density < 0.1) return 0;

    const normalized = (density - 0.1) / 0.9;
    return normalized * normalized * (0.78 + normalized * 0.22);
};
