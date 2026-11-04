import * as THREE from 'three';

// Shaft width relative to the head width; matches the normals overlay arrows.
const SHAFT_RATIO = 0.32;
const SEGMENTS = 12;

const shaftGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1, SEGMENTS).translate(0, 0.5, 0);
const headGeometry = new THREE.ConeGeometry(0.5, 1, SEGMENTS).translate(0, 0.5, 0);
const up = new THREE.Vector3(0, 1, 0);

// An arrow made of a tube and a cone along +y, a mesh replacement for THREE.ArrowHelper.
export class VectorArrow extends THREE.Group {
  private readonly material: THREE.MeshBasicMaterial;
  private readonly shaft: THREE.Mesh;
  private readonly head: THREE.Mesh;

  constructor(color: THREE.ColorRepresentation) {
    super();
    this.material = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    this.shaft = new THREE.Mesh(shaftGeometry, this.material);
    this.head = new THREE.Mesh(headGeometry, this.material);
    this.add(this.shaft, this.head);
  }

  setDirection(direction: THREE.Vector3) {
    this.quaternion.setFromUnitVectors(up, direction);
  }

  setLength(length: number, headLength: number, headWidth: number) {
    const shaftLength = Math.max(0, length - headLength);
    const shaftWidth = headWidth * SHAFT_RATIO;
    this.shaft.scale.set(shaftWidth, Math.max(shaftLength, 1e-4), shaftWidth);
    this.shaft.visible = shaftLength > 0;
    this.head.position.y = shaftLength;
    this.head.scale.set(headWidth, headLength, headWidth);
  }

  dispose() {
    this.material.dispose();
  }
}
