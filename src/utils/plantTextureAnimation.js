import { drawPlantSegments } from "@/utils/plantBillboard";

export const paintPlantTile = (
    context,
    renderData,
    globalProgress,
    { clear = true } = {}
) => {
    if (!context || !renderData?.plant) return false;

    const {
        plant,
        segmentSchedule,
        canvasScale,
        canvasWidth,
        canvasHeight,
        tileX,
        tileY,
        drawWidth,
        drawHeight,
    } = renderData;

    if (clear) {
        context.clearRect(tileX, tileY, drawWidth, drawHeight);
    }

    context.save();
    context.beginPath();
    context.rect(tileX, tileY, drawWidth, drawHeight);
    context.clip();
    context.translate(tileX, tileY);

    const fitScale = Math.min(
        drawWidth / Math.max(canvasWidth, 1),
        drawHeight / Math.max(canvasHeight, 1)
    );
    const scale = canvasScale * fitScale;

    drawPlantSegments(context, plant, scale, {
        globalProgress,
        segmentSchedule,
    });

    context.restore();
    return true;
};

export const updateAtlasPlantTexture = (mesh, plantId, globalProgress) => {
    if (mesh.userData?.plantId !== plantId) return false;

    const renderData = mesh.userData?.plantRenderData;
    if (!renderData) return false;

    if (renderData.bakedTree) {
        const growUniform = mesh.material?.uniforms?.instanceGrow;
        if (!growUniform) return false;

        growUniform.value = globalProgress;
        return true;
    }

    const group = mesh.parent;
    const context = group?.userData?.atlasContext;
    const texture = group?.userData?.atlasTexture;

    if (!context || !texture) return false;

    const changed = paintPlantTile(context, renderData, globalProgress);
    if (changed) {
        texture.needsUpdate = true;
    }

    return changed;
};

export const updateSpritePlantTexture = (sprite, globalProgress) => {
    const renderData = sprite.userData?.plantRenderData;
    const texture = sprite.material?.map;
    const canvas = texture?.image;

    if (!renderData?.plant || !canvas) return false;

    const context = canvas.getContext("2d");
    if (!context) return false;

    context.clearRect(0, 0, canvas.width, canvas.height);
    drawPlantSegments(context, renderData.plant, renderData.canvasScale, {
        globalProgress,
        segmentSchedule: renderData.segmentSchedule,
    });
    texture.needsUpdate = true;
    return true;
};
