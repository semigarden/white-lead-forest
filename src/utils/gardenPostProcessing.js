import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { FilmPass } from "three/addons/postprocessing/FilmPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import {
    GARDEN_GRAIN_SCALE,
    gardenEffectivePixelRatio,
    gardenPixelRatio,
} from "@/utils/gardenRenderer";
import { GardenExperimentShader } from "@/utils/gardenExperimentShader";
import { ConstantGlitchPass } from "@/utils/gardenConstantGlitchPass";
import { GardenAfterimagePass } from "@/utils/gardenAfterimagePass";
import { GardenFeedbackPass } from "@/utils/gardenFeedbackPass";
import { GardenWarpShader } from "@/utils/gardenWarpShader";
import { GardenTearShader } from "@/utils/gardenTearShader";
import { GardenHalftoneShader } from "@/utils/gardenHalftoneShader";
import {
    GARDEN_SHIFT_SHADES,
    applyGardenShiftColors,
} from "@/utils/gardenShiftColors";

export const GARDEN_EFFECTS = {
    afterimage: "afterimage",
    feedback: "feedback",
    bloom: "bloom",
    experiment: "experiment",
    warp: "warp",
    halftone: "halftone",
    film: "film",
    glitch: "glitch",
    tear: "tear",
};

export const GARDEN_DEFAULT_EFFECTS = {
    [GARDEN_EFFECTS.afterimage]: true,
    [GARDEN_EFFECTS.feedback]: true,
    [GARDEN_EFFECTS.bloom]: true,
    [GARDEN_EFFECTS.experiment]: false,
    [GARDEN_EFFECTS.warp]: false,
    [GARDEN_EFFECTS.halftone]: false,
    [GARDEN_EFFECTS.film]: true,
    [GARDEN_EFFECTS.glitch]: true,
    [GARDEN_EFFECTS.tear]: false,
};

const resolveGardenEffects = (preset = {}) => {
    const effects = {
        ...GARDEN_DEFAULT_EFFECTS,
        ...(preset.effects ?? {}),
    };

    if (preset.glitchEnabled === false) {
        effects[GARDEN_EFFECTS.glitch] = false;
    } else if (preset.glitchEnabled === true) {
        effects[GARDEN_EFFECTS.glitch] = true;
    }

    return effects;
};

export const GARDEN_EXPERIMENTAL_PRESET = {
    afterimageDamp: 0.89,
    afterimageMoveTrail: 0.045,
    afterimageYawTrail: 0.022,
    afterimagePlantTrail: 0.11,
    afterimagePlantDampBoost: 0.07,
    feedbackDamp: 0.8,
    feedbackMix: 0.32,
    feedbackMoveSmear: 0.028,
    feedbackYawSmear: 0.014,
    feedbackPlantSmear: 0.05,
    feedbackPlantDampBoost: 0.08,
    feedbackZoom: 1.0014,
    bloomStrength: 0.52,
    bloomRadius: 0.38,
    bloomThreshold: 0.68,
    warpRipple: 0.014,
    warpSwirl: 0.1,
    halftoneStrength: 0.24,
    halftoneScale: 1.4,
    filmNoise: 0.28,
    glitchAmount: 0.035,
    glitchSpeckStrength: 1,
    tearAmount: 0.055,
    tearBandCount: 8,
    effects: { ...GARDEN_DEFAULT_EFFECTS },
};

export const FOREST_POST_PROCESSING_PRESET = {
    ...GARDEN_EXPERIMENTAL_PRESET,
    afterimagePlantTrail: 0,
    afterimagePlantDampBoost: 0,
    feedbackPlantSmear: 0,
    feedbackPlantDampBoost: 0,
    filmNoise: 0.12,
    glitchAmount: 0.05,
    glitchSpeckStrength: 0.15,
};

export const createGardenComposer = (
    renderer,
    scene,
    camera,
    preset = GARDEN_EXPERIMENTAL_PRESET
) => {
    const composer = new EffectComposer(renderer);

    composer.addPass(new RenderPass(scene, camera));

    const afterimagePass = new GardenAfterimagePass(preset.afterimageDamp);
    composer.addPass(afterimagePass);

    const feedbackPass = new GardenFeedbackPass(
        preset.feedbackDamp,
        preset.feedbackMix
    );
    feedbackPass.setZoom(preset.feedbackZoom);
    composer.addPass(feedbackPass);

    const prevPosition = new THREE.Vector3().copy(camera.position);
    const worldDelta = new THREE.Vector3();
    const right = new THREE.Vector3();
    const forward = new THREE.Vector3();
    const euler = new THREE.Euler(0, 0, 0, "YXZ");
    let prevYaw = euler.setFromQuaternion(camera.quaternion, "YXZ").y;

    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(1, 1),
        preset.bloomStrength,
        preset.bloomRadius,
        preset.bloomThreshold
    );
    composer.addPass(bloomPass);

    const experimentPass = new ShaderPass(GardenExperimentShader);
    applyGardenShiftColors(
        experimentPass.uniforms,
        preset.shiftShades ?? GARDEN_SHIFT_SHADES
    );
    composer.addPass(experimentPass);

    const experimentBase = {
        chroma: GardenExperimentShader.uniforms.chroma.value,
        warp: GardenExperimentShader.uniforms.warp.value,
    };

    const warpPass = new ShaderPass(GardenWarpShader);
    warpPass.uniforms.ripple.value = preset.warpRipple;
    warpPass.uniforms.swirl.value = preset.warpSwirl;
    applyGardenShiftColors(
        warpPass.uniforms,
        preset.shiftShades ?? GARDEN_SHIFT_SHADES
    );
    composer.addPass(warpPass);

    const halftonePass = new ShaderPass(GardenHalftoneShader);
    halftonePass.uniforms.strength.value = preset.halftoneStrength;
    halftonePass.uniforms.scale.value = preset.halftoneScale;
    applyGardenShiftColors(
        halftonePass.uniforms,
        preset.shiftShades ?? GARDEN_SHIFT_SHADES
    );
    composer.addPass(halftonePass);

    const noisePass = new FilmPass(preset.filmNoise, false);
    composer.addPass(noisePass);

    const glitchPass = new ConstantGlitchPass(
        preset.glitchAmount,
        preset.glitchSpeckStrength ?? 1
    );
    applyGardenShiftColors(
        glitchPass.uniforms,
        preset.shiftShades ?? GARDEN_SHIFT_SHADES
    );
    composer.addPass(glitchPass);

    const tearPass = new ShaderPass(GardenTearShader);
    tearPass.uniforms.amount.value = preset.tearAmount;
    tearPass.uniforms.bandCount.value = preset.tearBandCount;
    applyGardenShiftColors(
        tearPass.uniforms,
        preset.shiftShades ?? GARDEN_SHIFT_SHADES
    );
    composer.addPass(tearPass);

    composer.addPass(new OutputPass());

    const effectPasses = {
        [GARDEN_EFFECTS.afterimage]: afterimagePass,
        [GARDEN_EFFECTS.feedback]: feedbackPass,
        [GARDEN_EFFECTS.bloom]: bloomPass,
        [GARDEN_EFFECTS.experiment]: experimentPass,
        [GARDEN_EFFECTS.warp]: warpPass,
        [GARDEN_EFFECTS.halftone]: halftonePass,
        [GARDEN_EFFECTS.film]: noisePass,
        [GARDEN_EFFECTS.glitch]: glitchPass,
        [GARDEN_EFFECTS.tear]: tearPass,
    };

    const initialEffects = resolveGardenEffects(preset);
    Object.entries(effectPasses).forEach(([name, pass]) => {
        pass.enabled = initialEffects[name] !== false;
    });

    const setEffectEnabled = (name, enabled = true) => {
        const pass = effectPasses[name];
        if (!pass) return false;
        pass.enabled = enabled;
        return true;
    };

    const isEffectEnabled = (name) => effectPasses[name]?.enabled ?? false;

    const setEffects = (next = {}) => {
        Object.entries(next).forEach(([name, enabled]) => {
            if (name in effectPasses) {
                setEffectEnabled(name, enabled);
            }
        });
    };

    const getEffects = () =>
        Object.fromEntries(
            Object.keys(effectPasses).map((name) => [
                name,
                isEffectEnabled(name),
            ])
        );

    const toggleEffect = (name) => {
        if (!(name in effectPasses)) return null;
        const next = !isEffectEnabled(name);
        setEffectEnabled(name, next);
        return next;
    };

    const resize = (width, height) => {
        const pixelRatio = gardenPixelRatio();

        renderer.setPixelRatio(pixelRatio);
        renderer.setSize(width, height);
        composer.setPixelRatio(pixelRatio);
        composer.setSize(width, height);

        const bufferWidth = renderer.domElement.width;
        const bufferHeight = renderer.domElement.height;
        const effectivePixelRatio = gardenEffectivePixelRatio(
            width,
            bufferWidth
        );

        glitchPass.uniforms.uPixelRatio.value = effectivePixelRatio;
        glitchPass.uniforms.uGrainScale.value = GARDEN_GRAIN_SCALE;

        afterimagePass.setSize(bufferWidth, bufferHeight);
        feedbackPass.setSize(bufferWidth, bufferHeight);
        bloomPass.resolution.set(bufferWidth, bufferHeight);
        halftonePass.uniforms.resolution.value.set(bufferWidth, bufferHeight);
    };

    const baseAfterimageDamp = preset.afterimageDamp;
    const baseFeedbackDamp = preset.feedbackDamp;

    const update = (elapsed = 0, motion = {}) => {
        worldDelta.subVectors(camera.position, prevPosition);
        prevPosition.copy(camera.position);

        euler.setFromQuaternion(camera.quaternion, "YXZ");
        let yawDelta = euler.y - prevYaw;
        while (yawDelta > Math.PI) yawDelta -= Math.PI * 2;
        while (yawDelta < -Math.PI) yawDelta += Math.PI * 2;
        prevYaw = euler.y;

        right.set(1, 0, 0).applyQuaternion(camera.quaternion);
        right.y = 0;
        if (right.lengthSq() > 1e-6) right.normalize();

        forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
        forward.y = 0;
        if (forward.lengthSq() > 1e-6) forward.normalize();

        const moveX = worldDelta.dot(right);
        const moveY = worldDelta.dot(forward);

        const plantMotion = motion.plants ?? {};
        const plantStrength = plantMotion.strength ?? 0;

        const trailX =
            -moveX * preset.afterimageMoveTrail +
            yawDelta * preset.afterimageYawTrail +
            (plantMotion.trailX ?? 0) * preset.afterimagePlantTrail * plantStrength;
        const trailY =
            -moveY * preset.afterimageMoveTrail +
            (plantMotion.trailY ?? 0) * preset.afterimagePlantTrail * plantStrength;

        if (afterimagePass.enabled) {
            afterimagePass.damp = Math.min(
                0.98,
                baseAfterimageDamp +
                    preset.afterimagePlantDampBoost * plantStrength
            );
            afterimagePass.setTrailOffset(trailX, trailY);
        }

        if (feedbackPass.enabled) {
            feedbackPass.uniforms.damp.value = Math.min(
                0.96,
                baseFeedbackDamp + preset.feedbackPlantDampBoost * plantStrength
            );
            const smearX =
                -moveX * preset.feedbackMoveSmear +
                yawDelta * preset.feedbackYawSmear +
                (plantMotion.trailX ?? 0) *
                    preset.feedbackPlantSmear *
                    plantStrength;
            const smearY =
                -moveY * preset.feedbackMoveSmear +
                (plantMotion.trailY ?? 0) *
                    preset.feedbackPlantSmear *
                    plantStrength;
            feedbackPass.setSmearOffset(smearX, smearY);
        }

        const breathe = 0.5 + Math.sin(elapsed * 0.35) * 0.5;
        const surge = 0.5 + Math.sin(elapsed * 1.1) * 0.5;

        if (experimentPass.enabled) {
            experimentPass.uniforms.time.value = elapsed;
            experimentPass.uniforms.chroma.value =
                experimentBase.chroma * (0.85 + breathe * 0.3);
            experimentPass.uniforms.warp.value =
                experimentBase.warp * (0.9 + breathe * 0.2);
        }

        if (warpPass.enabled) {
            warpPass.uniforms.time.value = elapsed;
            warpPass.uniforms.ripple.value =
                preset.warpRipple * (0.75 + surge * 0.55);
            warpPass.uniforms.swirl.value =
                preset.warpSwirl * (0.8 + breathe * 0.35);
        }

        if (halftonePass.enabled) {
            halftonePass.uniforms.time.value = elapsed;
        }

        if (tearPass.enabled) {
            tearPass.uniforms.time.value = elapsed;
            tearPass.uniforms.amount.value =
                preset.tearAmount * (0.7 + surge * 0.6);
        }

        if (glitchPass.enabled) {
            glitchPass.advance(elapsed);
        }
    };

    const effectsApi = {
        names: GARDEN_EFFECTS,
        setEnabled: setEffectEnabled,
        isEnabled: isEffectEnabled,
        set: setEffects,
        get: getEffects,
        toggle: toggleEffect,
    };

    return {
        composer,
        effects: effectsApi,
        afterimagePass,
        feedbackPass,
        bloomPass,
        experimentPass,
        warpPass,
        halftonePass,
        noisePass,
        glitchPass,
        tearPass,
        resize,
        update,
        dispose: () => {
            composer.dispose();
        },
    };
};
