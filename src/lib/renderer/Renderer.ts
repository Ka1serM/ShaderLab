import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { ViewHelper } from 'three/examples/jsm/helpers/ViewHelper.js';
import { base } from '$app/paths';
import { ShaderTaskMaterial, type ShaderInput } from './ShaderTaskMaterial';
import { InfiniteGrid } from './InfiniteGrid';
import { validateShaderProgram, type ShaderDiagnostic, type ShaderDiagnostics } from './shaderValidation';
import { ShaderReadback, type ShaderReadbackRequest, type ShaderReadbackValue } from './shaderReadback';
import { loadModel } from './assetCache';

// Scene assets must refresh when their Markdown definition changes during authoring.
THREE.Cache.enabled = false;

// TransformControls normally occupy a fixed fraction of the canvas height.
// Use the size they have in a typical 600px-high viewport as our fixed visual size.
const TRANSFORM_CONTROLS_REFERENCE_HEIGHT = 600;
// Free space kept around the framed scene, as a factor on the field of view.
const FRAME_MARGIN = 1.1;
// Inset view size as a fraction of the viewport, and its placement in CSS pixels.
const INSET_VIEW_SCALE = 0.3;
const INSET_VIEW_MIN_SCALE = 0.15;
const INSET_VIEW_MAX_SCALE = 0.9;
const INSET_VIEW_MARGIN = 12;
const INSET_VIEW_BORDER = 2;
const INSET_VIEW_HANDLE = 12;

type UniformValue = number | number[] | boolean;

function sameUniformValue(a: UniformValue | undefined, b: UniformValue) {
  if (!Array.isArray(a) || !Array.isArray(b)) return a === b;
  return a.length === b.length && a.every((component, index) => component === b[index]);
}

function readsInput(name: string, vertexShader: string, fragmentShader: string) {
  const pattern = new RegExp(`\\b${name}\\b`);
  return pattern.test(vertexShader) || pattern.test(fragmentShader);
}


function sameUniformValues(previous: Record<string, UniformValue>, next: Record<string, UniformValue>) {
  const names = Object.keys(next);
  if (names.length !== Object.keys(previous).length) return false;
  return names.every(name => sameUniformValue(previous[name], next[name]));
}

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
  /**
   * World-space box `[min, max]` that the default camera must frame. Needed when
   * a vertex shader moves geometry outside the bounds of its source meshes.
   */
  frameBox?: [[number, number, number], [number, number, number]];
  /**
   * Draw the scene a second time in a corner of the viewport with `uInsetView`
   * set. The shader decides what this view shows, for example a virtual camera.
   * The inset takes its width-to-height ratio from the float uniform `aspectUniform`.
   */
  insetView?: { aspectUniform: string };
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

export type TransformMode = 'translate' | 'rotate' | 'scale';

export type ViewportOverlays = {
  infiniteGrid?: boolean;
  viewHelper?: boolean;
  /**
   * The object gizmo always offers translate, rotate and scale. A mode without
   * a transform for the selected object leaves the object unchanged.
   */
  transformControls?: {
    mode?: TransformMode;
  };
};

export type ViewportVector = {
  id: string;
  value: [number, number, number];
  origin?: [number, number, number];
  visualization: 'vector' | 'point';
  editable?: boolean;
  target?: string;
  inverse?: number[];
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
  /** Index of the scene object that a click selects, or undefined when a click hits no object. */
  onObjectSelect?: (objectIndex: number | undefined) => void;
  onVectorChange?: (id: string, value: [number, number, number]) => void;
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
  shaderReadbacks: ShaderReadbackRequest[];
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
  private readonly pickingMaterial: THREE.RawShaderMaterial;
  private readonly pickingTarget = new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: true,
    stencilBuffer: false
  });
  private readonly pickingPixel = new Uint8Array(4);

  private readonly container: HTMLElement;
  private readonly clock = new THREE.Clock();
  private shaderTime = 0;
  private timePaused = false;
  private readonly onCameraChange?: RendererOptions['onCameraChange'];
  private readonly onTransformChange?: RendererOptions['onTransformChange'];
  private readonly onObjectSelect?: RendererOptions['onObjectSelect'];
  private readonly onVectorChange?: RendererOptions['onVectorChange'];
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
  private insetView?: Scene['insetView'];
  /** The last transform state from the owner, also while a drag ignores it. */
  private acceptedTransform?: ViewportTransform;
  private insetScale = INSET_VIEW_SCALE;
  private insetAspectReported = false;
  private insetResizing = false;
  private renderedWidth = 0;
  private renderedHeight = 0;
  private disposed = false;
  private applyingCamera = false;
  private cameraKey = '';
  private cameraPoseSaved: boolean;
  // The pose is reported once the camera stops moving, not on every damped orbit frame.
  private cameraSavePending = false;
  private transformDragging = false;
  private sceneGeneration = 0;
  // The default view is refitted on resize until the user moves the camera, and
  // is never persisted: a fit depends on the viewport size of the current visit.
  private autoFrame = false;
  private frameBox?: Scene['frameBox'];
  private drawables: Drawable[] = [];
  private objectGroups: THREE.Group[] = [];
  private uniformValues: Record<string, number | number[] | boolean> = {};
  private readonly shaderReadback: ShaderReadback;
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
  private vectorHelpers = new Map<string, THREE.ArrowHelper>();
  private pointHelpers = new Map<string, THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>>();
  private vectorDefinitions = new Map<string, ViewportVector>();
  private vectorEditProxy?: THREE.Object3D;
  private editingVectorId?: string;
  private visualizationPointerStart?: THREE.Vector2;
  private suppressVisualizationSelection = false;
  private gizmoSelection: 'object' | 'visualization' | null = null;
  private applyingTransform = false;
  private transformPosition = new THREE.Vector3();
  private transformQuaternion = new THREE.Quaternion();
  private transformScale = new THREE.Vector3(1, 1, 1);
  private transformMode: TransformMode = 'translate';
  private transformSpace: 'local' | 'world' = 'local';
  private horizontalFov: number;
  private shaderRenderable = false;
  // Frames are scheduled only for a visible change, camera damping, a view helper animation,
  // a pending readback, or a shader that reads `time`. An idle viewport runs no frame callback.
  private renderRequested = true;
  private looping = false;
  private shaderReadsTime = false;
  private shaderReadsMouse = false;
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
    this.onObjectSelect = options.onObjectSelect;
    this.onVectorChange = options.onVectorChange;
    this.onShaderErrors = options.onShaderErrors;
    this.onShaderReadbacks = options.onShaderReadbacks;
    this.shaderReadbacks = options.shaderReadbacks ?? [];
    this.vertexShader = options.vertexShader;
    this.reportErrors = options.reportErrors ?? false;
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
    this.shaderReadback = new ShaderReadback(this.renderer.getContext() as WebGL2RenderingContext, values => this.onShaderReadbacks?.(values));
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
        // These renderer-owned uniforms must exist before a shader that
        // declares them can compile. Scene changes only alter their values.
        { type: 'float', name: 'uWireframeLineWidth', init: 3.5 },
        { type: 'int', name: 'uWireframe', init: 0 },
        { type: 'int', name: 'uInsetView', init: 0 },
        { type: 'int', name: 'uObjectIndex', init: 0 },
        ...(options.inputs ?? [])
      ]
    });
    this.pickingMaterial = new THREE.RawShaderMaterial({
      vertexShader: initialValidation.valid ? options.vertexShader : fallbackVertex,
      // The red channel holds the object index + 1, so 0 means that no object was hit.
      fragmentShader: 'precision highp float; uniform int uObjectIndex; out vec4 fragColor; void main() { fragColor = vec4(float(uObjectIndex + 1) / 255.0, 0.0, 0.0, 1.0); }',
      uniforms: this.material.uniforms,
      glslVersion: THREE.GLSL3,
      side: THREE.DoubleSide,
      // The ID pass only hits the depth that the visible material wrote first. See pickDrawable().
      depthFunc: THREE.EqualDepth,
      depthWrite: false
    });
    this.taskInputNames = new Set((options.inputs ?? []).map(input => input.name));
    // Teaching shaders supply their control uniforms at construction time.
    // Apply them before the first draw; otherwise WebGL uses zero-valued
    // uniforms until a later reactive update or interaction occurs.
    this.setUniformValues(options.uniformValues ?? {});

    if (initialValidation.valid) this.trackShaderInputs(options.vertexShader, options.fragmentShader);

    // Capture listeners run before OrbitControls and TransformControls, so a
    // pointer on the inset never orbits the camera or picks an object.
    this.renderer.domElement.addEventListener('pointerdown', this.handleInsetPointerDown, { capture: true });
    this.renderer.domElement.addEventListener('pointermove', this.handleInsetPointerMove, { capture: true });
    this.renderer.domElement.addEventListener('pointerup', this.handleInsetPointerUp, { capture: true });
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 0;
    this.controls.maxDistance = 100;
    this.controls.maxPolarAngle = Math.PI;
    this.controls.addEventListener('change', () => {
      this.requestRender();
      if (!this.applyingCamera) this.cameraSavePending = true;
    });
    this.controls.addEventListener('start', () => { this.autoFrame = false; });
    this.applyCameraPose(options.cameraPose);
    this.setOverlays(options.overlays);

    this.resizeObserver = new ResizeObserver(() => this.scheduleResize());
    this.resizeObserver.observe(this.container);
    this.visibilityObserver = new IntersectionObserver(entries => {
      this.visible = entries[0]?.isIntersecting ?? true;
      this.requestRender();
    });
    this.visibilityObserver.observe(this.container);
    this.resize();
    this.requestRender();
  }

  setUniformValues(values: Record<string, number | number[] | boolean>) {
    if (sameUniformValues(this.uniformValues, values)) return;
    const nextNames = new Set(Object.keys(values));
    for (const name of this.uniformValueNames) {
      if (!nextNames.has(name) && !this.taskInputNames.has(name)) this.material.removeInput(name);
    }
    this.uniformValues = values;
    Object.entries(values).forEach(([name, value]) => this.material.setInput(name, value));
    this.uniformValueNames = nextNames;
    this.requestRender();
    this.updateShaderReadbacks();
  }

  setInputs(inputs: ShaderInput[] = []) {
    const nextNames = new Set(inputs.map(input => input.name));
    for (const name of this.taskInputNames) {
      if (!nextNames.has(name)) this.material.removeInput(name);
    }
    inputs.forEach(input => this.material.addInput(input));
    this.taskInputNames = nextNames;
    // Adding or removing an input can reset a uniform, so the next uniform update must apply every value.
    this.uniformValues = {};
    this.requestRender();
  }

  setCameraPose(pose: ViewportCameraPose, saved = this.cameraPoseSaved) {
    this.cameraPoseSaved = saved;
    this.applyCameraPose(pose);
  }

  /** The readbacks belong to this vertex shader, so both are replaced together. */
  updateShaders(vertexShader: string, fragmentShader: string, shaderReadbacks: ShaderReadbackRequest[]) {
    this.shaderReadbacks = shaderReadbacks;
    const validation = this.validateShaders(vertexShader, fragmentShader);
    this.shaderRenderable = validation.valid;
    this.publishDiagnostics(validation.diagnostics);
    if (!validation.valid) {
      this.renderScene();
      return;
    }
    this.material.updateShaders(vertexShader, fragmentShader);
    this.trackShaderInputs(vertexShader, fragmentShader);
    this.pickingMaterial.vertexShader = vertexShader;
    this.pickingMaterial.needsUpdate = true;
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
    this.setUniformValues(state.uniformValues ?? {});
    this.setOverlays(state.overlays);
    this.setShaderLineOffsets(state.shaderLineOffsets);
    // The synchronous part of setScene() removes the previous objects and
    // scene options, so the new shader never draws them.
    const sceneLoaded = this.setScene(state.scene);
    this.updateShaders(state.vertexShader, state.fragmentShader, state.shaderReadbacks);
    await sceneLoaded;
    await this.material.texturesLoaded();
    if (!this.disposed) this.renderScene();
  }

  private updateShaderReadbacks() {
    if (!this.shaderRenderable || !this.shaderReadbacks.length) return;
    this.shaderReadback.request(this.vertexShader, this.shaderReadbacks, this.uniformValues);
    this.renderer.resetState();
    this.scheduleFrame();
  }

  private trackShaderInputs(vertexShader: string, fragmentShader: string) {
    this.shaderReadsTime = readsInput('time', vertexShader, fragmentShader);
    const readsMouse = readsInput('iMouse', vertexShader, fragmentShader);
    if (readsMouse === this.shaderReadsMouse) return;
    this.shaderReadsMouse = readsMouse;
    const canvas = this.renderer.domElement;
    if (readsMouse) {
      canvas.addEventListener('pointerenter', this.handleMouseMove);
      canvas.addEventListener('pointermove', this.handleMouseMove);
      canvas.addEventListener('pointerleave', this.handleMouseLeave);
      return;
    }
    canvas.removeEventListener('pointerenter', this.handleMouseMove);
    canvas.removeEventListener('pointermove', this.handleMouseMove);
    canvas.removeEventListener('pointerleave', this.handleMouseLeave);
  }

  setShaderLineOffsets(offsets: { vertex: number; fragment: number }) {
    this.shaderLineOffsets = offsets;
  }

  setTimePaused(paused: boolean) {
    this.timePaused = paused;
    this.requestRender();
  }

  setOverlays(overlays: ViewportOverlays | undefined) {
    this.requestRender();
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
        this.autoFrame = false;
        this.controls.enabled = false;
        this.requestRender();
        event.preventDefault();
        event.stopPropagation();
      };
      this.renderer.domElement.addEventListener('pointerup', this.viewHelperPointerUp);
    }

    if (overlays?.transformControls) {
      this.transformMode = overlays.transformControls.mode ?? 'translate';
      this.transformSpace = 'local';
      this.ensureTransformControls();
    }
  }

  private ensureTransformControls() {
    if (this.transformControls) return;
    this.transformProxy = new THREE.Object3D();
    this.scene.add(this.transformProxy);
    this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
    this.transformControls.setSpace(this.transformSpace);
    this.transformControls.setMode(this.transformMode);
    this.updateTransformControlsSize();
    this.transformControls.addEventListener('mouseDown', () => {
      this.suppressVisualizationSelection = true;
      this.transformDragging = true;
      this.controls.enabled = false;
    });
    this.transformControls.addEventListener('mouseUp', () => {
      this.transformDragging = false;
      this.controls.enabled = !this.transformDragging && !this.viewHelper?.animating;
      queueMicrotask(() => { this.suppressVisualizationSelection = false; });
    });
    this.transformControls.addEventListener('dragging-changed', event => {
      this.transformDragging = Boolean(event.value);
      this.controls.enabled = !this.transformDragging && !this.viewHelper?.animating;
      // The gizmo moves freely during a drag. Afterwards, show what the owner
      // accepted, so a mode that the object does not support snaps back.
      if (!this.transformDragging && this.gizmoSelection === 'object') this.setTransformState(this.acceptedTransform);
    });
    this.transformControls.addEventListener('change', () => this.requestRender());
    this.transformControls.addEventListener('objectChange', () => this.editingVectorId ? this.saveVectorEdit() : this.saveTransform());
    this.transformControlsHelper = this.transformControls.getHelper();
    this.scene.add(this.transformControlsHelper);
    this.renderer.domElement.addEventListener('pointerdown', this.handleVisualizationPointerDown);
    this.renderer.domElement.addEventListener('pointerup', this.handleVisualizationPointerUp);
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

  setTransformMode(mode: TransformMode) {
    this.editingVectorId = undefined;
    this.transformMode = mode;
    this.transformControls?.setMode(this.transformMode);
    this.syncTransformProxy();
    if (this.gizmoSelection === 'object') this.attachObjectGizmo();
    this.requestRender();
  }

  /** Shows the object gizmo, as a click on the object does. */
  selectObject() {
    this.editingVectorId = undefined;
    this.transformControls?.setMode(this.transformMode);
    this.gizmoSelection = 'object';
    this.syncTransformProxy();
    this.requestRender();
  }

  setTransformSpace(space: 'local' | 'world') {
    this.transformSpace = space;
    this.syncTransformProxy();
    this.requestRender();
  }

  /** `undefined` means that the selected object has no transform, so the object gizmo hides. */
  setTransformState(transform: ViewportTransform | undefined) {
    this.acceptedTransform = transform;
    if (!this.transformProxy) return;
    if (this.transformDragging && this.gizmoSelection === 'object') return;
    if (!transform) {
      if (this.gizmoSelection === 'object') {
        this.transformControls?.detach();
        this.gizmoSelection = null;
      }
      this.requestRender();
      return;
    }
    this.transformPosition.fromArray(transform.position);
    this.transformQuaternion.fromArray(transform.quaternion).normalize();
    this.transformScale.fromArray(transform.scale);
    this.syncTransformProxy();
    this.requestRender();
  }

  private syncTransformProxy() {
    if (!this.transformProxy || !this.transformControls) return;
    this.applyingTransform = true;
    this.transformProxy.position.copy(this.transformPosition);
    // Three.js intentionally treats scaling as local-only. Using an
    // unrotated proxy gives the scale handles genuine world-axis alignment.
    const worldAligned = this.transformMode === 'scale' && this.transformSpace === 'world';
    this.transformProxy.quaternion.copy(worldAligned ? new THREE.Quaternion() : this.transformQuaternion);
    this.transformProxy.scale.copy(this.transformScale);
    this.transformProxy.updateMatrixWorld();
    if (this.editingVectorId || this.gizmoSelection !== 'object') {
      this.applyingTransform = false;
      return;
    }
    this.transformControls.setSpace(this.transformSpace);
    this.attachObjectGizmo();
    this.applyingTransform = false;
  }

  /**
   * Scene content is replaced asynchronously while the overlay objects live
   * for the lifetime of the viewport. Keep the transform proxy attached
   * independently of scene-loading and route-transition order.
   */
  private attachObjectGizmo() {
    if (!this.transformControls || !this.transformProxy) return;
    if (this.transformControls.object !== this.transformProxy) this.transformControls.attach(this.transformProxy);
    this.transformControlsHelper?.updateMatrixWorld(true);
  }

  // Uses the CSS size cached by resize(), so a pointer move never forces a layout query.
  private handleMouseMove = (event: PointerEvent) => {
    if (this.renderedWidth <= 0 || this.renderedHeight <= 0) return;
    const canvas = this.renderer.domElement;
    this.mousePositionArray[0] = Math.min(canvas.width, Math.max(0, event.offsetX * canvas.width / this.renderedWidth));
    this.mousePositionArray[1] = Math.min(canvas.height, Math.max(0, event.offsetY * canvas.height / this.renderedHeight));
    this.mousePositionArray[2] = 1;
    this.material.setInput('iMouse', this.mousePositionArray);
    this.requestRender();
  };

  private handleMouseLeave = () => {
    this.mousePositionArray[2] = 0;
    this.material.setInput('iMouse', this.mousePositionArray);
    this.requestRender();
  };

  setVectorVisualizations(vectors: ViewportVector[] = []) {
    this.requestRender();
    if (vectors.some(vector => vector.editable)) this.ensureTransformControls();
    this.vectorDefinitions = new Map(vectors.map(vector => [vector.id, vector]));
    if (this.editingVectorId && !this.vectorDefinitions.get(this.editingVectorId)?.editable) {
      this.editingVectorId = undefined;
      this.transformControls?.detach();
      this.gizmoSelection = null;
    }
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
      const endpoint = origin.clone().add(value);
      if (vector.visualization === 'point') {
        let point = this.pointHelpers.get(vector.id);
        if (!point) {
          point = new THREE.Mesh(
            new THREE.SphereGeometry(.033, 20, 12),
            new THREE.MeshBasicMaterial({ color: 0xbf2732, side: THREE.DoubleSide, depthTest: false, depthWrite: false })
          );
          this.pointHelpers.set(vector.id, point);
          point.renderOrder = 1000;
          this.scene.add(point);
        }
        point.position.copy(endpoint);
        point.userData.visualizationId = vector.id;
        if (this.editingVectorId === vector.id && this.vectorEditProxy) this.vectorEditProxy.position.copy(point.position);
        continue;
      }
      const displayedValue = endpoint.clone().sub(origin);
      const length = displayedValue.length();
      let helper = this.vectorHelpers.get(vector.id);
      if (!helper) {
        helper = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, 0xbf2732);
        this.vectorHelpers.set(vector.id, helper);
        this.scene.add(helper);
      }
      helper.position.copy(origin);
      helper.userData.visualizationId = vector.id;
      helper.visible = length > Number.EPSILON;
      if (!helper.visible) continue;
      helper.setDirection(displayedValue.normalize());
      helper.setLength(length, Math.min(.25, length * .2), Math.min(.12, length * .1));
      if (this.editingVectorId === vector.id && this.vectorEditProxy) this.vectorEditProxy.position.copy(endpoint);
    }
  }

  private handleVisualizationPointerDown = (event: PointerEvent) => {
    this.visualizationPointerStart = new THREE.Vector2(event.clientX, event.clientY);
  };

  private handleVisualizationPointerUp = (event: PointerEvent) => {
    if (this.suppressVisualizationSelection) {
      this.visualizationPointerStart = undefined;
      return;
    }
    if (!this.visualizationPointerStart || !this.transformControls) return;
    const distance = this.visualizationPointerStart.distanceTo(new THREE.Vector2(event.clientX, event.clientY));
    this.visualizationPointerStart = undefined;
    if (distance > 4) return;
    this.requestRender();
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.params.Line!.threshold = .12;
    raycaster.setFromCamera(pointer, this.camera);
    this.scene.updateMatrixWorld(true);
    const candidates: Array<{ id: string; object: THREE.Object3D }> = [];
    for (const [id, point] of this.pointHelpers) if (this.vectorDefinitions.get(id)?.editable) candidates.push({ id, object: point });
    for (const [id, arrow] of this.vectorHelpers) if (this.vectorDefinitions.get(id)?.editable) candidates.push({ id, object: arrow });
    let hit: { id: string; distance: number } | undefined;
    for (const candidate of candidates) {
      const distance = raycaster.intersectObject(candidate.object, true)[0]?.distance ?? Infinity;
      if (distance < (hit?.distance ?? Infinity)) hit = { id: candidate.id, distance };
    }
    if (hit) {
      const definition = this.vectorDefinitions.get(hit.id)!;
      this.editingVectorId = hit.id;
      if (!this.vectorEditProxy) {
        this.vectorEditProxy = new THREE.Object3D();
        this.scene.add(this.vectorEditProxy);
      }
      this.vectorEditProxy.position.fromArray(definition.origin ?? [0, 0, 0]).add(new THREE.Vector3().fromArray(definition.value));
      this.vectorEditProxy.quaternion.identity();
      this.vectorEditProxy.scale.set(1, 1, 1);
      this.transformControls.setMode('translate');
      this.transformControls.setSpace('world');
      this.transformControls.attach(this.vectorEditProxy);
      this.gizmoSelection = 'visualization';
      return;
    }

    const objectHit = this.overlays?.transformControls ? this.pickDrawable(event) : undefined;
    this.editingVectorId = undefined;
    // Attach first: the selection callback replaces the transform state before the next frame.
    if (objectHit !== undefined) {
      this.attachObjectGizmo();
      this.transformControls.setMode(this.transformMode);
      this.transformControls.setSpace(this.transformSpace);
      this.gizmoSelection = 'object';
    } else {
      this.transformControls.detach();
      this.gizmoSelection = null;
    }
    this.onObjectSelect?.(objectHit);
  };

  /** GPU picking uses the active vertex shader, so shader-side transforms and
   * deformations have exactly the same silhouette as the visible object.
   * The first pass draws the visible material, so fragments that its shader
   * discards write no depth. The second pass writes object IDs only where its
   * depth equals that visible depth. */
  private pickDrawable(event: PointerEvent): number | undefined {
    if (!this.shaderRenderable || !this.drawables.length) return undefined;
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return undefined;
    const drawingSize = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const x = Math.min(drawingSize.x - 1, Math.max(0, Math.floor((event.clientX - rect.left) * drawingSize.x / rect.width)));
    const y = Math.min(drawingSize.y - 1, Math.max(0, Math.floor((event.clientY - rect.top) * drawingSize.y / rect.height)));
    const previousTarget = this.renderer.getRenderTarget();
    const previousOverride = this.scene.overrideMaterial;
    const previousAutoClear = this.renderer.autoClear;
    const previousLayerMask = this.camera.layers.mask;
    try {
      // Inputs can be added and removed while editing shader annotations.
      // Reuse the exact uniform objects from the visible material each pick.
      this.pickingMaterial.uniforms = this.material.uniforms;
      this.camera.layers.set(1);
      this.camera.setViewOffset(drawingSize.x, drawingSize.y, x, y, 1, 1);
      this.camera.updateProjectionMatrix();
      this.renderer.autoClear = false;
      this.renderer.setRenderTarget(this.pickingTarget);
      this.renderer.clear();
      this.scene.overrideMaterial = null;
      this.renderer.render(this.scene, this.camera);
      this.renderer.clear(true, false, false);
      this.scene.overrideMaterial = this.pickingMaterial;
      this.renderer.render(this.scene, this.camera);
      this.renderer.readRenderTargetPixels(this.pickingTarget, 0, 0, 1, 1, this.pickingPixel);
      return this.pickingPixel[0] > 0 ? this.pickingPixel[0] - 1 : undefined;
    } finally {
      this.renderer.setRenderTarget(previousTarget);
      this.renderer.autoClear = previousAutoClear;
      this.scene.overrideMaterial = previousOverride;
      this.camera.clearViewOffset();
      this.camera.layers.mask = previousLayerMask;
      this.camera.updateProjectionMatrix();
      this.renderer.resetState();
    }
  }

  private saveVectorEdit() {
    if (!this.editingVectorId || !this.vectorEditProxy) return;
    const definition = this.vectorDefinitions.get(this.editingVectorId);
    if (!definition) return;
    const localPosition = this.vectorEditProxy.position.clone();
    if (definition.inverse?.length === 16) {
      const matrix = new THREE.Matrix4().fromArray(definition.inverse);
      if (Math.abs(matrix.determinant()) <= Number.EPSILON) return;
      localPosition.applyMatrix4(matrix.invert());
    }
    const value = localPosition.sub(new THREE.Vector3().fromArray(definition.origin ?? [0, 0, 0]));
    this.onVectorChange?.(definition.target ?? this.editingVectorId, value.toArray() as [number, number, number]);
  }

  async setScene(sceneDefinition: Scene) {
    const generation = ++this.sceneGeneration;
    this.frameBox = sceneDefinition.frameBox;
    this.insetView = sceneDefinition.insetView;
    this.autoFrame = !this.cameraPoseSaved;
    this.editingVectorId = undefined;
    this.transformControls?.detach();
    this.gizmoSelection = null;
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
    // Load every object concurrently and add them together, so a slow model
    // never leaves the scene partially drawn.
    const loadedObjects = await Promise.all(sceneDefinition.objects.map(object => this.loadGeometries(object)));
    if (this.disposed || generation !== this.sceneGeneration) {
      loadedObjects.flat().forEach(loaded => loaded.geometry.dispose());
      return;
    }
    for (const [objectIndex, object] of sceneDefinition.objects.entries()) {
      const group = new THREE.Group();
      const objectId = `object-${objectIndex}`;
      group.name = objectId;
      group.position.fromArray(object.position ?? [0, 0, 0]);
      group.rotation.fromArray(object.rotation ?? [0, 0, 0]);
      group.scale.fromArray(object.scale ?? [1, 1, 1]);
      this.objectGroups.push(group);
      this.scene.add(group);
      loadedObjects[objectIndex].forEach((loaded, index) => this.addDrawable(object, objectIndex, group, loaded, `${objectId}-${index}`));
    }
    if (this.autoFrame) this.fitCameraToScene();
    this.renderScene();
  }

  private fitCameraToScene() {
    const bounds = this.frameBounds();
    if (bounds.isEmpty()) return;
    const center = bounds.getCenter(new THREE.Vector3());
    const view = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
    if (view.lengthSq() < Number.EPSILON) view.set(1, 1, 1);
    view.normalize();

    this.applyingCamera = true;
    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(view, this.fitDistance(bounds, center, view));
    this.camera.lookAt(center);
    this.controls.update();
    this.applyingCamera = false;
  }

  private frameBounds() {
    if (this.frameBox) return new THREE.Box3(new THREE.Vector3(...this.frameBox[0]), new THREE.Vector3(...this.frameBox[1]));
    // Groups are created moments before this fit and have not been rendered yet.
    this.scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3().makeEmpty();
    for (const drawable of this.drawables) {
      if (drawable instanceof THREE.InstancedMesh) drawable.computeBoundingBox();
      bounds.expandByObject(drawable);
    }
    return bounds;
  }

  /** Distance along `view` from `center` at which `bounds` fits the frustum. */
  private fitDistance(bounds: THREE.Box3, center: THREE.Vector3, view: THREE.Vector3) {
    const tanVertical = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) / FRAME_MARGIN;
    const tanHorizontal = tanVertical * this.camera.aspect;
    this.camera.position.copy(center).add(view);
    this.camera.lookAt(center);
    this.camera.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    let distance = 0;
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
      const corner = new THREE.Vector3(x, y, z).sub(center);
      const depthOffset = corner.dot(view);
      distance = Math.max(distance, depthOffset + Math.abs(corner.dot(right)) / tanHorizontal, depthOffset + Math.abs(corner.dot(up)) / tanVertical);
    }
    return Math.max(distance, 0.5);
  }

  private async loadGeometries(object: Object): Promise<Geometry[]> {
    try {
      const parts = await loadModel(this.resolvePath(object.source));
      return parts.map(part => ({
        ...part,
        geometry: object.wireframe ? this.createQuadWireframeGeometry(part.geometry) : part.geometry.clone()
      }));
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

  private addDrawable(object: Object, objectIndex: number, group: THREE.Group, loaded: Geometry, id: string) {
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
    // All drawables share one material, so three.js does not upload its
    // uniforms again between them unless `uniformsNeedUpdate` requests it.
    const lineWidth = this.getWireframeLineWidth(object);
    const wireframe = object.wireframe ? 1 : 0;
    drawable.onBeforeRender = (_renderer, _scene, _camera, _geometry, material) => {
      this.material.uniforms.uWireframeLineWidth.value = lineWidth;
      this.material.uniforms.uWireframe.value = wireframe;
      this.material.uniforms.uObjectIndex.value = objectIndex;
      (material as THREE.ShaderMaterial).uniformsNeedUpdate = true;
    };

    if (drawable instanceof THREE.InstancedMesh) {
      for (let index = 0; index < count; index++) {
        drawable.setMatrixAt(index, new THREE.Matrix4().identity());
      }
      drawable.instanceMatrix.needsUpdate = true;
    }
    this.drawables.push(drawable);
    drawable.layers.set(1);
    this.camera.layers.enable(1);
    group.add(drawable);
  }

  private clearObjects() {
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
    this.requestRender();
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
    this.transformPosition.copy(this.transformProxy.position);
    if (!(this.transformMode === 'scale' && this.transformSpace === 'world')) {
      this.transformQuaternion.copy(this.transformProxy.quaternion);
    }
    this.transformScale.copy(this.transformProxy.scale);
    this.onTransformChange?.({
      position: this.transformPosition.toArray() as ViewportTransform['position'],
      quaternion: this.transformQuaternion.toArray() as ViewportTransform['quaternion'],
      scale: this.transformScale.toArray() as ViewportTransform['scale']
    });
  }

  private disposeOverlays() {
    this.gizmoSelection = null;
    this.transformDragging = false;
    this.suppressVisualizationSelection = false;
    this.visualizationPointerStart = undefined;
    if (this.viewHelper) {
      if (this.viewHelperPointerUp) this.renderer.domElement.removeEventListener('pointerup', this.viewHelperPointerUp);
      this.viewHelper.dispose();
      this.viewHelper = undefined;
      this.viewHelperPointerUp = undefined;
    }
    if (this.transformControls) {
      this.renderer.domElement.removeEventListener('pointerdown', this.handleVisualizationPointerDown);
      this.renderer.domElement.removeEventListener('pointerup', this.handleVisualizationPointerUp);
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
    if (this.vectorEditProxy) {
      this.scene.remove(this.vectorEditProxy);
      this.vectorEditProxy = undefined;
      this.editingVectorId = undefined;
    }
    this.controls.enabled = true;
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
    if (this.autoFrame && sizeChanged) this.fitCameraToScene();
    if (sizeChanged) this.material.setInput('iResolution', [this.renderer.domElement.width, this.renderer.domElement.height]);
    // Paint immediately after changing the drawing buffer. This keeps the
    // viewport responsive while a split pane is being dragged.
    this.renderScene();
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
    this.renderRequested = false;
    this.camera.position.toArray(this.cameraPositionArray);
    this.camera.getWorldDirection(this.cameraDirection).toArray(this.cameraDirectionArray);
    this.material.setInput('cameraPosition', this.cameraPositionArray);
    this.material.setInput('cameraDirection', this.cameraDirectionArray);
    this.material.setInput('cameraFov', this.horizontalFov * Math.PI / 180);
    const autoClear = this.renderer.autoClear;
    if (this.infiniteGrid) {
      this.renderer.autoClear = true;
      this.renderer.render(this.gridScene, this.camera);
      this.renderer.autoClear = false;
    }
    if (this.shaderRenderable) this.renderer.render(this.scene, this.camera);
    else if (!this.infiniteGrid) this.renderer.clear();
    const insetAspect = this.shaderRenderable ? this.insetAspect() : undefined;
    if (insetAspect !== undefined) this.renderInsetView(insetAspect);
    if (this.viewHelper) {
      // ViewHelper performs its own renderer.render() call. Prevent that
      // second pass from clearing the full viewport before drawing its corner.
      this.renderer.autoClear = false;
      this.viewHelper.render(this.renderer);
    }
    this.renderer.autoClear = autoClear;
  }

  /** Undefined when the scene has no inset or the shader does not supply a valid aspect ratio. */
  private insetAspect() {
    if (!this.insetView) return undefined;
    const { aspectUniform } = this.insetView;
    const aspect = this.uniformValues[aspectUniform];
    const valid = typeof aspect === 'number' && aspect > 0;
    // Shader edits can remove the uniform. Report it once and draw no inset until it is valid again.
    if (!valid && !this.insetAspectReported) console.error(`Inset view aspect uniform ${aspectUniform} must be a positive float, got ${aspect}.`);
    this.insetAspectReported = !valid;
    return valid ? aspect : undefined;
  }

  /** The inset fits a box of `insetScale` times the viewport. Its corner is at the bottom left, in CSS pixels. */
  private insetSize(aspect: number) {
    const size = this.renderer.getSize(new THREE.Vector2());
    const boxWidth = size.x * this.insetScale;
    const boxHeight = size.y * this.insetScale;
    return new THREE.Vector2(Math.round(Math.min(boxWidth, boxHeight * aspect)), Math.round(Math.min(boxHeight, boxWidth / aspect)));
  }

  /** Pointer position in CSS pixels, measured from the bottom-left corner like the WebGL viewport. */
  private viewportPointer(event: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(event.clientX - rect.left, rect.bottom - event.clientY);
  }

  private insetHit(event: PointerEvent): 'handle' | 'view' | undefined {
    const aspect = this.insetAspect();
    if (aspect === undefined || !this.shaderRenderable) return undefined;
    const inset = this.insetSize(aspect);
    const pointer = this.viewportPointer(event);
    const right = INSET_VIEW_MARGIN + inset.x;
    const top = INSET_VIEW_MARGIN + inset.y;
    if (Math.abs(pointer.x - right) <= INSET_VIEW_HANDLE && Math.abs(pointer.y - top) <= INSET_VIEW_HANDLE) return 'handle';
    if (pointer.x >= INSET_VIEW_MARGIN && pointer.x <= right && pointer.y >= INSET_VIEW_MARGIN && pointer.y <= top) return 'view';
    return undefined;
  }

  private handleInsetPointerDown = (event: PointerEvent) => {
    const hit = this.insetHit(event);
    if (!hit) return;
    event.stopImmediatePropagation();
    if (hit !== 'handle') return;
    this.insetResizing = true;
    this.renderer.domElement.setPointerCapture(event.pointerId);
  };

  /** Drags the top-right corner of the inset. The bottom-left corner stays in place. */
  private handleInsetPointerMove = (event: PointerEvent) => {
    if (!this.insetResizing) {
      this.renderer.domElement.style.cursor = this.insetHit(event) === 'handle' ? 'nesw-resize' : '';
      return;
    }
    event.stopImmediatePropagation();
    const aspect = this.insetAspect();
    if (aspect === undefined) return;
    const size = this.renderer.getSize(new THREE.Vector2());
    const pointer = this.viewportPointer(event).subScalar(INSET_VIEW_MARGIN);
    // At scale 1 the inset is min(W, H · aspect) wide and min(H, W / aspect) high.
    const scale = Math.max(pointer.x / Math.min(size.x, size.y * aspect), pointer.y / Math.min(size.y, size.x / aspect));
    this.insetScale = THREE.MathUtils.clamp(scale, INSET_VIEW_MIN_SCALE, INSET_VIEW_MAX_SCALE);
    this.requestRender();
  };

  private handleInsetPointerUp = (event: PointerEvent) => {
    if (!this.insetResizing) return;
    event.stopImmediatePropagation();
    this.insetResizing = false;
    this.renderer.domElement.releasePointerCapture(event.pointerId);
  };

  /** Draws the inset in the bottom-left corner, framed by a border that is visible in both themes. */
  private renderInsetView(aspect: number) {
    const { x: width, y: height } = this.insetSize(aspect);
    const size = this.renderer.getSize(new THREE.Vector2());
    const autoClear = this.renderer.autoClear;
    this.renderer.setScissorTest(true);
    this.renderer.setScissor(INSET_VIEW_MARGIN - INSET_VIEW_BORDER, INSET_VIEW_MARGIN - INSET_VIEW_BORDER, width + 2 * INSET_VIEW_BORDER, height + 2 * INSET_VIEW_BORDER);
    this.renderer.setClearColor(0x808080, 0.6);
    this.renderer.clear();
    this.renderer.setScissor(INSET_VIEW_MARGIN, INSET_VIEW_MARGIN, width, height);
    this.renderer.setViewport(INSET_VIEW_MARGIN, INSET_VIEW_MARGIN, width, height);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
    this.renderer.autoClear = false;
    // Overlays such as gizmos and helpers belong to the main view only.
    // Layer 1 holds just the shader drawables.
    const layerMask = this.camera.layers.mask;
    this.camera.layers.set(1);
    this.material.uniforms.uInsetView.value = 1;
    this.renderer.render(this.scene, this.camera);
    this.material.uniforms.uInsetView.value = 0;
    this.camera.layers.mask = layerMask;
    // The resize handle covers the top-right corner of the inset.
    this.renderer.setScissor(INSET_VIEW_MARGIN + width - INSET_VIEW_HANDLE, INSET_VIEW_MARGIN + height - INSET_VIEW_HANDLE, INSET_VIEW_HANDLE + INSET_VIEW_BORDER, INSET_VIEW_HANDLE + INSET_VIEW_BORDER);
    this.renderer.setClearColor(0x808080, 0.6);
    this.renderer.clear();
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.autoClear = autoClear;
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, size.x, size.y);
  }

  private requestRender() {
    this.renderRequested = true;
    this.scheduleFrame();
  }

  private scheduleFrame() {
    if (this.animationFrame || this.disposed) return;
    // Restart the clock after an idle period, so `time` does not jump by the idle duration.
    if (!this.looping) this.clock.getDelta();
    this.looping = true;
    this.animationFrame = requestAnimationFrame(this.frame);
  }

  private frame = () => {
    this.animationFrame = 0;
    const delta = this.clock.getDelta();
    // The visibility observer requests a frame again when the viewport becomes visible.
    if (!this.visible) {
      this.looping = false;
      return;
    }
    this.controls.enabled = !this.transformDragging && !this.viewHelper?.animating;
    const cameraMoving = this.controls.update();
    if (!cameraMoving && this.cameraSavePending) {
      this.cameraSavePending = false;
      this.saveCamera();
    }
    const viewHelperAnimating = Boolean(this.viewHelper?.animating);
    if (viewHelperAnimating) {
      this.viewHelper!.update(delta);
      this.renderRequested = true;
      if (!this.viewHelper!.animating) this.saveCamera();
    }
    const timeRunning = this.shaderReadsTime && !this.timePaused;
    if (timeRunning) {
      this.shaderTime += delta;
      this.material.setInput('time', this.shaderTime);
      this.renderRequested = true;
    }
    if (this.renderRequested) this.renderScene();
    const readbackPending = this.shaderReadback.collect();
    const keepRunning = cameraMoving || viewHelperAnimating || timeRunning || readbackPending;
    if (keepRunning && !this.animationFrame) this.animationFrame = requestAnimationFrame(this.frame);
    this.looping = this.animationFrame !== 0;
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
    const lines = (['vertex', 'fragment'] as const).flatMap(stage =>
      diagnostics[stage].map(diagnostic => `[${stage} ${diagnostic.type}, line ${diagnostic.line}] ${diagnostic.message}`));
    if (!lines.length) return;
    const failed = diagnostics.vertex.some(diagnostic => diagnostic.type === 'error') || diagnostics.fragment.some(diagnostic => diagnostic.type === 'error');
    if (failed) console.error(`Shader compilation failed:\n${lines.join('\n')}`);
    else console.warn(`Shader compilation warnings:\n${lines.join('\n')}`);
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
    this.renderer.domElement.removeEventListener('pointerdown', this.handleInsetPointerDown, { capture: true });
    this.renderer.domElement.removeEventListener('pointermove', this.handleInsetPointerMove, { capture: true });
    this.renderer.domElement.removeEventListener('pointerup', this.handleInsetPointerUp, { capture: true });
    this.controls.dispose();
    this.disposeOverlays();
    this.vectorHelpers.forEach(helper => this.disposeVectorHelper(helper));
    this.vectorHelpers.clear();
    this.pointHelpers.forEach(helper => this.disposePointHelper(helper));
    this.pointHelpers.clear();
    this.syncInfiniteGrid(false);
    this.clearObjects();
    this.material.dispose();
    this.pickingMaterial.dispose();
    this.pickingTarget.dispose();
    this.shaderReadback.dispose();
    this.renderer.dispose();
    if (this.container.contains(this.renderer.domElement)) this.container.removeChild(this.renderer.domElement);
  }
}
