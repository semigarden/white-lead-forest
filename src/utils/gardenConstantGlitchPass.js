import { ShaderMaterial, UniformsUtils } from "three";
import { Pass, FullScreenQuad } from "three/addons/postprocessing/Pass.js";
import { GardenGlitchShader } from "@/utils/gardenGlitchShader";

export class ConstantGlitchPass extends Pass {
    constructor(amount = 0.035, speckStrength = 1) {
        super();

        this.amount = amount;
        this.speckStrength = speckStrength;
        this.uniforms = UniformsUtils.clone(GardenGlitchShader.uniforms);
        this.material = new ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: GardenGlitchShader.vertexShader,
            fragmentShader: GardenGlitchShader.fragmentShader,
        });

        this._fsQuad = new FullScreenQuad(this.material);
    }

    advance(elapsed = 0) {
        this.uniforms.byp.value = 0;
        this.uniforms.amount.value = this.amount;
        this.uniforms.speckStrength.value = this.speckStrength;
        this.uniforms.uTime.value = elapsed % 157;
        this.uniforms.angle.value = Math.sin(elapsed * 0.9) * 0.35;
    }

    render(renderer, writeBuffer, readBuffer) {
        this.uniforms.tDiffuse.value = readBuffer.texture;

        if (this.renderToScreen) {
            renderer.setRenderTarget(null);
            this._fsQuad.render(renderer);
        } else {
            renderer.setRenderTarget(writeBuffer);
            if (this.clear) renderer.clear();
            this._fsQuad.render(renderer);
        }
    }

    dispose() {
        this.material.dispose();
        this._fsQuad.dispose();
    }
}
