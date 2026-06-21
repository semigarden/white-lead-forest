import { Vector2, Vector3 } from "three";
import { GARDEN_SHADE_SHIFT_GLSL } from "@/utils/gardenShiftColors";

export const GardenGlitchShader = {
    name: "GardenGlitchShader",

    uniforms: {
        tDiffuse: { value: null },
        byp: { value: 0 },
        amount: { value: 0.08 },
        angle: { value: 0.02 },
        speckStrength: { value: 1 },
        uPixelRatio: { value: 1 },
        uGrainScale: { value: 2 },
        uTime: { value: 0 },
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
        uniform int byp;

        uniform sampler2D tDiffuse;
        uniform float amount;
        uniform float angle;
        uniform float speckStrength;
        uniform float uPixelRatio;
        uniform float uGrainScale;
        uniform float uTime;
        uniform vec3 shadeA;
        uniform vec3 shadeB;
        uniform vec3 shadeC;

        varying vec2 vUv;

        ${GARDEN_SHADE_SHIFT_GLSL}

        float hash21(vec2 p) {
            vec3 p3 = fract(vec3(p.xyx) * 0.1031);
            p3 += dot(p3, p3.yzx + 33.33);
            return fract((p3.x + p3.y) * p3.z);
        }

        vec2 hash22(vec2 p) {
            float n = hash21(p);
            return vec2(n, hash21(p + n + 19.19));
        }

        void main() {
            if (byp < 1) {
                vec2 p = vUv;

                vec2 offset = amount * vec2(cos(angle), sin(angle));
                vec3 sampleA = texture2D(tDiffuse, p + offset).rgb;
                vec3 sampleB = texture2D(tDiffuse, p).rgb;
                vec3 sampleC = texture2D(tDiffuse, p - offset).rgb;

                vec3 color = shadeShift(sampleA, sampleB, sampleC, shadeA, shadeB, shadeC);
                gl_FragColor = vec4(color, texture2D(tDiffuse, p).a);

                vec2 cssPixel = gl_FragCoord.xy / max(uPixelRatio, 1.0);
                vec2 grid = cssPixel * uGrainScale;
                grid.x += floor(grid.y) * 0.5;
                vec2 cellId = floor(grid);
                vec2 cellJitter = hash22(cellId + vec2(3.71, 9.13));
                vec2 sampleCell = cellId + cellJitter;

                vec2 cellRand = hash22(cellId + vec2(17.3, 41.7));
                float cellPhase =
                    cellRand.x * 6.2831853 + cellRand.y * 4.7123889;
                float cellRate = 0.85 + cellRand.x * 1.35;

                vec2 cellDrift = vec2(
                    sin(uTime * cellRate + cellPhase),
                    cos(uTime * (cellRate * 0.79 + 0.31) + cellPhase * 1.37 + 1.91)
                ) * 2.8;

                float speck = hash21(sampleCell + vec2(17.17, 41.41) + cellDrift);
                vec4 snow =
                    200.0 * amount * speckStrength * vec4(speck * 0.2);
                gl_FragColor = gl_FragColor + snow;
            } else {
                gl_FragColor = texture2D(tDiffuse, vUv);
            }
        }
    `,
};
