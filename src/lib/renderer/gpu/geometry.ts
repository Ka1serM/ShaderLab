import * as THREE from 'three';
import type { Program } from './program';

type SourceAttribute = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;

function glType(gl: WebGL2RenderingContext, array: ArrayLike<number>) {
  if (array instanceof Float32Array) return gl.FLOAT;
  if (array instanceof Uint16Array) return gl.UNSIGNED_SHORT;
  if (array instanceof Int16Array) return gl.SHORT;
  if (array instanceof Uint32Array) return gl.UNSIGNED_INT;
  if (array instanceof Int32Array) return gl.INT;
  if (array instanceof Int8Array) return gl.BYTE;
  if (array instanceof Uint8Array || array instanceof Uint8ClampedArray) return gl.UNSIGNED_BYTE;
  throw new Error('Unsupported vertex attribute array type.');
}

function isIntegerAttribute(gl: WebGL2RenderingContext, type: number) {
  return ([gl.INT, gl.INT_VEC2, gl.INT_VEC3, gl.INT_VEC4, gl.UNSIGNED_INT, gl.UNSIGNED_INT_VEC2, gl.UNSIGNED_INT_VEC3, gl.UNSIGNED_INT_VEC4] as number[]).includes(type);
}

export class GpuGeometry {
  private readonly buffers = new Map<ArrayLike<number>, WebGLBuffer>();
  private readonly index?: { buffer: WebGLBuffer; type: number; count: number };
  readonly vertexCount: number;
  private instanceBuffer?: WebGLBuffer;
  private instanceCapacity = 0;
  private vaos = new Map<Program, WebGLVertexArrayObject>();

  constructor(private readonly gl: WebGL2RenderingContext, readonly source: THREE.BufferGeometry, readonly instanceCount: number) {
    gl.bindVertexArray(null);
    const index = source.index;
    if (index) {
      const buffer = gl.createBuffer()!;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index.array as ArrayBufferView, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
      this.index = { buffer, type: index.array instanceof Uint32Array ? gl.UNSIGNED_INT : index.array instanceof Uint8Array ? gl.UNSIGNED_BYTE : gl.UNSIGNED_SHORT, count: index.count };
    }
    this.vertexCount = source.getAttribute('position')?.count ?? 0;
  }

  draw(program: Program, instances = this.instanceCount, mode = this.gl.TRIANGLES) {
    const gl = this.gl;
    if (instances < 1) return;
    if (instances > this.instanceCapacity && this.instanceBuffer) {
      gl.deleteBuffer(this.instanceBuffer);
      this.instanceBuffer = undefined;
      for (const vao of this.vaos.values()) gl.deleteVertexArray(vao);
      this.vaos.clear();
    }
    this.instanceCapacity = Math.max(this.instanceCapacity, instances);
    gl.bindVertexArray(this.vaoFor(program));
    const total = this.index ? this.index.count : this.vertexCount;
    const start = Math.max(0, this.source.drawRange.start);
    const count = Math.min(total - start, this.source.drawRange.count);
    if (count > 0) {
      if (this.index) {
        const bytes = this.index.type === gl.UNSIGNED_INT ? 4 : this.index.type === gl.UNSIGNED_BYTE ? 1 : 2;
        gl.drawElementsInstanced(mode, count, this.index.type, start * bytes, instances);
      } else {
        gl.drawArraysInstanced(mode, start, count, instances);
      }
    }
    gl.bindVertexArray(null);
  }

  drawVertices(program: Program, mode: number) {
    const gl = this.gl;
    if (this.vertexCount < 1) return;
    gl.bindVertexArray(this.vaoFor(program));
    gl.drawArrays(mode, 0, this.vertexCount);
    gl.bindVertexArray(null);
  }

  release(program: Program) {
    const vao = this.vaos.get(program);
    if (vao) this.gl.deleteVertexArray(vao);
    this.vaos.delete(program);
  }

  dispose() {
    const gl = this.gl;
    for (const vao of this.vaos.values()) gl.deleteVertexArray(vao);
    for (const buffer of this.buffers.values()) gl.deleteBuffer(buffer);
    if (this.index) gl.deleteBuffer(this.index.buffer);
    if (this.instanceBuffer) gl.deleteBuffer(this.instanceBuffer);
    this.vaos.clear();
    this.buffers.clear();
  }

  private bufferFor(array: ArrayLike<number>) {
    let buffer = this.buffers.get(array);
    if (!buffer) {
      const gl = this.gl;
      buffer = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, array as unknown as ArrayBufferView, gl.STATIC_DRAW);
      this.buffers.set(array, buffer);
    }
    return buffer;
  }

  private vaoFor(program: Program) {
    let vao = this.vaos.get(program);
    if (vao) return vao;
    const gl = this.gl;
    vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    for (const attribute of program.attributes.values()) {
      if (attribute.location < 0) continue;
      if (attribute.name === 'instanceMatrix' && attribute.type === gl.FLOAT_MAT4) {
        this.bindInstanceMatrix(attribute.location);
        continue;
      }
      const source = this.source.getAttribute(attribute.name) as SourceAttribute | undefined;
      if (!source) continue;
      const interleaved = source instanceof THREE.InterleavedBufferAttribute;
      const array = interleaved ? source.data.array : source.array;
      const type = glType(gl, array);
      const bytes = (array as unknown as Float32Array).BYTES_PER_ELEMENT;
      const stride = interleaved ? source.data.stride * bytes : 0;
      const offset = interleaved ? source.offset * bytes : 0;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bufferFor(array));
      gl.enableVertexAttribArray(attribute.location);
      if (isIntegerAttribute(gl, attribute.type) && type !== gl.FLOAT) gl.vertexAttribIPointer(attribute.location, source.itemSize, type, stride, offset);
      else gl.vertexAttribPointer(attribute.location, source.itemSize, type, source.normalized, stride, offset);
    }
    if (this.index) gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.index.buffer);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    this.vaos.set(program, vao);
    return vao;
  }

  private bindInstanceMatrix(location: number) {
    const gl = this.gl;
    if (!this.instanceBuffer) {
      const capacity = Math.max(this.instanceCapacity, this.instanceCount);
      const matrices = new Float32Array(16 * capacity);
      for (let instance = 0; instance < capacity; instance++) matrices.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], instance * 16);
      this.instanceBuffer = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, matrices, gl.STATIC_DRAW);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    for (let column = 0; column < 4; column++) {
      gl.enableVertexAttribArray(location + column);
      gl.vertexAttribPointer(location + column, 4, gl.FLOAT, false, 64, column * 16);
      gl.vertexAttribDivisor(location + column, 1);
    }
  }
}
