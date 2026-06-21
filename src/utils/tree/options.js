import { BarkType, Billboard, LeafType, TreeType } from './enums';

export default class TreeOptions {
  constructor() {
    this.seed = 0;
    this.type = TreeType.Deciduous;

    this.bark = {

      type: BarkType.Oak,

      tint: 0xffffff,

      flatShading: false,

      textured: true,

      textureScale: { x: 1, y: 1 },
    };

    this.branch = {

      levels: 3,

      angle: {
        1: 70,
        2: 60,
        3: 60,
      },

      children: {
        0: 7,
        1: 7,
        2: 5,
      },

      force: {
        direction: { x: 0, y: 1, z: 0 },
        strength: 0.01,
      },

      gnarliness: {
        0: 0.15,
        1: 0.2,
        2: 0.3,
        3: 0.02,
      },

      length: {
        0: 20,
        1: 20,
        2: 10,
        3: 1,
      },

      radius: {
        0: 1.5,
        1: 0.7,
        2: 0.7,
        3: 0.7,
      },

      sections: {
        0: 12,
        1: 10,
        2: 8,
        3: 6,
      },

      segments: {
        0: 8,
        1: 6,
        2: 4,
        3: 3,
      },

      start: {
        1: 0.4,
        2: 0.3,
        3: 0.3,
      },

      taper: {
        0: 0.7,
        1: 0.7,
        2: 0.7,
        3: 0.7,
      },

      twist: {
        0: 0,
        1: 0,
        2: 0,
        3: 0,
      },
    };

    this.leaves = {

      type: LeafType.Oak,

      billboard: Billboard.Double,

      angle: 10,

      count: 1,

      start: 0,

      size: 2.5,

      sizeVariance: 0.7,

      tint: 0xffffff,

      alphaTest: 0.5,
    };
  }

  copy(source, target = this) {
    for (let key in source) {
      if (source.hasOwnProperty(key) && target.hasOwnProperty(key)) {
        if (typeof source[key] === 'object' && source[key] !== null) {
          this.copy(source[key], target[key]);
        } else {
          target[key] = source[key];
        }
      }
    }
  }
}