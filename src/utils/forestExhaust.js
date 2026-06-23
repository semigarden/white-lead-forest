import * as THREE from "three";
import {
    attachAudioUnlock,
    getOrCreateAudioListener,
} from "@/utils/forestAudio";
import breathAudioUrl from "../../material/breath.mp3?url";

const DEFAULT_CONFIG = {
    rippleBoost: 3,
    swirlBoost: 2.5,
    chromaBoost: 3,
    walkIncreaseRate: 0.0555, // 0.0055
    restDecreaseRate: 0.0585, // 0.0085
    referenceWalkSpeed: 1.2,
    moveThreshold: 0.015,
    audioVolume: 0.75,
    audioCurve: 0.55,
    audioLoop: true,
};

const clampAmount = (value) => Math.min(1, Math.max(0, value));

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const createForestExhaustSystem = ({
    camera = null,
    warpPass = null,
    warpRipple = 0.014,
    warpSwirl = 0.1,
    warpChroma = 0.0022,
    audioUrl = breathAudioUrl,
    onAmountChange = null,
    ...config
} = {}) => {
    const options = { ...DEFAULT_CONFIG, ...config };
    const maxRipple = warpRipple * options.rippleBoost;
    const maxSwirl = warpSwirl * options.swirlBoost;
    const maxChroma = warpChroma * options.chromaBoost;

    let amount = 0;
    let lastPlayerX = null;
    let lastPlayerZ = null;

    const listener = getOrCreateAudioListener(camera);
    const audio = listener ? new THREE.Audio(listener) : null;
    let audioLoaded = false;
    let audioPlaying = false;
    let audioUnlocked = false;
    let audioUnlock = null;

    const tryPlayBreathAudio = () => {
        if (!audio || !audioLoaded || audioPlaying || !audioUnlocked) return;
        audio.play();
        audioPlaying = true;
    };

    const updateBreathAudio = (exhaustAmount) => {
        if (!audio || !audioLoaded) return;

        const gain =
            clampAmount(exhaustAmount) ** options.audioCurve * options.audioVolume;
        audio.setVolume(gain);

        if (gain > 0.001) {
            tryPlayBreathAudio();
        }
    };

    if (audio) {
        audio.setLoop(options.audioLoop);
        audio.setVolume(0);

        audioUnlock = attachAudioUnlock(listener, () => {
            audioUnlocked = true;
            tryPlayBreathAudio();
        });

        const loader = new THREE.AudioLoader();
        loader.load(
            audioUrl,
            (buffer) => {
                audio.setBuffer(buffer);
                audioLoaded = true;
                updateBreathAudio(amount);
                tryPlayBreathAudio();
            },
            undefined,
            (error) => {
                console.warn("Breath audio failed to load", error);
            }
        );
    }

    const applyAmount = (value) => {
        amount = clampAmount(value);

        if (warpPass) {
            warpPass.enabled = amount > 0;
        }

        updateBreathAudio(amount);
        onAmountChange?.(amount);
        return amount;
    };

    const resetWarp = () => {
        amount = 0;
        lastPlayerX = null;
        lastPlayerZ = null;
        if (warpPass) {
            warpPass.enabled = false;
            warpPass.uniforms.ripple.value = 0;
            warpPass.uniforms.swirl.value = 0;
            warpPass.uniforms.chroma.value = 0;
        }
    };

    const applyFrame = (elapsed = 0) => {
        if (!warpPass || amount <= 0) return;

        const breathe = 0.5 + Math.sin(elapsed * 0.35) * 0.5;
        const surge = 0.5 + Math.sin(elapsed * 1.1) * 0.5;

        warpPass.uniforms.time.value = elapsed;
        warpPass.uniforms.ripple.value =
            maxRipple * amount * (0.75 + surge * 0.55);
        warpPass.uniforms.swirl.value =
            maxSwirl * amount * (0.8 + breathe * 0.35);
        warpPass.uniforms.chroma.value = maxChroma * amount;
    };

    const updateMovement = (delta = 0, playerX = 0, playerZ = 0) => {
        if (delta <= 0) {
            return { amount, moving: false, speed: 0 };
        }

        if (lastPlayerX === null || lastPlayerZ === null) {
            lastPlayerX = playerX;
            lastPlayerZ = playerZ;
            return { amount, moving: false, speed: 0 };
        }

        const dx = playerX - lastPlayerX;
        const dz = playerZ - lastPlayerZ;
        lastPlayerX = playerX;
        lastPlayerZ = playerZ;

        const speed = Math.hypot(dx, dz) / delta;
        const moving = speed > options.moveThreshold;

        if (moving) {
            const speedFactor = clamp(
                speed / options.referenceWalkSpeed,
                0.15,
                1.5
            );
            applyAmount(
                amount + options.walkIncreaseRate * speedFactor * delta
            );
        } else {
            applyAmount(amount - options.restDecreaseRate * delta);
        }

        return { amount, moving, speed };
    };

    return {
        updateMovement,
        applyFrame,
        getAmount: () => amount,
        dispose: () => {
            resetWarp();
            audioUnlock?.dispose();
            if (audio?.isPlaying) {
                audio.stop();
            }
            audio?.disconnect();
        },
    };
};
