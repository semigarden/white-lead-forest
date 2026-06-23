import { finiteNumber } from "@/utils/forestAudio";

export const DARKNESS_COLLAPSE_THRESHOLD = 0.9;

const DEFAULT_CONFIG = {
    threshold: DARKNESS_COLLAPSE_THRESHOLD,
    fadeOutDuration: 2.8,
    holdBlackDuration: 0.35,
    fadeInDuration: 1.2,
    cooldownMs: 12000,
};

export const createForestCollapseSystem = ({
    mount,
    threshold = DEFAULT_CONFIG.threshold,
    fadeOutDuration = DEFAULT_CONFIG.fadeOutDuration,
    holdBlackDuration = DEFAULT_CONFIG.holdBlackDuration,
    fadeInDuration = DEFAULT_CONFIG.fadeInDuration,
    cooldownMs = DEFAULT_CONFIG.cooldownMs,
    getDarkAmount,
    darkSystem,
    exhaustSystem,
    walkControls,
    worldOrigin,
    terrain = null,
    groundRipples = null,
    positionSaver = null,
    getSpawnState,
    onReset = null,
    runChunkSync = null,
} = {}) => {
    const overlay = document.createElement("div");
    overlay.className = "forest-blackout";
    overlay.setAttribute("aria-hidden", "true");
    mount.appendChild(overlay);

    let phase = "idle";
    let phaseElapsed = 0;
    let collapseCooldownUntil = 0;

    const setBlackout = (opacity) => {
        overlay.style.opacity = String(Math.min(1, Math.max(0, opacity)));
    };

    const lockMovement = (locked) => {
        if (locked) {
            walkControls?.setEnabled?.(false);
            walkControls?.resetPointerState?.();
            return;
        }

        walkControls?.resetPointerState?.();
        walkControls?.setEnabled?.(true);
    };

    const performReset = () => {
        const spawn = getSpawnState?.();
        if (!spawn || !walkControls || !worldOrigin) return;

        worldOrigin.origin.x = 0;
        worldOrigin.origin.z = 0;
        worldOrigin.anchor.position.set(0, 0, 0);

        const state = walkControls.getState();
        state.x = finiteNumber(spawn.x, state.x);
        state.z = finiteNumber(spawn.z, state.z);
        state.yaw = finiteNumber(spawn.yaw, state.yaw);
        state.pitch = finiteNumber(spawn.pitch, state.pitch);

        walkControls.cancelMoveTarget?.();
        walkControls.applyCamera();

        darkSystem?.resetAmount?.();
        exhaustSystem?.resetAmount?.();
        terrain?.updateForOrigin?.(0, 0);
        groundRipples?.clearTrail?.();

        positionSaver?.schedule?.(spawn);
        positionSaver?.flush?.();

        onReset?.(spawn);
        runChunkSync?.();
    };

    const update = (delta = 0) => {
        if (phase === "idle") {
            if (performance.now() < collapseCooldownUntil) {
                return;
            }

            if ((getDarkAmount?.() ?? 0) >= threshold) {
                phase = "fadeOut";
                phaseElapsed = 0;
                lockMovement(true);
            }
            return;
        }

        phaseElapsed += Math.max(0, delta);

        if (phase === "fadeOut") {
            const progress = Math.min(1, phaseElapsed / fadeOutDuration);
            setBlackout(progress);

            if (progress >= 1) {
                performReset();
                phase = "hold";
                phaseElapsed = 0;
                setBlackout(1);
            }
            return;
        }

        if (phase === "hold") {
            setBlackout(1);

            if (phaseElapsed >= holdBlackDuration) {
                phase = "fadeIn";
                phaseElapsed = 0;
            }
            return;
        }

        if (phase === "fadeIn") {
            const progress = Math.min(1, phaseElapsed / fadeInDuration);
            setBlackout(1 - progress);

            if (progress >= 1) {
                phase = "idle";
                phaseElapsed = 0;
                setBlackout(0);
                collapseCooldownUntil = performance.now() + cooldownMs;
                lockMovement(false);
            }
        }
    };

    return {
        update,
        isActive: () => phase !== "idle",
        dispose: () => {
            lockMovement(false);
            overlay.remove();
        },
    };
};
