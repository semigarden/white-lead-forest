import * as THREE from "three";

export const WORLD_REBASE_THRESHOLD = 512;

export const createWorldOriginController = () => {
    const origin = { x: 0, z: 0 };
    const anchor = new THREE.Group();

    const getLogicalXZ = (localX, localZ) => ({
        x: origin.x + localX,
        z: origin.z + localZ,
    });

    const applyLocalXZ = (camera, logicalX, logicalZ, y) => {
        camera.position.set(logicalX - origin.x, y, logicalZ - origin.z);
    };

    const rebaseIfNeeded = (camera, controlsTarget = null) => {
        const localX = camera.position.x;
        const localZ = camera.position.z;

        if (
            Math.abs(localX) < WORLD_REBASE_THRESHOLD &&
            Math.abs(localZ) < WORLD_REBASE_THRESHOLD
        ) {
            return false;
        }

        origin.x += localX;
        origin.z += localZ;
        anchor.position.x -= localX;
        anchor.position.z -= localZ;
        camera.position.x -= localX;
        camera.position.z -= localZ;

        if (controlsTarget) {
            controlsTarget.x -= localX;
            controlsTarget.z -= localZ;
        }

        return true;
    };

    return {
        origin,
        anchor,
        getLogicalXZ,
        applyLocalXZ,
        rebaseIfNeeded,
    };
};
