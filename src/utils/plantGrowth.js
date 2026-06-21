const easeOutCubic = (t) => 1 - (1 - t) ** 3;

const clamp01 = (value) => Math.max(0, Math.min(1, value));

export const buildSegmentSchedule = (segments = []) => {
    if (segments.length === 0) return [];

    const maxDepth = Math.max(...segments.map((segment) => segment.depth));
    const depthSegmentCounts = new Array(maxDepth + 1).fill(0);

    segments.forEach((segment) => {
        depthSegmentCounts[segment.depth] += 1;
    });

    const depthIndices = new Array(segments.length);
    const depthSeen = new Array(maxDepth + 1).fill(0);

    segments.forEach((segment, index) => {
        depthIndices[index] = depthSeen[segment.depth]++;
    });

    const depthDuration = 1 / (maxDepth + 1);

    return segments.map((segment, index) => {
        const countAtDepth = depthSegmentCounts[segment.depth];
        const slotDuration = depthDuration / Math.max(1, countAtDepth);
        const start =
            segment.depth * depthDuration + depthIndices[index] * slotDuration;
        const end = start + slotDuration;

        return { start, end };
    });
};

export const segmentProgressFromSchedule = (slot, globalProgress) => {
    if (!slot || globalProgress <= slot.start) return 0;
    if (globalProgress >= slot.end) return 1;

    const t = (globalProgress - slot.start) / (slot.end - slot.start);
    return easeOutCubic(clamp01(t));
};

export const effectiveGrowProgressForShrink = (shrinkFactor, initialGrow = 1) => {
    const base = initialGrow > 0 ? initialGrow : 1;
    return clamp01(shrinkFactor / base);
};
