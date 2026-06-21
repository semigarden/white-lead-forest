import * as THREE from "three";

import birchAo from "./assets/bark/birch_ao_1k.jpg";
import birchColor from "./assets/bark/birch_color_1k.jpg";
import birchNormal from "./assets/bark/birch_normal_1k.jpg";
import birchRoughness from "./assets/bark/birch_roughness_1k.jpg";

import oakAo from "./assets/bark/oak_ao_1k.jpg";
import oakColor from "./assets/bark/oak_color_1k.jpg";
import oakNormal from "./assets/bark/oak_normal_1k.jpg";
import oakRoughness from "./assets/bark/oak_roughness_1k.jpg";

import pineAo from "./assets/bark/pine_ao_1k.jpg";
import pineColor from "./assets/bark/pine_color_1k.jpg";
import pineNormal from "./assets/bark/pine_normal_1k.jpg";
import pineRoughness from "./assets/bark/pine_roughness_1k.jpg";

import ashLeaves from "./assets/leaves/ash_color.png";
import aspenLeaves from "./assets/leaves/aspen_color.png";
import oakLeaves from "./assets/leaves/oak_color.png";
import pineLeaves from "./assets/leaves/pine_color.png";

const textureLoader = new THREE.TextureLoader();

export function getBarkTexture(barkType, fileType, scale = { x: 1, y: 1 }) {
    const texture = textures.bark[barkType][fileType];
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.x = scale.x;
    texture.repeat.y = 1 / scale.y;
    return texture;
}

export function getLeafTexture(leafType) {
    return textures.leaves[leafType];
}

const loadTexture = (url, srgb = true) => {
    const texture = textureLoader.load(url);
    texture.premultiplyAlpha = true;
    if (srgb) {
        texture.colorSpace = THREE.SRGBColorSpace;
    }

    return texture;
};

const textures = {
    bark: {
        birch: {
            ao: loadTexture(birchAo, false),
            color: loadTexture(birchColor),
            normal: loadTexture(birchNormal, false),
            roughness: loadTexture(birchRoughness, false),
        },
        oak: {
            ao: loadTexture(oakAo, false),
            color: loadTexture(oakColor),
            normal: loadTexture(oakNormal, false),
            roughness: loadTexture(oakRoughness, false),
        },
        pine: {
            ao: loadTexture(pineAo, false),
            color: loadTexture(pineColor),
            normal: loadTexture(pineNormal, false),
            roughness: loadTexture(pineRoughness, false),
        },
    },
    leaves: {
        ash: loadTexture(ashLeaves),
        aspen: loadTexture(aspenLeaves),
        oak: loadTexture(oakLeaves),
        pine: loadTexture(pineLeaves),
    },
};
