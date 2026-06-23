import * as THREE from "three";
import riverAudioUrl from "../../material/river.mp3?url";
import {
    finiteNumber,
    onForestAudioUnlock,
    safeAudioVolume,
    unlockForestAudio,
} from "@/utils/forestAudio";

export const FOREST_RIVER_MAX_SPAWN_DISTANCE = 1000;

const DEFAULT_CONFIG = {
    maxSpawnDistance: FOREST_RIVER_MAX_SPAWN_DISTANCE,
    refDistance: 96,
    maxAudioDistance: 5500,
    rolloffFactor: 0.45,
    volume: 0.9,
    loop: true,
    navigationMinGain: 0.1,
    navigationMaxGain: 1,
    navigationDistancePower: 0.48,
    facingBoost: 1,
    behindAttenuation: 0.62,
    nearFieldRadius: 140,
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const sampleRiverPosition = (originX, originZ, maxDistance) => {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * maxDistance;

    return {
        x: originX + Math.cos(angle) * distance,
        z: originZ + Math.sin(angle) * distance,
    };
};

const getHorizontalForward = (camera) => {
    if (!camera) {
        return { x: 0, z: -1 };
    }

    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;

    if (
        !Number.isFinite(forward.x) ||
        !Number.isFinite(forward.z) ||
        forward.lengthSq() < 1e-6
    ) {
        return { x: 0, z: -1 };
    }

    forward.normalize();
    return { x: forward.x, z: forward.z };
};

const computeNavigation = (logicalPosition, playerX, playerZ, camera, options) => {
    const safePlayerX = finiteNumber(playerX);
    const safePlayerZ = finiteNumber(playerZ);
    const dx = logicalPosition.x - safePlayerX;
    const dz = logicalPosition.z - safePlayerZ;
    const distance = Math.hypot(dx, dz);

    let alignment = 0;
    let relativeBearing = 0;
    let forwardX = 0;
    let forwardZ = -1;

    if (distance > 0.001) {
        const toRiverX = dx / distance;
        const toRiverZ = dz / distance;
        const forward = getHorizontalForward(camera);
        forwardX = forward.x;
        forwardZ = forward.z;
        alignment = forwardX * toRiverX + forwardZ * toRiverZ;
        relativeBearing = Math.atan2(
            forwardX * toRiverZ - forwardZ * toRiverX,
            forwardX * toRiverX + forwardZ * toRiverZ
        );
    }

    const proximity = clamp(1 - distance / options.maxSpawnDistance, 0, 1);
    const distanceGain =
        options.navigationMinGain +
        (options.navigationMaxGain - options.navigationMinGain) *
            proximity ** options.navigationDistancePower;

    const nearBlend = clamp(1 - distance / options.nearFieldRadius, 0, 1);
    const facingWeight = 1 - nearBlend;

    const rawFacingGain = 1 + Math.max(0, alignment) * options.facingBoost;
    const rawBehindGain = alignment < -0.18 ? options.behindAttenuation : 1;
    const guidedDirectionGain = rawFacingGain * rawBehindGain;
    const directionGain = 1 + (guidedDirectionGain - 1) * facingWeight;

    const navigationGain = finiteNumber(distanceGain * directionGain, 0);

    return {
        distance: finiteNumber(distance),
        alignment: finiteNumber(alignment),
        proximity: finiteNumber(proximity),
        nearBlend: finiteNumber(nearBlend),
        distanceGain: finiteNumber(distanceGain),
        facingGain: finiteNumber(rawFacingGain),
        directionGain: finiteNumber(directionGain),
        navigationGain,
        riverX: logicalPosition.x,
        riverZ: logicalPosition.z,
        playerX: safePlayerX,
        playerZ: safePlayerZ,
        relativeBearing: finiteNumber(relativeBearing),
        radarX: finiteNumber(Math.sin(relativeBearing)),
        radarY: finiteNumber(-Math.cos(relativeBearing)),
    };
};

export const createForestRiverSystem = ({
    camera,
    anchor,
    originX = 0,
    originZ = 0,
    audioUrl = riverAudioUrl,
    sampleGroundHeight = null,
    onReady = null,
    ...config
} = {}) => {
    const options = { ...DEFAULT_CONFIG, ...config };
    const logicalPosition = sampleRiverPosition(
        originX,
        originZ,
        options.maxSpawnDistance
    );

    const source = new THREE.Object3D();
    source.name = "river-sound";
    anchor?.add(source);

    let audio = null;
    let loaded = false;
    let playing = false;
    let originOffsetX = 0;
    let originOffsetZ = 0;
    let disposeAudioUnlock = null;

    const syncSourcePosition = () => {
        const groundY =
            sampleGroundHeight?.(logicalPosition.x, logicalPosition.z) ?? 0;
        source.position.set(
            logicalPosition.x - originOffsetX,
            groundY,
            logicalPosition.z - originOffsetZ
        );
    };

    syncSourcePosition();

    const tryPlay = () => {
        if (!audio || !loaded || playing) return;
        audio.play();
        playing = true;
    };

    const initAudio = (listener) => {
        if (!listener || audio) return;

        audio = new THREE.PositionalAudio(listener);
        audio.setRefDistance(options.refDistance);
        audio.setRolloffFactor(options.rolloffFactor);
        audio.setMaxDistance(options.maxAudioDistance);
        audio.setLoop(options.loop);
        audio.setVolume(0);
        source.add(audio);

        const loader = new THREE.AudioLoader();
        loader.load(
            audioUrl,
            (buffer) => {
                audio.setBuffer(buffer);
                loaded = true;
                onReady?.({ ...logicalPosition });
                tryPlay();
            },
            undefined,
            (error) => {
                console.warn("River audio failed to load", error);
            }
        );
    };

    disposeAudioUnlock = onForestAudioUnlock(initAudio);

    const updateNavigation = (playerX = 0, playerZ = 0, camera = null) => {
        const metrics = computeNavigation(
            logicalPosition,
            playerX,
            playerZ,
            camera,
            options
        );

        if (loaded && audio) {
            audio.setVolume(
                safeAudioVolume(options.volume * metrics.navigationGain)
            );
        }

        return metrics;
    };

    return {
        getLogicalPosition: () => ({ ...logicalPosition }),
        updateNavigation,
        syncWorldOrigin: (worldOrigin) => {
            originOffsetX = worldOrigin?.x ?? 0;
            originOffsetZ = worldOrigin?.z ?? 0;
            syncSourcePosition();
        },
        unlock: unlockForestAudio,
        dispose: () => {
            disposeAudioUnlock?.();
            if (audio?.isPlaying) {
                audio.stop();
            }
            if (audio) {
                source.remove(audio);
                audio.disconnect();
            }
            anchor?.remove(source);
        },
    };
};
