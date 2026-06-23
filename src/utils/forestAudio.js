import * as THREE from "three";

export const getOrCreateAudioListener = (camera) => {
    if (!camera) return null;

    let listener = camera.children.find(
        (child) => child instanceof THREE.AudioListener
    );

    if (!listener) {
        listener = new THREE.AudioListener();
        camera.add(listener);
    }

    return listener;
};

export const attachAudioUnlock = (listener, onUnlock) => {
    let unlocked = false;

    const unlock = () => {
        if (unlocked) return;
        unlocked = true;

        if (listener?.context?.state === "suspended") {
            listener.context.resume().then(onUnlock).catch(() => {});
        } else {
            onUnlock();
        }
    };

    const onUnlockPointer = () => {
        unlock();
        window.removeEventListener("pointerdown", onUnlockPointer);
        window.removeEventListener("keydown", onUnlockKey);
    };

    const onUnlockKey = (event) => {
        if (event.repeat) return;
        unlock();
        window.removeEventListener("pointerdown", onUnlockPointer);
        window.removeEventListener("keydown", onUnlockKey);
    };

    window.addEventListener("pointerdown", onUnlockPointer);
    window.addEventListener("keydown", onUnlockKey);

    return {
        unlock,
        dispose: () => {
            window.removeEventListener("pointerdown", onUnlockPointer);
            window.removeEventListener("keydown", onUnlockKey);
        },
    };
};
