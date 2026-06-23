const DEFAULT_CONFIG = {
    rippleBoost: 3,
    swirlBoost: 2.5,
    chromaBoost: 3,
    walkIncreaseRate: 0.0555, // 0.0055
    restDecreaseRate: 0.0085,
    referenceWalkSpeed: 1.2,
    moveThreshold: 0.015,
};

const clampAmount = (value) => Math.min(1, Math.max(0, value));

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const createForestExhaustSystem = ({
    warpPass = null,
    warpRipple = 0.014,
    warpSwirl = 0.1,
    warpChroma = 0.0022,
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

    const applyAmount = (value) => {
        amount = clampAmount(value);

        if (warpPass) {
            warpPass.enabled = amount > 0;
        }

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
        },
    };
};
