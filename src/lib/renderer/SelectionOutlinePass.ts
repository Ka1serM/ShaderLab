import * as THREE from 'three';

const fullscreenVertexShader = `
precision highp float;
in vec3 position;
out vec2 vUv;

void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const outlineFragmentShader = `
precision highp float;
uniform sampler2D idTexture;
uniform vec2 texelSize;
uniform float radius;
uniform vec3 outlineColor;
in vec2 vUv;
out vec4 fragColor;

float selectedAt(vec2 offset) {
  return step(0.5, texture(idTexture, vUv + offset * texelSize).r);
}

void main() {
  // Only fill pixels outside the selection. Sampling cardinal and diagonal
  // neighbours gives stable coverage at corners without tinting the object.
  float center = selectedAt(vec2(0.0));
  float neighbours = 0.0;
  for (float distance = 1.0; distance <= 5.0; distance += 1.0) {
    if (distance > radius) break;
    neighbours = max(neighbours, max(max(
      selectedAt(vec2(-distance, 0.0)), selectedAt(vec2(distance, 0.0))
    ), max(
      selectedAt(vec2(0.0, -distance)), selectedAt(vec2(0.0, distance))
    )));
    float diagonal = distance * 0.7071;
    neighbours = max(neighbours, max(max(
      selectedAt(vec2(-diagonal, -diagonal)), selectedAt(vec2(diagonal, -diagonal))
    ), max(
      selectedAt(vec2(-diagonal, diagonal)), selectedAt(vec2(diagonal, diagonal))
    )));
  }
  float outline = (1.0 - center) * neighbours;
  fragColor = vec4(outlineColor, outline);
}
`;

/** Renders a binary object-ID mask and composites its exterior silhouette. */
export class SelectionOutlinePass {
  readonly idTarget = new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: true,
    stencilBuffer: false,
    generateMipmaps: false
  });

  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.Camera();
  private readonly material: THREE.RawShaderMaterial;
  private readonly geometry: THREE.BufferGeometry;

  constructor(color = 0xff0000, radius = 5) {
    this.material = new THREE.RawShaderMaterial({
      vertexShader: fullscreenVertexShader,
      fragmentShader: outlineFragmentShader,
      glslVersion: THREE.GLSL3,
      uniforms: {
        idTexture: { value: this.idTarget.texture },
        texelSize: { value: new THREE.Vector2(1, 1) },
        radius: { value: radius },
        outlineColor: { value: new THREE.Color(color) }
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NormalBlending,
      toneMapped: false
    });
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      -1, -1, 0,
      3, -1, 0,
      -1, 3, 0
    ], 3));
    const quad = new THREE.Mesh(this.geometry, this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  setSize(width: number, height: number) {
    const targetWidth = Math.max(1, Math.floor(width));
    const targetHeight = Math.max(1, Math.floor(height));
    if (this.idTarget.width === targetWidth && this.idTarget.height === targetHeight) return;
    this.idTarget.setSize(targetWidth, targetHeight);
    (this.material.uniforms.texelSize.value as THREE.Vector2).set(1 / targetWidth, 1 / targetHeight);
  }

  render(renderer: THREE.WebGLRenderer) {
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.idTarget.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}
