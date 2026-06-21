import { hashString } from "@/utils/lSystem";

const monthFromDate = (value) => {
    const timestamp = typeof value === "number" ? value : Date.parse(value ?? "");
    if (!Number.isFinite(timestamp)) return null;
    return new Date(timestamp).getMonth();
};

const seasonalHue = (month) => {
    if (month == null) return 155;
    if (month <= 1 || month === 11) return 190;
    if (month <= 4) return 130;
    if (month <= 7) return 102;
    return 42;
};

const hashRange = (hash, shift, min, max) => {
    const unit = ((hash >> shift) & 0xff) / 255;
    return min + unit * (max - min);
};

export const buildPlantPhenotype = ({
    text = "",
    id = "",
    gardenId = "",
    pubDate = null,
    at = null,
} = {}) => {
    const speciesHash = hashString(gardenId || "local-garden");
    const plantHash = hashString(`${gardenId}:${id}:${text}:${pubDate ?? at ?? ""}`);
    const month = monthFromDate(pubDate ?? at);
    const baseHue = seasonalHue(month);
    const authorHueShift = ((speciesHash >> 4) % 54) - 27;
    const individualHueShift = ((plantHash >> 11) % 26) - 13;
    const archetypeBias = speciesHash % 5;

    return {
        presetIndex: (plantHash + archetypeBias) % 12,
        iterations: 3 + ((plantHash >> 5) % 2),
        angleJitter: ((plantHash >> 9) % 13) - 6,
        segmentLength: hashRange(plantHash, 13, 5, 7.5),
        sizeScale: hashRange(plantHash, 17, 0.72, 1.62),
        strokeScale: hashRange(speciesHash, 7, 0.72, 1.35),
        opacityScale: hashRange(plantHash, 20, 0.72, 1),
        hue: (baseHue + authorHueShift + individualHueShift + 360) % 360,
        saturation: hashRange(speciesHash, 14, 16, 54),
        lightness: hashRange(plantHash, 22, 72, 96),
        rootHue: (baseHue + authorHueShift * 0.6 + 360) % 360,
    };
};
