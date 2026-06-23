import * as THREE from "three";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { ForestDarkShader } from "@/utils/forestDarkShader";
import {
    onForestAudioUnlock,
    safeAudioVolume,
} from "@/utils/forestAudio";
import { FOREST_RIVER_MAX_SPAWN_DISTANCE } from "@/utils/forestRiver";
import darkAudioUrl from "../../material/dark.mp3?url";
import forestAudioUrl from "../../material/forest.mp3?url";
import {
    FOREST_NIGHT_SHIFT_SHADES,
    GARDEN_SHIFT_SHADES,
} from "@/utils/gardenShiftColors";

const DEFAULT_CONFIG = {
    maxRiverDistance: FOREST_RIVER_MAX_SPAWN_DISTANCE,
    darknessPower: 0.62,
    darkenApproachRate: 0.85,
    fogDarkNear: 10,
    fogDarkFar: 42,
    bloomThresholdDark: 0.02,
    bloomStrengthDarkBoost: 1.35,
    audioVolume: 0.75,
    audioCurve: 0.55,
    audioLoop: true,
    forestFadeInEnd: 0.3,
    forestFadeOutStart: 0.7,
    darkAudioStart: 0.7,
};

const clampAmount = (value) => Math.min(1, Math.max(0, value));

const smoothstep = (edge0, edge1, value) => {
    const t = clampAmount((value - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
};

const lerpScalar = (from, to, t) => from + (to - from) * t;

const lerpVector3 = (target, from, to, t) => {
    target.x = lerpScalar(from.x, to.x, t);
    target.y = lerpScalar(from.y, to.y, t);
    target.z = lerpScalar(from.z, to.z, t);
};

const createColorTarget = (color) => ({
    color,
    original: color.clone(),
    inverted: new THREE.Color(
        1 - color.r,
        1 - color.g,
        1 - color.b
    ),
    working: new THREE.Color(),
});

const applyInvertAmount = (target, amount) => {
    target.working.copy(target.original).lerp(target.inverted, amount);
    target.color.copy(target.working);
};

const createFogTarget = (fog, { fogDarkNear, fogDarkFar }) => ({
    fog,
    color: createColorTarget(fog.color),
    originalNear: fog.near,
    originalFar: fog.far,
    darkNear: fogDarkNear,
    darkFar: fogDarkFar,
});

const applyFogAmount = (target, amount) => {
    applyInvertAmount(target.color, amount);
    target.fog.near = lerpScalar(target.originalNear, target.darkNear, amount);
    target.fog.far = lerpScalar(target.originalFar, target.darkFar, amount);
};

const resetFogTarget = (target) => {
    applyInvertAmount(target.color, 0);
    target.fog.near = target.originalNear;
    target.fog.far = target.originalFar;
};

const createShiftTarget = (uniforms) => ({
    uniforms,
    day: {
        plus: GARDEN_SHIFT_SHADES.plus.clone(),
        center: GARDEN_SHIFT_SHADES.center.clone(),
        minus: GARDEN_SHIFT_SHADES.minus.clone(),
    },
    night: FOREST_NIGHT_SHIFT_SHADES,
});

const applyShiftAmount = (target, amount) => {
    if (!target?.uniforms?.shadeA) return;

    lerpVector3(
        target.uniforms.shadeA.value,
        target.day.plus,
        target.night.plus,
        amount
    );
    lerpVector3(
        target.uniforms.shadeB.value,
        target.day.center,
        target.night.center,
        amount
    );
    lerpVector3(
        target.uniforms.shadeC.value,
        target.day.minus,
        target.night.minus,
        amount
    );
};

const createBloomTarget = (bloomPass, { bloomThresholdDark, bloomStrengthDarkBoost }) => ({
    bloomPass,
    baseThreshold: bloomPass.threshold,
    baseStrength: bloomPass.strength,
    darkThreshold: bloomThresholdDark,
    darkStrength: bloomPass.strength * bloomStrengthDarkBoost,
});

const applyBloomAmount = (target, amount) => {
    target.bloomPass.threshold = lerpScalar(
        target.baseThreshold,
        target.darkThreshold,
        amount
    );
    target.bloomPass.strength = lerpScalar(
        target.baseStrength,
        target.darkStrength,
        amount
    );
};

const resetBloomTarget = (target) => {
    target.bloomPass.threshold = target.baseThreshold;
    target.bloomPass.strength = target.baseStrength;
};

const targetDarknessForDistance = (distance, options) => {
    const proximity = clampAmount(1 - distance / options.maxRiverDistance);
    return proximity ** options.darknessPower;
};

const computeDarknessAudioGains = (darkAmount, options) => {
    const amount = clampAmount(darkAmount);
    const fadeInEnd = clampAmount(options.forestFadeInEnd);
    const fadeOutStart = clampAmount(options.forestFadeOutStart);
    const darkStart = clampAmount(options.darkAudioStart);

    const forestFadeIn =
        fadeInEnd > 0 ? smoothstep(0, fadeInEnd, amount) : amount > 0 ? 1 : 0;
    const forestFadeOut =
        fadeOutStart < 1
            ? 1 - smoothstep(fadeOutStart, 1, amount)
            : amount < 1
              ? 1
              : 0;
    const forestBlend = forestFadeIn * forestFadeOut;

    const darkBlend =
        darkStart < 1
            ? smoothstep(darkStart, 1, amount)
            : amount >= 1
              ? 1
              : 0;

    const curve = options.audioCurve;
    const volume = options.audioVolume;

    return {
        forest: forestBlend ** curve * volume,
        dark: darkBlend ** curve * volume,
    };
};

export const createForestDarkSystem = ({
    scene,
    camera = null,
    fog = null,
    groundMaterial = null,
    composer = null,
    bloomPass = null,
    glitchPass = null,
    forestAudioUrl: forestUrl = forestAudioUrl,
    darkAudioUrl: darkUrl = darkAudioUrl,
    onAmountChange = null,
    ...config
} = {}) => {
    const options = { ...DEFAULT_CONFIG, ...config };
    const colorTargets = [];

    if (scene?.background instanceof THREE.Color) {
        colorTargets.push(createColorTarget(scene.background));
    }

    if (groundMaterial?.color instanceof THREE.Color) {
        colorTargets.push(createColorTarget(groundMaterial.color));
    }

    const fogTarget =
        fog?.color instanceof THREE.Color
            ? createFogTarget(fog, options)
            : null;

    const bloomTarget = bloomPass ? createBloomTarget(bloomPass, options) : null;
    const shiftTarget = glitchPass?.uniforms ? createShiftTarget(glitchPass.uniforms) : null;

    let darkenPass = null;
    if (composer) {
        darkenPass = new ShaderPass(ForestDarkShader);
        darkenPass.uniforms.amount.value = 0;
        const outputIndex = Math.max(0, composer.passes.length - 1);
        composer.insertPass(darkenPass, outputIndex);
    }

    let amount = 0;

    let forestAudio = null;
    let darkAudio = null;
    let forestLoaded = false;
    let darkLoaded = false;
    let forestPlaying = false;
    let darkPlaying = false;
    let disposeAudioUnlock = null;

    const tryPlayAmbientAudio = () => {
        if (forestAudio && forestLoaded && !forestPlaying) {
            forestAudio.play();
            forestPlaying = true;
        }
        if (darkAudio && darkLoaded && !darkPlaying) {
            darkAudio.play();
            darkPlaying = true;
        }
    };

    const updateDarkAudio = (darkAmount) => {
        if (!forestAudio && !darkAudio) return;

        const { forest: forestGain, dark: darkGain } = computeDarknessAudioGains(
            darkAmount,
            options
        );

        if (forestAudio && forestLoaded) {
            forestAudio.setVolume(safeAudioVolume(forestGain));
        }
        if (darkAudio && darkLoaded) {
            darkAudio.setVolume(safeAudioVolume(darkGain));
        }

        if (forestGain > 0.001 || darkGain > 0.001) {
            tryPlayAmbientAudio();
        }
    };

    const loadAmbientTrack = (audio, url, onLoaded, label) => {
        if (!audio) return;

        audio.setLoop(options.audioLoop);
        audio.setVolume(0);

        const loader = new THREE.AudioLoader();
        loader.load(
            url,
            (buffer) => {
                audio.setBuffer(buffer);
                onLoaded();
                updateDarkAudio(amount);
                tryPlayAmbientAudio();
            },
            undefined,
            (error) => {
                console.warn(`${label} audio failed to load`, error);
            }
        );
    };

    const initAudio = (listener) => {
        if (!listener || forestAudio || darkAudio) return;

        forestAudio = new THREE.Audio(listener);
        darkAudio = new THREE.Audio(listener);

        loadAmbientTrack(
            forestAudio,
            forestUrl,
            () => {
                forestLoaded = true;
            },
            "Forest"
        );
        loadAmbientTrack(
            darkAudio,
            darkUrl,
            () => {
                darkLoaded = true;
            },
            "Dark"
        );
    };

    if (camera) {
        disposeAudioUnlock = onForestAudioUnlock(initAudio);
    }

    const applyAmount = (value) => {
        amount = clampAmount(value);
        const crushAmount = amount >= 1 ? 1 : smoothstep(0.68, 1, amount);

        colorTargets.forEach((target) => applyInvertAmount(target, amount));
        if (fogTarget) {
            applyFogAmount(fogTarget, amount);
        }
        if (bloomTarget) {
            applyBloomAmount(bloomTarget, amount);
        }
        if (shiftTarget) {
            applyShiftAmount(shiftTarget, amount);
        }
        if (darkenPass) {
            darkenPass.uniforms.amount.value = crushAmount;
        }

        updateDarkAudio(amount);
        onAmountChange?.(amount);
        return amount;
    };

    const resetScene = () => {
        amount = 0;
        colorTargets.forEach((target) => applyInvertAmount(target, 0));
        if (fogTarget) {
            resetFogTarget(fogTarget);
        }
        if (bloomTarget) {
            resetBloomTarget(bloomTarget);
        }
        if (shiftTarget) {
            applyShiftAmount(shiftTarget, 0);
        }
        if (darkenPass) {
            darkenPass.uniforms.amount.value = 0;
        }
    };

    const updateProximity = (delta = 0, riverDistance = Number.POSITIVE_INFINITY) => {
        const target = targetDarknessForDistance(riverDistance, options);

        if (delta <= 0) {
            return { amount, target };
        }

        const diff = target - amount;

        if (diff <= 0.0001) {
            return { amount, target };
        }

        applyAmount(
            amount + diff * Math.min(1, options.darkenApproachRate * delta)
        );

        return { amount, target };
    };

    return {
        updateProximity,
        getAmount: () => amount,
        resetAmount: () => applyAmount(0),
        dispose: () => {
            resetScene();
            disposeAudioUnlock?.();
            if (forestAudio?.isPlaying) {
                forestAudio.stop();
            }
            if (darkAudio?.isPlaying) {
                darkAudio.stop();
            }
            forestAudio?.disconnect();
            darkAudio?.disconnect();
            if (darkenPass && composer) {
                const index = composer.passes.indexOf(darkenPass);
                if (index >= 0) {
                    composer.passes.splice(index, 1);
                }
                darkenPass.dispose?.();
            }
        },
    };
};
