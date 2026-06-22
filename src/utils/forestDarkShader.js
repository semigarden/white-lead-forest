export const ForestDarkShader = {
    name: "ForestDarkShader",

    uniforms: {
        tDiffuse: { value: null },
        amount: { value: 0 },
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
        uniform float amount;

        varying vec2 vUv;

        void main() {
            vec4 tex = texture2D(tDiffuse, vUv);
            vec3 color = mix(tex.rgb, vec3(0.0), amount);
            gl_FragColor = vec4(color, tex.a);
        }
    `,
};
