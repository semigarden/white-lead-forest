import { hashString } from "@/utils/lSystem";
import {
    segmentStrokeColor,
    segmentStrokeWidth,
} from "@/utils/plantDraw";
import {
    buildSegmentSchedule,
    segmentProgressFromSchedule,
} from "@/utils/plantGrowth";
import { buildPlantPhenotype } from "@/utils/plantPhenotype";
import { bakeTreeToCanvas } from "@/utils/treeBake";
import {
    createTreeForPlant,
    treePresetForPlant,
    FOREST_PRESET_ASPECT,
    TREE_TARGET_WORLD_HEIGHT,
} from "@/utils/treePlant";
import { sampleForestDensity } from "@/utils/forestNoise";

const CANVAS_TARGET = 256;
const BASE_WORLD_HEIGHT = TREE_TARGET_WORLD_HEIGHT;
const FOREST_RADIUS = 34;
const CANDIDATE_COUNT = 42;
const TREE_CLEARANCE = 0.55;
const BILLBOARD_WIDTH_BOOST = 1.18;
const FOREST_DENSITY_SEED = "forest-density";
const PLAYER_PLACEMENT_RADIUS = 4.5;

export const plantWorldScale = (text, seed = "") => {
    const hash = hashString(`${text}:${seed}`);
    return 0.68 + ((hash >> 16) % 88) / 100;
};

const phenotypeStrokeColor = (segment, phenotype) => {
    if (!phenotype) return segmentStrokeColor(segment.depth);

    const depthLightness = Math.max(52, phenotype.lightness - segment.depth * 7);
    const opacity = Math.max(
        0.22,
        (0.95 - segment.depth * 0.12) * phenotype.opacityScale
    );
    const channel = Math.round(depthLightness * 2.55);

    return `rgba(${channel}, ${channel}, ${channel}, ${opacity})`;
};

export const drawPlantSegments = (
    context,
    plant,
    scale,
    { globalProgress = 1, segmentSchedule = null } = {}
) => {
    const schedule =
        segmentSchedule ?? buildSegmentSchedule(plant.segments ?? []);

    plant.segments.forEach((segment, index) => {
        const segmentProgress = segmentProgressFromSchedule(
            schedule[index],
            globalProgress
        );
        if (segmentProgress <= 0) return;

        context.strokeStyle = phenotypeStrokeColor(segment, plant.phenotype);
        context.lineWidth =
            segmentStrokeWidth(segment.depth) *
            (plant.phenotype?.strokeScale ?? 1) *
            scale;

        const x1 = segment.x1 * scale;
        const y1 = segment.y1 * scale;
        const x2 = segment.x2 * scale;
        const y2 = segment.y2 * scale;
        const drawX = x1 + (x2 - x1) * segmentProgress;
        const drawY = y1 + (y2 - y1) * segmentProgress;

        context.beginPath();
        context.moveTo(x1, y1);
        context.lineTo(drawX, drawY);
        context.stroke();
    });
};

export const renderPlantToCanvas = (
    plant,
    canvasTarget = CANVAS_TARGET,
    options = {}
) => {
    const canvas = document.createElement("canvas");
    const scale = canvasTarget / Math.max(plant.width, plant.height, 1);
    canvas.width = Math.max(1, Math.ceil(plant.width * scale));
    canvas.height = Math.max(1, Math.ceil(plant.height * scale));

    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.lineCap = "round";
    context.lineJoin = "round";

    drawPlantSegments(context, plant, scale, options);

    return canvas;
};

export const createPlantRenderAsset = (text, seed = "", options = {}) => {
    const phenotype = buildPlantPhenotype({
        text,
        id: seed,
        gardenId: options.gardenId,
        pubDate: options.pubDate,
        at: options.at,
    });
    const { tree, sizeScale, bounds } = createTreeForPlant(
        text,
        seed,
        phenotype
    );
    const baked = bakeTreeToCanvas(tree, bounds);

    return {
        canvas: baked.canvas,
        plant: {
            width: baked.width,
            height: baked.height,
            segments: [],
            phenotype,
        },
        segmentSchedule: [],
        canvasScale: 1,
        sizeScale,
        worldWidth: baked.worldWidth,
        worldHeight: baked.worldHeight,
        bakedTree: true,
    };
};

const clamp01 = (value) => Math.max(0, Math.min(1, value));

const hashUnit = (key) => hashString(key) / 0xffffffff;

const forestDensity = (x, z, seed) => {
    const density = sampleForestDensity(x, z, seed);
    const distance = Math.hypot(x, z) / FOREST_RADIUS;
    const edgeFalloff = 1 - Math.pow(clamp01(distance), 3);

    return clamp01(density * 0.88 + edgeFalloff * 0.12);
};

export const estimatePlantWorldSize = (text, seed = "") => {
    const sizeScale = plantWorldScale(text, seed);
    const worldHeight = BASE_WORLD_HEIGHT * sizeScale;
    const preset = treePresetForPlant(text, seed);
    const aspect = FOREST_PRESET_ASPECT[preset] ?? 0.7;
    const worldWidth = worldHeight * aspect * BILLBOARD_WIDTH_BOOST;

    return { worldHeight, worldWidth, sizeScale };
};

export const plantFootprintRadius = (text, seed = "") => {
    const { worldWidth, worldHeight } = estimatePlantWorldSize(text, seed);
    return Math.max(worldWidth * 0.5, worldHeight * 0.24);
};

export const plantCollisionRadius = (text, seed = "") => {
    const { worldHeight } = estimatePlantWorldSize(text, seed);
    return Math.max(0.7, Math.min(1.8, worldHeight * 0.095));
};

export const plantSpacingRadius = (text, seed = "") => {
    const { worldWidth, worldHeight } = estimatePlantWorldSize(text, seed);
    return Math.max(worldWidth * 0.2, worldHeight * 0.1);
};

export const spacingBetweenPlants = (left, right) =>
    plantSpacingRadius(left.text, left.id ?? left.text) +
    plantSpacingRadius(right.text, right.id ?? right.text) +
    TREE_CLEARANCE;

export const minSpacingForPlant = (plant) =>
    plantFootprintRadius(plant.text, plant.id ?? plant.text) * 2 + TREE_CLEARANCE;

const spacingScore = (candidate, positions) => {
    if (positions.length === 0) return 1;

    let nearestRatio = Infinity;
    let overlapPenalty = 0;

    positions.forEach((position) => {
        const required = spacingBetweenPlants(
            { text: candidate.text ?? "", id: candidate.id },
            { text: position.text ?? "", id: position.id }
        );
        const distance = Math.hypot(
            candidate.x - position.x,
            candidate.z - position.z
        );
        const ratio = distance / required;

        nearestRatio = Math.min(nearestRatio, ratio);
        if (ratio < 1) {
            overlapPenalty += (1 - ratio) * (1 - ratio);
        }
    });

    const tooIsolatedPenalty =
        nearestRatio > 2.8 ? (nearestRatio - 2.8) * 0.08 : 0;
    return (
        Math.min(nearestRatio, 1.4) * 0.9 -
        overlapPenalty * 7 -
        tooIsolatedPenalty
    );
};

const scoreAnchoredCandidate = (candidate, positions, anchor) => {
    const density = forestDensity(candidate.x, candidate.z, FOREST_DENSITY_SEED);
    const spacing = spacingScore(candidate, positions);
    const distanceFromAnchor = Math.hypot(
        candidate.x - anchor.x,
        candidate.z - anchor.z
    );

    return (
        density * 1.8 +
        spacing -
        distanceFromAnchor * 0.035 +
        candidate.jitter * 0.12
    );
};

export const placePlantNear = (
    plant,
    existingPlants = [],
    anchor = { x: 0, z: 0 }
) => {
    const positions = existingPlants
        .filter(
            (existingPlant) =>
                existingPlant?.id !== plant?.id &&
                Number.isFinite(existingPlant?.x) &&
                Number.isFinite(existingPlant?.z)
        )
        .map((existingPlant) => ({
            id: existingPlant.id,
            text: existingPlant.text,
            x: existingPlant.x,
            z: existingPlant.z,
            minSpacing: minSpacingForPlant(existingPlant),
        }));
    const safeAnchor = {
        x: Number.isFinite(anchor?.x) ? anchor.x : 0,
        z: Number.isFinite(anchor?.z) ? anchor.z : 0,
    };
    let bestCandidate = null;
    let bestScore = -Infinity;

    for (let index = 0; index < CANDIDATE_COUNT; index++) {
        const hash = hashString(`${plant.id ?? plant.text}:near:${index}`);
        const angle =
            ((hash >> 5) % 628) / 100 +
            (index / CANDIDATE_COUNT) * Math.PI * 2;
        const distance =
            0.9 + (((hash >> 13) % 1000) / 1000) * PLAYER_PLACEMENT_RADIUS;
        const candidate = {
            id: plant.id,
            text: plant.text,
            x: safeAnchor.x + Math.cos(angle) * distance,
            z: safeAnchor.z + Math.sin(angle) * distance,
            jitter: ((hash >> 23) % 1000) / 1000,
            minSpacing: minSpacingForPlant(plant),
        };
        const score = scoreAnchoredCandidate(candidate, positions, safeAnchor);

        if (!bestCandidate || score > bestScore) {
            bestCandidate = candidate;
            bestScore = score;
        }
    }

    return bestCandidate ?? {
        id: plant.id,
        text: plant.text,
        x: safeAnchor.x,
        z: safeAnchor.z,
        minSpacing: minSpacingForPlant(plant),
    };
};

export const sampleUnboundedForestDensity = (x, z, seed = FOREST_DENSITY_SEED) =>
    sampleForestDensity(x, z, seed);
