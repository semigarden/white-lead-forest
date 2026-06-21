import * as THREE from 'three';

export class Branch {

  constructor(
    origin = new THREE.Vector3(),
    orientation = new THREE.Euler(),
    length = 0,
    radius = 0,
    level = 0,
    sectionCount = 0,
    segmentCount = 0,
  ) {
    this.origin = origin.clone();
    this.orientation = orientation.clone();
    this.length = length;
    this.radius = radius;
    this.level = level;
    this.sectionCount = sectionCount;
    this.segmentCount = segmentCount;
  }
}
