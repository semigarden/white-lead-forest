import { Vector3 } from "three";
import { GARDEN_SHADE_SHIFT_GLSL } from "@/utils/gardenShiftColors";

export const GardenExperimentShader = {
    name: "GardenExperimentShader",

    uniforms: {
        tDiffuse: { value: null },
        time: { value: 0 },
        chroma: { value: 0.0035 },
        warp: { value: 0.018 },
        scanStrength: { value: 0.035 },
        vignette: { value: 1.45 },
        tint: { value: 0.08 },
        shadeA: { value: new Vector3(0.07, 0.13, 0.16) },
        shadeB: { value: new Vector3(0.76, 0.71, 0.79) },
        shadeC: { value: new Vector3(0.93, 0.68, 0.52) },
    },

    vertexShader: /* glsl */ `
        varying vec2 vUv;

        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,

    fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform float time;
        uniform float chroma;
        uniform float warp;
        uniform float scanStrength;
        uniform float vignette;
        uniform float tint;
        uniform vec3 shadeA;
        uniform vec3 shadeB;
        uniform vec3 shadeC;

        varying vec2 vUv;

        ${GARDEN_SHADE_SHIFT_GLSL}

        vec2 barrel(vec2 uv, float amount) {
            vec2 centered = uv - 0.5;
            float r2 = dot(centered, centered);
            return uv + centered * r2 * amount;
        }

        void main() {
            vec2 uv = barrel(vUv, warp);

            if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
                gl_FragColor = vec4(0.0, 0.004, 0.002, 1.0);
                return;
            }

            vec2 fromCenter = uv - 0.5;
            float edge = length(fromCenter);
            vec2 offset = normalize(fromCenter + 1e-5) * chroma * (0.35 + edge * 2.2);

            vec3 sampleA = texture2D(tDiffuse, uv + offset).rgb;
            vec3 sampleB = texture2D(tDiffuse, uv).rgb;
            vec3 sampleC = texture2D(tDiffuse, uv - offset).rgb;

            vec3 color = shadeShift(sampleA, sampleB, sampleC, shadeA, shadeB, shadeC);

            float scan = sin((uv.y + time * 0.04) * 720.0) * scanStrength;
            color -= scan;

            color = mix(color, color * vec3(0.82, 1.02, 0.9), tint);

            vec2 vignetteUv = fromCenter * vignette;
            float vignetteMask = 1.0 - dot(vignetteUv, vignetteUv);
            color *= clamp(vignetteMask, 0.0, 1.0);

            gl_FragColor = vec4(color, texture2D(tDiffuse, uv).a);
        }
    `,
};
