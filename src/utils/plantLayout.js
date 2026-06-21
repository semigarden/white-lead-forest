import { placePlantNear } from "@/utils/plantBillboard";
import { hashString } from "@/utils/lSystem";

const DAY_MS = 86_400_000;

const daysBetween = (left, right) =>
    Math.abs((left || 0) - (right || 0)) / DAY_MS;

const yearKey = (plant) => {
    const date = new Date(plant.at || 0);
    return Number.isFinite(date.getTime()) ? String(date.getFullYear()) : "unknown";
};

const anchorScore = (plant, anchor) => {
    const gapDays = daysBetween(plant.at, anchor.at);
    return 1.2 / (gapDays + 1);
};

const findTimelineAnchor = (plant, placed) => {
    let bestAnchor = placed[0];
    let bestScore = anchorScore(plant, bestAnchor);

    placed.forEach((anchor) => {
        const score = anchorScore(plant, anchor);
        if (score > bestScore) {
            bestAnchor = anchor;
            bestScore = score;
        }
    });

    return bestAnchor;
};

const chronologicalPlants = (plants) =>
    [...plants].sort((left, right) => {
        const timeDelta = (left.at || 0) - (right.at || 0);
        if (timeDelta !== 0) return timeDelta;
        return left.id.localeCompare(right.id);
    });

const groupPlantsByYear = (plants) => {
    const groups = new Map();

    chronologicalPlants(plants).forEach((plant) => {
        const key = yearKey(plant);
        const group = groups.get(key) ?? [];
        group.push(plant);
        groups.set(key, group);
    });

    return [...groups.entries()].sort(([left], [right]) =>
        left.localeCompare(right)
    );
};

const estimateYearRadius = (plants) =>
    Math.max(5.5, Math.min(14, 3.2 + Math.sqrt(plants.length) * 2.2));

const buildYearAreas = (yearGroups) => {
    const ringGap = 1.2;
    const centers = new Map();
    let innerRadius = 0;

    yearGroups.forEach(([year, plants]) => {
        const thickness = estimateYearRadius(plants);
        const outerRadius = innerRadius + thickness;
        centers.set(year, {
            x: 0,
            z: 0,
            innerRadius,
            outerRadius,
            radius: thickness,
        });
        innerRadius = outerRadius + ringGap;
    });

    return centers;
};

const pointInYearArea = (area, index = 0, count = 1, plant = null) => {
    if (area.innerRadius === 0) {
        const hash = hashString(`${plant?.id ?? "core"}:core`);
        const radius = ((hash >> 8) % 1000) / 1000 * area.outerRadius * 0.72;
        const angle = ((hash >> 18) % 628) / 100;
        return {
            x: Math.cos(angle) * radius,
            z: Math.sin(angle) * radius,
        };
    }

    const hash = hashString(`${plant?.id ?? index}:ring`);
    const fraction = (index + 0.5) / Math.max(count, 1);
    const radiusUnit = 0.28 + (((hash >> 10) % 1000) / 1000) * 0.52;
    const radius =
        area.innerRadius + (area.outerRadius - area.innerRadius) * radiusUnit;
    const angle =
        fraction * Math.PI * 2 +
        (((hash >> 20) % 1000) / 1000 - 0.5) *
            (Math.PI * 0.42) /
            Math.max(count, 1);
    return {
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
    };
};

const clampToYearArea = (position, area) => {
    const dx = position.x;
    const dz = position.z;
    const distance = Math.hypot(dx, dz);
    const minDistance = area.innerRadius;
    const maxDistance = area.outerRadius;

    if (distance === 0) {
        return {
            ...position,
            ...pointInYearArea(area),
        };
    }

    if (distance >= minDistance && distance <= maxDistance) return position;

    const clamped = Math.max(minDistance, Math.min(maxDistance, distance));
    return {
        ...position,
        x: (dx / distance) * clamped,
        z: (dz / distance) * clamped,
    };
};

const buildUnifiedDateLayout = (plants) => {
    const yearGroups = groupPlantsByYear(plants);
    const yearCenters = buildYearAreas(yearGroups);
    const layoutById = new Map();
    const allPlaced = [];

    yearGroups.forEach(([year, yearPlants]) => {
        const center = yearCenters.get(year) ?? { x: 0, z: 0, innerRadius: 0 };
        const placed = [];

        yearPlants.forEach((plant, index) => {
            const target = pointInYearArea(
                center,
                index,
                yearPlants.length,
                plant
            );
            const placementContext = [...allPlaced.slice(-18), ...placed];
            const anchor =
                placed.length > 0
                    ? findTimelineAnchor(plant, placed)
                    : { ...plant, ...target };
            const candidate = placePlantNear(
                plant,
                placementContext.map((entry) => ({
                    id: entry.id,
                    text: entry.text,
                    x: entry.x,
                    z: entry.z,
                })),
                target
            );
            const gapDays = daysBetween(plant.at, anchor.at);
            const gapScale = 1 + Math.min(gapDays / 45, 1.6) * 0.18;
            const position = clampToYearArea(
                {
                    x: target.x + (candidate.x - target.x) * gapScale,
                    z: target.z + (candidate.z - target.z) * gapScale,
                    minSpacing: candidate.minSpacing,
                },
                center
            );

            layoutById.set(plant.id, position);
            placed.push({ ...plant, ...position });
            allPlaced.push({ ...plant, ...position });
        });
    });

    return layoutById;
};

export const layoutNewPlantByDate = (plant, existingPlants = []) => {
    const placedExisting = existingPlants.filter(
        (entry) => Number.isFinite(entry?.x) && Number.isFinite(entry?.z)
    );
    const allPlants = [...existingPlants, plant];
    const yearGroups = groupPlantsByYear(allPlants);
    const yearCenters = buildYearAreas(yearGroups);
    const year = yearKey(plant);
    const center = yearCenters.get(year) ?? {
        x: 0,
        z: 0,
        innerRadius: 0,
        outerRadius: 0,
    };
    const yearPlants =
        yearGroups.find(([key]) => key === year)?.[1] ?? [plant];
    const index = yearPlants.findIndex((entry) => entry.id === plant.id);
    const target = pointInYearArea(center, index, yearPlants.length, plant);

    const sameYearPlaced = chronologicalPlants(
        placedExisting.filter((entry) => yearKey(entry) === year)
    );

    const placementContext = [
        ...placedExisting.slice(-18),
        ...sameYearPlaced,
    ].map((entry) => ({
        id: entry.id,
        text: entry.text,
        x: entry.x,
        z: entry.z,
    }));

    const anchor =
        sameYearPlaced.length > 0
            ? findTimelineAnchor(plant, sameYearPlaced)
            : { ...plant, ...target };
    const candidate = placePlantNear(plant, placementContext, target);
    const gapDays = daysBetween(plant.at, anchor.at);
    const gapScale = 1 + Math.min(gapDays / 45, 1.6) * 0.18;

    return clampToYearArea(
        {
            x: target.x + (candidate.x - target.x) * gapScale,
            z: target.z + (candidate.z - target.z) * gapScale,
            minSpacing: candidate.minSpacing,
        },
        center
    );
};

export const buildDateBasedLayout = buildUnifiedDateLayout;
