import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { ViewHelper } from 'three/examples/jsm/helpers/ViewHelper.js';
import { base } from '$app/paths';
import { ShaderTaskMaterial, type ShaderInput } from './ShaderTaskMaterial';
import { InfiniteGrid } from './InfiniteGrid';
import { validateShaderProgram, type ShaderDiagnostic, type ShaderDiagnostics } from './shaderValidation';
import { readShaderMatrices, type ShaderReadbackRequest, type ShaderReadbackValue } from './shaderReadback';

// Scene assets must refresh when their Markdown definition changes during authoring.
THREE.Cache.enabled = false;

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
  /** Path to a GLB scene asset. */
  source: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  /** Number of identical instances. Their placement belongs in the shader. */
  instanceCount?: number;
  /** Draw quad outlines without showing their internal triangulation edges. */
  wireframe?: boolean;
  /** Outline width in framebuffer pixels. Only applies when `wireframe` is enabled. */
  lineWidth?: number;
};

export type Scene = {
  objects: Object[];
};

/** A named scene that can be selected from the viewport. */
export type SceneDefinition = Scene & {
  id: string;
  label: string;
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

export type ViewportVector = {
  id: string;
  value: [number, number, number];
  origin?: [number, number, number];
  visualization: 'vector' | 'point';
};

export type RendererOptions = {
  container: HTMLElement;
  vertexShader: string;
  fragmentShader: string;
  inputs?: ShaderInput[];
  uniformValues?: Record<string, number | number[] | boolean>;
  shaderLineOffsets?: { vertex: number; fragment: number };
  cameraPose: ViewportCameraPose;
  cameraPoseSaved?: boolean;
  overlays?: ViewportOverlays;
  reportErrors?: boolean;
  onCameraChange?: (pose: ViewportCameraPose) => void;
  onTransformChange?: (transform: ViewportTransform) => void;
  onShaderErrors?: (errors: ShaderDiagnostics) => void;
  shaderReadbacks?: ShaderReadbackRequest[];
  onShaderReadbacks?: (values: Record<string, ShaderReadbackValue>) => void;
};

/** All task-owned renderer state is replaced together during navigation. */
export type RendererTaskState = {
  inputs?: ShaderInput[];
  uniformValues?: Record<string, number | number[] | boolean>;
  overlays?: ViewportOverlays;
  shaderLineOffsets: { vertex: number; fragment: number };
  vertexShader: string;
  fragmentShader: string;
  scene: Scene;
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
  private shaderTime = 0;
  private timePaused = false;
  private readonly loader = new GLTFLoader();
  private readonly onCameraChange?: RendererOptions['onCameraChange'];
  private readonly onTransformChange?: RendererOptions['onTransformChange'];
  private readonly onShaderErrors?: RendererOptions['onShaderErrors'];
  private readonly reportErrors: boolean;
  private resizeObserver: ResizeObserver;
  private visibilityObserver: IntersectionObserver;
  private visible = true;
  private animationFrame = 0;
  private resizeFrame = 0;
  private settledResizeFrame = 0;
  private resizeRetryFrame = 0;
  private resizeRetries = 0;
  private renderedWidth = 0;
  private renderedHeight = 0;
  private disposed = false;
  private applyingCamera = false;
  private cameraKey = '';
  private cameraPoseSaved: boolean;
  private transformDragging = false;
  private sceneGeneration = 0;
  private drawables: Drawable[] = [];
  private objectGroups: THREE.Group[] = [];
  private uniformValues: Record<string, number | number[] | boolean>;
  private taskInputNames = new Set<string>();
  private uniformValueNames = new Set<string>();
  private shaderLineOffsets: { vertex: number; fragment: number };
  private overlays: ViewportOverlays | undefined;
  private overlaysKey = '';
  private infiniteGrid?: InfiniteGrid;
  private transformControls?: TransformControls;
  private transformControlsHelper?: THREE.Object3D;
  private viewHelper?: ViewHelper;
  private viewHelperPointerUp?: (event: PointerEvent) => void;
  private transformProxy?: THREE.Object3D;
  private transformOverlayMatrix = new THREE.Matrix4();
  private selectionPointerStart?: THREE.Vector2;
  private suppressSelection = false;
  private vectorHelpers = new Map<string, THREE.ArrowHelper>();
  private pointHelpers = new Map<string, THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>>();
  private applyingTransform = false;
  private horizontalFov: number;
  private shaderRenderable = false;
  private vertexShader: string;
  private shaderReadbacks: ShaderReadbackRequest[];
  private readonly onShaderReadbacks?: RendererOptions['onShaderReadbacks'];
  private readonly cameraDirection = new THREE.Vector3();
  private readonly cameraPositionArray = [0, 0, 0];
  private readonly cameraDirectionArray = [0, 0, -1];
  // Framebuffer-pixel coordinates, measured from the viewport's top-left.
  // The third component is 1 only while the pointer is inside the viewport.
  private readonly mousePositionArray = [0, 0, 0];

  constructor(options: RendererOptions) {
    this.container = options.container;
    this.cameraPoseSaved = options.cameraPoseSaved ?? false;
    this.onCameraChange = options.onCameraChange;
    this.onTransformChange = options.onTransformChange;
    this.onShaderErrors = options.onShaderErrors;
    this.onShaderReadbacks = options.onShaderReadbacks;
    this.shaderReadbacks = options.shaderReadbacks ?? [];
    this.vertexShader = options.vertexShader;
    this.reportErrors = options.reportErrors ?? false;
    this.uniformValues = options.uniformValues ?? {};
    this.shaderLineOffsets = options.shaderLineOffsets ?? { vertex: 0, fragment: 0 };

    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.horizontalFov = options.cameraPose.fov;
    const verticalFov = 2 * Math.atan(Math.tan(this.horizontalFov * Math.PI / 360) / (width / height)) * 180 / Math.PI;
    // This is the viewport camera's clip plane, unrelated to the projection
    // lesson's uNear control. Keep it small enough to inspect a frustum from
    // close range without slicing its outline.
    this.camera = new THREE.PerspectiveCamera(verticalFov, width / height, 0.1, 1_000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    // Unbounded DPR makes two side-by-side teaching viewports prohibitively
    // expensive on modern mobile/retina displays without a visible benefit.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height, false);
    this.renderer.domElement.style.cssText = 'width: 100%; height: 100%; display: block; background: transparent;';
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
        { type: 'vec3', name: 'iMouse', init: this.mousePositionArray },
        { type: 'float', name: 'cameraFov', init: this.horizontalFov * Math.PI / 180 },
        { type: 'vec3', name: 'cameraPosition', init: [0, 0, 1] },
        { type: 'vec3', name: 'cameraDirection', init: [0, 0, -1] },
        // This renderer-owned uniform must exist before any projection shader
        // can compile. Scene changes only alter its value.
        { type: 'float', name: 'uWireframeLineWidth', init: 3.5 },
        ...(options.inputs ?? [])
      ]
    });
    this.taskInputNames = new Set((options.inputs ?? []).map(input => input.name));
    // Teaching shaders supply their control uniforms at construction time.
    // Apply them before the first draw; otherwise WebGL uses zero-valued
    // uniforms until a later reactive update or interaction occurs.
    this.setUniformValues(this.uniformValues);

    this.renderer.domElement.addEventListener('pointerenter', this.handleMouseMove);
    this.renderer.domElement.addEventListener('pointermove', this.handleMouseMove);
    this.renderer.domElement.addEventListener('pointerleave', this.handleMouseLeave);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 0;
    this.controls.maxDistance = 100;
    this.controls.maxPolarAngle = Math.PI;
    this.controls.addEventListener('change', () => this.saveCamera());
    this.applyCameraPose(options.cameraPose);
    this.setOverlays(options.overlays);

    this.resizeObserver = new ResizeObserver(() => this.scheduleResize());
    this.resizeObserver.observe(this.container);
    this.visibilityObserver = new IntersectionObserver(entries => {
      this.visible = entries[0]?.isIntersecting ?? true;
    });
    this.visibilityObserver.observe(this.container);
    this.resize();
    this.animate();
  }

  setUniformValues(values: Record<string, number | number[] | boolean>) {
    const nextNames = new Set(Object.keys(values));
    for (const name of this.uniformValueNames) {
      if (!nextNames.has(name) && !this.taskInputNames.has(name)) this.material.removeInput(name);
    }
    this.uniformValues = values;
    Object.entries(values).forEach(([name, value]) => this.material.setInput(name, value));
    this.uniformValueNames = nextNames;
    this.updateShaderReadbacks();
  }

  setShaderReadbacks(readbacks: ShaderReadbackRequest[] = []) {
    this.shaderReadbacks = readbacks;
    this.updateShaderReadbacks();
  }

  setInputs(inputs: ShaderInput[] = []) {
    const nextNames = new Set(inputs.map(input => input.name));
    for (const name of this.taskInputNames) {
      if (!nextNames.has(name)) this.material.removeInput(name);
    }
    inputs.forEach(input => this.material.addInput(input));
    this.taskInputNames = nextNames;
  }

  setCameraPose(pose: ViewportCameraPose, saved = this.cameraPoseSaved) {
    this.cameraPoseSaved = saved;
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
    this.vertexShader = vertexShader;
    // Compile during the edit update instead of waiting for the next animation
    // frame. This makes diagnostics deterministic even while the viewport is
    // hidden, resizing, or still settling after a route change.
    this.renderScene();
    this.updateShaderReadbacks();
  }

  /**
   * Replaces every task-owned value before beginning the (possibly async)
   * scene load. This is the only transition path used for task navigation,
   * so no overlay, input, or shader can leak from the previous task.
   */
  async replaceTaskState(state: RendererTaskState) {
    this.setInputs(state.inputs);
    this.setWireframeLineWidth(state.scene);
    this.setUniformValues(state.uniformValues ?? {});
    this.setOverlays(state.overlays);
    this.setShaderLineOffsets(state.shaderLineOffsets);
    this.updateShaders(state.vertexShader, state.fragmentShader);
    await this.setScene(state.scene);
  }

  private updateShaderReadbacks() {
    if (!this.shaderRenderable || !this.shaderReadbacks.length) return;
    const values = readShaderMatrices(
      this.renderer.getContext() as WebGL2RenderingContext,
      this.vertexShader,
      this.shaderReadbacks,
      this.uniformValues
    );
    this.renderer.resetState();
    if (Object.keys(values).length) this.onShaderReadbacks?.(values);
  }

  setShaderLineOffsets(offsets: { vertex: number; fragment: number }) {
    this.shaderLineOffsets = offsets;
  }

  setTimePaused(paused: boolean) {
    this.timePaused = paused;
  }

  setOverlays(overlays: ViewportOverlays | undefined) {
    this.syncInfiniteGrid(overlays?.infiniteGrid !== false);
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
      this.transformControls.setSpace('local');
      this.transformControls.setMode(overlays.transformControls.mode ?? 'translate');
      this.updateTransformControlsSize();
      this.transformControls.addEventListener('mouseDown', () => {
        this.suppressSelection = true;
        this.transformDragging = true;
        this.controls.enabled = false;
      });
      this.transformControls.addEventListener('mouseUp', () => {
        this.transformDragging = false;
        this.controls.enabled = !this.transformDragging && !this.viewHelper?.animating;
        queueMicrotask(() => { this.suppressSelection = false; });
      });
      this.transformControls.addEventListener('dragging-changed', event => {
        this.transformDragging = Boolean(event.value);
        this.controls.enabled = !this.transformDragging && !this.viewHelper?.animating;
      });
      this.transformControls.addEventListener('objectChange', () => this.saveTransform());
      this.transformControlsHelper = this.transformControls.getHelper();
      this.scene.add(this.transformControlsHelper);
      this.renderer.domElement.addEventListener('pointerdown', this.handleSelectionPointerDown);
      this.renderer.domElement.addEventListener('pointerup', this.handleSelectionPointerUp);
    }
  }

  private syncInfiniteGrid(enabled: boolean) {
    if (enabled && !this.infiniteGrid) {
      this.infiniteGrid = new InfiniteGrid();
      this.gridScene.add(this.infiniteGrid);
      return;
    }
    if (!enabled && this.infiniteGrid) {
      this.gridScene.remove(this.infiniteGrid);
      this.infiniteGrid.geometry.dispose();
      this.infiniteGrid.material.dispose();
      this.infiniteGrid = undefined;
    }
  }

  setTransformMode(mode: 'translate' | 'rotate' | 'scale') {
    this.transformControls?.setMode(mode);
  }

  setTransformSpace(space: 'local' | 'world') {
    this.transformControls?.setSpace(space);
  }

  setTransformOverlayMatrix(matrix: number[] | undefined) {
    if (!this.transformProxy) return;
    const m = matrix && matrix.length === 16 ? new THREE.Matrix4().fromArray(matrix) : new THREE.Matrix4();
    this.transformOverlayMatrix.copy(m);
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

  private handleSelectionPointerDown = (event: PointerEvent) => {
    this.selectionPointerStart = new THREE.Vector2(event.clientX, event.clientY);
  };

  private handleMouseMove = (event: PointerEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this.mousePositionArray[0] = Math.min(this.renderer.domElement.width, Math.max(0, (event.clientX - rect.left) * this.renderer.domElement.width / rect.width));
    this.mousePositionArray[1] = Math.min(this.renderer.domElement.height, Math.max(0, (event.clientY - rect.top) * this.renderer.domElement.height / rect.height));
    this.mousePositionArray[2] = 1;
    this.material.setInput('iMouse', this.mousePositionArray);
  };

  private handleMouseLeave = () => {
    this.mousePositionArray[2] = 0;
    this.material.setInput('iMouse', this.mousePositionArray);
  };

  private handleSelectionPointerUp = (event: PointerEvent) => {
    if (this.suppressSelection) {
      this.suppressSelection = false;
      this.selectionPointerStart = undefined;
      return;
    }
    if (event.defaultPrevented || !this.selectionPointerStart || !this.transformControls || !this.transformProxy) return;
    const distance = this.selectionPointerStart.distanceTo(new THREE.Vector2(event.clientX, event.clientY));
    this.selectionPointerStart = undefined;
    if (distance > 4) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, this.camera);
    this.scene.updateMatrixWorld(true);

    const hit = this.drawables.some(drawable => {
      if (drawable.userData.selectable === false) return false;
      const matrixWorld = drawable.matrixWorld.clone();
      drawable.matrixWorld.multiplyMatrices(matrixWorld, this.transformOverlayMatrix);
      const intersects = raycaster.intersectObject(drawable, false).length > 0;
      drawable.matrixWorld.copy(matrixWorld);
      return intersects;
    });
    if (hit) this.transformControls.attach(this.transformProxy);
    else this.transformControls.detach();
  };

  setVectorVisualizations(vectors: ViewportVector[] = []) {
    const activeVectorIds = new Set(vectors.filter(vector => vector.visualization === 'vector').map(vector => vector.id));
    const activePointIds = new Set(vectors.filter(vector => vector.visualization === 'point').map(vector => vector.id));
    for (const [id, helper] of this.vectorHelpers) {
      if (activeVectorIds.has(id)) continue;
      this.disposeVectorHelper(helper);
      this.vectorHelpers.delete(id);
    }
    for (const [id, helper] of this.pointHelpers) {
      if (activePointIds.has(id)) continue;
      this.disposePointHelper(helper);
      this.pointHelpers.delete(id);
    }

    for (const vector of vectors) {
      const value = new THREE.Vector3().fromArray(vector.value);
      const origin = new THREE.Vector3().fromArray(vector.origin ?? [0, 0, 0]);
      if (vector.visualization === 'point') {
        let point = this.pointHelpers.get(vector.id);
        if (!point) {
          point = new THREE.Mesh(
            new THREE.SphereGeometry(.075, 20, 12),
            new THREE.MeshBasicMaterial({ color: 0xbf2732, side: THREE.DoubleSide })
          );
          this.pointHelpers.set(vector.id, point);
          this.scene.add(point);
        }
        point.position.copy(origin).add(value);
        continue;
      }
      const length = value.length();
      let helper = this.vectorHelpers.get(vector.id);
      if (!helper) {
        helper = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, 0xbf2732);
        this.vectorHelpers.set(vector.id, helper);
        this.scene.add(helper);
      }
      helper.position.copy(origin);
      helper.visible = length > Number.EPSILON;
      if (!helper.visible) continue;
      helper.setDirection(value.normalize());
      helper.setLength(length, Math.min(.25, length * .2), Math.min(.12, length * .1));
    }
  }

  async setScene(sceneDefinition: Scene) {
    const generation = ++this.sceneGeneration;
    this.setWireframeLineWidth(sceneDefinition);
    this.clearObjects();
    // A viewport instance is reused when navigating between tasks/teaching
    // pages. Always restore the ordinary mesh state before loading the next
    // scene so a previous wireframe-style scene cannot leak into it.
    this.material.wireframe = false;
    this.material.wireframeLinewidth = 1;
    // The quad-outline shader outputs fractional edge coverage. Blend it so
    // the derivative ramp actually antialiases instead of being treated as an
    // opaque red pixel. Keep depth writes enabled: the reference shader's
    // front/back passes do this too, and it prevents unstable transparent-face
    // ordering when the camera looks along a frustum edge.
    const wireframeObjects = sceneDefinition.objects.filter(object => object.wireframe);
    this.material.transparent = wireframeObjects.length > 0;
    this.material.depthWrite = true;
    this.material.forceSinglePass = false;
    this.material.needsUpdate = true;
    for (const [objectIndex, object] of sceneDefinition.objects.entries()) {
      const geometries = await this.loadGeometries(object);
      if (this.disposed || generation !== this.sceneGeneration) {
        geometries.forEach(loaded => loaded.geometry.dispose());
        continue;
      }
      const group = new THREE.Group();
      const objectId = `object-${objectIndex}`;
      group.name = objectId;
      group.position.fromArray(object.position ?? [0, 0, 0]);
      group.rotation.fromArray(object.rotation ?? [0, 0, 0]);
      group.scale.fromArray(object.scale ?? [1, 1, 1]);
      this.objectGroups.push(group);
      this.scene.add(group);
      geometries.forEach((loaded, index) => this.addDrawable(object, group, loaded, `${objectId}-${index}`));
    }
    if (!this.cameraPoseSaved) this.fitCameraToScene();
    this.renderScene();
  }

  private fitCameraToScene() {
    if (!this.drawables.length) return;

    const bounds = new THREE.Box3().makeEmpty();
    for (const drawable of this.drawables) {
      if (drawable instanceof THREE.InstancedMesh) drawable.computeBoundingBox();
      bounds.expandByObject(drawable);
    }
    if (bounds.isEmpty()) return;

    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    // The orbit pivot is always the world origin. Include the scene's offset
    // in the fit radius so off-origin objects remain fully visible.
    const radius = Math.max(size.length() * 0.5 + center.length(), 0.05);
    const viewDirection = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
    if (viewDirection.lengthSq() < Number.EPSILON) viewDirection.set(1, 1, 1);
    viewDirection.normalize();

    const verticalFov = THREE.MathUtils.degToRad(this.camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov * 0.5) * Math.max(this.camera.aspect, Number.EPSILON));
    const limitingFov = Math.min(verticalFov, horizontalFov);
    const distance = radius / Math.sin(limitingFov * 0.5) * 1.15;

    this.camera.position.copy(this.controls.target.set(0, 0, 0)).addScaledVector(viewDirection, distance);
    this.camera.lookAt(0, 0, 0);
    this.controls.update();
    this.cameraKey = '';
    this.saveCamera();
  }

  private async loadGeometries(object: Object): Promise<Geometry[]> {
    try {
      const gltf = await this.loader.loadAsync(this.resolvePath(object.source));
      gltf.scene.updateMatrixWorld(true);
      const geometries: Geometry[] = [];
      gltf.scene.traverse(child => {
        if ((child as THREE.Mesh).isMesh) {
          let geometry = (child as THREE.Mesh).geometry.clone();
          if (object.wireframe) geometry = this.createQuadWireframeGeometry(geometry);
          const loaded = {
            geometry,
            position: new THREE.Vector3(),
            quaternion: new THREE.Quaternion(),
            scale: new THREE.Vector3()
          };
          child.matrixWorld.decompose(loaded.position, loaded.quaternion, loaded.scale);
          geometries.push(loaded);
        }
      });
      // Drawables use cloned geometry, so the loader-owned graph can be released
      // immediately instead of surviving until the next scene transition.
      gltf.scene.traverse(child => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach(material => material.dispose());
      });
      return geometries;
    } catch (error) {
      console.error(`Failed to load viewport model ${object.source}:`, error);
      return [];
    }
  }

  /**
   * The GPU rasterizes every quad as two triangles. Give each triangle
   * barycentric coordinates, then move the coordinate opposite its longest
   * edge away from zero. For a quad split into two triangles that longest edge
   * is the diagonal, so the fragment shader can draw only the outer outline.
   */
  private createQuadWireframeGeometry(source: THREE.BufferGeometry) {
    const geometry = source.index ? source.toNonIndexed() : source.clone();
    if (geometry !== source) source.dispose();

    const position = geometry.getAttribute('position');
    if (!position) return geometry;

    const barycentric = new Float32Array(position.count * 3);
    const verticesPerTriangle = 3;
    for (let vertex = 0; vertex + 2 < position.count; vertex += verticesPerTriangle) {
      const a = new THREE.Vector3().fromBufferAttribute(position, vertex);
      const b = new THREE.Vector3().fromBufferAttribute(position, vertex + 1);
      const c = new THREE.Vector3().fromBufferAttribute(position, vertex + 2);
      const oppositeEdgeLengths = [b.distanceToSquared(c), a.distanceToSquared(c), a.distanceToSquared(b)];
      let ignoredEdge = 0;
      if (oppositeEdgeLengths[1] > oppositeEdgeLengths[ignoredEdge]) ignoredEdge = 1;
      if (oppositeEdgeLengths[2] > oppositeEdgeLengths[ignoredEdge]) ignoredEdge = 2;

      for (let corner = 0; corner < verticesPerTriangle; corner++) {
        const offset = (vertex + corner) * 3;
        barycentric[offset + corner] = 1;
        barycentric[offset + ignoredEdge] += 1;
      }
    }
    geometry.setAttribute('barycentric', new THREE.BufferAttribute(barycentric, 3));
    return geometry;
  }

  private getWireframeLineWidth(object: Object) {
    const lineWidth = object.lineWidth ?? 3.5;
    return Number.isFinite(lineWidth) ? Math.max(0.5, lineWidth) : 3.5;
  }

  private setWireframeLineWidth(sceneDefinition: Scene) {
    const wireframeObject = sceneDefinition.objects.find(object => object.wireframe);
    this.material.setInput('uWireframeLineWidth', wireframeObject ? this.getWireframeLineWidth(wireframeObject) : 3.5);
  }

  private addDrawable(object: Object, group: THREE.Group, loaded: Geometry, id: string) {
    const count = Math.max(1, Math.floor(object.instanceCount ?? 1));
    // Use one consistent drawable type. This keeps the attribute/program path
    // identical for ordinary and instanced tasks, including count === 1.
    const drawable: Drawable = new THREE.InstancedMesh(loaded.geometry, this.material, count);
    drawable.name = id;
    drawable.userData.selectable = true;
    // User vertex shaders can move vertices beyond the source mesh bounds.
    // Those bounds are not reliable for any ShaderLab drawable.
    drawable.frustumCulled = false;
    drawable.position.copy(loaded.position);
    drawable.quaternion.copy(loaded.quaternion);
    drawable.scale.copy(loaded.scale);
    if (object.wireframe) {
      const lineWidth = this.getWireframeLineWidth(object);
      drawable.onBeforeRender = () => {
        this.material.uniforms.uWireframeLineWidth.value = lineWidth;
      };
    }

    if (drawable instanceof THREE.InstancedMesh) {
      for (let index = 0; index < count; index++) {
        drawable.setMatrixAt(index, new THREE.Matrix4().identity());
      }
      drawable.instanceMatrix.needsUpdate = true;
    }
    this.drawables.push(drawable);
    group.add(drawable);
  }

  private clearObjects() {
    this.transformControls?.detach();
    this.drawables.forEach(drawable => {
      drawable.geometry.dispose();
    });
    this.drawables = [];
    this.objectGroups.forEach(group => this.scene.remove(group));
    this.objectGroups = [];
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
    this.cameraPoseSaved = true;
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
      this.renderer.domElement.removeEventListener('pointerdown', this.handleSelectionPointerDown);
      this.renderer.domElement.removeEventListener('pointerup', this.handleSelectionPointerUp);
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

  private disposeVectorHelper(helper: THREE.ArrowHelper) {
    this.scene.remove(helper);
    helper.line.geometry.dispose();
    (helper.line.material as THREE.Material).dispose();
    helper.cone.geometry.dispose();
    (helper.cone.material as THREE.Material).dispose();
  }

  private disposePointHelper(helper: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>) {
    this.scene.remove(helper);
    helper.geometry.dispose();
    helper.material.dispose();
  }

  private scheduleResize() {
    if (this.resizeFrame) return;
    this.resizeFrame = requestAnimationFrame(() => {
      this.resizeFrame = 0;
      this.resize();
      // Moving a panel into/out of the maximizer changes its containing block.
      // ResizeObserver may run before that layout is final, so repaint once more
      // on the settled size instead of leaving a newly resized canvas blank.
      cancelAnimationFrame(this.settledResizeFrame);
      this.settledResizeFrame = requestAnimationFrame(() => {
        this.settledResizeFrame = 0;
        this.resize(true);
      });
    });
  }

  private resize(forceRender = false) {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    // Split panes can briefly report zero dimensions while being dragged.
    // Do not resize the WebGL buffer to that transient state, but check again
    // a couple of frames later in case this was a maximization layout change.
    if (width < 2 || height < 2) {
      if (this.resizeRetries++ < 2 && !this.resizeRetryFrame) {
        this.resizeRetryFrame = requestAnimationFrame(() => {
          this.resizeRetryFrame = 0;
          this.scheduleResize();
        });
      }
      return;
    }
    this.resizeRetries = 0;
    const sizeChanged = width !== this.renderedWidth || height !== this.renderedHeight;
    if (!sizeChanged && !forceRender) return;

    if (sizeChanged) {
      this.renderedWidth = width;
      this.renderedHeight = height;
      this.renderer.setSize(width, height, false);
    }
    this.updateTransformControlsSize(height);
    this.camera.aspect = width / height;
    this.camera.fov = 2 * Math.atan(Math.tan(this.horizontalFov * Math.PI / 360) / this.camera.aspect) * 180 / Math.PI;
    this.camera.updateProjectionMatrix();
    if (sizeChanged) this.material.setInput('iResolution', [this.renderer.domElement.width, this.renderer.domElement.height]);
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
    if (!this.visible || document.hidden) return;
    this.controls.enabled = !this.transformDragging && !this.viewHelper?.animating;
    this.controls.update();
    if (this.viewHelper?.animating) {
      this.viewHelper.update(delta);
      if (!this.viewHelper.animating) this.saveCamera();
    }
    if (!this.timePaused) this.shaderTime += delta;
    this.material.setInput('time', this.shaderTime);
    this.camera.position.toArray(this.cameraPositionArray);
    this.camera.getWorldDirection(this.cameraDirection).toArray(this.cameraDirectionArray);
    this.material.setInput('cameraPosition', this.cameraPositionArray);
    this.material.setInput('cameraDirection', this.cameraDirectionArray);
    this.material.setInput('cameraFov', this.horizontalFov * Math.PI / 180);
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
    cancelAnimationFrame(this.settledResizeFrame);
    cancelAnimationFrame(this.resizeRetryFrame);
    this.sceneGeneration++;
    this.resizeObserver.disconnect();
    this.visibilityObserver.disconnect();
    this.renderer.domElement.removeEventListener('pointerenter', this.handleMouseMove);
    this.renderer.domElement.removeEventListener('pointermove', this.handleMouseMove);
    this.renderer.domElement.removeEventListener('pointerleave', this.handleMouseLeave);
    this.controls.dispose();
    this.disposeOverlays();
    this.vectorHelpers.forEach(helper => this.disposeVectorHelper(helper));
    this.vectorHelpers.clear();
    this.pointHelpers.forEach(helper => this.disposePointHelper(helper));
    this.pointHelpers.clear();
    this.syncInfiniteGrid(false);
    this.clearObjects();
    this.material.dispose();
    this.renderer.dispose();
    if (this.container.contains(this.renderer.domElement)) this.container.removeChild(this.renderer.domElement);
  }
}
