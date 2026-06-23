import * as THREE from "three";

export const finiteNumber = (value, fallback = 0) =>
    Number.isFinite(value) ? value : fallback;

export const safeAudioVolume = (value, max = 1) =>
    Math.min(max, Math.max(0, finiteNumber(value, 0)));

let unlocked = false;
let unlockListenersAttached = false;
let listenerCamera = null;
const unlockCallbacks = new Set();

const onUnlockPointer = () => {
    unlockForestAudio();
};

const onUnlockKey = (event) => {
    if (event.repeat) return;
    unlockForestAudio();
};

const attachUnlockGestureListeners = () => {
    if (unlockListenersAttached) return;
    unlockListenersAttached = true;
    window.addEventListener("pointerdown", onUnlockPointer);
    window.addEventListener("keydown", onUnlockKey);
};

const detachUnlockGestureListeners = () => {
    if (!unlockListenersAttached) return;
    unlockListenersAttached = false;
    window.removeEventListener("pointerdown", onUnlockPointer);
    window.removeEventListener("keydown", onUnlockKey);
};

const notifyUnlockCallbacks = (listener) => {
    const callbacks = [...unlockCallbacks];
    unlockCallbacks.clear();

    for (const callback of callbacks) {
        callback(listener);
    }
};

export const isForestAudioUnlocked = () => unlocked;

export const initForestAudioUnlock = (camera) => {
    if (camera) {
        listenerCamera = camera;
    }
    attachUnlockGestureListeners();
};

export const unlockForestAudio = () => {
    if (unlocked) return;
    unlocked = true;
    detachUnlockGestureListeners();

    const listener = listenerCamera
        ? getOrCreateAudioListener(listenerCamera)
        : null;

    const notify = () => {
        notifyUnlockCallbacks(listener);
    };

    if (listener?.context?.state === "suspended") {
        listener.context.resume().then(notify).catch(notify);
    } else {
        notify();
    }
};

export const onForestAudioUnlock = (callback) => {
    if (unlocked) {
        callback(getOrCreateAudioListener(listenerCamera));
        return () => {};
    }

    unlockCallbacks.add(callback);
    attachUnlockGestureListeners();
    return () => unlockCallbacks.delete(callback);
};

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
