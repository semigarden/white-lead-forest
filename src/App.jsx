import { useRef } from "react";
import { useForestPlants } from "@/hooks/useForestPlants";
import Forest from "@/components/Forest";
import { FOREST_POST_PROCESSING_PRESET } from "@/utils/gardenPostProcessing";
import {
    DEFAULT_PROCEDURAL_FOREST_CONFIG,
    PROCEDURAL_RENDER_RADIUS,
} from "@/utils/proceduralForest";

const GROUND_CAMERA = {
    offset: { x: 0, y: 1.55, z: 4.5 },
    target: { x: 0, y: 0, z: 0 },
    minDistance: 1.2,
    maxDistance: 28,
};

function App() {
    const { plants } = useForestPlants();
    const forestActionsRef = useRef(null);

    return (
        <Forest
            plants={plants}
            cameraOffset={GROUND_CAMERA.offset}
            cameraTarget={GROUND_CAMERA.target}
            minDistance={GROUND_CAMERA.minDistance}
            maxDistance={GROUND_CAMERA.maxDistance}
            scrollWalk
            walkSpeed={0.005}
            walkNavigation
            unboundedMovement
            walkPositionKey="forest"
            visibleChunkRadius={PROCEDURAL_RENDER_RADIUS}
            forestActionsRef={forestActionsRef}
            postProcessingPreset={FOREST_POST_PROCESSING_PRESET}
            proceduralForest={DEFAULT_PROCEDURAL_FOREST_CONFIG}
        />
    );
}

export default App;
