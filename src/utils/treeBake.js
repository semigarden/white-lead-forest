import * as THREE from "three";
import { disposeTree } from "@/utils/treePlant";

const BAKE_SIZE = 512;
const TOP_PAD = 0.04;
const SIDE_PAD = 0.06;
const ALPHA_CROP_THRESHOLD = 4;

const defringeCanvas = (canvas) => {
    const context = canvas.getContext("2d");
    const { width, height } = canvas;
    const imageData = context.getImageData(0, 0, width, height);
    const pixels = imageData.data;

    for (let index = 0; index < pixels.length; index += 4) {
        const alpha = pixels[index + 3] / 255;
        if (alpha <= 0) {
            pixels[index] = 0;
            pixels[index + 1] = 0;
            pixels[index + 2] = 0;
            continue;
        }

        if (alpha < 1) {
            pixels[index] *= alpha;
            pixels[index + 1] *= alpha;
            pixels[index + 2] *= alpha;
        }
    }

    context.putImageData(imageData, 0, 0);
    return canvas;
};

const softenAlphaChannel = (canvas) => {
    const context = canvas.getContext("2d");
    const { width, height } = canvas;
    const source = context.getImageData(0, 0, width, height);
    const src = source.data;
    const out = new Uint8ClampedArray(src);

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            let sum = 0;
            let count = 0;

            for (let dy = -1; dy <= 1; dy += 1) {
                for (let dx = -1; dx <= 1; dx += 1) {
                    const sx = x + dx;
                    const sy = y + dy;
                    if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;

                    sum += src[(sy * width + sx) * 4 + 3];
                    count += 1;
                }
            }

            out[(y * width + x) * 4 + 3] = Math.round(sum / count);
        }
    }

    source.data.set(out);
    context.putImageData(source, 0, 0);
    return canvas;
};

let bakeRenderer = null;
let bakeScene = null;
let bakeCamera = null;

const ensureBakeContext = () => {
    if (bakeRenderer) return;

    bakeRenderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
    });
    bakeRenderer.setSize(BAKE_SIZE, BAKE_SIZE);
    bakeRenderer.setPixelRatio(1);
    bakeRenderer.setClearColor(0x000000, 0);
    bakeRenderer.autoClear = true;

    bakeScene = new THREE.Scene();
    bakeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 200);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.35);
    keyLight.position.set(2.5, 4, 5);
    bakeScene.add(keyLight);
    bakeScene.add(new THREE.AmbientLight(0xffffff, 0.42));
};

const cropCanvasToAlpha = (source) => {
    const context = source.getContext("2d");
    const { width, height } = source;
    const pixels = context.getImageData(0, 0, width, height).data;

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const alpha = pixels[(y * width + x) * 4 + 3];
            if (alpha <= ALPHA_CROP_THRESHOLD) continue;

            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
        }
    }

    if (maxX < minX || maxY < minY) {
        return {
            canvas: source,
            width: 1,
            height: 1,
            aspect: 1,
        };
    }

    const cropWidth = maxX - minX + 1;
    const cropHeight = maxY - minY + 1;
    const cropped = document.createElement("canvas");
    cropped.width = cropWidth;
    cropped.height = cropHeight;

    cropped
        .getContext("2d")
        .drawImage(
            source,
            minX,
            minY,
            cropWidth,
            cropHeight,
            0,
            0,
            cropWidth,
            cropHeight
        );

    defringeCanvas(cropped);
    softenAlphaChannel(cropped);
    defringeCanvas(cropped);

    return {
        canvas: cropped,
        width: cropWidth,
        height: cropHeight,
        aspect: cropWidth / Math.max(cropHeight, 1),
    };
};

export const bakeTreeToCanvas = (tree, bounds) => {
    ensureBakeContext();

    bakeScene.add(tree);

    const box = bounds ?? new THREE.Box3().setFromObject(tree);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const treeHeight = Math.max(size.y, 0.01);
    const halfWidth = Math.max(size.x * (0.5 + SIDE_PAD), 0.01);
    const halfHeight = (treeHeight * (1 + TOP_PAD)) / 2;
    const viewCenterY = center.y;
    const depth = box.max.z + Math.max(size.z, halfWidth) * 2.5 + 2;

    bakeCamera.left = -halfWidth;
    bakeCamera.right = halfWidth;
    bakeCamera.top = halfHeight;
    bakeCamera.bottom = -halfHeight;
    bakeCamera.position.set(center.x, viewCenterY, depth);
    bakeCamera.up.set(0, 1, 0);
    bakeCamera.lookAt(center.x, viewCenterY, box.min.z);
    bakeCamera.updateProjectionMatrix();

    bakeRenderer.clear();
    bakeRenderer.render(bakeScene, bakeCamera);
    bakeScene.remove(tree);

    const frame = document.createElement("canvas");
    frame.width = BAKE_SIZE;
    frame.height = BAKE_SIZE;
    const frameContext = frame.getContext("2d");
    frameContext.clearRect(0, 0, BAKE_SIZE, BAKE_SIZE);
    frameContext.drawImage(bakeRenderer.domElement, 0, 0);

    disposeTree(tree);

    const cropped = cropCanvasToAlpha(frame);

    return {
        ...cropped,
        worldHeight: treeHeight,
        worldWidth: treeHeight * cropped.aspect,
    };
};
