import * as THREE from 'three';

/**
 * The app's one WebGL context. Its canvas is never in the page: a viewport
 * renders into the bottom-left corner and copies the result into its own 2D
 * canvas. The DOM, CSS and stacking of every viewport therefore stay exactly
 * as they would be with a context per viewport, but programs, textures and
 * meshes live in one place and the browser's context limit is never reached.
 */
export class GpuDevice {
  private static instance?: GpuDevice;

  /** Created on first use. Throws where WebGL2 is unavailable. */
  static shared() {
    return GpuDevice.instance ??= new GpuDevice();
  }

  readonly renderer: THREE.WebGLRenderer;
  readonly gl: WebGL2RenderingContext;
  /** Unbounded DPR makes large viewports prohibitively expensive on retina displays without a visible benefit. */
  readonly pixelRatio = Math.min(window.devicePixelRatio, 2);
  private width = 1;
  private height = 1;

  private constructor() {
    const canvas = document.createElement('canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    // Only three.js's own helpers compile through it; task shaders compile in Program.
    this.renderer.debug.checkShaderErrors = false;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(1, 1, false);
    this.gl = this.renderer.getContext() as WebGL2RenderingContext;
  }

  /** Prepares a frame of `width` × `height` CSS pixels in the corner of the shared canvas. */
  begin(width: number, height: number) {
    if (width > this.width || height > this.height) {
      this.width = Math.max(width, this.width);
      this.height = Math.max(height, this.height);
      this.renderer.setSize(this.width, this.height, false);
    }
    this.renderer.setRenderTarget(null);
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, width, height);
  }

  /** Copies the frame into `target`. It must run in the same task as the drawing. */
  present(target: CanvasRenderingContext2D) {
    const source = this.renderer.domElement;
    const { width, height } = target.canvas;
    target.globalCompositeOperation = 'copy';
    target.drawImage(source, 0, source.height - height, width, height, 0, 0, width, height);
  }
}
