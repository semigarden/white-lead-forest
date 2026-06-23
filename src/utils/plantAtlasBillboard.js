import * as THREE from "three";
import { applyPlantTextureQuality } from "@/utils/gardenRenderer";
import { getCachedPlantRenderAsset } from "@/utils/plantRenderCache";
import { sampleTerrainSlope } from "@/utils/forestTerrain";

const MAX_ATLAS_SIZE = 4096;
const MAX_TILE_SIZE = 512;
const MIN_TILE_SIZE = 256;
const TILE_GUTTER = 4;
const ALPHA_CUTOFF = 0.04;
const ALPHA_FEATHER = 2.0;
const ALPHA_DISCARD = 0.001;
const GROUND_CONTACT_HEIGHT = 0.24;
const GROUND_ROOT_FADE = 0.14;
const GROUND_ROOT_SHADE = 0.72;

const alphaFeatherGlsl = `
float plantFeatheredAlpha(float alpha) {
    float edge = max(fwidth(alpha), 0.0008) * ${ALPHA_FEATHER.toFixed(1)};
    return smoothstep(${ALPHA_CUTOFF.toFixed(3)} - edge, ${ALPHA_CUTOFF.toFixed(3)} + edge, alpha);
}
`;

const vertexShader = `
uniform vec2 instanceScale;
uniform vec4 instanceUvRect;
uniform vec4 instanceSway;
uniform vec4 instanceTerrain;
uniform float instanceGrow;

uniform float time;
uniform vec3 cameraRight;
uniform vec3 cameraUp;

varying vec2 vUv;
varying float vLocalY;

void main() {
    float t = time * instanceSway.y + instanceSway.x;
    float roll = sin(t) * instanceSway.z;
    float c = cos(roll);
    float s = sin(roll);

    vec2 local = vec2(
        position.x * instanceScale.x,
        position.y * instanceScale.y * instanceGrow
    );
    vec2 rotated = vec2(
        local.x * c - local.y * s,
        local.x * s + local.y * c
    );

    vec3 base = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    base.x += sin(t * 0.85) * instanceSway.w;
    base.z += cos(t * 1.05) * instanceSway.w;

    vec3 worldPosition = base + cameraRight * rotated.x + cameraUp * rotated.y;

    vec3 horizontal = cameraRight * (position.x * instanceScale.x);
    float slopeLift = horizontal.x * instanceTerrain.x + horizontal.z * instanceTerrain.y;
    float contactMask =
        (1.0 - smoothstep(0.0, ${GROUND_CONTACT_HEIGHT.toFixed(2)}, position.y * instanceGrow)) *
        instanceTerrain.z;
    worldPosition.y += slopeLift * contactMask;

    vLocalY = position.y;
    vUv = instanceUvRect.xy + uv * instanceUvRect.zw;
    gl_Position = projectionMatrix * viewMatrix * vec4(worldPosition, 1.0);
}
`;

const fragmentShader = `
uniform sampler2D map;
uniform vec4 instanceTerrain;

varying vec2 vUv;
varying float vLocalY;

${alphaFeatherGlsl}

void main() {
    vec4 color = texture2D(map, vUv);
    float alpha = plantFeatheredAlpha(color.a);
    if (alpha <= ${ALPHA_DISCARD.toFixed(3)}) discard;

    float groundFade = smoothstep(0.0, instanceTerrain.w, vLocalY);
    alpha *= groundFade;
    if (alpha <= ${ALPHA_DISCARD.toFixed(3)}) discard;

    vec3 rgb = color.rgb / max(color.a, ${ALPHA_DISCARD.toFixed(3)});
    float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
    float rootShade = mix(${GROUND_ROOT_SHADE.toFixed(2)}, 1.0, groundFade);
    gl_FragColor = vec4(vec3(luma) * rootShade * alpha, alpha);
}
`;

let sharedQuadGeometry = null;

const getQuadGeometry = () => {
    if (sharedQuadGeometry) return sharedQuadGeometry;

    sharedQuadGeometry = new THREE.BufferGeometry();
    sharedQuadGeometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(
            [-0.5, 0, 0, 0.5, 0, 0, -0.5, 1, 0, 0.5, 1, 0],
            3
        )
    );
    sharedQuadGeometry.setAttribute(
        "uv",
        new THREE.Float32BufferAttribute([0, 1, 1, 1, 0, 0, 1, 0], 2)
    );
    sharedQuadGeometry.setIndex([0, 1, 2, 2, 1, 3]);

    return sharedQuadGeometry;
};

const plantSway = () => ({
    phase: 0,
    speed: 0,
    rollAmp: 0,
    offsetAmp: 0,
});

const atlasTileSize = (count) => {
    const side = Math.max(1, Math.ceil(Math.sqrt(count)));
    return Math.max(
        MIN_TILE_SIZE,
        Math.min(MAX_TILE_SIZE, Math.floor(MAX_ATLAS_SIZE / side))
    );
};

const plantPosition = (plant) => ({
    x: Number.isFinite(plant?.x) ? plant.x : 0,
    z: Number.isFinite(plant?.z) ? plant.z : 0,
});

const terrainGroundContact = (sampleGroundHeight, x, z) => {
    if (!sampleGroundHeight) {
        return {
            y: 0,
            terrain: [0, 0, 0, GROUND_ROOT_FADE],
        };
    }

    const { y, dhdx, dhdz } = sampleTerrainSlope(x, z, sampleGroundHeight);

    return {
        y,
        terrain: [dhdx, dhdz, 1, GROUND_ROOT_FADE],
    };
};

const createBillboardMaterial = (texture, values) =>
    new THREE.ShaderMaterial({
        uniforms: {
            map: { value: texture },
            time: { value: 0 },
            cameraRight: { value: new THREE.Vector3(1, 0, 0) },
            cameraUp: { value: new THREE.Vector3(0, 1, 0) },
            instanceScale: { value: new THREE.Vector2(...values.scale) },
            instanceUvRect: { value: new THREE.Vector4(...values.uvRect) },
            instanceSway: { value: new THREE.Vector4(...values.sway) },
            instanceTerrain: { value: new THREE.Vector4(...values.terrain) },
            instanceGrow: { value: values.grow },
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        premultipliedAlpha: true,
        depthWrite: false,
        depthTest: true,
    });

export const createPlantAtlasBillboards = (plants = [], options = {}) => {
    const group = new THREE.Group();
    if (plants.length === 0) return group;

    const getInitialGrow = options.getInitialGrow ?? (() => 1);

    const tileSize = atlasTileSize(plants.length);
    const columns = Math.max(1, Math.ceil(Math.sqrt(plants.length)));
    const rows = Math.ceil(plants.length / columns);
    const atlas = document.createElement("canvas");
    atlas.width = columns * tileSize;
    atlas.height = rows * tileSize;

    const context = atlas.getContext("2d");
    context.clearRect(0, 0, atlas.width, atlas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";

    const texture = new THREE.CanvasTexture(atlas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false;
    applyPlantTextureQuality(texture);
    texture.needsUpdate = true;

    const geometry = getQuadGeometry();
    const plantRenderData = new Map();

    plants.forEach((plant, index) => {
        const globalProgress = getInitialGrow(plant);
        const asset = getCachedPlantRenderAsset(plant.text, plant.id, {
            gardenId: plant.gardenId,
            pubDate: plant.pubDate,
            at: plant.at,
            renderOptions: { globalProgress },
        });
        const column = index % columns;
        const row = Math.floor(index / columns);
        const drawableTileSize = Math.max(1, tileSize - TILE_GUTTER * 2);
        const scale = Math.min(
            1,
            drawableTileSize / Math.max(asset.canvas.width, asset.canvas.height)
        );
        const drawWidth = Math.max(1, Math.floor(asset.canvas.width * scale));
        const drawHeight = Math.max(1, Math.floor(asset.canvas.height * scale));
        const x =
            column * tileSize +
            TILE_GUTTER +
            Math.floor((drawableTileSize - drawWidth) / 2);
        const y =
            row * tileSize +
            TILE_GUTTER +
            Math.floor((drawableTileSize - drawHeight) / 2);

        context.drawImage(asset.canvas, x, y, drawWidth, drawHeight);

        const position = plantPosition(plant);
        const ground = terrainGroundContact(
            options.sampleGroundHeight,
            position.x,
            position.z
        );
        const scaleMultiplier = options.plantScaleMultiplier ?? 1;
        const sway = plantSway();
        const grow = asset.bakedTree ? getInitialGrow(plant) : 1;
        const uvRect = [
            x / atlas.width,
            y / atlas.height,
            drawWidth / atlas.width,
            drawHeight / atlas.height,
        ];

        const renderData = {
            plant: asset.plant,
            segmentSchedule: asset.segmentSchedule,
            canvasScale: asset.canvasScale,
            canvasWidth: asset.canvas.width,
            canvasHeight: asset.canvas.height,
            tileX: x,
            tileY: y,
            drawWidth,
            drawHeight,
            bakedTree: Boolean(asset.bakedTree),
        };

        const mesh = new THREE.Mesh(
            geometry,
            createBillboardMaterial(texture, {
                scale: [
                    asset.worldWidth * scaleMultiplier,
                    asset.worldHeight * scaleMultiplier,
                ],
                uvRect,
                sway: [sway.phase, sway.speed, sway.rollAmp, sway.offsetAmp],
                terrain: ground.terrain,
                grow,
            })
        );
        mesh.position.set(position.x, ground.y, position.z);
        mesh.frustumCulled = false;
        mesh.userData.plantAtlas = true;
        mesh.userData.plantId = plant.id;
        mesh.userData.plantRenderData = renderData;
        group.add(mesh);

        plantRenderData.set(plant.id, renderData);
    });

    group.userData.plantAtlasGroup = true;
    group.userData.plantRenderData = plantRenderData;
    group.userData.atlasCanvas = atlas;
    group.userData.atlasContext = context;
    group.userData.atlasTexture = texture;

    return group;
};

export const setAtlasInstancePosition = (
    mesh,
    _instanceIndex,
    x,
    z,
    sampleGroundHeight = null
) => {
    const ground = terrainGroundContact(sampleGroundHeight, x, z);
    mesh.position.set(x, ground.y, z);

    const terrainUniform = mesh.material?.uniforms?.instanceTerrain?.value;
    if (terrainUniform) {
        terrainUniform.set(...ground.terrain);
    }
};
