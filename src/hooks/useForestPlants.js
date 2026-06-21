import { useCallback, useEffect, useState } from "react";
import {
    FOREST_PLANTS_UPDATED,
    loadUserLines,
    removeLastUserLine,
    saveUserLine,
} from "@/api/forest";
import { randomPlantText } from "@/utils/randomPlantText";

export const useForestPlants = () => {
    const [plants, setPlants] = useState(loadUserLines);

    const refreshPlants = useCallback(() => {
        setPlants(loadUserLines());
    }, []);

    useEffect(() => {
        const onUpdate = () => refreshPlants();
        window.addEventListener(FOREST_PLANTS_UPDATED, onUpdate);
        window.addEventListener("storage", onUpdate);
        return () => {
            window.removeEventListener(FOREST_PLANTS_UPDATED, onUpdate);
            window.removeEventListener("storage", onUpdate);
        };
    }, [refreshPlants]);

    const plantLine = (text) => {
        const next = saveUserLine(text);
        setPlants(next);
        return next;
    };

    const plantRandomLine = () => plantLine(randomPlantText());

    const removeLastPlant = () => {
        const next = removeLastUserLine();
        setPlants(next);
        return next;
    };

    return { plants, plantRandomLine, removeLastPlant };
};
