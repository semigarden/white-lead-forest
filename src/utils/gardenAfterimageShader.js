import { Vector2 } from "three";

export const GardenAfterimageShader = {
    name: "GardenAfterimageShader",

    uniforms: {
        damp: { value: 0.96 },
        tOld: { value: null },
        tNew: { value: null },
        trailOffset: { value: new Vector2() },
    },

    vertexShader: /* glsl */ `
        varying vec2 vUv;

        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,

    fragmentShader: /* glsl */ `
        uniform float damp;
        uniform sampler2D tOld;
        uniform sampler2D tNew;
        uniform vec2 trailOffset;

        varying vec2 vUv;

        vec4 when_gt(vec4 x, float y) {
            return max(sign(x - y), 0.0);
        }

        void main() {
            vec4 texelOld = texture2D(tOld, vUv + trailOffset);
            vec4 texelNew = texture2D(tNew, vUv);

            texelOld *= damp * when_gt(texelOld, 0.1);

            gl_FragColor = max(texelNew, texelOld);
        }
    `,
};
