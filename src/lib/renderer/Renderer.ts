import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { ViewHelper } from 'three/examples/jsm/helpers/ViewHelper.js';
import { InfiniteGrid } from './InfiniteGrid';
import { ShaderReadback, type ShaderReadbackRequest, type ShaderReadbackValue } from './shaderReadback';
import { loadModel } from './assetCache';
import type { CameraLink, LinkedCamera } from './CameraLink';
import { GpuDevice } from './gpu/device';
import { GpuGeometry } from './gpu/geometry';
import { ShaderInputs, type ShaderInput } from './gpu/inputs';
import { compileProgram, type Program, type ShaderDiagnostic, type ShaderDiagnostics } from './gpu/program';
import { bufferSampler, computeFragmentShader, DISPATCH_VERTEX_SHADER, parseComputeShader, sameLayout, withBufferAccess, type BufferLayout } from './gpu/compute';
import { Simulation } from './gpu/simulation';

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
const DEFAULT_LINE_WIDTH = 3.5;

// The red channel holds the object index + 1, so 0 means that no object was hit.
const PICK_FRAGMENT_SHADER = 'precision highp float; uniform int uObjectIndex; out vec4 fragColor; void main() { fragColor = vec4(float(uObjectIndex + 1) / 255.0, 0.0, 0.0, 1.0); }';

/** Uniforms the renderer supplies. Every other uniform takes its value from the task's inputs and controls. */
const RENDERER_UNIFORMS = new Set([
  'time', 'iResolution', 'iMouse', 'cameraFov', 'cameraPosition', 'cameraDirection',
  'modelMatrix', 'viewMatrix', 'projectionMatrix', 'modelViewMatrix', 'normalMatrix',
  'uWireframe', 'uWireframeLineWidth', 'uInsetView', 'uObjectIndex',
  'deltaTime', 'pointerPosition', 'pointerVelocity', 'pointerDown', 'shaderlabReset'
]);
// A frame that took longer than this, for example after a hidden tab, advances a simulation by this much only.
const MAX_SIMULATION_FRAME = 1 / 30;
// A single step while paused advances the simulation by one frame at 60 Hz.
const STEP_FRAME = 1 / 60;

type UniformValue = number | number[] | boolean;

function sameUniformValue(a: UniformValue | undefined, b: UniformValue) {
  if (!Array.isArray(a) || !Array.isArray(b)) return a === b;
  return a.length === b.length && a.every((component, index) => component === b[index]);
}

function sameUniformValues(previous: Record<string, UniformValue>, next: Record<string, UniformValue>) {
  const names = Object.keys(next);
  if (names.length !== Object.keys(previous).length) return false;
  return names.every(name => sameUniformValue(previous[name], next[name]));
}

const modelView = new THREE.Matrix4();
const normalMatrix = new THREE.Matrix3();
const projectScreen = new THREE.Matrix4();
const clipPosition = new THREE.Vector4();
const partBounds = new THREE.Box3();

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
  /**
   * Number of identical instances. Their placement belongs in the shader. The
   * name of a compute buffer draws one instance per element of that buffer.
   */
  instanceCount?: number | string;
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
  /** False keeps the camera where the task puts it, so a drag can belong to the shader. */
  orbitControls?: boolean;
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

/**
 * What the renderer reports back. The owner replaces the whole set when a
 * different page takes over the viewport, so no callback outlives its page.
 */
export type RendererEvents = {
  onCameraChange?: (pose: ViewportCameraPose) => void;
  onTransformChange?: (transform: ViewportTransform) => void;
  /** Index of the scene object that a click selects, or undefined when a click hits no object. */
  onObjectSelect?: (objectIndex: number | undefined) => void;
  onVectorChange?: (id: string, value: [number, number, number]) => void;
  onShaderErrors?: (errors: ShaderDiagnostics) => void;
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
  /** A compute stage. Its buffer is then readable in the vertex shader. */
  computeShader?: ComputeShaderSource;
  simulation?: SimulationSettings;
  scene: Scene;
};

export type ComputeShaderSource = {
  source: string;
  /** Hidden template lines before the editable code. */
  lineOffset: number;
};

export type SimulationSettings = {
  /** Dispatches per frame. More steps of a smaller `deltaTime` keep stiff simulations stable. */
  stepsPerFrame: number;
  running: boolean;
  /** Multiplies `deltaTime`. */
  speed: number;
};


type Geometry = {
  geometry: THREE.BufferGeometry;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
};

/** One mesh of a scene object, drawn with the task's shader. */
type Part = {
  /** Carries the part's world matrix. */
  node: THREE.Object3D;
  geometry: GpuGeometry;
  objectIndex: number;
  wireframe: boolean;
  lineWidth: number;
  /** Draws one instance per element of this compute buffer. */
  instancesFrom?: string;
};

/** A 1 × 1 framebuffer for GPU picking. */
type PickTarget = { framebuffer: WebGLFramebuffer; color: WebGLRenderbuffer; depth: WebGLRenderbuffer };

/**
 * A viewport. The task's shader is compiled once into our own `Program` and
 * drawn with plain WebGL2 on the app's shared context. three.js still draws
 * the helpers around it: the grid, the gizmo, the view helper and vectors.
 * Every raw GL block ends with `resetState()`, so three.js never works from a
 * stale idea of the GL state.
 */
export class Renderer implements LinkedCamera {
  private readonly device = GpuDevice.shared();
  private readonly gl = this.device.gl;
  private readonly three = this.device.renderer;
  /** Arrows, points and the gizmo's proxy objects. */
  private readonly overlayScene = new THREE.Scene();
  private readonly gridScene = new THREE.Scene();
  /** The transform gizmo is drawn last, over everything. */
  private readonly gizmoScene = new THREE.Scene();
  /** Holds the scene objects' matrices. It is never rendered by three.js. */
  private readonly objectRoot = new THREE.Group();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private readonly inputs: ShaderInputs;
  private program?: Program;
  private pickProgram?: Program;
  /** The compute stage's dispatch program and the buffer it updates. */
  private computeProgram?: Program;
  private simulation?: Simulation;
  private simulationSettings: SimulationSettings = { stepsPerFrame: 1, running: true, speed: 1 };
  private simulationTime = 0;
  private orbitEnabled = true;
  // The pointer on the z = 0 plane, in world units, for compute shaders.
  private readonly pointerPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private readonly pointerWorld = new THREE.Vector3();
  private readonly pointerPrevious = new THREE.Vector3();
  private readonly pointerVelocity = new THREE.Vector3();
  private pointerInside = false;
  private pointerDown = false;
  private pickTarget?: PickTarget;
  private readonly pickingPixel = new Uint8Array(4);

  /** The renderer's own element. Views attach it to their layout and detach it again; it is never recreated. */
  readonly element: HTMLElement;
  private readonly container: HTMLElement;
  /** What the viewport shows. Frames are drawn on the shared context and copied here. */
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly clock = new THREE.Clock();
  private shaderTime = 0;
  private timePaused = false;
  events: RendererEvents = {};
  private cameraLink?: CameraLink;
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
  private cameraPoseSaved = false;
  // The pose is reported once the camera stops moving, not on every damped orbit frame.
  private cameraSavePending = false;
  private transformDragging = false;
  private sceneGeneration = 0;
  // The default view is refitted on resize until the user moves the camera, and
  // is never persisted: a fit depends on the viewport size of the current visit.
  private autoFrame = false;
  private frameBox?: Scene['frameBox'];
  private parts: Part[] = [];
  /**
   * Wireframe scenes output fractional edge coverage, so their objects blend
   * and draw like a transparent double-sided three.js material.
   */
  private transparent = false;
  private uniformValues: Record<string, UniformValue> = {};
  private readonly shaderReadback: ShaderReadback;
  private shaderLineOffsets = { vertex: 0, fragment: 0 };
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
  private vertexShader = '';
  private shaderReadbacks: ShaderReadbackRequest[] = [];
  private readonly cameraDirection = new THREE.Vector3();
  private readonly cameraPositionArray = [0, 0, 0];
  private readonly cameraDirectionArray = [0, 0, -1];
  // Framebuffer-pixel coordinates, measured from the viewport's top-left.
  // The third component is 1 only while the pointer is inside the viewport.
  private readonly mousePositionArray = [0, 0, 0];

  /**
   * Starts empty and detached. The owner fills it with `replaceTaskState()` and
   * places `element` into a view with `attach()`.
   */
  constructor() {
    this.element = this.container = document.createElement('div');
    this.container.style.cssText = 'position: absolute; inset: 0; overflow: hidden; border-radius: inherit;';
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = 0;
    this.canvas.style.cssText = 'width: 100%; height: 100%; display: block; background: transparent;';
    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('A 2D canvas context is unavailable.');
    this.context = context;
    this.container.appendChild(this.canvas);
    const cameraPose: ViewportCameraPose = { position: [0, 0, 1], quaternion: [0, 0, 0, 1], target: [0, 0, 0], fov: 30 };

    this.horizontalFov = cameraPose.fov;
    // This is the viewport camera's clip plane, unrelated to the projection
    // lesson's uNear control. Keep it small enough to inspect a frustum from
    // close range without slicing its outline.
    this.camera = new THREE.PerspectiveCamera(this.horizontalFov, 1, 0.1, 1_000);
    this.inputs = new ShaderInputs(this.gl, () => {
      this.three.resetState();
      this.requestRender();
    });
    this.shaderReadback = new ShaderReadback(this.gl, values => this.events.onShaderReadbacks?.(values));

    // Capture listeners run before OrbitControls and TransformControls, so a
    // pointer on the inset never orbits the camera or picks an object.
    this.canvas.addEventListener('pointerdown', this.handleInsetPointerDown, { capture: true });
    this.canvas.addEventListener('pointermove', this.handleInsetPointerMove, { capture: true });
    this.canvas.addEventListener('pointerup', this.handleInsetPointerUp, { capture: true });
    this.canvas.addEventListener('pointermove', this.handlePointer);
    this.canvas.addEventListener('pointerdown', this.handlePointer);
    this.canvas.addEventListener('pointerup', this.handlePointer);
    this.canvas.addEventListener('pointercancel', this.handlePointerLeave);
    this.canvas.addEventListener('pointerleave', this.handlePointerLeave);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.minDistance = 0;
    this.controls.maxDistance = 100;
    this.controls.maxPolarAngle = Math.PI;
    this.controls.addEventListener('change', () => {
      this.requestRender();
      if (this.applyingCamera) return;
      this.cameraSavePending = true;
      this.shareCamera(true);
    });
    this.controls.addEventListener('start', () => { this.autoFrame = false; });
    this.applyCameraPose(cameraPose);
    this.setOverlays(undefined);

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

  setUniformValues(values: Record<string, UniformValue>) {
    if (sameUniformValues(this.uniformValues, values)) return;
    this.uniformValues = values;
    this.applyValues();
    this.requestRender();
    this.updateShaderReadbacks();
  }

  setInputs(inputs: ShaderInput[] = []) {
    this.inputs.set(inputs);
    this.applyValues();
    this.requestRender();
  }

  setCameraPose(pose: ViewportCameraPose, saved = this.cameraPoseSaved) {
    this.cameraPoseSaved = saved;
    this.applyCameraPose(pose);
  }

  /** Viewports with the same link show one camera. */
  setCameraLink(link: CameraLink | undefined) {
    if (link === this.cameraLink) return;
    this.cameraLink?.leave(this);
    this.cameraLink = link;
    link?.join(this);
  }

  attach(parent: HTMLElement) {
    if (this.element.parentNode !== parent) parent.appendChild(this.element);
    this.scheduleResize();
    this.requestRender();
  }

  detach(parent: HTMLElement) {
    if (this.element.parentNode === parent) parent.removeChild(this.element);
  }

  get aspect() {
    return this.camera.aspect;
  }

  followCamera(pose: ViewportCameraPose, userMoved: boolean) {
    if (userMoved) this.autoFrame = false;
    this.applyCameraPose(pose);
  }

  /**
   * Compiles once. A program that fails keeps the previous one alive but not
   * drawn, so the viewport shows the grid until the shader compiles again.
   * The readbacks belong to this vertex shader, so both are replaced together.
   * With a compute stage, its buffer layout is parsed first: the drawing
   * shader reads the buffer through code generated from it.
   */
  updateShaders(vertexShader: string, fragmentShader: string, shaderReadbacks: ShaderReadbackRequest[], computeShader?: ComputeShaderSource) {
    this.shaderReadbacks = shaderReadbacks;
    const diagnostics: ShaderDiagnostics = { vertex: [], fragment: [], compute: [] };
    let vertex = vertexShader;
    let vertexLineOffset = this.shaderLineOffsets.vertex;
    let compute: { layout: BufferLayout; program?: Program } | undefined;
    if (computeShader) {
      const parsed = parseComputeShader(computeShader.source);
      diagnostics.compute = parsed.diagnostics.map(diagnostic => ({ ...diagnostic, line: Math.max(1, diagnostic.line - computeShader.lineOffset) }));
      if (parsed.layout) {
        const dispatch = computeFragmentShader(parsed.layout, parsed.source);
        const result = compileProgram(this.gl, DISPATCH_VERTEX_SHADER, dispatch.source, { hiddenLines: { vertex: 0, fragment: dispatch.hiddenLines + computeShader.lineOffset } });
        diagnostics.compute.push(...result.diagnostics.fragment);
        compute = { layout: parsed.layout, program: result.program };
        const access = withBufferAccess(parsed.layout, vertexShader);
        vertex = access.source;
        vertexLineOffset += access.addedLines;
      }
    }
    // Without a buffer layout the drawing shader cannot compile, and its errors would only repeat the compute stage's.
    const drawable = !computeShader || compute;
    const result = drawable
      ? compileProgram(this.gl, vertex, fragmentShader, { hiddenLines: { vertex: vertexLineOffset, fragment: this.shaderLineOffsets.fragment } })
      : undefined;
    this.three.resetState();
    if (result) {
      diagnostics.vertex = result.diagnostics.vertex;
      diagnostics.fragment = result.diagnostics.fragment;
    }
    const program = result?.program;
    let renderable = Boolean(program) && (!computeShader || Boolean(compute?.program));
    if (renderable && compute?.program) {
      try {
        this.replaceCompute(compute.layout, compute.program);
      } catch (error) {
        compute.program.dispose();
        diagnostics.compute.push({ type: 'error', line: 1, message: error instanceof Error ? error.message : String(error), timestamp: Date.now() });
        renderable = false;
      }
    } else {
      compute?.program?.dispose();
    }
    if (!computeShader) this.disposeCompute();
    this.shaderRenderable = renderable;
    this.publishDiagnostics(diagnostics);
    if (renderable && program) {
      this.replacePrograms(program);
      this.vertexShader = vertex;
      this.trackShaderInputs(program);
    } else {
      program?.dispose();
    }
    this.renderScene();
    this.updateShaderReadbacks();
    this.scheduleFrame();
  }

  /**
   * Installs a new dispatch program. A buffer with the same layout keeps its
   * state, so editing the update rule changes a running simulation in place.
   */
  private replaceCompute(layout: BufferLayout, program: Program) {
    const keep = this.simulation && sameLayout(this.simulation.layout, layout);
    const simulation = keep ? this.simulation! : new Simulation(this.gl, layout);
    this.three.resetState();
    this.computeProgram?.dispose();
    this.computeProgram = program;
    if (!keep) {
      this.simulation?.dispose();
      this.simulation = simulation;
    }
    this.applyValues();
    if (!keep) this.resetSimulation();
  }

  private disposeCompute() {
    this.computeProgram?.dispose();
    this.computeProgram = undefined;
    this.simulation?.dispose();
    this.simulation = undefined;
  }

  /** Runs, pauses and paces the compute stage. */
  setSimulation(settings: SimulationSettings) {
    this.simulationSettings = { ...settings, stepsPerFrame: Math.max(1, Math.floor(settings.stepsPerFrame)) };
    this.requestRender();
  }

  /** Starts the buffer over from `init()`. */
  resetSimulation() {
    if (!this.simulation || !this.computeProgram) return;
    this.simulationTime = 0;
    this.dispatch(true, 0);
    this.three.resetState();
    this.requestRender();
  }

  /** Advances a paused simulation by one frame. */
  stepSimulation() {
    if (!this.simulation || !this.computeProgram || !this.shaderRenderable) return;
    this.advanceSimulation(STEP_FRAME);
    this.requestRender();
  }

  private advanceSimulation(frameTime: number) {
    const steps = this.simulationSettings.stepsPerFrame;
    const deltaTime = Math.min(frameTime, MAX_SIMULATION_FRAME) * this.simulationSettings.speed / steps;
    // The pointer's velocity over this frame; it is zero while the pointer rests.
    if (this.pointerInside && frameTime > 0) this.pointerVelocity.subVectors(this.pointerWorld, this.pointerPrevious).divideScalar(frameTime);
    else this.pointerVelocity.set(0, 0, 0);
    this.pointerPrevious.copy(this.pointerWorld);
    for (let step = 0; step < steps; step++) {
      this.simulationTime += deltaTime;
      this.dispatch(false, deltaTime);
    }
    this.three.resetState();
  }

  private dispatch(reset: boolean, deltaTime: number) {
    const program = this.computeProgram!;
    program.set('time', this.simulationTime);
    program.set('deltaTime', deltaTime);
    program.set('iResolution', [this.canvas.width, this.canvas.height]);
    program.set('iMouse', this.mousePositionArray);
    program.set('pointerPosition', this.pointerWorld.toArray());
    program.set('pointerVelocity', this.pointerVelocity.toArray());
    program.set('pointerDown', this.pointerDown);
    program.set('shaderlabReset', reset);
    for (const name of this.inputs.textureNames) program.setTexture(name, this.inputs.texture(name));
    this.simulation!.dispatch(program);
  }

  private handlePointer = (event: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, this.camera);
    const hit = raycaster.ray.intersectPlane(this.pointerPlane, new THREE.Vector3());
    if (hit) {
      // Entering the viewport must not look like a jump from where the pointer left it.
      if (!this.pointerInside) this.pointerPrevious.copy(hit);
      this.pointerWorld.copy(hit);
    }
    this.pointerInside = Boolean(hit);
    if (event.type === 'pointerdown' && event.button === 0) this.pointerDown = true;
    if (event.type === 'pointerup') this.pointerDown = false;
    if (this.simulation) this.requestRender();
  };

  private handlePointerLeave = () => {
    this.pointerInside = false;
    this.pointerDown = false;
  };

  private syncControlsEnabled() {
    this.controls.enabled = this.orbitEnabled && !this.transformDragging && !this.viewHelper?.animating;
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
    if (state.simulation) this.setSimulation(state.simulation);
    this.updateShaders(state.vertexShader, state.fragmentShader, state.shaderReadbacks, state.computeShader);
    await sceneLoaded;
    await this.inputs.loaded();
    if (!this.disposed) this.renderScene();
  }

  private replacePrograms(program: Program) {
    for (const previous of [this.program, this.pickProgram]) {
      if (!previous) continue;
      this.parts.forEach(part => part.geometry.release(previous));
      previous.dispose();
    }
    this.program = program;
    // The picking program shares the vertex shader. It is compiled on the first click.
    this.pickProgram = undefined;
    this.applyValues();
  }

  /** Gives every uniform the renderer does not own its value: a control first, then a task input, otherwise zero. */
  private applyValues() {
    for (const program of [this.program, this.pickProgram, this.computeProgram]) {
      if (!program) continue;
      for (const uniform of program.uniforms.values()) {
        if (uniform.unit !== undefined || RENDERER_UNIFORMS.has(uniform.name)) continue;
        program.set(uniform.name, this.uniformValues[uniform.name] ?? this.inputs.values.get(uniform.name));
      }
    }
  }

  private updateShaderReadbacks() {
    if (!this.shaderRenderable || !this.shaderReadbacks.length) return;
    this.shaderReadback.request(this.vertexShader, this.shaderReadbacks, this.uniformValues);
    this.three.resetState();
    this.scheduleFrame();
  }

  private trackShaderInputs(program: Program) {
    this.shaderReadsTime = program.uses('time');
    const readsMouse = program.uses('iMouse');
    if (readsMouse === this.shaderReadsMouse) return;
    this.shaderReadsMouse = readsMouse;
    if (readsMouse) {
      this.canvas.addEventListener('pointerenter', this.handleMouseMove);
      this.canvas.addEventListener('pointermove', this.handleMouseMove);
      this.canvas.addEventListener('pointerleave', this.handleMouseLeave);
      return;
    }
    this.canvas.removeEventListener('pointerenter', this.handleMouseMove);
    this.canvas.removeEventListener('pointermove', this.handleMouseMove);
    this.canvas.removeEventListener('pointerleave', this.handleMouseLeave);
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
    this.orbitEnabled = overlays?.orbitControls !== false;
    this.syncControlsEnabled();
    this.syncInfiniteGrid(overlays?.infiniteGrid !== false);
    const key = JSON.stringify(overlays ?? {});
    if (key === this.overlaysKey) return;
    this.disposeOverlays();
    this.overlays = overlays;
    this.overlaysKey = key;

    if (overlays?.viewHelper !== false) {
      this.viewHelper = new ViewHelper(this.camera, this.canvas);
      this.viewHelper.setLabels('X', 'Y', 'Z');
      this.viewHelperPointerUp = event => {
        if (!this.viewHelper?.handleClick(event)) return;
        this.autoFrame = false;
        this.controls.enabled = false;
        this.requestRender();
        event.preventDefault();
        event.stopPropagation();
      };
      this.canvas.addEventListener('pointerup', this.viewHelperPointerUp);
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
    this.overlayScene.add(this.transformProxy);
    this.transformControls = new TransformControls(this.camera, this.canvas);
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
      this.syncControlsEnabled();
      queueMicrotask(() => { this.suppressVisualizationSelection = false; });
    });
    this.transformControls.addEventListener('dragging-changed', event => {
      this.transformDragging = Boolean(event.value);
      this.syncControlsEnabled();
      // The gizmo moves freely during a drag. Afterwards, show what the owner
      // accepted, so a mode that the object does not support snaps back.
      if (!this.transformDragging && this.gizmoSelection === 'object') this.setTransformState(this.acceptedTransform);
    });
    this.transformControls.addEventListener('change', () => this.requestRender());
    this.transformControls.addEventListener('objectChange', () => this.editingVectorId ? this.saveVectorEdit() : this.saveTransform());
    this.transformControlsHelper = this.transformControls.getHelper();
    this.gizmoScene.add(this.transformControlsHelper);
    this.canvas.addEventListener('pointerdown', this.handleVisualizationPointerDown);
    this.canvas.addEventListener('pointerup', this.handleVisualizationPointerUp);
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
    const canvas = this.canvas;
    this.mousePositionArray[0] = Math.min(canvas.width, Math.max(0, event.offsetX * canvas.width / this.renderedWidth));
    this.mousePositionArray[1] = Math.min(canvas.height, Math.max(0, event.offsetY * canvas.height / this.renderedHeight));
    this.mousePositionArray[2] = 1;
    this.requestRender();
  };

  private handleMouseLeave = () => {
    this.mousePositionArray[2] = 0;
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
          this.overlayScene.add(point);
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
        this.overlayScene.add(helper);
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
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.params.Line!.threshold = .12;
    raycaster.setFromCamera(pointer, this.camera);
    this.overlayScene.updateMatrixWorld(true);
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
        this.overlayScene.add(this.vectorEditProxy);
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

    const objectHit = this.overlays?.transformControls ? this.pickPart(event) : undefined;
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
    this.events.onObjectSelect?.(objectHit);
  };

  /** GPU picking uses the active vertex shader, so shader-side transforms and
   * deformations have exactly the same silhouette as the visible object.
   * The first pass draws the visible program, so fragments that its shader
   * discards write no depth. The second pass writes object IDs only where its
   * depth equals that visible depth. */
  private pickPart(event: PointerEvent): number | undefined {
    const program = this.program;
    if (!this.shaderRenderable || !program || !this.parts.length) return undefined;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return undefined;
    const pickProgram = this.ensurePickProgram();
    if (!pickProgram) return undefined;
    const gl = this.gl;
    const { width, height } = this.canvas;
    const x = Math.min(width - 1, Math.max(0, Math.floor((event.clientX - rect.left) * width / rect.width)));
    const y = Math.min(height - 1, Math.max(0, Math.floor((event.clientY - rect.top) * height / rect.height)));
    try {
      this.camera.setViewOffset(width, height, x, y, 1, 1);
      this.camera.updateProjectionMatrix();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.ensurePickTarget().framebuffer);
      gl.viewport(0, 0, 1, 1);
      gl.disable(gl.SCISSOR_TEST);
      gl.colorMask(true, true, true, true);
      gl.depthMask(true);
      gl.clearColor(0, 0, 0, 0);
      gl.clearDepth(1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      this.drawParts(program, false);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.drawParts(pickProgram, false, true);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.pickingPixel);
      return this.pickingPixel[0] > 0 ? this.pickingPixel[0] - 1 : undefined;
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.camera.clearViewOffset();
      this.camera.updateProjectionMatrix();
      this.three.resetState();
    }
  }

  private ensurePickProgram() {
    if (this.pickProgram) return this.pickProgram;
    const { program } = compileProgram(this.gl, this.vertexShader, PICK_FRAGMENT_SHADER);
    this.three.resetState();
    if (!program) return undefined;
    this.pickProgram = program;
    this.applyValues();
    return program;
  }

  private ensurePickTarget() {
    if (this.pickTarget) return this.pickTarget;
    const gl = this.gl;
    const framebuffer = gl.createFramebuffer()!;
    const color = gl.createRenderbuffer()!;
    const depth = gl.createRenderbuffer()!;
    gl.bindRenderbuffer(gl.RENDERBUFFER, color);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, 1, 1);
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, 1, 1);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, color);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    return this.pickTarget = { framebuffer, color, depth };
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
    this.events.onVectorChange?.(definition.target ?? this.editingVectorId, value.toArray() as [number, number, number]);
  }

  async setScene(sceneDefinition: Scene) {
    const generation = ++this.sceneGeneration;
    this.frameBox = sceneDefinition.frameBox;
    this.insetView = sceneDefinition.insetView;
    this.autoFrame = !this.cameraPoseSaved;
    this.editingVectorId = undefined;
    this.transformControls?.detach();
    this.gizmoSelection = null;
    this.clearParts();
    // A viewport is reused when navigating between pages, so this is decided
    // for every scene and no wireframe drawing can leak into the next one.
    this.transparent = sceneDefinition.objects.some(object => object.wireframe);
    // Load every object concurrently and add them together, so a slow model
    // never leaves the scene partially drawn.
    const loadedObjects = await Promise.all(sceneDefinition.objects.map(object => this.loadGeometries(object)));
    if (this.disposed || generation !== this.sceneGeneration) {
      loadedObjects.flat().forEach(loaded => loaded.geometry.dispose());
      return;
    }
    for (const [objectIndex, object] of sceneDefinition.objects.entries()) {
      const group = new THREE.Group();
      group.name = `object-${objectIndex}`;
      group.position.fromArray(object.position ?? [0, 0, 0]);
      group.rotation.fromArray(object.rotation ?? [0, 0, 0]);
      group.scale.fromArray(object.scale ?? [1, 1, 1]);
      this.objectRoot.add(group);
      const instancesFrom = typeof object.instanceCount === 'string' ? object.instanceCount : undefined;
      const instanceCount = typeof object.instanceCount === 'number' ? Math.max(1, Math.floor(object.instanceCount)) : 1;
      for (const loaded of loadedObjects[objectIndex]) {
        const node = new THREE.Object3D();
        node.position.copy(loaded.position);
        node.quaternion.copy(loaded.quaternion);
        node.scale.copy(loaded.scale);
        group.add(node);
        this.parts.push({
          node,
          geometry: new GpuGeometry(this.gl, loaded.geometry, instanceCount),
          objectIndex,
          wireframe: Boolean(object.wireframe),
          lineWidth: this.getWireframeLineWidth(object),
          instancesFrom
        });
      }
    }
    this.three.resetState();
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
    this.shareCamera(false);
  }

  private frameBounds() {
    if (this.frameBox) return new THREE.Box3(new THREE.Vector3(...this.frameBox[0]), new THREE.Vector3(...this.frameBox[1]));
    this.objectRoot.updateMatrixWorld(true);
    const bounds = new THREE.Box3().makeEmpty();
    for (const part of this.parts) {
      const source = part.geometry.source;
      if (!source.boundingBox) source.computeBoundingBox();
      bounds.union(partBounds.copy(source.boundingBox!).applyMatrix4(part.node.matrixWorld));
    }
    return bounds;
  }

  /** Distance along `view` from `center` at which `bounds` fits the frustum. */
  private fitDistance(bounds: THREE.Box3, center: THREE.Vector3, view: THREE.Vector3) {
    const tanHorizontal = Math.tan(THREE.MathUtils.degToRad(this.horizontalFov) / 2) / FRAME_MARGIN;
    const tanVertical = tanHorizontal / (this.cameraLink?.widestAspect() ?? this.camera.aspect);
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
      const parts = await loadModel(object.source);
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
    const lineWidth = object.lineWidth ?? DEFAULT_LINE_WIDTH;
    return Number.isFinite(lineWidth) ? Math.max(0.5, lineWidth) : DEFAULT_LINE_WIDTH;
  }

  private clearParts() {
    for (const part of this.parts) {
      part.geometry.dispose();
      part.geometry.source.dispose();
    }
    this.parts = [];
    this.objectRoot.clear();
  }

  private applyCameraPose(pose: ViewportCameraPose) {
    const key = JSON.stringify(pose);
    if (this.cameraKey === key) return;
    this.applyingCamera = true;
    // A pose from outside replaces this viewport's orbit inertia. Without
    // damping, update() consumes the pending deltas; the pose below then
    // overwrites their effect, so the final update() applies no stale motion.
    this.controls.enableDamping = false;
    this.controls.update();
    this.controls.enableDamping = true;
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

  private currentCameraPose(): ViewportCameraPose {
    return {
      position: this.camera.position.toArray() as ViewportCameraPose['position'],
      quaternion: this.camera.quaternion.toArray() as ViewportCameraPose['quaternion'],
      target: this.controls.target.toArray() as ViewportCameraPose['target'],
      fov: this.horizontalFov
    };
  }

  private shareCamera(userMoved: boolean) {
    if (!this.cameraLink) return;
    this.cameraLink.share(this, this.currentCameraPose(), userMoved);
  }

  private saveCamera() {
    if (this.applyingCamera) return;
    this.cameraPoseSaved = true;
    const pose = this.currentCameraPose();
    this.cameraKey = JSON.stringify(pose);
    this.events.onCameraChange?.(pose);
  }

  private saveTransform() {
    if (this.applyingTransform || !this.transformProxy) return;
    this.transformPosition.copy(this.transformProxy.position);
    if (!(this.transformMode === 'scale' && this.transformSpace === 'world')) {
      this.transformQuaternion.copy(this.transformProxy.quaternion);
    }
    this.transformScale.copy(this.transformProxy.scale);
    this.events.onTransformChange?.({
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
      if (this.viewHelperPointerUp) this.canvas.removeEventListener('pointerup', this.viewHelperPointerUp);
      this.viewHelper.dispose();
      this.viewHelper = undefined;
      this.viewHelperPointerUp = undefined;
    }
    if (this.transformControls) {
      this.canvas.removeEventListener('pointerdown', this.handleVisualizationPointerDown);
      this.canvas.removeEventListener('pointerup', this.handleVisualizationPointerUp);
      this.transformControls.detach();
      if (this.transformControlsHelper) this.gizmoScene.remove(this.transformControlsHelper);
      this.transformControls.dispose();
      this.transformControls = undefined;
      this.transformControlsHelper = undefined;
    }
    if (this.transformProxy) {
      this.overlayScene.remove(this.transformProxy);
      this.transformProxy = undefined;
    }
    if (this.vectorEditProxy) {
      this.overlayScene.remove(this.vectorEditProxy);
      this.vectorEditProxy = undefined;
      this.editingVectorId = undefined;
    }
    this.syncControlsEnabled();
  }

  private disposeVectorHelper(helper: THREE.ArrowHelper) {
    this.overlayScene.remove(helper);
    helper.line.geometry.dispose();
    (helper.line.material as THREE.Material).dispose();
    helper.cone.geometry.dispose();
    (helper.cone.material as THREE.Material).dispose();
  }

  private disposePointHelper(helper: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>) {
    this.overlayScene.remove(helper);
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
    // Do not resize the canvas to that transient state, but check again
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
      this.canvas.width = Math.floor(width * this.device.pixelRatio);
      this.canvas.height = Math.floor(height * this.device.pixelRatio);
    }
    this.updateTransformControlsSize(height);
    this.camera.aspect = width / height;
    this.camera.fov = 2 * Math.atan(Math.tan(this.horizontalFov * Math.PI / 360) / this.camera.aspect) * 180 / Math.PI;
    this.camera.updateProjectionMatrix();
    if (this.autoFrame && sizeChanged) this.fitCameraToScene();
    // Paint immediately after resizing: a resized canvas is blank, and this
    // keeps the viewport responsive while a split pane is being dragged.
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

  /** Hands the context back to three.js after raw GL, drawing into this viewport's corner again. */
  private restoreThree() {
    this.three.resetState();
    this.three.setRenderTarget(null);
    this.three.setViewport(0, 0, this.renderedWidth, this.renderedHeight);
  }

  private renderScene() {
    this.renderRequested = false;
    if (this.disposed || !this.renderedWidth || !this.renderedHeight) return;
    const three = this.three;
    this.device.begin(this.renderedWidth, this.renderedHeight);
    this.camera.position.toArray(this.cameraPositionArray);
    this.camera.getWorldDirection(this.cameraDirection).toArray(this.cameraDirectionArray);
    three.autoClear = true;
    if (this.infiniteGrid) three.render(this.gridScene, this.camera);
    else three.clear();
    three.autoClear = false;
    const program = this.shaderRenderable ? this.program : undefined;
    if (program) {
      // As in one three.js scene: transparent objects draw after opaque helpers, opaque objects before them.
      if (this.transparent) three.render(this.overlayScene, this.camera);
      this.drawParts(program, false);
      this.restoreThree();
      if (!this.transparent) three.render(this.overlayScene, this.camera);
      three.render(this.gizmoScene, this.camera);
      const insetAspect = this.insetAspect();
      if (insetAspect !== undefined) this.renderInsetView(program, insetAspect);
    }
    // ViewHelper draws its own corner and must not clear the viewport first, hence autoClear stays off.
    this.viewHelper?.render(three);
    three.autoClear = true;
    this.device.present(this.context);
  }

  /**
   * Draws the scene objects with `program` into the current viewport, in the
   * order and with the state a three.js double-sided material would use.
   * `pick` draws ID colours where the depth equals the visible depth.
   */
  private drawParts(program: Program, inset: boolean, pick = false) {
    const gl = this.gl;
    const camera = this.camera;
    camera.updateMatrixWorld();
    this.objectRoot.updateMatrixWorld(true);
    const transparent = this.transparent && !pick;
    projectScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const order = this.parts.map((part, index) => ({ part, index, depth: clipPosition.setFromMatrixPosition(part.node.matrixWorld).applyMatrix4(projectScreen).z }));
    // Opaque objects front to back, transparent ones back to front, ties in scene order.
    order.sort((a, b) => (transparent ? b.depth - a.depth : a.depth - b.depth) || a.index - b.index);

    program.set('time', this.shaderTime);
    program.set('iResolution', [this.canvas.width, this.canvas.height]);
    program.set('iMouse', this.mousePositionArray);
    program.set('cameraFov', this.horizontalFov * Math.PI / 180);
    program.set('cameraPosition', this.cameraPositionArray);
    program.set('cameraDirection', this.cameraDirectionArray);
    program.set('viewMatrix', camera.matrixWorldInverse.elements);
    program.set('projectionMatrix', camera.projectionMatrix.elements);
    program.set('uInsetView', inset);
    program.set('pointerPosition', this.pointerWorld.toArray());
    program.set('pointerVelocity', this.pointerVelocity.toArray());
    program.set('pointerDown', this.pointerDown);
    for (const name of this.inputs.textureNames) program.setTexture(name, this.inputs.texture(name));
    this.simulation?.textures.forEach((texture, slot) => program.setTexture(bufferSampler(slot), texture));

    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    gl.colorMask(true, true, true, true);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(pick ? gl.EQUAL : gl.LEQUAL);
    gl.depthMask(!pick);
    if (transparent) {
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    } else {
      gl.disable(gl.BLEND);
    }
    gl.cullFace(gl.BACK);
    for (const { part } of order) {
      const instances = part.instancesFrom === undefined ? part.geometry.instanceCount
        : part.instancesFrom === this.simulation?.layout.name ? this.simulation.layout.count : 0;
      const world = part.node.matrixWorld;
      modelView.multiplyMatrices(camera.matrixWorldInverse, world);
      normalMatrix.getNormalMatrix(modelView);
      program.set('modelMatrix', world.elements);
      program.set('modelViewMatrix', modelView.elements);
      program.set('normalMatrix', normalMatrix.elements);
      program.set('uObjectIndex', part.objectIndex);
      program.set('uWireframe', part.wireframe);
      program.set('uWireframeLineWidth', part.lineWidth);
      program.bind();
      const mirrored = world.determinant() < 0;
      if (transparent) {
        // Back faces first, then front faces, so a closed transparent object blends correctly.
        gl.enable(gl.CULL_FACE);
        gl.frontFace(mirrored ? gl.CCW : gl.CW);
        part.geometry.draw(program, instances);
        gl.frontFace(mirrored ? gl.CW : gl.CCW);
        part.geometry.draw(program, instances);
      } else {
        gl.disable(gl.CULL_FACE);
        gl.frontFace(mirrored ? gl.CW : gl.CCW);
        part.geometry.draw(program, instances);
      }
    }
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
    const boxWidth = this.renderedWidth * this.insetScale;
    const boxHeight = this.renderedHeight * this.insetScale;
    return new THREE.Vector2(Math.round(Math.min(boxWidth, boxHeight * aspect)), Math.round(Math.min(boxHeight, boxWidth / aspect)));
  }

  /** Pointer position in CSS pixels, measured from the bottom-left corner like the WebGL viewport. */
  private viewportPointer(event: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
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
    this.canvas.setPointerCapture(event.pointerId);
  };

  /** Drags the top-right corner of the inset. The bottom-left corner stays in place. */
  private handleInsetPointerMove = (event: PointerEvent) => {
    if (!this.insetResizing) {
      this.canvas.style.cursor = this.insetHit(event) === 'handle' ? 'nesw-resize' : '';
      return;
    }
    event.stopImmediatePropagation();
    const aspect = this.insetAspect();
    if (aspect === undefined) return;
    const pointer = this.viewportPointer(event).subScalar(INSET_VIEW_MARGIN);
    const width = this.renderedWidth;
    const height = this.renderedHeight;
    // At scale 1 the inset is min(W, H · aspect) wide and min(H, W / aspect) high.
    const scale = Math.max(pointer.x / Math.min(width, height * aspect), pointer.y / Math.min(height, width / aspect));
    this.insetScale = THREE.MathUtils.clamp(scale, INSET_VIEW_MIN_SCALE, INSET_VIEW_MAX_SCALE);
    this.requestRender();
  };

  private handleInsetPointerUp = (event: PointerEvent) => {
    if (!this.insetResizing) return;
    event.stopImmediatePropagation();
    this.insetResizing = false;
    this.canvas.releasePointerCapture(event.pointerId);
  };

  /** Draws the inset in the bottom-left corner, framed by a border that is visible in both themes. */
  private renderInsetView(program: Program, aspect: number) {
    const { x: width, y: height } = this.insetSize(aspect);
    const three = this.three;
    three.setScissorTest(true);
    three.setScissor(INSET_VIEW_MARGIN - INSET_VIEW_BORDER, INSET_VIEW_MARGIN - INSET_VIEW_BORDER, width + 2 * INSET_VIEW_BORDER, height + 2 * INSET_VIEW_BORDER);
    three.setClearColor(0x808080, 0.6);
    three.clear();
    three.setScissor(INSET_VIEW_MARGIN, INSET_VIEW_MARGIN, width, height);
    three.setViewport(INSET_VIEW_MARGIN, INSET_VIEW_MARGIN, width, height);
    three.setClearColor(0x000000, 0);
    three.clear();
    // Helpers belong to the main view only; the inset shows just the shader's objects.
    this.drawParts(program, true);
    this.restoreThree();
    // The resize handle covers the top-right corner of the inset.
    three.setScissorTest(true);
    three.setScissor(INSET_VIEW_MARGIN + width - INSET_VIEW_HANDLE, INSET_VIEW_MARGIN + height - INSET_VIEW_HANDLE, INSET_VIEW_HANDLE + INSET_VIEW_BORDER, INSET_VIEW_HANDLE + INSET_VIEW_BORDER);
    three.setClearColor(0x808080, 0.6);
    three.clear();
    three.setClearColor(0x000000, 0);
    three.setScissorTest(false);
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
    this.syncControlsEnabled();
    const cameraMoving = this.controls.update();
    if (!cameraMoving && this.cameraSavePending) {
      this.cameraSavePending = false;
      this.saveCamera();
    }
    const viewHelperAnimating = Boolean(this.viewHelper?.animating);
    if (viewHelperAnimating) {
      this.viewHelper!.update(delta);
      this.shareCamera(true);
      this.renderRequested = true;
      if (!this.viewHelper!.animating) this.saveCamera();
    }
    const timeRunning = this.shaderReadsTime && !this.timePaused;
    if (timeRunning) {
      this.shaderTime += delta;
      this.renderRequested = true;
    }
    const simulating = Boolean(this.simulation && this.computeProgram && this.shaderRenderable && this.simulationSettings.running);
    if (simulating) {
      this.advanceSimulation(delta);
      this.renderRequested = true;
    }
    if (this.renderRequested) this.renderScene();
    let readbackPending = false;
    if (this.shaderReadback.busy) {
      readbackPending = this.shaderReadback.collect();
      this.three.resetState();
    }
    const keepRunning = cameraMoving || viewHelperAnimating || timeRunning || readbackPending || simulating;
    if (keepRunning && !this.animationFrame) this.animationFrame = requestAnimationFrame(this.frame);
    this.looping = this.animationFrame !== 0;
  };

  private publishDiagnostics(diagnostics: ShaderDiagnostics) {
    this.events.onShaderErrors?.(diagnostics);
    const lines = (['compute', 'vertex', 'fragment'] as const).flatMap(stage =>
      diagnostics[stage].map(diagnostic => `[${stage} ${diagnostic.type}, line ${diagnostic.line}] ${diagnostic.message}`));
    if (!lines.length) return;
    const failed = Object.values(diagnostics).some(list => list.some(diagnostic => diagnostic.type === 'error'));
    if (failed) console.error(`Shader compilation failed:\n${lines.join('\n')}`);
    else console.warn(`Shader compilation warnings:\n${lines.join('\n')}`);
  }

  /** Frees this viewport's GPU objects. The shared device lives on for the other viewports. */
  dispose() {
    this.disposed = true;
    this.cameraLink?.leave(this);
    cancelAnimationFrame(this.animationFrame);
    cancelAnimationFrame(this.resizeFrame);
    cancelAnimationFrame(this.settledResizeFrame);
    cancelAnimationFrame(this.resizeRetryFrame);
    this.sceneGeneration++;
    this.resizeObserver.disconnect();
    this.visibilityObserver.disconnect();
    this.canvas.removeEventListener('pointerenter', this.handleMouseMove);
    this.canvas.removeEventListener('pointermove', this.handleMouseMove);
    this.canvas.removeEventListener('pointerleave', this.handleMouseLeave);
    this.canvas.removeEventListener('pointerdown', this.handleInsetPointerDown, { capture: true });
    this.canvas.removeEventListener('pointermove', this.handleInsetPointerMove, { capture: true });
    this.canvas.removeEventListener('pointerup', this.handleInsetPointerUp, { capture: true });
    this.canvas.removeEventListener('pointermove', this.handlePointer);
    this.canvas.removeEventListener('pointerdown', this.handlePointer);
    this.canvas.removeEventListener('pointerup', this.handlePointer);
    this.canvas.removeEventListener('pointercancel', this.handlePointerLeave);
    this.canvas.removeEventListener('pointerleave', this.handlePointerLeave);
    this.controls.dispose();
    this.disposeOverlays();
    this.vectorHelpers.forEach(helper => this.disposeVectorHelper(helper));
    this.vectorHelpers.clear();
    this.pointHelpers.forEach(helper => this.disposePointHelper(helper));
    this.pointHelpers.clear();
    this.syncInfiniteGrid(false);
    this.clearParts();
    this.program?.dispose();
    this.pickProgram?.dispose();
    this.disposeCompute();
    this.inputs.dispose();
    if (this.pickTarget) {
      this.gl.deleteFramebuffer(this.pickTarget.framebuffer);
      this.gl.deleteRenderbuffer(this.pickTarget.color);
      this.gl.deleteRenderbuffer(this.pickTarget.depth);
    }
    this.shaderReadback.dispose();
    this.three.resetState();
    this.element.remove();
  }
}
