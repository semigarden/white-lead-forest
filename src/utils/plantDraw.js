export const segmentStrokeWidth = (depth) =>
    Math.max(0.35, 1.4 * Math.pow(0.72, depth));

export const segmentOpacity = (depth) =>
    Math.max(0.25, 0.95 - depth * 0.14);

export const segmentStrokeColor = (depth, active = false) => {
    const opacity = segmentOpacity(depth);
    return active
        ? `rgba(255, 255, 255, ${opacity})`
        : `rgba(255, 255, 255, ${opacity * 0.82})`;
};
