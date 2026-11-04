import * as THREE from 'three';

export class GpuDevice {
  private static instance?: GpuDevice;

  static shared() {
    return GpuDevice.instance ??= new GpuDevice();
  }

  readonly renderer: THREE.WebGLRenderer;
  readonly gl: WebGL2RenderingContext;
  readonly pixelRatio = Math.min(window.devicePixelRatio, 2);
  private width = 1;
  private height = 1;

  private constructor() {
    const canvas = document.createElement('canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.debug.checkShaderErrors = false;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(1, 1, false);
    this.gl = this.renderer.getContext() as WebGL2RenderingContext;
  }

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

  present(target: CanvasRenderingContext2D) {
    const source = this.renderer.domElement;
    const { width, height } = target.canvas;
    target.globalCompositeOperation = 'copy';
    target.drawImage(source, 0, source.height - height, width, height, 0, 0, width, height);
  }
}
