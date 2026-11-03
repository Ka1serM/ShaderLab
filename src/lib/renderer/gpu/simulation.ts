import { bufferSampler, type BufferLayout } from './compute';
import type { GpuTexture, Program } from './program';

type StateTarget = { framebuffer: WebGLFramebuffer; textures: GpuTexture[] };

/**
 * The state of a compute buffer, held twice: a dispatch reads the current
 * textures and writes the other set, then the two swap. No element can see a
 * half-updated neighbour, whatever order the GPU runs fragments in.
 */
export class Simulation {
  private readonly targets: [StateTarget, StateTarget];
  private current = 0;

  /** Throws where the browser cannot render into float textures. */
  constructor(private readonly gl: WebGL2RenderingContext, readonly layout: BufferLayout) {
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('This browser cannot render into float textures (EXT_color_buffer_float), so compute shaders cannot run here.');
    const maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const maxTargets = Math.min(gl.getParameter(gl.MAX_DRAW_BUFFERS) as number, gl.getParameter(gl.MAX_COLOR_ATTACHMENTS) as number);
    if (layout.width > maxSize || layout.height > maxSize) throw new Error(`The buffer needs a ${layout.width} × ${layout.height} texture; this GPU allows ${maxSize}.`);
    if (layout.slots > maxTargets) throw new Error(`The element type needs ${layout.slots} render targets; this GPU allows ${maxTargets}.`);
    this.targets = [this.createTarget(), this.createTarget()];
  }

  /** The textures of the current state, one per four floats of the element type. */
  get textures() {
    return this.targets[this.current].textures;
  }

  /** Runs `program` once per element. Its other uniforms must be set already. The caller restores the GL state. */
  dispatch(program: Program) {
    const gl = this.gl;
    const source = this.targets[this.current];
    const target = this.targets[1 - this.current];
    source.textures.forEach((texture, slot) => program.setTexture(bufferSampler(slot), texture));
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, this.layout.width, this.layout.height);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.colorMask(true, true, true, true);
    program.bind();
    gl.bindVertexArray(null);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.current = 1 - this.current;
  }

  dispose() {
    for (const target of this.targets) {
      this.gl.deleteFramebuffer(target.framebuffer);
      target.textures.forEach(texture => this.gl.deleteTexture(texture.handle));
    }
  }

  private createTarget(): StateTarget {
    const gl = this.gl;
    const { width, height, slots } = this.layout;
    const framebuffer = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    const textures: GpuTexture[] = [];
    for (let slot = 0; slot < slots; slot++) {
      const handle = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, handle);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, width, height);
      // Elements are read with texelFetch; float32 textures cannot filter anyway.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + slot, gl.TEXTURE_2D, handle, 0);
      textures.push({ target: gl.TEXTURE_2D, handle });
    }
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.drawBuffers(textures.map((_, slot) => gl.COLOR_ATTACHMENT0 + slot));
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`The compute buffer cannot be rendered into (framebuffer status ${status}).`);
    return { framebuffer, textures };
  }
}
