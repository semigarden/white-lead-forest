const OPENERS = [
    "a",
    "the",
    "this",
    "some",
    "every",
    "another",
    "one",
    "no",
];

const NOUNS = [
    "root",
    "path",
    "seed",
    "shadow",
    "memory",
    "echo",
    "line",
    "garden",
    "soil",
    "moon",
    "thought",
    "visitor",
    "territory",
    "silence",
    "breath",
];

const VERBS = [
    "grows",
    "waits",
    "roots",
    "fades",
    "remembers",
    "drifts",
    "keeps",
    "returns",
    "listens",
    "opens",
];

const ADJECTIVES = [
    "quiet",
    "unmarked",
    "patient",
    "sideways",
    "unfinished",
    "soft",
    "distant",
    "rooted",
    "wandering",
    "slow",
];

const PHRASES = [
    "roots remember what maps forget",
    "a quiet line beneath the moon",
    "the soil keeps what visitors leave",
    "nothing here is sealed",
    "wander first read second",
    "the garden grows sideways too",
    "hold still and let it breathe",
    "an unmarked path through thought",
    "memory roots without permission",
    "the moon watches the outer edge",
];

const pick = (items) => items[Math.floor(Math.random() * items.length)];

const maybe = (chance, value) => (Math.random() < chance ? value : "");

const buildComposedLine = () => {
    const pattern = Math.floor(Math.random() * 4);

    if (pattern === 0) {
        return `${pick(OPENERS)} ${pick(ADJECTIVES)} ${pick(NOUNS)} ${pick(VERBS)}`;
    }

    if (pattern === 1) {
        return `${pick(NOUNS)} ${pick(VERBS)} ${maybe(0.45, `in the ${pick(NOUNS)}`)}`.trim();
    }

    if (pattern === 2) {
        return `${pick(ADJECTIVES)} ${pick(NOUNS)} ${pick(VERBS)}`;
    }

    return `${pick(OPENERS)} ${pick(NOUNS)} ${pick(VERBS)} ${maybe(0.35, "here")}`.trim();
};

export const randomPlantText = () => {
    if (Math.random() < 0.42) {
        return pick(PHRASES);
    }

    return buildComposedLine();
};
