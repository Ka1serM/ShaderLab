import * as THREE from 'three';
import { GpuGeometry } from './gpu/geometry';
import { compileProgram, type Program } from './gpu/program';

// The arrow count grows with the square root of the vertex count, within
// bounds, so small meshes are not bare and dense ones stay readable.
const NORMALS_PER_SQRT_VERTEX = 1.5;
const MIN_NORMALS = 20;
const MAX_NORMALS = 50;
const LENGTH_PER_RADIUS = 0.12;
// Offset, relative to the mesh radius, used to measure how the vertex shader
// moves a point's neighbourhood. Small enough for curved deformations, large
// enough to stay well above float precision after the clip-space round trip.
const PROBE_PER_RADIUS = 2e-3;
const HEAD_LENGTH = 0.2;
const HEAD_WIDTH = 0.14;
const SHAFT_WIDTH = 0.045;
const HEAD_SEGMENTS = 8;

export type NormalsOptions = {
  // A vec3 vertex output to show instead of the normal derived from gl_Position,
  // for lessons where the shader's own (possibly wrong) normal is the point.
  normal?: string;
  // Space of `normal`: model (before the object's transform), world or view.
  space?: 'model' | 'world' | 'view';
  // Kept for older content; positions always come from gl_Position.
  position?: string;
  // Show the face normal of the triangle under each arrow (flat shading) instead
  // of the interpolated normal. One value for all instances, or one per
  // gl_InstanceID. Arrow positions are the same either way.
  flat?: boolean | boolean[];
};

export type NormalsPart = { source: THREE.BufferGeometry; matrixWorld: THREE.Matrix4; instances: number };

const INSTANCE_UNIFORM = 'shaderlabNormalsInstanceID';

// Replaces gl_InstanceID with a uniform so each instance can be captured with
// its own non-instanced draw.
function withInstanceUniform(source: string) {
  const replaced = source.replace(/\bgl_InstanceID\b/g, INSTANCE_UNIFORM);
  const declaration = `uniform int ${INSTANCE_UNIFORM};\n`;
  const version = replaced.match(/^\s*#version[^\n]*\n/);
  return version ? version[0] + declaration + replaced.slice(version[0].length) : declaration + replaced;
}

const CAPTURE_FRAGMENT = 'out vec4 color; void main() { color = vec4(0.0); }';

// Runs once per arrow (sample and instance): turns the captured clip positions
// of the sample's three corners back into world space and blends them with the
// sample's barycentric weights. With probes, a corner's normal is the cross
// product of its two transformed tangents, which is exactly how a normal
// transforms under any (locally linear) deformation, including non-uniform
// scale; the transformed normal probe only picks the side. aWeights.w selects
// the triangle's face normal instead (flat shading).
const RESOLVE_VERTEX = (derived: boolean) => `${derived ? '#define DERIVED\n' : ''}in vec4 aWeights;
in vec4 aClipA;
in vec4 aClipB;
in vec4 aClipC;
#ifdef DERIVED
in vec4 aTangentClipA;
in vec4 aTangentClipB;
in vec4 aTangentClipC;
in vec4 aBitangentClipA;
in vec4 aBitangentClipB;
in vec4 aBitangentClipC;
in vec4 aNormalClipA;
in vec4 aNormalClipB;
in vec4 aNormalClipC;
#else
in vec3 aNormalA;
in vec3 aNormalB;
in vec3 aNormalC;
uniform mat3 uNormalToWorld;
#endif
uniform mat4 uInverseViewProjection;
out vec4 vBase;
out vec4 vNormal;
vec3 unproject(vec4 clip) {
  vec4 world = uInverseViewProjection * clip;
  return world.xyz / world.w;
}
vec3 unit(vec3 value) {
  float lengthSquared = dot(value, value);
  return lengthSquared > 0.0 ? value * inversesqrt(lengthSquared) : vec3(0.0);
}
#ifdef DERIVED
vec3 cornerNormal(vec3 base, vec4 tangentClip, vec4 bitangentClip, vec4 normalClip) {
  vec3 normal = cross(unproject(tangentClip) - base, unproject(bitangentClip) - base);
  return unit(dot(normal, unproject(normalClip) - base) < 0.0 ? -normal : normal);
}
#endif
void main() {
  vec3 a = unproject(aClipA);
  vec3 b = unproject(aClipB);
  vec3 c = unproject(aClipC);
#ifdef DERIVED
  vec3 normal = mat3(
    cornerNormal(a, aTangentClipA, aBitangentClipA, aNormalClipA),
    cornerNormal(b, aTangentClipB, aBitangentClipB, aNormalClipB),
    cornerNormal(c, aTangentClipC, aBitangentClipC, aNormalClipC)) * aWeights.xyz;
#else
  vec3 normal = mat3(unit(uNormalToWorld * aNormalA), unit(uNormalToWorld * aNormalB), unit(uNormalToWorld * aNormalC)) * aWeights.xyz;
#endif
  vec3 base = mat3(a, b, c) * aWeights.xyz;
  if (aWeights.w > 0.5) {
    vec3 face = cross(b - a, c - a);
    normal = dot(face, normal) < 0.0 ? -face : face;
  }
  normal = unit(normal);
  bool valid = dot(normal, normal) > 0.5 && base == base && normal == normal && aClipA.w != 0.0 && aClipB.w != 0.0 && aClipC.w != 0.0;
  vBase = vec4(valid ? base : vec3(0.0), 1.0);
  vNormal = vec4(valid ? normal : vec3(0.0), 0.0);
  gl_Position = vec4(0.0);
}`;

// Each instance is one resolved arrow: a world position and a unit normal.
const ARROW_VERTEX = `in vec3 aArrow;
in vec4 aBase;
in vec4 aNormal;
uniform mat4 uViewProjection;
uniform float uLength;
void main() {
  vec3 normal = aNormal.xyz;
  if (!(dot(normal, normal) > 0.5)) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec3 side = normalize(cross(normal, abs(normal.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 world = aBase.xyz + uLength * (normal * aArrow.y + side * aArrow.x + cross(normal, side) * aArrow.z);
  gl_Position = uViewProjection * vec4(world, 1.0);
}`;

const ARROW_FRAGMENT = `uniform vec3 uColor;
out vec4 fragColor;
void main() {
  fragColor = vec4(uColor, 1.0);
}`;

const COLOR = [0xbf / 255, 0x27 / 255, 0x32 / 255];
const IDENTITY3 = new THREE.Matrix3().elements;
// Bytes per resolved arrow: vec4 position + vec4 normal, kept 16-byte aligned
// because some drivers (ANGLE on Vulkan) misread tightly packed vec3 instance
// data written by transform feedback.
const ARROW_BYTES = 32;

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

type Samples = { corners: Uint32Array; weights: Float32Array; count: number };

type Capture = { program: Program; derived: boolean };

type Resolve = { program: Program; derived: boolean };

type Entry = {
  samples: Samples;
  // Captured bytes per sample corner (all probes of it).
  captureStride: number;
  instances: number;
  flat: string;
  derived: boolean;
  geometry: GpuGeometry;
  captured: WebGLBuffer;
  resolved: WebGLBuffer;
  weights: WebGLBuffer;
  resolveVao: WebGLVertexArrayObject;
  arrowVao: WebGLVertexArrayObject;
};

export class NormalsOverlay {
  private readonly arrows: Program;
  private readonly resolvers: [Resolve, Resolve];
  private readonly arrowBuffer: WebGLBuffer;
  private readonly arrowVertexCount: number;
  private readonly transformFeedback: WebGLTransformFeedback;
  private readonly samples = new Map<THREE.BufferGeometry, Samples>();
  private readonly entries = new Map<string, Entry>();
  private readonly entryKeys = new WeakMap<THREE.BufferGeometry, number>();
  private nextSourceId = 0;
  private capture?: Capture;
  private captureKey?: string;
  private readonly viewProjection = new THREE.Matrix4();
  private readonly inverseViewProjection = new THREE.Matrix4();
  private readonly normalMatrix = new THREE.Matrix3();
  private readonly radius = new THREE.Sphere();

  constructor(private readonly gl: WebGL2RenderingContext) {
    const arrows = compileProgram(gl, ARROW_VERTEX, ARROW_FRAGMENT).program;
    const resolvers = [false, true].map(derived => compileProgram(gl, RESOLVE_VERTEX(derived), CAPTURE_FRAGMENT, { feedbackVaryings: ['vBase', 'vNormal'] }).program);
    if (!arrows || !resolvers[0] || !resolvers[1]) throw new Error('The normals overlay programs did not compile.');
    this.arrows = arrows;
    this.resolvers = [{ program: resolvers[0], derived: false }, { program: resolvers[1], derived: true }];
    const vertices = arrowVertices();
    this.arrowVertexCount = vertices.length / 3;
    this.arrowBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.arrowBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this.transformFeedback = gl.createTransformFeedback()!;
  }

  // Runs the scene's own vertex shader (all instances, current uniforms) on the
  // sample corners and draws one arrow per sample. Everything per frame stays
  // on the GPU, so the arrows follow animation, instancing and deformation.
  draw(vertexShader: string, options: NormalsOptions | undefined, parts: NormalsPart[], prepare: (program: Program, index: number) => void, camera: THREE.Camera) {
    const gl = this.gl;
    const capture = this.captureProgram(vertexShader, options?.normal);
    if (!capture) return;
    this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.inverseViewProjection.copy(this.viewProjection).invert();

    const used = new Set<string>();
    const work = parts.map((part, index) => {
      const instances = Math.max(1, part.instances);
      const flat = Array.from({ length: instances }, (_, instance) => flatFor(options, instance));
      const key = String(this.sourceId(part.source));
      used.add(key);
      const entry = this.entryFor(key, part.source, instances, flat, capture.derived);
      return { part, index, instances, entry: entry.samples.count ? entry : undefined };
    });
    this.prune(used, parts.map(part => part.source));

    gl.enable(gl.RASTERIZER_DISCARD);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this.transformFeedback);
    for (const { part, index, instances, entry } of work) {
      if (entry) {
        // One plain draw per instance into its own buffer range: drivers do not
        // agree on the output order of instanced transform feedback (ANGLE on
        // Vulkan scrambles it), so gl_InstanceID comes from a uniform instead.
        prepare(capture.program, index);
        const bytes = entry.samples.count * 3 * entry.captureStride;
        for (let instance = 0; instance < instances; instance++) {
          capture.program.set(INSTANCE_UNIFORM, instance);
          capture.program.bind();
          gl.bindBufferRange(gl.TRANSFORM_FEEDBACK_BUFFER, 0, entry.captured, instance * bytes, bytes);
          gl.beginTransformFeedback(gl.POINTS);
          entry.geometry.drawVertices(capture.program, gl.POINTS);
          gl.endTransformFeedback();
        }

        const resolve = this.resolvers[capture.derived ? 1 : 0].program;
        resolve.set('uInverseViewProjection', this.inverseViewProjection.elements);
        resolve.set('uNormalToWorld', this.normalToWorld(options?.space, part.matrixWorld, camera));
        resolve.bind();
        gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, entry.resolved);
        gl.bindVertexArray(entry.resolveVao);
        gl.beginTransformFeedback(gl.POINTS);
        gl.drawArrays(gl.POINTS, 0, entry.samples.count * instances);
        gl.endTransformFeedback();
        gl.bindVertexArray(null);
      }
    }
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    gl.disable(gl.RASTERIZER_DISCARD);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    this.arrows.set('uViewProjection', this.viewProjection.elements);
    this.arrows.set('uColor', COLOR);
    for (const { part, instances, entry } of work) {
      if (!entry) continue;
      part.source.boundingSphere ?? part.source.computeBoundingSphere();
      this.arrows.set('uLength', this.radius.copy(part.source.boundingSphere!).applyMatrix4(part.matrixWorld).radius * LENGTH_PER_RADIUS);
      this.arrows.bind();
      gl.bindVertexArray(entry.arrowVao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, this.arrowVertexCount, entry.samples.count * instances);
    }
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.useProgram(null);
  }

  dispose() {
    this.prune(new Set(), []);
    this.releaseCapture();
    this.arrows.dispose();
    for (const resolve of this.resolvers) resolve.program.dispose();
    this.gl.deleteBuffer(this.arrowBuffer);
    this.gl.deleteTransformFeedback(this.transformFeedback);
  }

  private normalToWorld(space: NormalsOptions['space'], matrixWorld: THREE.Matrix4, camera: THREE.Camera) {
    if (space === 'model') return this.normalMatrix.getNormalMatrix(matrixWorld).elements;
    if (space === 'view') return this.normalMatrix.getNormalMatrix(camera.matrixWorld).elements;
    return IDENTITY3;
  }

  private sourceId(source: THREE.BufferGeometry) {
    let id = this.entryKeys.get(source);
    if (id === undefined) this.entryKeys.set(source, id = this.nextSourceId++);
    return id;
  }

  // Captures gl_Position, plus the named normal output when one is given and it
  // can be captured; otherwise falls back to normals derived from gl_Position.
  private captureProgram(source: string, normal: string | undefined): Capture | undefined {
    const key = `${normal ?? ''}\0${source}`;
    if (key === this.captureKey) return this.capture;
    this.releaseCapture();
    this.captureKey = key;
    const vertexShader = withInstanceUniform(source);
    const gl = this.gl;
    if (normal) {
      const { program, diagnostics } = compileProgram(gl, vertexShader, CAPTURE_FRAGMENT, { feedbackVaryings: ['gl_Position', normal] });
      if (program && gl.getTransformFeedbackVarying(program.handle, 1)?.type === gl.FLOAT_VEC3) return this.capture = { program, derived: false };
      program?.dispose();
      const reason = program ? 'it must be a vec3 output' : [...diagnostics.vertex, ...diagnostics.fragment].map(diagnostic => diagnostic.message).join(' ');
      console.warn(`Normals overlay cannot capture ${normal} (${reason}); showing normals derived from gl_Position instead.`);
    }
    const { program } = compileProgram(gl, vertexShader, CAPTURE_FRAGMENT, { feedbackVaryings: ['gl_Position'] });
    return this.capture = program ? { program, derived: true } : undefined;
  }

  private releaseCapture() {
    if (this.capture) for (const entry of this.entries.values()) entry.geometry.release(this.capture.program);
    this.capture?.program.dispose();
    this.capture = undefined;
    this.captureKey = undefined;
  }

  private samplesFor(source: THREE.BufferGeometry) {
    let samples = this.samples.get(source);
    if (!samples) this.samples.set(source, samples = sampleSurface(source));
    return samples;
  }

  private entryFor(key: string, source: THREE.BufferGeometry, instances: number, flatInstances: boolean[], derived: boolean) {
    const flat = flatInstances.map(Number).join('');
    const existing = this.entries.get(key);
    if (existing && existing.instances === instances && existing.flat === flat && existing.derived === derived) return existing;
    if (existing) this.release(key, existing);
    const gl = this.gl;
    const samples = this.samplesFor(source);
    const probes = derived ? 4 : 1;
    source.boundingSphere ?? source.computeBoundingSphere();
    const geometry = new GpuGeometry(gl, probeGeometry(source, samples.corners, probes, (source.boundingSphere?.radius || 1) * PROBE_PER_RADIUS), instances);
    const arrows = samples.count * instances;

    const buffer = (bytes: number, usage: number) => {
      const handle = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, handle);
      gl.bufferData(gl.ARRAY_BUFFER, Math.max(4, bytes), usage);
      return handle;
    };
    const captureStride = derived ? 64 : 28;
    const captured = buffer(arrows * 3 * captureStride, gl.DYNAMIC_COPY);
    const resolved = buffer(arrows * ARROW_BYTES, gl.DYNAMIC_COPY);
    // Barycentric weights per arrow, w = 1 for face normals.
    const weightData = new Float32Array(Math.max(1, arrows) * 4);
    for (let instance = 0; instance < instances; instance++) {
      for (let sample = 0; sample < samples.count; sample++) {
        const at = (instance * samples.count + sample) * 4;
        weightData.set(samples.weights.subarray(sample * 3, sample * 3 + 3), at);
        weightData[at + 3] = flatInstances[instance] ? 1 : 0;
      }
    }
    const weights = buffer(0, gl.STATIC_DRAW);
    gl.bufferData(gl.ARRAY_BUFFER, weightData, gl.STATIC_DRAW);

    const attribute = (program: Program, name: string, handle: WebGLBuffer, size: number, stride: number, offset: number, divisor: number) => {
      const location = program.attributes.get(name)?.location ?? -1;
      if (location < 0) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, handle);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset);
      gl.vertexAttribDivisor(location, divisor);
    };

    // The resolve pass reads one sample's three corners per vertex.
    const resolve = this.resolvers[derived ? 1 : 0].program;
    const sampleStride = captureStride * 3;
    const resolveVao = gl.createVertexArray()!;
    gl.bindVertexArray(resolveVao);
    attribute(resolve, 'aWeights', weights, 4, 0, 0, 0);
    ['A', 'B', 'C'].forEach((name, corner) => {
      const at = corner * captureStride;
      attribute(resolve, `aClip${name}`, captured, 4, sampleStride, at, 0);
      if (derived) {
        attribute(resolve, `aTangentClip${name}`, captured, 4, sampleStride, at + 16, 0);
        attribute(resolve, `aBitangentClip${name}`, captured, 4, sampleStride, at + 32, 0);
        attribute(resolve, `aNormalClip${name}`, captured, 4, sampleStride, at + 48, 0);
      } else {
        attribute(resolve, `aNormal${name}`, captured, 3, sampleStride, at + 16, 0);
      }
    });

    const arrowVao = gl.createVertexArray()!;
    gl.bindVertexArray(arrowVao);
    attribute(this.arrows, 'aArrow', this.arrowBuffer, 3, 0, 0, 0);
    attribute(this.arrows, 'aBase', resolved, 4, ARROW_BYTES, 0, 1);
    attribute(this.arrows, 'aNormal', resolved, 4, ARROW_BYTES, 16, 1);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    const entry = { samples, captureStride, instances, flat, derived, geometry, captured, resolved, weights, resolveVao, arrowVao };
    this.entries.set(key, entry);
    return entry;
  }

  private release(key: string, entry: Entry) {
    const gl = this.gl;
    entry.geometry.dispose();
    entry.geometry.source.dispose();
    gl.deleteBuffer(entry.captured);
    gl.deleteBuffer(entry.resolved);
    gl.deleteBuffer(entry.weights);
    gl.deleteVertexArray(entry.resolveVao);
    gl.deleteVertexArray(entry.arrowVao);
    this.entries.delete(key);
  }

  private prune(keep: Set<string>, sources: THREE.BufferGeometry[]) {
    for (const [key, entry] of this.entries) if (!keep.has(key)) this.release(key, entry);
    for (const source of this.samples.keys()) if (!sources.includes(source)) this.samples.delete(source);
  }
}

function flatFor(options: NormalsOptions | undefined, instance: number) {
  const flat = options?.flat;
  return Boolean(Array.isArray(flat) ? flat[instance] : flat);
}

// Gathers every attribute of the sample corners into a point list. With four
// probes per corner, probes 1-3 move the position slightly along two tangents
// and the normal, so the captured gl_Position reveals how the shader moves the
// neighbourhood of each point.
function probeGeometry(source: THREE.BufferGeometry, corners: Uint32Array, probes: number, epsilon: number) {
  const geometry = new THREE.BufferGeometry();
  const total = corners.length * probes;
  for (const [name, attribute] of Object.entries(source.attributes)) {
    const size = attribute.itemSize;
    const sourceArray = attribute instanceof THREE.InterleavedBufferAttribute ? attribute.data.array : attribute.array;
    // getComponent decodes normalized (quantized) data, so those become floats;
    // plain integer attributes keep their type for integer shader inputs.
    const float = attribute.normalized || sourceArray instanceof Float32Array;
    const array = float ? new Float32Array(total * size) : new (sourceArray.constructor as Float32ArrayConstructor)(total * size);
    for (let corner = 0; corner < corners.length; corner++) {
      for (let component = 0; component < size; component++) {
        const value = attribute.getComponent(corners[corner], component);
        for (let probe = 0; probe < probes; probe++) array[(corner * probes + probe) * size + component] = value;
      }
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(array, size, float ? false : attribute.normalized));
  }
  const position = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (probes < 4 || !position || position.itemSize < 3) return geometry;

  const normals = source.getAttribute('normal');
  const positions = source.getAttribute('position');
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const face = new THREE.Vector3(), normal = new THREE.Vector3(), tangent = new THREE.Vector3(), bitangent = new THREE.Vector3(), point = new THREE.Vector3();
  for (let first = 0; first + 2 < corners.length; first += 3) {
    a.fromBufferAttribute(positions, corners[first]);
    b.fromBufferAttribute(positions, corners[first + 1]);
    c.fromBufferAttribute(positions, corners[first + 2]);
    face.subVectors(c, b).cross(a.clone().sub(b)).normalize();
    for (let offset = 0; offset < 3; offset++) {
      const corner = corners[first + offset];
      if (normals) normal.fromBufferAttribute(normals, corner);
      if (!normals || !(normal.lengthSq() > 1e-16)) normal.copy(face);
      if (!(normal.lengthSq() > 1e-16)) normal.set(0, 1, 0);
      normal.normalize();
      tangent.crossVectors(normal, Math.abs(normal.y) < 0.99 ? THREE.Object3D.DEFAULT_UP : new THREE.Vector3(1, 0, 0)).normalize();
      bitangent.crossVectors(normal, tangent);
      point.fromBufferAttribute(positions, corner);
      const base = (first + offset) * probes;
      position.setXYZ(base + 1, point.x + tangent.x * epsilon, point.y + tangent.y * epsilon, point.z + tangent.z * epsilon);
      position.setXYZ(base + 2, point.x + bitangent.x * epsilon, point.y + bitangent.y * epsilon, point.z + bitangent.z * epsilon);
      position.setXYZ(base + 3, point.x + normal.x * epsilon, point.y + normal.y * epsilon, point.z + normal.z * epsilon);
    }
  }
  return geometry;
}

function triangleCorners(geometry: THREE.BufferGeometry) {
  const positions = geometry.getAttribute('position');
  const index = geometry.index;
  const count = positions ? (index ? index.count : positions.count) - ((index ? index.count : positions.count) % 3) : 0;
  return { count, corner: (at: number) => index ? index.getX(at) : at };
}

const EMPTY: Samples = { corners: new Uint32Array(), weights: new Float32Array(), count: 0 };

// Arrows sit on triangle centres, where the normal is meaningful for every
// shading model: the face normal (flat) and the interpolated normal (Gouraud,
// per-fragment) both live there. One triangle per cell of an even grid, the one
// whose centre lies nearest the cell centre, keeps the arrows evenly spread.
function sampleSurface(geometry: THREE.BufferGeometry): Samples {
  const positions = geometry.getAttribute('position');
  const { count: cornerCount, corner } = triangleCorners(geometry);
  if (!cornerCount) return EMPTY;
  geometry.boundingBox ?? geometry.computeBoundingBox();
  const center = geometry.boundingBox!.getCenter(new THREE.Vector3());
  const target = Math.max(MIN_NORMALS, Math.min(MAX_NORMALS, Math.round(Math.sqrt(positions.count) * NORMALS_PER_SQRT_VERTEX)));
  const cell = Math.sqrt(surfaceArea(geometry) / target) || 1;
  const snap = (value: number) => Math.sign(value) * Math.round(Math.abs(value));
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const best = new Map<string, { distance: number; first: number }>();
  for (let first = 0; first < cornerCount; first += 3) {
    a.fromBufferAttribute(positions, corner(first));
    b.fromBufferAttribute(positions, corner(first + 1));
    c.fromBufferAttribute(positions, corner(first + 2));
    const centroid = a.add(b).add(c).divideScalar(3).sub(center).divideScalar(cell);
    const x = snap(centroid.x), y = snap(centroid.y), z = snap(centroid.z);
    const distance = (centroid.x - x) ** 2 + (centroid.y - y) ** 2 + (centroid.z - z) ** 2;
    const key = `${x},${y},${z}`;
    const current = best.get(key);
    if (!current || distance < current.distance) best.set(key, { distance, first });
  }
  const chosen = [...best.values()].map(sample => sample.first).sort((left, right) => left - right);
  const corners = new Uint32Array(chosen.length * 3);
  chosen.forEach((first, sample) => {
    for (let offset = 0; offset < 3; offset++) corners[sample * 3 + offset] = corner(first + offset);
  });
  return { corners, weights: new Float32Array(corners.length).fill(1 / 3), count: chosen.length };
}

function surfaceArea(geometry: THREE.BufferGeometry) {
  const positions = geometry.getAttribute('position');
  const { count, corner } = triangleCorners(geometry);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let area = 0;
  for (let first = 0; first + 2 < count; first += 3) {
    a.fromBufferAttribute(positions, corner(first));
    b.fromBufferAttribute(positions, corner(first + 1)).sub(a);
    c.fromBufferAttribute(positions, corner(first + 2)).sub(a);
    area += b.cross(c).length() / 2;
  }
  return area;
}
