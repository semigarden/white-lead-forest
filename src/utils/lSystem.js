const PRESETS = [
    {
        axiom: "F",
        rules: { F: "F[+F]F[-F]F" },
        angle: 25,
    },
    {
        axiom: "F",
        rules: { F: "F[+F]F[-F][F]" },
        angle: 22,
    },
    {
        axiom: "X",
        rules: { X: "F+[[X]-X]-F[-FX]+X", F: "FF" },
        angle: 22,
    },
    {
        axiom: "F",
        rules: { F: "FF-[-F+F+F]+[+F-F-F]" },
        angle: 18,
    },
    {
        axiom: "F",
        rules: { F: "F[+F]F[-F+F]" },
        angle: 28,
    },
    {
        axiom: "F",
        rules: { F: "F[+F][-F]FF" },
        angle: 19,
    },
    {
        axiom: "F",
        rules: { F: "FF+[+F-F-F]-[-F+F+F]" },
        angle: 16,
    },
    {
        axiom: "X",
        rules: { X: "F[+X]F[-X]+X", F: "FF" },
        angle: 24,
    },
    {
        axiom: "X",
        rules: { X: "F[-X][X]F[-X]+FX", F: "FF" },
        angle: 21,
    },
    {
        axiom: "F",
        rules: { F: "F[+F]F[-F]F[+F][-F]" },
        angle: 32,
    },
    {
        axiom: "F",
        rules: { F: "F[+F-F]F[-F+F]" },
        angle: 35,
    },
    {
        axiom: "X",
        rules: { X: "F+[[X]-X]-F[-FX]+X", F: "F" },
        angle: 29,
    },
    {
        axiom: "F",
        rules: { F: "FF[+F][-F][++F][--F]" },
        angle: 14,
    },
];

const MAX_INSTRUCTIONS = 12000;
const SAFE_FALLBACK_PRESET = 0;
const FOREST_CANDIDATE_ATTEMPTS = 12;
const FOREST_PRESET_BIAS = [0, 1, 4, 6, 7, 8, 9, 2, 3, 5, 10, 11];

export const hashString = (text) => {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
};

export const expandLSystem = (axiom, rules, iterations) => {
    let current = axiom;
    for (let i = 0; i < iterations; i++) {
        let next = "";
        for (const symbol of current) {
            next += rules[symbol] ?? symbol;
            if (next.length > MAX_INSTRUCTIONS) return next.slice(0, MAX_INSTRUCTIONS);
        }
        current = next;
    }
    return current;
};

export const interpretLSystem = (instructions, angleStep, segmentLength) => {
    const segments = [];
    const stack = [];
    let x = 0;
    let y = 0;
    let angle = -90;
    let depth = 0;

    for (const symbol of instructions) {
        if (symbol === "F") {
            const radians = (angle * Math.PI) / 180;
            const nx = x + Math.cos(radians) * segmentLength;
            const ny = y + Math.sin(radians) * segmentLength;
            segments.push({ x1: x, y1: y, x2: nx, y2: ny, depth });
            x = nx;
            y = ny;
        } else if (symbol === "+") {
            angle += angleStep;
        } else if (symbol === "-") {
            angle -= angleStep;
        } else if (symbol === "[") {
            stack.push({ x, y, angle, depth });
            depth += 1;
        } else if (symbol === "]") {
            const state = stack.pop();
            if (!state) continue;
            x = state.x;
            y = state.y;
            angle = state.angle;
            depth = state.depth;
        }
    }

    return segments;
};

export const normalizeSegments = (segments, padding = 8) => {
    if (segments.length === 0) {
        return {
            segments: [],
            viewBox: `0 0 40 40`,
            width: 40,
            height: 40,
        };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    segments.forEach((segment) => {
        minX = Math.min(minX, segment.x1, segment.x2);
        minY = Math.min(minY, segment.y1, segment.y2);
        maxX = Math.max(maxX, segment.x1, segment.x2);
        maxY = Math.max(maxY, segment.y1, segment.y2);
    });

    const width = maxX - minX + padding * 2;
    const height = maxY - minY + padding * 2;
    const offsetX = minX - padding;
    const offsetY = minY - padding;

    const normalized = segments.map((segment) => ({
        ...segment,
        x1: segment.x1 - offsetX,
        y1: segment.y1 - offsetY,
        x2: segment.x2 - offsetX,
        y2: segment.y2 - offsetY,
    }));

    return {
        segments: normalized,
        viewBox: `0 0 ${width} ${height}`,
        width,
        height,
        rootX: -offsetX,
        rootY: -offsetY,
    };
};

const segmentBounds = (segments) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    segments.forEach((segment) => {
        minX = Math.min(minX, segment.x1, segment.x2);
        minY = Math.min(minY, segment.y1, segment.y2);
        maxX = Math.max(maxX, segment.x1, segment.x2);
        maxY = Math.max(maxY, segment.y1, segment.y2);
    });

    return {
        minX,
        minY,
        maxX,
        maxY,
        width: maxX - minX,
        height: maxY - minY,
    };
};

const isQualityForestPlant = (plant) => {
    const segments = plant.segments ?? [];
    if (segments.length < 12) return false;
    if (plant.height < 28) return false;

    const aspect = plant.width / Math.max(plant.height, 1);
    if (aspect > 1.45 || aspect < 0.22) return false;

    const rootDepth = plant.rootY / Math.max(plant.height, 1);
    if (rootDepth < 0.58) return false;

    const trunkSegments = segments.filter((segment) => segment.depth === 0);
    if (trunkSegments.length < 2) return false;

    const highestTrunkY = trunkSegments.reduce(
        (top, segment) => Math.min(top, segment.y1, segment.y2),
        plant.rootY
    );
    const trunkReach = plant.rootY - highestTrunkY;
    if (trunkReach < plant.height * 0.28) return false;

    const branchSegments = segments.filter((segment) => segment.depth >= 1);
    const forkSegments = segments.filter((segment) => segment.depth >= 2);
    const maxDepth = segments.reduce(
        (deepest, segment) => Math.max(deepest, segment.depth),
        0
    );

    if (branchSegments.length < 8) return false;
    if (forkSegments.length < 4) return false;
    if (maxDepth < 3) return false;

    const segmentDensity = segments.length / Math.max(plant.height, 1);
    if (segmentDensity > 1.75) return false;

    const lowerBandY = plant.rootY - plant.height * 0.38;
    const lowerSegments = segments.filter(
        (segment) => Math.max(segment.y1, segment.y2) >= lowerBandY
    );
    const lowerBounds = segmentBounds(lowerSegments);
    const lowerSpreadRatio = lowerBounds.width / Math.max(plant.height, 1);
    if (lowerSpreadRatio > 0.68) return false;

    const crownSegments = segments.filter(
        (segment) => Math.min(segment.y1, segment.y2) <= plant.rootY - plant.height * 0.42
    );
    const crownBounds = segmentBounds(crownSegments);
    const crownSpreadRatio = crownBounds.width / Math.max(plant.height, 1);
    if (crownSpreadRatio > 1.05) return false;

    const trunkMass = trunkSegments.length / segments.length;
    if (trunkMass > 0.42 && aspect > 0.95) return false;

    return true;
};

const forestCandidateParams = (text, seed, phenotype, attempt) => {
    const hash = hashString(`${text}:${seed}:forest:${attempt}`);
    const presetIndex =
        phenotype?.presetIndex != null && attempt === 0
            ? phenotype.presetIndex % PRESETS.length
            : FOREST_PRESET_BIAS[hash % FOREST_PRESET_BIAS.length];
    const iterations =
        phenotype?.iterations != null && attempt === 0
            ? phenotype.iterations
            : 3 + ((hash >> 3) % 2);
    const angleJitter =
        phenotype?.angleJitter != null && attempt === 0
            ? phenotype.angleJitter
            : ((hash >> 6) % 15) - 7;
    const segmentLength =
        phenotype?.segmentLength != null && attempt === 0
            ? phenotype.segmentLength
            : 5 + ((hash >> 10) % 4);

    return {
        presetIndex,
        iterations,
        angleJitter,
        segmentLength: Math.min(8, Math.max(4.5, segmentLength)),
    };
};

const buildPlantFromPreset = ({
    text,
    seed,
    phenotype,
    presetIndex,
    iterations,
    angleJitter,
    segmentLength,
}) => {
    const hash = hashString(`${text}:${seed}`);
    const preset = PRESETS[presetIndex % PRESETS.length];
    const angle =
        preset.angle +
        (angleJitter ?? ((hash >> 4) % 11) - 5);
    const instructions = expandLSystem(preset.axiom, preset.rules, iterations);
    const segments = interpretLSystem(instructions, angle, segmentLength);
    const normalized = normalizeSegments(segments);

    return {
        ...normalized,
        hash,
        iterations,
        angle,
        phenotype,
    };
};

export const textToPlant = (text, seed = "", phenotype = null) => {
    const hash = hashString(`${text}:${seed}`);

    for (let attempt = 0; attempt < FOREST_CANDIDATE_ATTEMPTS; attempt++) {
        const params = forestCandidateParams(text, seed, phenotype, attempt);
        const candidate = buildPlantFromPreset({
            text,
            seed: `${seed}:${attempt}`,
            phenotype,
            ...params,
        });

        if (isQualityForestPlant(candidate)) {
            return candidate;
        }
    }

    const fallbackPresets = [0, 4, 6, 8, 1, 7];
    for (const presetIndex of fallbackPresets) {
        for (const iterations of [3, 4]) {
            const candidate = buildPlantFromPreset({
                text,
                seed: `${seed}:fallback:${presetIndex}:${iterations}`,
                phenotype,
                presetIndex,
                iterations,
                angleJitter: ((hash >> 4) % 7) - 3,
                segmentLength: 5.5 + (hash % 2),
            });

            if (isQualityForestPlant(candidate)) {
                return candidate;
            }
        }
    }

    return buildPlantFromPreset({
        text,
        seed: `${seed}:fallback`,
        phenotype,
        presetIndex: SAFE_FALLBACK_PRESET,
        iterations: 4,
        angleJitter: ((hash >> 4) % 7) - 3,
        segmentLength: 6,
    });
};
