import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { ViewHelper } from 'three/examples/jsm/helpers/ViewHelper.js';
import { base } from '$app/paths';
import { ShaderTaskMaterial, type ShaderInput } from './ShaderTaskMaterial';
import { InfiniteGrid } from './InfiniteGrid';
import { validateShaderProgram, type ShaderDiagnostic, type ShaderDiagnostics } from './shaderValidation';

// TransformControls normally occupy a fixed fraction of the canvas height.
// Use the size they have in a typical 600px-high viewport as our fixed visual size.
const TRANSFORM_CONTROLS_REFERENCE_HEIGHT = 600;

export type ViewportCameraPose = {
  position: [number, number, number];
  quaternion: [number, number, number, number];
  target: [number, number, number];
  fov: number;
};

export type ViewportShaderError = ShaderDiagnostic;

export type Object = {
  id: string;
  source:
    | { type: 'primitive'; geometry: 'plane' | 'sphere' | 'box' }
    | { type: 'model'; path: string };
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  instances?: {
    count: number;
    matrices?: number[][];
  };
};

export type Scene = {
  objects: Object[];
};

export type ViewportTransform = {
  position: [number, number, number];
  quaternion: [number, number, number, number];
  scale: [number, number, number];
};

export type ViewportOverlays = {
  infiniteGrid?: boolean;
  viewHelper?: boolean;
  transformControls?: {
    mode?: 'translate' | 'rotate' | 'scale';
  };
};

export type RendererOptions = {
  container: HTMLElement;
  vertexShader: string;
  fragmentShader: string;
  inputs?: ShaderInput[];
  uniformValues?: Record<string, number | number[] | boolean>;
  shaderLineOffsets?: { vertex: number; fragment: number };
  cameraPose: ViewportCameraPose;
  overlays?: ViewportOverlays;
  reportErrors?: boolean;
  onCameraChange?: (pose: ViewportCameraPose) => void;
  onTransformChange?: (transform: ViewportTransform) => void;
  onShaderErrors?: (errors: ShaderDiagnostics) => void;
};

type Drawable = THREE.Mesh | THREE.InstancedMesh;
type Geometry = {
  geometry: THREE.BufferGeometry;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
};

export class Renderer {
  readonly scene = new THREE.Scene();
  private readonly gridScene = new THREE.Scene();
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly material: ShaderTaskMaterial;

  private readonly container: HTMLElement;
  private readonly clock = new THREE.Clock();
  private readonly loader = new GLTFLoader();
  private readonly onCameraChange?: RendererOptions['onCameraChange'];
  private readonly onTransformChange?: RendererOptions['onTransformChange'];
  private readonly onShaderErrors?: RendererOptions['onShaderErrors'];
  private readonly reportErrors: boolean;
  private resizeObserver: ResizeObserver;
  private animationFrame = 0;
  private resizeFrame = 0;
  private renderedWidth = 0;
  private renderedHeight = 0;
  private disposed = false;
  private applyingCamera = false;
  private cameraKey = '';
  private transformDragging = false;
  private sceneGeneration = 0;
  private drawables: Drawable[] = [];
  private objectGroups: THREE.Group[] = [];
  private loadedRoots: THREE.Object3D[] = [];
  private uniformValues: Record<string, number | number[] | boolean>;
  private shaderLineOffsets: { vertex: number; fragment: number };
  private overlays: ViewportOverlays | undefined;
  private overlaysKey = '';
  private infiniteGrid?: InfiniteGrid;
  private transformControls?: TransformControls;
  private transformControlsHelper?: THREE.Object3D;
  private viewHelper?: ViewHelper;
  private viewHelperPointerUp?: (event: PointerEvent) => void;
  private transformProxy?: THREE.Object3D;
  private applyingTransform = false;
  private horizontalFov: number;
  private shaderRenderable = false;

  constructor(options: RendererOptions) {
    this.container = options.container;
    this.onCameraChange = options.onCameraChange;
    this.onTransformChange = options.onTransformChange;
    this.onShaderErrors = options.onShaderErrors;
    this.reportErrors = options.reportErrors ?? false;
    this.uniformValues = options.uniformValues ?? {};
    this.shaderLineOffsets = options.shaderLineOffsets ?? { vertex: 0, fragment: 0 };

    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.horizontalFov = options.cameraPose.fov;
    const verticalFov = 2 * Math.atan(Math.tan(this.horizontalFov * Math.PI / 360) / (width / height)) * 180 / Math.PI;
    this.camera = new THREE.PerspectiveCamera(verticalFov, width / height, 0.01, 10_000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(width, height, false);
    this.renderer.domElement.style.cssText = 'width: 100%; height: 100%; display: block;';
    // Candidate programs are validated before Three.js sees them. Its debug
    // compiler is therefore unnecessary and cannot repeatedly log bad programs.
    this.renderer.debug.checkShaderErrors = false;
    this.container.appendChild(this.renderer.domElement);

    const initialValidation = this.validateShaders(options.vertexShader, options.fragmentShader);
    const fallbackVertex = 'precision highp float; in vec3 position; void main() { gl_Position = vec4(position, 1.0); }';
    const fallbackFragment = 'precision highp float; out vec4 fragColor; void main() { fragColor = vec4(0.0); }';
    this.shaderRenderable = initialValidation.valid;
    this.publishDiagnostics(initialValidation.diagnostics);

    this.material = new ShaderTaskMaterial({
      vertexShader: initialValidation.valid ? options.vertexShader : fallbackVertex,
      fragmentShader: initialValidation.valid ? options.fragmentShader : fallbackFragment,
      inputs: [
        { type: 'float', name: 'time', init: 0 },
        { type: 'vec2', name: 'iResolution', init: [width * window.devicePixelRatio, height * window.devicePixelRatio] },
        { type: 'float', name: 'cameraFov', init: this.horizontalFov * Math.PI / 180 },
        { type: 'vec3', name: 'cameraPosition', init: [0, 0, 1] },
        { type: 'vec3', name: 'cameraDirection', init: [0, 0, -1] },
        ...(options.inputs ?? [])
      ]
    });
    // Teaching shaders supply their control uniforms at construction time.
    // Apply them before the first draw; otherwise WebGL uses zero-valued
    // uniforms until a later reactive update or interaction occurs.
    this.setUniformValues(this.uniformValues);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 0;
    this.controls.maxDistance = 50;
    this.controls.maxPolarAngle = Math.PI;
    this.controls.addEventListener('change', () => this.saveCamera());
    this.applyCameraPose(options.cameraPose);
    if (options.overlays?.infiniteGrid !== false) {
      this.infiniteGrid = new InfiniteGrid();
      this.gridScene.add(this.infiniteGrid);
    }
    this.setOverlays(options.overlays);

    this.resizeObserver = new ResizeObserver(() => this.scheduleResize());
    this.resizeObserver.observe(this.container);
    this.resize();
    this.animate();
  }

  setUniformValues(values: Record<string, number | number[] | boolean>) {
    this.uniformValues = values;
    Object.entries(values).forEach(([name, value]) => this.material.setInput(name, value));
  }

  setInputs(inputs: ShaderInput[] = []) {
    inputs.forEach(input => this.material.addInput(input));
  }

  setCameraPose(pose: ViewportCameraPose) {
    this.applyCameraPose(pose);
  }

  updateShaders(vertexShader: string, fragmentShader: string) {
    const validation = this.validateShaders(vertexShader, fragmentShader);
    this.shaderRenderable = validation.valid;
    this.publishDiagnostics(validation.diagnostics);
    if (!validation.valid) {
      this.renderScene();
      return;
    }
    this.material.updateShaders(vertexShader, fragmentShader);
    // Compile during the edit update instead of waiting for the next animation
    // frame. This makes diagnostics deterministic even while the viewport is
    // hidden, resizing, or still settling after a route change.
    this.renderScene();
  }

  setShaderLineOffsets(offsets: { vertex: number; fragment: number }) {
    this.shaderLineOffsets = offsets;
  }

  setOverlays(overlays: ViewportOverlays | undefined) {
    const key = JSON.stringify(overlays ?? {});
    if (key === this.overlaysKey) return;
    this.disposeOverlays();
    this.overlays = overlays;
    this.overlaysKey = key;

    if (overlays?.viewHelper !== false) {
      this.viewHelper = new ViewHelper(this.camera, this.renderer.domElement);
      this.viewHelper.setLabels('X', 'Y', 'Z');
      this.viewHelperPointerUp = event => {
        if (!this.viewHelper?.handleClick(event)) return;
        this.controls.enabled = false;
        event.preventDefault();
        event.stopPropagation();
      };
      this.renderer.domElement.addEventListener('pointerup', this.viewHelperPointerUp);
    }

    if (overlays?.transformControls) {
      this.transformProxy = new THREE.Object3D();
      this.scene.add(this.transformProxy);
      this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
      this.transformControls.setMode(overlays.transformControls.mode ?? 'translate');
      this.updateTransformControlsSize();
      this.transformControls.attach(this.transformProxy);
      this.transformControls.addEventListener('mouseDown', () => {
        this.transformDragging = true;
        this.controls.enabled = false;
      });
      this.transformControls.addEventListener('mouseUp', () => {
        this.transformDragging = false;
    this.controls.enabled = !this.transformDragging && !this.viewHelper?.animating;
      });
      this.transformControls.addEventListener('dragging-changed', event => {
        this.transformDragging = Boolean(event.value);
        this.controls.enabled = !this.transformDragging && !this.viewHelper?.animating;
      });
      this.transformControls.addEventListener('objectChange', () => this.saveTransform());
      this.transformControlsHelper = this.transformControls.getHelper();
      this.scene.add(this.transformControlsHelper);
    }
  }

  setTransformMode(mode: 'translate' | 'rotate' | 'scale') {
    this.transformControls?.setMode(mode);
  }

  setTransformOverlayMatrix(matrix: number[] | undefined) {
    if (!this.transformProxy || !matrix || matrix.length !== 16) return;
    const m = new THREE.Matrix4().fromArray(matrix);
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    m.decompose(p, q, s);
    if (
      this.transformProxy.position.equals(p) &&
      this.transformProxy.quaternion.equals(q) &&
      this.transformProxy.scale.equals(s)
    ) return;
    this.applyingTransform = true;
    this.transformProxy.position.copy(p);
    this.transformProxy.quaternion.copy(q);
    this.transformProxy.scale.copy(s);
    this.transformProxy.updateMatrixWorld();
    this.applyingTransform = false;
  }

  async setScene(sceneDefinition: Scene) {
    const generation = ++this.sceneGeneration;
    this.clearObjects();
    for (const object of sceneDefinition.objects) {
      const geometries = await this.loadGeometries(object);
      if (this.disposed || generation !== this.sceneGeneration) {
        geometries.forEach(loaded => loaded.geometry.dispose());
        continue;
      }
      const group = new THREE.Group();
      group.name = object.id;
      group.position.fromArray(object.position ?? [0, 0, 0]);
      group.rotation.fromArray(object.rotation ?? [0, 0, 0]);
      group.scale.fromArray(object.scale ?? [1, 1, 1]);
      this.objectGroups.push(group);
      this.scene.add(group);
      geometries.forEach((loaded, index) => this.addDrawable(object, group, loaded, `${object.id}-${index}`));
    }
    this.renderScene();
  }

  private async loadGeometries(object: Object): Promise<Geometry[]> {
    if (object.source.type === 'primitive') {
      const geometry = object.source.geometry === 'plane'
        ? new THREE.PlaneGeometry(2, 2)
        : object.source.geometry === 'sphere'
          ? new THREE.SphereGeometry(1, 48, 32)
          : new THREE.BoxGeometry(1, 1, 1);
      return [{ geometry, position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), scale: new THREE.Vector3(1, 1, 1) }];
    }

    try {
      const gltf = await this.loader.loadAsync(this.resolvePath(object.source.path));
      gltf.scene.updateMatrixWorld(true);
      this.loadedRoots.push(gltf.scene);
      const geometries: Geometry[] = [];
      gltf.scene.traverse(child => {
        if ((child as THREE.Mesh).isMesh) {
          geometries.push({
            geometry: (child as THREE.Mesh).geometry.clone(),
            position: new THREE.Vector3(),
            quaternion: new THREE.Quaternion(),
            scale: new THREE.Vector3()
          });
          child.matrixWorld.decompose(
            geometries[geometries.length - 1].position,
            geometries[geometries.length - 1].quaternion,
            geometries[geometries.length - 1].scale
          );
        }
      });
      if (geometries.length) return geometries;
      return [{ geometry: new THREE.BoxGeometry(1, 1, 1), position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), scale: new THREE.Vector3(1, 1, 1) }];
    } catch (error) {
      console.error(`Failed to load viewport model ${object.source.path}:`, error);
      return [{ geometry: new THREE.BoxGeometry(1, 1, 1), position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), scale: new THREE.Vector3(1, 1, 1) }];
    }
  }

  private addDrawable(object: Object, group: THREE.Group, loaded: Geometry, id: string) {
    const count = Math.max(1, Math.floor(object.instances?.count ?? 1));
    // Use one consistent drawable type. This keeps the attribute/program path
    // identical for ordinary and instanced tasks, including count === 1.
    const drawable: Drawable = new THREE.InstancedMesh(loaded.geometry, this.material, count);
    drawable.name = id;
    drawable.position.copy(loaded.position);
    drawable.quaternion.copy(loaded.quaternion);
    drawable.scale.copy(loaded.scale);

    if (drawable instanceof THREE.InstancedMesh) {
      for (let index = 0; index < count; index++) {
        const matrix = object.instances?.matrices?.[index];
        const instanceMatrix = matrix?.length === 16
          ? new THREE.Matrix4().fromArray(matrix)
          : new THREE.Matrix4().identity();
        drawable.setMatrixAt(index, instanceMatrix);
      }
      drawable.instanceMatrix.needsUpdate = true;
    }
    this.drawables.push(drawable);
    group.add(drawable);
  }

  private clearObjects() {
    this.drawables.forEach(drawable => {
      drawable.geometry.dispose();
    });
    this.drawables = [];
    this.objectGroups.forEach(group => this.scene.remove(group));
    this.objectGroups = [];
    this.loadedRoots.forEach(root => root.traverse(child => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach(material => material.dispose());
    }));
    this.loadedRoots = [];
  }

  private resolvePath(path: string) {
    return `${base}/${path.replace(/^\//, '')}`;
  }

  private applyCameraPose(pose: ViewportCameraPose) {
    const key = JSON.stringify(pose);
    if (this.cameraKey === key) return;
    this.applyingCamera = true;
    this.camera.position.fromArray(pose.position);
    this.camera.quaternion.fromArray(pose.quaternion);
    this.horizontalFov = pose.fov;
    this.camera.fov = 2 * Math.atan(Math.tan(pose.fov * Math.PI / 360) / this.camera.aspect) * 180 / Math.PI;
    this.camera.updateProjectionMatrix();
    this.controls.target.fromArray(pose.target);
    this.controls.update();
    this.cameraKey = key;
    this.applyingCamera = false;
  }

  private saveCamera() {
    if (this.applyingCamera) return;
    const pose: ViewportCameraPose = {
      position: this.camera.position.toArray() as ViewportCameraPose['position'],
      quaternion: this.camera.quaternion.toArray() as ViewportCameraPose['quaternion'],
      target: this.controls.target.toArray() as ViewportCameraPose['target'],
      fov: this.horizontalFov
    };
    this.cameraKey = JSON.stringify(pose);
    this.onCameraChange?.(pose);
  }

  private saveTransform() {
    if (this.applyingTransform || !this.transformProxy) return;
    this.onTransformChange?.({
      position: this.transformProxy.position.toArray() as ViewportTransform['position'],
      quaternion: this.transformProxy.quaternion.toArray() as ViewportTransform['quaternion'],
      scale: this.transformProxy.scale.toArray() as ViewportTransform['scale']
    });
  }

  private disposeOverlays() {
    if (this.viewHelper) {
      if (this.viewHelperPointerUp) this.renderer.domElement.removeEventListener('pointerup', this.viewHelperPointerUp);
      this.viewHelper.dispose();
      this.viewHelper = undefined;
      this.viewHelperPointerUp = undefined;
    }
    if (this.transformControls) {
      this.transformControls.detach();
      if (this.transformControlsHelper) this.scene.remove(this.transformControlsHelper);
      this.transformControls.dispose();
      this.transformControls = undefined;
      this.transformControlsHelper = undefined;
    }
    if (this.transformProxy) {
      this.scene.remove(this.transformProxy);
      this.transformProxy = undefined;
    }
  }

  private scheduleResize() {
    if (this.resizeFrame) return;
    this.resizeFrame = requestAnimationFrame(() => {
      this.resizeFrame = 0;
      this.resize();
    });
  }

  private resize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    // Split panes can briefly report zero dimensions while being dragged.
    // Do not resize the WebGL buffer to that transient state.
    if (width < 2 || height < 2) return;
    if (width === this.renderedWidth && height === this.renderedHeight) return;

    this.renderedWidth = width;
    this.renderedHeight = height;
    this.renderer.setSize(width, height, false);
    this.updateTransformControlsSize(height);
    this.camera.aspect = width / height;
    this.camera.fov = 2 * Math.atan(Math.tan(this.horizontalFov * Math.PI / 360) / this.camera.aspect) * 180 / Math.PI;
    this.camera.updateProjectionMatrix();
    this.material.setInput('iResolution', [this.renderer.domElement.width, this.renderer.domElement.height]);
    // Paint immediately after changing the drawing buffer. This keeps the
    // viewport responsive while a split pane is being dragged.
    this.renderScene();
    if (this.viewHelper) {
      const autoClear = this.renderer.autoClear;
      this.renderer.autoClear = false;
      this.viewHelper.render(this.renderer);
      this.renderer.autoClear = autoClear;
    }
  }

  /**
   * TransformControls' built-in perspective scaling makes `size: 1` cover a
   * fixed portion of the viewport height. Counteract that behavior so the
   * gizmo remains the same size in CSS pixels while panes are resized.
   */
  private updateTransformControlsSize(height = this.container.clientHeight) {
    if (height < 1) return;
    this.transformControls?.setSize(TRANSFORM_CONTROLS_REFERENCE_HEIGHT / height);
  }

  private renderScene() {
    const autoClear = this.renderer.autoClear;
    if (this.infiniteGrid) {
      this.renderer.autoClear = true;
      this.renderer.render(this.gridScene, this.camera);
      this.renderer.autoClear = false;
    }
    if (this.shaderRenderable) this.renderer.render(this.scene, this.camera);
    else if (!this.infiniteGrid) this.renderer.clear();
    this.renderer.autoClear = autoClear;
  }

  private animate = () => {
    if (this.disposed) return;
    this.animationFrame = requestAnimationFrame(this.animate);
    const delta = this.clock.getDelta();
    this.controls.enabled = !this.transformDragging && !this.viewHelper?.animating;
    this.controls.update();
    if (this.viewHelper?.animating) {
      this.viewHelper.update(delta);
      if (!this.viewHelper.animating) this.saveCamera();
    }
    this.material.setInput('time', this.clock.elapsedTime);
    this.material.setInput('cameraPosition', this.camera.position.toArray());
    this.material.setInput('cameraDirection', this.camera.getWorldDirection(new THREE.Vector3()).toArray());
    this.material.setInput('cameraFov', this.horizontalFov * Math.PI / 180);
    Object.entries(this.uniformValues).forEach(([name, value]) => this.material.setInput(name, value));
    this.renderScene();
    if (this.viewHelper) {
      // ViewHelper performs its own renderer.render() call. Prevent that
      // second pass from clearing the full viewport before drawing its corner.
      const autoClear = this.renderer.autoClear;
      this.renderer.autoClear = false;
      this.viewHelper.render(this.renderer);
      this.renderer.autoClear = autoClear;
    }
  };

  private validateShaders(vertexShader: string, fragmentShader: string) {
    return validateShaderProgram(
      this.renderer.getContext() as WebGL2RenderingContext,
      vertexShader,
      fragmentShader,
      this.shaderLineOffsets
    );
  }

  private publishDiagnostics(diagnostics: ShaderDiagnostics) {
    if (this.reportErrors) this.onShaderErrors?.(diagnostics);
    else if (diagnostics.vertex.length || diagnostics.fragment.length) console.error('Shader validation failed', diagnostics);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.animationFrame);
    cancelAnimationFrame(this.resizeFrame);
    this.sceneGeneration++;
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.disposeOverlays();
    if (this.infiniteGrid) {
      this.gridScene.remove(this.infiniteGrid);
      this.infiniteGrid.geometry.dispose();
      this.infiniteGrid.material.dispose();
      this.infiniteGrid = undefined;
    }
    this.clearObjects();
    this.material.dispose();
    this.renderer.dispose();
    if (this.container.contains(this.renderer.domElement)) this.container.removeChild(this.renderer.domElement);
  }
}
