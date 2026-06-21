import * as THREE from "three";

export const GARDEN_MAX_PIXEL_RATIO = 2;
export const GARDEN_GRAIN_SCALE = 2;

export const gardenPixelRatio = () =>
    Math.min(window.devicePixelRatio || 1, GARDEN_MAX_PIXEL_RATIO);

export const gardenEffectivePixelRatio = (cssWidth, bufferWidth) => {
    if (cssWidth > 0 && bufferWidth > 0) {
        return bufferWidth / cssWidth;
    }

    return gardenPixelRatio();
};

export const createGardenRenderer = () => {
    const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
        depth: true,
        stencil: false,
    });

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;

    return renderer;
};

export const applyGardenTextureQuality = (texture, renderer = gardenTextureRenderer) => {
    const maxAnisotropy = renderer?.capabilities?.getMaxAnisotropy?.() ?? 1;

    texture.anisotropy = Math.min(8, maxAnisotropy);
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
};

export const applyPlantTextureQuality = (
    texture,
    renderer = gardenTextureRenderer
) => {
    const maxAnisotropy = renderer?.capabilities?.getMaxAnisotropy?.() ?? 1;

    texture.anisotropy = Math.min(8, maxAnisotropy);
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
};

let gardenTextureRenderer = null;

export const setGardenTextureRenderer = (renderer) => {
    gardenTextureRenderer = renderer;
};
