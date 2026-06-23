import * as THREE from "three";

const FIELD_RADIUS = 36;
const PITCH_UP = -1.45;
const PITCH_DOWN = 0.75;
const lookCameraHelper = new THREE.PerspectiveCamera();

const walkAnglesToward = (x, z, cameraY, targetX, targetY, targetZ) => {
    lookCameraHelper.position.set(x, cameraY, z);
    lookCameraHelper.lookAt(targetX, targetY, targetZ);
    const euler = new THREE.Euler().setFromQuaternion(
        lookCameraHelper.quaternion,
        "YXZ"
    );

    return {
        yaw: euler.y,
        pitch: euler.x,
    };
};

const applyWalkCamera = (camera, state, cameraY, worldOrigin = null) => {
    state.pitch = THREE.MathUtils.clamp(state.pitch, PITCH_UP, PITCH_DOWN);
    const originX = worldOrigin?.x ?? 0;
    const originZ = worldOrigin?.z ?? 0;
    camera.position.set(state.x - originX, cameraY, state.z - originZ);

    const euler = new THREE.Euler(state.pitch, state.yaw, 0, "YXZ");
    camera.quaternion.setFromEuler(euler);
};

const initWalkState = (offset, target, cameraY) => {
    const angles = walkAnglesToward(
        offset.x,
        offset.z,
        cameraY,
        target.x,
        target.y,
        target.z
    );

    return {
        x: offset.x,
        z: offset.z,
        yaw: angles.yaw,
        pitch: angles.pitch,
    };
};

const isMobileLikePointer = () =>
    window.matchMedia("(pointer: coarse)").matches ||
    window.matchMedia("(hover: none)").matches;

const pointerDistance = (a, b) =>
    Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_DISTANCE = 28;
const TAP_MOVE_THRESHOLD = 12;
const CLICK_MOVE_THRESHOLD = 6;
const DEFAULT_MOVE_SPEED = 10;
const DEFAULT_LOOK_AT_DURATION = 1.35;

const easeOutCubic = (t) => 1 - (1 - t) ** 3;

const lerpAngle = (from, to, t) => {
    let delta = to - from;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    return from + delta * t;
};

const lookAnglesToward = (state, cameraY, targetX, targetY, targetZ) => {
    const dx = targetX - state.x;
    const dy = targetY - cameraY;
    const dz = targetZ - state.z;

    if (dx * dx + dy * dy + dz * dz < 0.0001) return null;

    return walkAnglesToward(state.x, state.z, cameraY, targetX, targetY, targetZ);
};

const worldPointToLogical = (worldX, worldY, worldZ, worldAnchor, worldOrigin) => {
    const originX = worldOrigin?.x ?? 0;
    const originZ = worldOrigin?.z ?? 0;

    if (worldAnchor) {
        return {
            x: worldX - worldAnchor.position.x + originX,
            y: worldY,
            z: worldZ - worldAnchor.position.z + originZ,
        };
    }

    return { x: worldX, y: worldY, z: worldZ };
};

const pointerToGround = (
    camera,
    domElement,
    clientX,
    clientY,
    target,
    { groundMeshes = [], worldAnchor = null, worldOrigin = null } = {}
) => {
    const rect = domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;

    const aspect = rect.width / rect.height;
    if (Math.abs(camera.aspect - aspect) > 0.0001) {
        camera.aspect = aspect;
        camera.updateProjectionMatrix();
    }

    const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, camera);

    if (groundMeshes.length > 0) {
        const hits = raycaster.intersectObjects(groundMeshes, false);
        if (hits.length > 0) {
            const hit = hits[0].point;
            const logical = worldPointToLogical(
                hit.x,
                hit.y,
                hit.z,
                worldAnchor,
                worldOrigin
            );
            target.set(logical.x, logical.y, logical.z);
            return true;
        }
    }

    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    if (!raycaster.ray.intersectPlane(groundPlane, target)) {
        return false;
    }

    const logical = worldPointToLogical(
        target.x,
        target.y,
        target.z,
        worldAnchor,
        worldOrigin
    );
    target.set(logical.x, logical.y, logical.z);
    return true;
};

export const attachGardenWalkControls = ({
    camera,
    domElement,
    cameraY,
    eyeHeight = cameraY,
    sampleGroundHeight = null,
    groundMeshes = [],
    worldAnchor = null,
    initialOffset,
    lookTarget,
    groundLookTarget = null,
    savedState = null,
    onPositionChange = null,
    constrainPosition = clampWalkPosition,
    resolveMovementDelta = null,
    enabled = true,
    rotateSpeed = 0.003,
    panSpeed = 0.004,
    pinchSpeed = 0.014,
    moveSpeed = DEFAULT_MOVE_SPEED,
    worldOrigin = null,
}) => {
    const resolveEyeY = (state) =>
        (sampleGroundHeight?.(state.x, state.z) ?? 0) + eyeHeight;
    const mobileLike = isMobileLikePointer();
    const gardenLookTarget = groundLookTarget ?? lookTarget;
    const hasSavedState =
        savedState &&
        Number.isFinite(savedState.x) &&
        Number.isFinite(savedState.z) &&
        Number.isFinite(savedState.yaw) &&
        Number.isFinite(savedState.pitch);

    const state = hasSavedState
        ? {
              x: savedState.x,
              z: savedState.z,
              yaw: savedState.yaw,
              pitch: savedState.pitch,
          }
        : initWalkState(
              initialOffset,
              mobileLike ? gardenLookTarget : lookTarget,
              resolveEyeY({
                  x: initialOffset.x,
                  z: initialOffset.z,
                  yaw: 0,
                  pitch: 0,
              })
          );

    if (mobileLike) {
        state.pitch = initWalkState(
            initialOffset,
            gardenLookTarget,
            resolveEyeY({
                x: initialOffset.x,
                z: initialOffset.z,
                yaw: 0,
                pitch: 0,
            })
        ).pitch;
    }

    constrainPosition?.(state);

    const notifyPositionChange = () => {
        onPositionChange?.({
            x: state.x,
            z: state.z,
            yaw: state.yaw,
            pitch: state.pitch,
        });
    };

    const updateCamera = () => {
        applyWalkCamera(
            camera,
            state,
            resolveEyeY(state),
            worldOrigin
        );
        notifyPositionChange();
    };

    applyWalkCamera(
        camera,
        state,
        resolveEyeY(state),
        worldOrigin
    );

    const pointers = new Map();
    const forward = new THREE.Vector3();
    const moveTarget = new THREE.Vector3();
    const groundHit = new THREE.Vector3();
    let hasMoveTarget = false;
    let dragMode = null;
    let lastX = 0;
    let lastY = 0;
    let pinchDistance = null;
    let lastPinchCenter = null;
    let capturedPointerId = null;
    let lastTap = { time: 0, x: 0, y: 0 };
    let touchStartX = 0;
    let touchStartY = 0;
    let clickStartX = 0;
    let clickStartY = 0;
    let clickCancelled = false;
    let suppressClickUntil = 0;
    let lookAtAnimation = null;

    const clearMoveTarget = () => {
        hasMoveTarget = false;
    };

    const startLookAt = (targetX, targetY, targetZ, duration = DEFAULT_LOOK_AT_DURATION) => {
        const angles = lookAnglesToward(
            state,
            resolveEyeY(state),
            targetX,
            targetY,
            targetZ
        );
        if (!angles) return;

        clearMoveTarget();
        lookAtAnimation = {
            startYaw: state.yaw,
            startPitch: state.pitch,
            targetYaw: angles.yaw,
            targetPitch: angles.pitch,
            elapsed: 0,
            duration: Math.max(0.2, duration),
        };
    };

    const applyPositionConstraint = (motion = null) => {
        const wrapped = Boolean(constrainPosition?.(state, motion));
        if (wrapped) {
            clearMoveTarget();
            updateCamera();
        }
        return wrapped;
    };

    const setMoveTarget = (x, z) => {
        moveTarget.set(x, 0, z);
        hasMoveTarget = true;
    };

    const moveToScreenPoint = (clientX, clientY) => {
        if (
            !pointerToGround(camera, domElement, clientX, clientY, groundHit, {
                groundMeshes,
                worldAnchor,
                worldOrigin,
            })
        ) {
            return false;
        }

        setMoveTarget(groundHit.x, groundHit.z);
        return true;
    };

    const onViewportResize = () => {
        clearMoveTarget();
        lookAtAnimation = null;
    };

    const onWorldRebase = () => {
        clearMoveTarget();
        lookAtAnimation = null;
    };

    const applyPanMove = (dx, dy) => {
        clearMoveTarget();
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        right.y = 0;
        if (right.lengthSq() > 0.0001) right.normalize();

        const panForward = new THREE.Vector3(0, 0, -1).applyQuaternion(
            camera.quaternion
        );
        panForward.y = 0;
        if (panForward.lengthSq() > 0.0001) panForward.normalize();

        const panX = (right.x * dx - panForward.x * dy) * panSpeed;
        const panZ = (right.z * dx - panForward.z * dy) * panSpeed;

        state.x -= panX;
        state.z -= panZ;
        if (!applyPositionConstraint()) {
            updateCamera();
        }
    };

    const applyPinchMove = (deltaDistance) => {
        clearMoveTarget();
        camera.getWorldDirection(forward);
        forward.y = 0;

        if (forward.lengthSq() < 0.0001) return;
        forward.normalize();

        const step = THREE.MathUtils.clamp(
            deltaDistance * pinchSpeed,
            -0.45,
            0.45
        );

        state.x += forward.x * step;
        state.z += forward.z * step;
        if (!applyPositionConstraint()) {
            updateCamera();
        }
    };

    const onPointerDown = (event) => {
        if (!enabled) return;

        if (event.pointerType === "touch" || event.button !== 0) {
            lookAtAnimation = null;
        }

        pointers.set(event.pointerId, event);

        if (pointers.size === 2) {
            dragMode = "pinch";
            const [first, second] = [...pointers.values()];
            pinchDistance = pointerDistance(first, second);
            lastPinchCenter = {
                x: (first.clientX + second.clientX) / 2,
                y: (first.clientY + second.clientY) / 2,
            };

            if (capturedPointerId !== null) {
                domElement.releasePointerCapture(capturedPointerId);
                capturedPointerId = null;
            }
            return;
        }

        if (pointers.size > 2) return;

        if (event.pointerType === "touch") {
            const now = performance.now();
            const isDoubleTap =
                now - lastTap.time < DOUBLE_TAP_MS &&
                Math.hypot(
                    event.clientX - lastTap.x,
                    event.clientY - lastTap.y
                ) < DOUBLE_TAP_DISTANCE;

            dragMode = isDoubleTap ? "pan" : "click";
            touchStartX = event.clientX;
            touchStartY = event.clientY;
            clickStartX = event.clientX;
            clickStartY = event.clientY;
            clickCancelled = false;
        } else if (event.button === 0) {
            dragMode = "click";
            clickStartX = event.clientX;
            clickStartY = event.clientY;
            clickCancelled = false;
        } else if (event.button === 2) {
            dragMode = "pan";
        } else if (event.button === 1) {
            dragMode = "rotate";
        } else {
            pointers.delete(event.pointerId);
            return;
        }

        lastX = event.clientX;
        lastY = event.clientY;

        if (dragMode === "pan") {
            clearMoveTarget();
            domElement.setPointerCapture(event.pointerId);
            capturedPointerId = event.pointerId;
        } else if (dragMode === "rotate") {
            domElement.setPointerCapture(event.pointerId);
            capturedPointerId = event.pointerId;
        }
    };

    const onPointerMove = (event) => {
        if (!pointers.has(event.pointerId)) return;

        pointers.set(event.pointerId, event);

        if (dragMode === "pinch" && pointers.size >= 2) {
            if (event.pointerType === "touch") {
                event.preventDefault();
            }

            const [first, second] = [...pointers.values()];
            const distance = pointerDistance(first, second);
            const center = {
                x: (first.clientX + second.clientX) / 2,
                y: (first.clientY + second.clientY) / 2,
            };

            if (lastPinchCenter) {
                const panDx = center.x - lastPinchCenter.x;
                const panDy = center.y - lastPinchCenter.y;
                if (Math.hypot(panDx, panDy) > 0.5) {
                    applyPanMove(panDx, panDy);
                }
            }

            if (pinchDistance !== null) {
                const delta = distance - pinchDistance;
                if (Math.abs(delta) > 0.5) {
                    applyPinchMove(delta);
                }
            }

            pinchDistance = distance;
            lastPinchCenter = center;
            return;
        }

        if (!dragMode || dragMode === "pinch") return;

        const dx = event.clientX - lastX;
        const dy = event.clientY - lastY;
        lastX = event.clientX;
        lastY = event.clientY;

        if (dragMode === "click") {
            const totalMove = Math.hypot(
                event.clientX - clickStartX,
                event.clientY - clickStartY
            );
            if (totalMove > CLICK_MOVE_THRESHOLD) {
                clickCancelled = true;
                dragMode = "rotate";
                domElement.setPointerCapture(event.pointerId);
                capturedPointerId = event.pointerId;
            } else {
                return;
            }
        }

        if (dragMode === "rotate") {
            lookAtAnimation = null;
            state.yaw -= dx * rotateSpeed;
            state.pitch -= dy * rotateSpeed;
            updateCamera();
            return;
        }

        applyPanMove(dx, dy);
    };

    const finishPointer = (event) => {
        if (performance.now() < suppressClickUntil) return;

        if (dragMode === "click" && !clickCancelled) {
            moveToScreenPoint(event.clientX, event.clientY);
            if (event.pointerType === "touch") {
                lastTap = {
                    time: performance.now(),
                    x: event.clientX,
                    y: event.clientY,
                };
            }
        }
    };

    const endDrag = (event) => {
        const endingPinch = dragMode === "pinch";

        finishPointer(event);

        pointers.delete(event.pointerId);

        if (endingPinch) {
            suppressClickUntil = performance.now() + 320;
        }

        if (pointers.size < 2) {
            pinchDistance = null;
            lastPinchCenter = null;
            if (dragMode === "pinch" && pointers.size === 1) {
                const remaining = [...pointers.values()][0];
                dragMode = "rotate";
                lastX = remaining.clientX;
                lastY = remaining.clientY;
                clickCancelled = true;
                touchStartX = remaining.clientX;
                touchStartY = remaining.clientY;
                domElement.setPointerCapture(remaining.pointerId);
                capturedPointerId = remaining.pointerId;
            } else if (dragMode === "pinch") {
                dragMode = null;
            }
        }

        if (pointers.size === 0) {
            dragMode = null;
        }

        if (capturedPointerId === event.pointerId) {
            domElement.releasePointerCapture(event.pointerId);
            capturedPointerId = null;
        }
    };

    const onContextMenu = (event) => event.preventDefault();

    domElement.addEventListener("pointerdown", onPointerDown, { passive: false });
    domElement.addEventListener("pointermove", onPointerMove, { passive: false });
    domElement.addEventListener("pointerup", endDrag, { passive: false });
    domElement.addEventListener("pointercancel", endDrag, { passive: false });
    domElement.addEventListener("contextmenu", onContextMenu);

    const update = (delta = 0) => {
        if (lookAtAnimation && delta > 0) {
            lookAtAnimation.elapsed += delta;
            const progress = Math.min(
                1,
                lookAtAnimation.elapsed / lookAtAnimation.duration
            );
            const eased = easeOutCubic(progress);

            state.yaw = lerpAngle(
                lookAtAnimation.startYaw,
                lookAtAnimation.targetYaw,
                eased
            );
            state.pitch = THREE.MathUtils.lerp(
                lookAtAnimation.startPitch,
                lookAtAnimation.targetPitch,
                eased
            );
            updateCamera();

            if (progress >= 1) {
                lookAtAnimation = null;
            }
        }

        if (!hasMoveTarget || delta <= 0) return;

        const { dx, dz } = resolveMovementDelta
            ? resolveMovementDelta(state, moveTarget)
            : {
                  dx: moveTarget.x - state.x,
                  dz: moveTarget.z - state.z,
              };
        const distance = Math.hypot(dx, dz);

        if (distance < 0.08) {
            const motion = { dx, dz };
            state.x = moveTarget.x;
            state.z = moveTarget.z;
            clearMoveTarget();
            if (!applyPositionConstraint(motion)) {
                updateCamera();
            }
            return;
        }

        const step = Math.min(distance, moveSpeed * delta);
        const motion = { dx: (dx / distance) * step, dz: (dz / distance) * step };
        state.x += motion.dx;
        state.z += motion.dz;
        if (!applyPositionConstraint(motion)) {
            updateCamera();
        }
    };

    const resetPointerState = () => {
        if (capturedPointerId !== null) {
            try {
                domElement.releasePointerCapture(capturedPointerId);
            } catch {
                // Pointer may already be released.
            }
            capturedPointerId = null;
        }

        pointers.clear();
        dragMode = null;
        pinchDistance = null;
        lastPinchCenter = null;
        clickCancelled = false;
        clearMoveTarget();
    };

    return {
        getState: () => state,
        applyCamera: updateCamera,
        applyPositionConstraint,
        cancelMoveTarget: clearMoveTarget,
        startLookAt,
        setEnabled: (value) => {
            enabled = Boolean(value);
            if (!enabled) {
                resetPointerState();
            }
        },
        resetPointerState,
        onViewportResize,
        onWorldRebase,
        update,
        dispose: () => {
            domElement.removeEventListener("pointerdown", onPointerDown);
            domElement.removeEventListener("pointermove", onPointerMove);
            domElement.removeEventListener("pointerup", endDrag);
            domElement.removeEventListener("pointercancel", endDrag);
            domElement.removeEventListener("contextmenu", onContextMenu);
        },
    };
};

export const clampWalkPosition = (state, maxRadius = FIELD_RADIUS) => {
    const dist = Math.hypot(state.x, state.z);
    if (dist <= maxRadius) return;

    const scale = maxRadius / dist;
    state.x *= scale;
    state.z *= scale;
};

export const attachScrollWalk = ({
    camera,
    domElement,
    speed = 0.004,
    onMove,
}) => {
    const forward = new THREE.Vector3();
    const move = new THREE.Vector3();

    const onWheel = (event) => {
        event.preventDefault();

        camera.getWorldDirection(forward);
        forward.y = 0;

        if (forward.lengthSq() < 0.0001) return;
        forward.normalize();

        const step = THREE.MathUtils.clamp(
            event.deltaY * speed,
            -0.45,
            0.45
        );
        move.copy(forward).multiplyScalar(step);
        onMove(move);
    };

    domElement.addEventListener("wheel", onWheel, { passive: false });

    return () => {
        domElement.removeEventListener("wheel", onWheel);
    };
};
