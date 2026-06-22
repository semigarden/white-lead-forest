import * as THREE from "three";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { ForestDarkShader } from "@/utils/forestDarkShader";
import {
    FOREST_NIGHT_SHIFT_SHADES,
    GARDEN_SHIFT_SHADES,
} from "@/utils/gardenShiftColors";

const DEFAULT_CONFIG = {
    fadeInDuration: 2.8,
    holdDuration: 0.35,
    fadeOutDuration: 2.8,
    key: "d",
    fogDarkNear: 10,
    fogDarkFar: 42,
    bloomThresholdDark: 0.02,
    bloomStrengthDarkBoost: 1.35,
};

const PHASE = {
    idle: "idle",
    fadeIn: "fadeIn",
    hold: "hold",
    fadeOut: "fadeOut",
};

const easeInOutCubic = (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

const isTypingTarget = (target) => {
    if (!(target instanceof HTMLElement)) return false;

    return (
        target.isContentEditable ||
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT"
    );
};

const clampAmount = (value) => Math.min(1, Math.max(0, value));

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

export const createForestDarkSystem = ({
    scene,
    fog = null,
    groundMaterial = null,
    composer = null,
    bloomPass = null,
    glitchPass = null,
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
    let phase = PHASE.idle;
    let phaseElapsed = 0;

    const applyAmount = (value) => {
        amount = clampAmount(value);

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
            darkenPass.uniforms.amount.value = amount;
        }

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

    const setAmount = (value) => {
        phase = PHASE.idle;
        phaseElapsed = 0;
        return applyAmount(value);
    };

    const onKeyDown = (event) => {
        if (event.repeat) return;
        if (event.code !== "KeyD" && event.key?.toLowerCase() !== options.key) {
            return;
        }
        if (isTypingTarget(event.target)) return;
        if (phase !== PHASE.idle) return;

        phase = PHASE.fadeIn;
        phaseElapsed = 0;
    };

    const update = (delta = 0) => {
        if (phase === PHASE.idle) return;

        phaseElapsed += delta;

        switch (phase) {
            case PHASE.fadeIn: {
                const t = Math.min(1, phaseElapsed / options.fadeInDuration);
                applyAmount(easeInOutCubic(t));
                if (t >= 1) {
                    phase = PHASE.hold;
                    phaseElapsed = 0;
                }
                break;
            }
            case PHASE.hold: {
                applyAmount(1);
                if (phaseElapsed >= options.holdDuration) {
                    phase = PHASE.fadeOut;
                    phaseElapsed = 0;
                }
                break;
            }
            case PHASE.fadeOut: {
                const t = Math.min(1, phaseElapsed / options.fadeOutDuration);
                applyAmount(1 - easeInOutCubic(t));
                if (t >= 1) {
                    applyAmount(0);
                    phase = PHASE.idle;
                    phaseElapsed = 0;
                }
                break;
            }
            default:
                break;
        }
    };

    window.addEventListener("keydown", onKeyDown);

    return {
        update,
        setAmount,
        getAmount: () => amount,
        isActive: () => phase !== PHASE.idle,
        dispose: () => {
            window.removeEventListener("keydown", onKeyDown);
            resetScene();
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
