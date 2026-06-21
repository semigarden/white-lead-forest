import { Vector2, Vector3 } from "three";
import { GARDEN_SHADE_SHIFT_GLSL } from "@/utils/gardenShiftColors";

export const GardenHalftoneShader = {
    name: "GardenHalftoneShader",

    uniforms: {
        tDiffuse: { value: null },
        time: { value: 0 },
        scale: { value: 1.35 },
        strength: { value: 0.22 },
        angle: { value: 0.42 },
        shadeA: { value: new Vector3(0.07, 0.13, 0.16) },
        shadeB: { value: new Vector3(0.76, 0.71, 0.79) },
        shadeC: { value: new Vector3(0.93, 0.68, 0.52) },
        resolution: { value: new Vector2(1, 1) },
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
        uniform float scale;
        uniform float strength;
        uniform float angle;
        uniform vec3 shadeA;
        uniform vec3 shadeB;
        uniform vec3 shadeC;
        uniform vec2 resolution;

        varying vec2 vUv;

        ${GARDEN_SHADE_SHIFT_GLSL}

        float halftone(vec2 uv, float rotation) {
            float s = sin(rotation);
            float c = cos(rotation);
            mat2 rot = mat2(c, -s, s, c);
            vec2 centered = (uv - 0.5) * resolution / min(resolution.x, resolution.y) * scale;
            centered = rot * centered;
            vec2 cell = fract(centered) - 0.5;
            return 1.0 - smoothstep(0.18, 0.22, length(cell));
        }

        void main() {
            vec3 base = texture2D(tDiffuse, vUv).rgb;
            float luma = dot(base, vec3(0.2126, 0.7152, 0.0722));

            float rot = angle + time * 0.08;
            float dotA = halftone(vUv + vec2(0.002, 0.0), rot);
            float dotB = halftone(vUv, rot + 2.094);
            float dotC = halftone(vUv - vec2(0.002, 0.0), rot + 4.188);

            vec3 sampleA = base * dotA;
            vec3 sampleB = base * dotB;
            vec3 sampleC = base * dotC;

            vec3 halftoned = shadeShift(sampleA, sampleB, sampleC, shadeA, shadeB, shadeC);
            vec3 color = mix(base, halftoned, strength * (0.55 + luma * 0.45));

            gl_FragColor = vec4(color, texture2D(tDiffuse, vUv).a);
        }
    `,
};
