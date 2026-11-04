import * as THREE from 'three';
import { GpuGeometry } from './gpu/geometry';
import { compileProgram, type Program } from './gpu/program';

const VERTICES_PER_NORMAL = 1024;
const MIN_NORMALS = 24;
const LENGTH_PER_RADIUS = 0.12;
const HEAD_LENGTH = 0.2;
const HEAD_WIDTH = 0.14;
const SHAFT_WIDTH = 0.045;
const HEAD_SEGMENTS = 8;

export type NormalsVaryings = { position: string; normal: string; space?: 'model' | 'world' };

export type NormalsPart = { source: THREE.BufferGeometry; matrixWorld: THREE.Matrix4 };

const PASSTHROUGH_VERTEX = `in vec3 position;
in vec3 normal;
out vec3 shaderlabPosition;
out vec3 shaderlabNormal;
void main() {
  shaderlabPosition = position;
  shaderlabNormal = normal;
  gl_Position = vec4(0.0);
}`;
const PASSTHROUGH_VARYINGS: NormalsVaryings = { position: 'shaderlabPosition', normal: 'shaderlabNormal', space: 'model' };

const CAPTURE_FRAGMENT = 'out vec4 color; void main() { color = vec4(0.0); }';

// Each instance is one sample: the captured outputs of its triangle's three
// corners, blended with the sample's barycentric weights like a varying.
const ARROW_VERTEX = `in vec3 aArrow;
in vec3 aWeights;
in vec3 aPositionA;
in vec3 aNormalA;
in vec3 aPositionB;
in vec3 aNormalB;
in vec3 aPositionC;
in vec3 aNormalC;
uniform mat4 uModelMatrix;
uniform mat3 uNormalMatrix;
uniform mat4 uViewProjection;
uniform float uLength;
void main() {
  vec3 base = (uModelMatrix * vec4(mat3(aPositionA, aPositionB, aPositionC) * aWeights, 1.0)).xyz;
  vec3 normal = uNormalMatrix * (mat3(aNormalA, aNormalB, aNormalC) * aWeights);
  if (dot(normal, normal) < 1e-12) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  normal = normalize(normal);
  vec3 side = normalize(cross(normal, abs(normal.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 world = base + uLength * (normal * aArrow.y + side * aArrow.x + cross(normal, side) * aArrow.z);
  gl_Position = uViewProjection * vec4(world, 1.0);
}`;

const ARROW_FRAGMENT = `uniform vec3 uColor;
out vec4 fragColor;
void main() {
  fragColor = vec4(uColor, 1.0);
}`;

const COLOR = [0xbf / 255, 0x27 / 255, 0x32 / 255];
const IDENTITY4 = new THREE.Matrix4().elements;
const IDENTITY3 = new THREE.Matrix3().elements;

// Shaft as a tube from 0 to the head, head as a cone whose tip sits at 1.
function arrowVertices() {
  const neck = 1 - HEAD_LENGTH;
  const ring = (index: number, radius: number, y: number) => {
    const angle = (index / HEAD_SEGMENTS) * Math.PI * 2;
    return [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
  };
  const shaft = SHAFT_WIDTH / 2, head = HEAD_WIDTH / 2;
  const vertices: number[] = [];
  for (let index = 0; index < HEAD_SEGMENTS; index++) {
    const [a, b] = [index, index + 1];
    vertices.push(...ring(a, shaft, 0), ...ring(b, shaft, neck), ...ring(b, shaft, 0));
    vertices.push(...ring(a, shaft, 0), ...ring(a, shaft, neck), ...ring(b, shaft, neck));
    vertices.push(0, 1, 0, ...ring(b, head, neck), ...ring(a, head, neck));
    vertices.push(0, neck, 0, ...ring(a, head, neck), ...ring(b, head, neck));
  }
  return new Float32Array(vertices);
}

type PartArrows = {
  samples: GpuGeometry;
  count: number;
  feedback: WebGLBuffer;
  weights: WebGLBuffer;
  vao: WebGLVertexArrayObject;
};

export class NormalsOverlay {
  private readonly arrows: Program;
  private readonly arrowBuffer: WebGLBuffer;
  private readonly arrowVertexCount: number;
  private readonly transformFeedback: WebGLTransformFeedback;
  private readonly parts = new Map<THREE.BufferGeometry, PartArrows>();
  private capture?: Program;
  private captureKey?: string;
  private readonly normalMatrix = new THREE.Matrix3();
  private readonly radius = new THREE.Sphere();

  constructor(private readonly gl: WebGL2RenderingContext) {
    const { program } = compileProgram(gl, ARROW_VERTEX, ARROW_FRAGMENT);
    if (!program) throw new Error('The normals overlay program did not compile.');
    this.arrows = program;
    const vertices = arrowVertices();
    this.arrowVertexCount = vertices.length / 3;
    this.arrowBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.arrowBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this.transformFeedback = gl.createTransformFeedback()!;
  }

  // Runs the scene's vertex shader on the sample corners, then draws one arrow
  // per sample from the captured outputs. Everything per frame stays on the GPU.
  draw(vertexShader: string, varyings: NormalsVaryings | undefined, parts: NormalsPart[], prepare: (program: Program, index: number) => void, viewProjection: THREE.Matrix4) {
    const gl = this.gl;
    const capture = varyings ? this.captureProgram(vertexShader, varyings) : this.captureProgram(PASSTHROUGH_VERTEX, PASSTHROUGH_VARYINGS);
    if (!capture) return;
    const space = varyings ? varyings.space ?? 'world' : 'model';
    const arrows = parts.map(part => this.arrowsFor(part.source));
    this.prune(parts.map(part => part.source));

    gl.enable(gl.RASTERIZER_DISCARD);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this.transformFeedback);
    arrows.forEach((part, index) => {
      if (!part.count) return;
      prepare(capture, index);
      capture.bind();
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, part.feedback);
      gl.beginTransformFeedback(gl.POINTS);
      part.samples.drawVertices(capture, gl.POINTS);
      gl.endTransformFeedback();
    });
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    gl.disable(gl.RASTERIZER_DISCARD);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    this.arrows.set('uViewProjection', viewProjection.elements);
    this.arrows.set('uColor', COLOR);
    arrows.forEach((part, index) => {
      if (!part.count) return;
      const { source, matrixWorld } = parts[index];
      source.boundingSphere ?? source.computeBoundingSphere();
      this.arrows.set('uLength', this.radius.copy(source.boundingSphere!).applyMatrix4(matrixWorld).radius * LENGTH_PER_RADIUS);
      this.arrows.set('uModelMatrix', space === 'model' ? matrixWorld.elements : IDENTITY4);
      this.arrows.set('uNormalMatrix', space === 'model' ? this.normalMatrix.getNormalMatrix(matrixWorld).elements : IDENTITY3);
      this.arrows.bind();
      gl.bindVertexArray(part.vao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, this.arrowVertexCount, part.count);
    });
    gl.bindVertexArray(null);
    gl.useProgram(null);
  }

  dispose() {
    this.prune([]);
    this.releaseCapture();
    this.arrows.dispose();
    this.gl.deleteBuffer(this.arrowBuffer);
    this.gl.deleteTransformFeedback(this.transformFeedback);
  }

  private captureProgram(vertexShader: string, { position, normal }: NormalsVaryings) {
    const key = `${position}\0${normal}\0${vertexShader}`;
    if (key === this.captureKey) return this.capture;
    this.releaseCapture();
    this.captureKey = key;
    const gl = this.gl;
    const { program, diagnostics } = compileProgram(gl, vertexShader, CAPTURE_FRAGMENT, { feedbackVaryings: [position, normal] });
    if (program && [0, 1].every(index => gl.getTransformFeedbackVarying(program.handle, index)?.type === gl.FLOAT_VEC3)) return this.capture = program;
    program?.dispose();
    const reason = program ? 'both must be vec3 outputs' : [...diagnostics.vertex, ...diagnostics.fragment].map(diagnostic => diagnostic.message).join(' ');
    console.warn(`Normals overlay cannot capture ${position} and ${normal}: ${reason}`);
    return undefined;
  }

  private releaseCapture() {
    if (this.capture) for (const part of this.parts.values()) part.samples.release(this.capture);
    this.capture?.dispose();
    this.capture = undefined;
    this.captureKey = undefined;
  }

  private arrowsFor(source: THREE.BufferGeometry) {
    const existing = this.parts.get(source);
    if (existing) return existing;
    const gl = this.gl;
    const { corners, weights, count } = sampleSurface(source);
    const gathered = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(source.attributes)) gathered.setAttribute(name, attribute);
    gathered.setIndex(new THREE.BufferAttribute(corners, 1));
    const samples = new GpuGeometry(gl, gathered.toNonIndexed(), 1);

    const feedback = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, feedback);
    gl.bufferData(gl.ARRAY_BUFFER, Math.max(1, count * 3 * 6 * 4), gl.DYNAMIC_COPY);
    const weightBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, weightBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, weights, gl.STATIC_DRAW);

    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const attribute = (name: string, buffer: WebGLBuffer, stride: number, offset: number, divisor: number) => {
      const location = this.arrows.attributes.get(name)?.location ?? -1;
      if (location < 0) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, 3, gl.FLOAT, false, stride, offset);
      gl.vertexAttribDivisor(location, divisor);
    };
    attribute('aArrow', this.arrowBuffer, 0, 0, 0);
    attribute('aWeights', weightBuffer, 0, 0, 1);
    const corner = 6 * 4, sample = corner * 3;
    ['A', 'B', 'C'].forEach((name, index) => {
      attribute(`aPosition${name}`, feedback, sample, index * corner, 1);
      attribute(`aNormal${name}`, feedback, sample, index * corner + 12, 1);
    });
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    const arrows = { samples, count, feedback, weights: weightBuffer, vao };
    this.parts.set(source, arrows);
    return arrows;
  }

  private prune(keep: THREE.BufferGeometry[]) {
    const gl = this.gl;
    for (const [source, part] of this.parts) {
      if (keep.includes(source)) continue;
      part.samples.dispose();
      part.samples.source.dispose();
      gl.deleteBuffer(part.feedback);
      gl.deleteBuffer(part.weights);
      gl.deleteVertexArray(part.vao);
      this.parts.delete(source);
    }
  }
}

// One sample per occupied cell of a grid centred on the bounding box: the surface
// point nearest the cell centre, as barycentric weights of its triangle. Sampling
// the surface rather than picking vertices keeps the arrows mirror-symmetric even
// when the tessellation is not.
function sampleSurface(geometry: THREE.BufferGeometry) {
  const positions = geometry.getAttribute('position');
  const index = geometry.index;
  if (!positions || !geometry.getAttribute('normal')) return { corners: new Uint32Array(), weights: new Float32Array(), count: 0 };
  const cornerCount = index ? index.count : positions.count;
  const corner = (at: number) => index ? index.getX(at) : at;
  geometry.boundingBox ?? geometry.computeBoundingBox();
  const center = geometry.boundingBox!.getCenter(new THREE.Vector3());
  const target = Math.min(positions.count, Math.max(MIN_NORMALS, Math.round(positions.count / VERTICES_PER_NORMAL)));
  const cell = Math.sqrt(surfaceArea(geometry) / target) || 1;
  const snap = (value: number) => Math.sign(value) * Math.round(Math.abs(value));
  const triangle = new THREE.Triangle();
  const bounds = new THREE.Box3();
  const cellCenter = new THREE.Vector3();
  const closest = new THREE.Vector3();
  const weights = new THREE.Vector3();
  const best = new Map<string, { distance: number; corners: number[]; weights: number[] }>();
  for (let first = 0; first + 2 < cornerCount; first += 3) {
    const ids = [corner(first), corner(first + 1), corner(first + 2)];
    triangle.a.fromBufferAttribute(positions, ids[0]).sub(center).divideScalar(cell);
    triangle.b.fromBufferAttribute(positions, ids[1]).sub(center).divideScalar(cell);
    triangle.c.fromBufferAttribute(positions, ids[2]).sub(center).divideScalar(cell);
    bounds.setFromPoints([triangle.a, triangle.b, triangle.c]);
    for (let x = snap(bounds.min.x); x <= snap(bounds.max.x); x++) {
      for (let y = snap(bounds.min.y); y <= snap(bounds.max.y); y++) {
        for (let z = snap(bounds.min.z); z <= snap(bounds.max.z); z++) {
          triangle.closestPointToPoint(cellCenter.set(x, y, z), closest);
          if (snap(closest.x) !== x || snap(closest.y) !== y || snap(closest.z) !== z) continue;
          const distance = closest.distanceToSquared(cellCenter);
          const key = `${x},${y},${z}`;
          const current = best.get(key);
          if (current && current.distance <= distance) continue;
          triangle.getBarycoord(closest, weights);
          best.set(key, { distance, corners: ids, weights: weights.toArray() });
        }
      }
    }
  }
  const samples = [...best.values()];
  return {
    corners: Uint32Array.from(samples.flatMap(sample => sample.corners)),
    weights: Float32Array.from(samples.flatMap(sample => sample.weights)),
    count: samples.length
  };
}

function surfaceArea(geometry: THREE.BufferGeometry) {
  const positions = geometry.getAttribute('position');
  const index = geometry.index;
  const corners = index ? index.count : positions.count;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let area = 0;
  for (let corner = 0; corner + 2 < corners; corner += 3) {
    const vertex = (offset: number) => index ? index.getX(corner + offset) : corner + offset;
    a.fromBufferAttribute(positions, vertex(0));
    b.fromBufferAttribute(positions, vertex(1)).sub(a);
    c.fromBufferAttribute(positions, vertex(2)).sub(a);
    area += b.cross(c).length() / 2;
  }
  return area;
}
