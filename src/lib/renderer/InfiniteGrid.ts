import * as THREE from 'three';

/** Camera-following world-space grid with a radial fade. */
export class InfiniteGrid extends THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
  constructor(cellSize = 1, fadeRadius = 32) {
    // The geometry is intentionally much larger than the visible fade area.
    // It stays centered at the world origin, so no square camera-following
    // boundary can become visible around the radial falloff.
    const geometry = new THREE.PlaneGeometry(fadeRadius * 32, fadeRadius * 32);
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      uniforms: {
        uCellSize: { value: cellSize },
        uFadeRadius: { value: fadeRadius }
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        uniform float uCellSize;
        uniform float uFadeRadius;
        varying vec3 vWorldPosition;

        float lineGrid(vec2 coordinate, float spacing) {
          vec2 scaled = coordinate / spacing;
          vec2 width = fwidth(scaled);
          vec2 distanceToLine = abs(fract(scaled - 0.5) - 0.5) / width;
          return 1.0 - min(min(distanceToLine.x, distanceToLine.y), 1.0);
        }

        void main() {
          vec2 coordinate = vWorldPosition.xz;
          float minor = lineGrid(coordinate, uCellSize);
          float major = lineGrid(coordinate, uCellSize * 5.0);
          float distanceToOrigin = length(coordinate);
          float fade = 1.0 - smoothstep(uFadeRadius * 0.35, uFadeRadius, distanceToOrigin);
          vec3 color = mix(vec3(0.26, 0.30, 0.36), vec3(0.42, 0.48, 0.58), major);
          float alpha = max(minor * 0.32, major * 0.58) * fade;
          gl_FragColor = vec4(color, alpha);
        }
      `
    });
    super(geometry, material);
    this.rotation.x = -Math.PI / 2;
    this.renderOrder = -1;
  }

}
