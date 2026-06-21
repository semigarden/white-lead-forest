import { Vector3 } from "three";
import { GARDEN_SHADE_SHIFT_GLSL } from "@/utils/gardenShiftColors";

export const GardenTearShader = {
    name: "GardenTearShader",

    uniforms: {
        tDiffuse: { value: null },
        time: { value: 0 },
        amount: { value: 0.06 },
        bandCount: { value: 7.0 },
        jitter: { value: 0.018 },
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
        uniform float amount;
        uniform float bandCount;
        uniform float jitter;
        uniform vec3 shadeA;
        uniform vec3 shadeB;
        uniform vec3 shadeC;

        varying vec2 vUv;

        ${GARDEN_SHADE_SHIFT_GLSL}

        float rand(vec2 co) {
            return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
        }

        void main() {
            vec2 p = vUv;
            float band = floor(p.y * bandCount);
            float bandSeed = rand(vec2(band, floor(time * 3.7)));
            float bandActive = step(0.62, bandSeed);

            float tearShift = (bandSeed - 0.5) * amount * bandActive;
            p.x += tearShift;

            float blockY = floor(p.y * 90.0);
            float blockX = floor(p.x * 160.0);
            float blockSeed = rand(vec2(blockX, blockY + floor(time * 11.0)));
            if (blockSeed > 0.985) {
                p.x += (blockSeed - 0.992) * jitter * 40.0;
            }

            if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) {
                gl_FragColor = vec4(0.01, 0.02, 0.03, 1.0);
                return;
            }

            vec2 offset = vec2(tearShift * 0.35, bandActive * amount * 0.15);
            vec3 sampleA = texture2D(tDiffuse, p + offset).rgb;
            vec3 sampleB = texture2D(tDiffuse, p).rgb;
            vec3 sampleC = texture2D(tDiffuse, p - offset).rgb;

            vec3 color = shadeShift(sampleA, sampleB, sampleC, shadeA, shadeB, shadeC);

            float xs = floor(gl_FragCoord.x);
            float ys = floor(gl_FragCoord.y);
            float snow = rand(vec2(xs + time * 17.0, ys * 0.7)) * amount * 0.35;
            color += vec3(snow * 0.15, snow * 0.08, snow * 0.2);

            gl_FragColor = vec4(color, texture2D(tDiffuse, p).a);
        }
    `,
};
