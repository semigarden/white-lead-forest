import { Vector3 } from "three";
import { GARDEN_SHADE_SHIFT_GLSL } from "@/utils/gardenShiftColors";

export const GardenWarpShader = {
    name: "GardenWarpShader",

    uniforms: {
        tDiffuse: { value: null },
        time: { value: 0 },
        ripple: { value: 0.012 },
        swirl: { value: 0.08 },
        chroma: { value: 0.0022 },
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
        uniform float ripple;
        uniform float swirl;
        uniform float chroma;
        uniform vec3 shadeA;
        uniform vec3 shadeB;
        uniform vec3 shadeC;

        varying vec2 vUv;

        ${GARDEN_SHADE_SHIFT_GLSL}

        float warpEdgeMask(vec2 uv) {
            float inset = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
            return smoothstep(0.0, 0.16, inset);
        }

        vec2 rippleWarp(vec2 uv, float t, float amount) {
            vec2 warped = uv;
            warped.x += sin(uv.y * 48.0 + t * 1.8) * amount;
            warped.y += sin(uv.x * 42.0 - t * 1.3) * amount * 0.72;
            warped.x += sin(uv.y * 12.0 - t * 0.55) * amount * 0.45;
            return warped;
        }

        vec2 swirlWarp(vec2 uv, float t, float amount) {
            vec2 centered = uv - 0.5;
            float radius = length(centered);
            float angle = atan(centered.y, centered.x);
            angle += sin(t * 0.42 + radius * 9.0) * amount * radius;
            return 0.5 + vec2(cos(angle), sin(angle)) * radius;
        }

        vec2 clampUv(vec2 uv) {
            return clamp(uv, 0.0, 1.0);
        }

        void main() {
            float edgeMask = warpEdgeMask(vUv);
            float rippleAmt = ripple * edgeMask;
            float swirlAmt = swirl * edgeMask;

            vec2 warped = swirlWarp(rippleWarp(vUv, time, rippleAmt), time, swirlAmt);
            vec2 uv = clampUv(warped);

            vec2 fromCenter = uv - 0.5;
            float edge = length(fromCenter);
            vec2 offset = normalize(fromCenter + 1e-5) * chroma * edgeMask * (0.4 + edge * 1.8);

            vec3 sampleA = texture2D(tDiffuse, clampUv(uv + offset)).rgb;
            vec3 sampleB = texture2D(tDiffuse, uv).rgb;
            vec3 sampleC = texture2D(tDiffuse, clampUv(uv - offset)).rgb;

            vec3 color = shadeShift(sampleA, sampleB, sampleC, shadeA, shadeB, shadeC);
            gl_FragColor = vec4(color, texture2D(tDiffuse, uv).a);
        }
    `,
};
