const DEFAULT_CONFIG = {
    fadeInDuration: 2.4,
    holdDuration: 0.35,
    fadeOutDuration: 2.4,
    key: "e",
    rippleBoost: 3,
    swirlBoost: 2.5,
    chromaBoost: 3,
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
    let phase = PHASE.idle;
    let phaseElapsed = 0;

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

    const setAmount = (value) => {
        phase = PHASE.idle;
        phaseElapsed = 0;
        return applyAmount(value);
    };

    const onKeyDown = (event) => {
        if (event.repeat) return;
        if (event.code !== "KeyE" && event.key?.toLowerCase() !== options.key) {
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
        applyFrame,
        setAmount,
        getAmount: () => amount,
        isActive: () => phase !== PHASE.idle,
        dispose: () => {
            window.removeEventListener("keydown", onKeyDown);
            resetWarp();
        },
    };
};
