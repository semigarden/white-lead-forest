import {
    buildDateBasedLayout,
    layoutNewPlantByDate,
} from "@/utils/plantLayout";
import { withChunkFields } from "@/utils/gardenChunks";

const STORAGE_KEY = "white-lead-forest";
export const FOREST_PLANTS_UPDATED = "forest-plants-updated";

const createForestId = () => {
    if (globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }

    return `forest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const readStoredLines = () => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const writeUserLines = (lines) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
};

const migrateSpatialLines = (lines) => {
    let changed = false;
    const layoutById = buildDateBasedLayout(lines);
    const next = lines.map((line) => {
        if (Number.isFinite(line?.x) && Number.isFinite(line?.z)) {
            return withChunkFields(line);
        }

        changed = true;
        const position = layoutById.get(line.id) ?? { x: 0, z: 0 };
        return withChunkFields({
            ...line,
            x: position.x,
            z: position.z,
        });
    });

    return { lines: next, changed };
};

export const loadUserLines = () => {
    const storedLines = readStoredLines();
    const { lines, changed } = migrateSpatialLines(storedLines);

    if (changed) {
        try {
            writeUserLines(lines);
        } catch {
            return lines;
        }
    }

    return lines;
};

export const removeLastUserLine = () => {
    try {
        const currentLines = loadUserLines();
        if (currentLines.length === 0) return currentLines;

        const next = currentLines.slice(0, -1);
        writeUserLines(next);
        window.dispatchEvent(new Event(FOREST_PLANTS_UPDATED));
        return next;
    } catch {
        return loadUserLines();
    }
};

export const saveUserLine = (text) => {
    const trimmed = text.trim();
    if (!trimmed) return loadUserLines();

    try {
        const currentLines = loadUserLines();
        const entry = {
            id: createForestId(),
            text: trimmed,
            at: Date.now(),
        };
        const position = layoutNewPlantByDate(entry, currentLines);
        const spatialEntry = withChunkFields({
            ...entry,
            x: position.x,
            z: position.z,
        });

        const next = [...currentLines, spatialEntry];
        writeUserLines(next);
        window.dispatchEvent(new Event(FOREST_PLANTS_UPDATED));
        return next;
    } catch {
        return loadUserLines();
    }
};
