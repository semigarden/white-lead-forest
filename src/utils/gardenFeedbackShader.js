import { Vector2 } from "three";

export const GardenFeedbackShader = {
    name: "GardenFeedbackShader",

    uniforms: {
        damp: { value: 0.82 },
        mixAmount: { value: 0.28 },
        zoom: { value: 1.0012 },
        tOld: { value: null },
        tNew: { value: null },
        smearOffset: { value: new Vector2() },
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
        uniform float mixAmount;
        uniform float zoom;
        uniform sampler2D tOld;
        uniform sampler2D tNew;
        uniform vec2 smearOffset;

        varying vec2 vUv;

        void main() {
            vec2 oldUv = (vUv - 0.5) * zoom + 0.5 + smearOffset;
            vec4 texelOld = texture2D(tOld, oldUv);
            vec4 texelNew = texture2D(tNew, vUv);

            texelOld *= damp;
            gl_FragColor = mix(texelOld, texelNew, mixAmount);
        }
    `,
};
