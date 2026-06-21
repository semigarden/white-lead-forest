import {
    HalfFloatType,
    NearestFilter,
    NoBlending,
    ShaderMaterial,
    UniformsUtils,
    Vector2,
    WebGLRenderTarget,
} from "three";
import { Pass, FullScreenQuad } from "three/addons/postprocessing/Pass.js";
import { CopyShader } from "three/addons/shaders/CopyShader.js";
import { GardenAfterimageShader } from "@/utils/gardenAfterimageShader";

export class GardenAfterimagePass extends Pass {
    constructor(damp = 0.96) {
        super();

        this.uniforms = UniformsUtils.clone(GardenAfterimageShader.uniforms);
        this.uniforms.damp.value = damp;
        this.trailOffset = new Vector2();

        this.compFsMaterial = new ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: GardenAfterimageShader.vertexShader,
            fragmentShader: GardenAfterimageShader.fragmentShader,
        });

        this.copyFsMaterial = new ShaderMaterial({
            uniforms: UniformsUtils.clone(CopyShader.uniforms),
            vertexShader: CopyShader.vertexShader,
            fragmentShader: CopyShader.fragmentShader,
            blending: NoBlending,
            depthTest: false,
            depthWrite: false,
        });

        this._textureComp = new WebGLRenderTarget(1, 1, {
            magFilter: NearestFilter,
            type: HalfFloatType,
        });

        this._textureOld = new WebGLRenderTarget(1, 1, {
            magFilter: NearestFilter,
            type: HalfFloatType,
        });

        this._compFsQuad = new FullScreenQuad(this.compFsMaterial);
        this._copyFsQuad = new FullScreenQuad(this.copyFsMaterial);
    }

    get damp() {
        return this.uniforms.damp.value;
    }

    set damp(value) {
        this.uniforms.damp.value = value;
    }

    setTrailOffset(x, y) {
        this.trailOffset.set(x, y);
        this.uniforms.trailOffset.value = this.trailOffset;
    }

    render(renderer, writeBuffer, readBuffer) {
        this.uniforms.tOld.value = this._textureOld.texture;
        this.uniforms.tNew.value = readBuffer.texture;

        renderer.setRenderTarget(this._textureComp);
        this._compFsQuad.render(renderer);

        this._copyFsQuad.material.uniforms.tDiffuse.value =
            this._textureComp.texture;

        if (this.renderToScreen) {
            renderer.setRenderTarget(null);
            this._copyFsQuad.render(renderer);
        } else {
            renderer.setRenderTarget(writeBuffer);
            if (this.clear) renderer.clear();
            this._copyFsQuad.render(renderer);
        }

        const temp = this._textureOld;
        this._textureOld = this._textureComp;
        this._textureComp = temp;
    }

    setSize(width, height) {
        this._textureComp.setSize(width, height);
        this._textureOld.setSize(width, height);
    }

    dispose() {
        this._textureComp.dispose();
        this._textureOld.dispose();
        this.compFsMaterial.dispose();
        this.copyFsMaterial.dispose();
        this._compFsQuad.dispose();
        this._copyFsQuad.dispose();
    }
}
