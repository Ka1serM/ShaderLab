import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { ViewHelper } from 'three/examples/jsm/helpers/ViewHelper.js';
import { InfiniteGrid } from './InfiniteGrid';
import { NormalsOverlay, type NormalsVaryings } from './NormalsOverlay';
import { VectorArrow } from './VectorArrow';
import { sameValues } from '$lib/utils/sameValues';
import { defaultCameraPose, type ViewportCameraPose } from './camera';
import { ShaderReadback, type ShaderReadbackRequest, type ShaderReadbackValue } from './shaderReadback';
import { loadModel } from './assetCache';
import type { CameraLink, LinkedCamera } from './CameraLink';
import { GpuDevice } from './gpu/device';
import { GpuGeometry } from './gpu/geometry';
import { ShaderInputs, type ShaderInput } from './gpu/inputs';
import { compileProgram, type Program, type ShaderDiagnostic, type ShaderDiagnostics } from './gpu/program';
import { bufferSampler, computeFragmentShader, dispatchVertexShader, parseComputeShader, sameLayout, withBufferAccess, type BufferLayout } from './gpu/compute';
import { Simulation } from './gpu/simulation';

THREE.Cache.enabled = false;

const TRANSFORM_CONTROLS_REFERENCE_HEIGHT = 600;
const FRAME_MARGIN = 1.1;
const INSET_VIEW_SCALE = 0.3;
const INSET_VIEW_MIN_SCALE = 0.15;
const INSET_VIEW_MAX_SCALE = 0.9;
const INSET_VIEW_MARGIN = 12;
const INSET_VIEW_BORDER = 2;
const INSET_VIEW_HANDLE = 12;
const DEFAULT_LINE_WIDTH = 3.5;
const INSET_VIEW_ASPECT_UNIFORM = 'uAspect';

const PICK_FRAGMENT_SHADER = 'uniform int uObjectIndex; out vec4 fragColor; void main() { fragColor = vec4(float(uObjectIndex + 1) / 255.0, 0.0, 0.0, 1.0); }';

const RENDERER_UNIFORMS = new Set([
  'time', 'iResolution', 'iMouse', 'cameraFov', 'cameraPosition', 'cameraDirection',
  'modelMatrix', 'viewMatrix', 'projectionMatrix', 'modelViewMatrix', 'normalMatrix',
  'uWireframe', 'uWireframeLineWidth', 'uInsetView', 'uObjectIndex',
  'deltaTime', 'pointerPosition', 'pointerVelocity', 'pointerInside', 'pointerDown', 'frame'
]);
const SIMULATION_FRAME = 1 / 60;
const MAX_SIMULATION_FRAME = 2 * SIMULATION_FRAME;

type UniformValue = number | number[] | boolean;


const modelView = new THREE.Matrix4();
const normalMatrix = new THREE.Matrix3();
const projectScreen = new THREE.Matrix4();
const clipPosition = new THREE.Vector4();
const partBounds = new THREE.Box3();

export type { ViewportCameraPose };


export type Object = {
  source: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  instanceCount?: number;
  wireframe?: boolean;
  lineWidth?: number;
};

export type Scene = {
  objects: Object[];
  frameBox?: [[number, number, number], [number, number, number]];
  background?: [number, number, number];
};

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
  transformControls?: {
    mode?: TransformMode;
  };
  orbitControls?: boolean;
  normals?: boolean | NormalsVaryings;
  insetView?: boolean;
};

export type ViewportVector = {
  id: string;
  value: [number, number, number];
  visualization: 'vector' | 'point';
  editable?: boolean;
};

export type RendererEvents = {
  onCameraChange?: (pose: ViewportCameraPose) => void;
  onTransformChange?: (transform: ViewportTransform) => void;
  onObjectSelect?: (objectIndex: number | undefined) => void;
  onVectorChange?: (id: string, value: [number, number, number]) => void;
  onShaderErrors?: (errors: ShaderDiagnostics) => void;
  onShaderReadbacks?: (values: Record<string, ShaderReadbackValue>) => void;
};

export type RendererShaders = {
  vertexShader: string;
  fragmentShader: string;
  computeShader?: string;
  lineOffsets: { vertex: number; fragment: number; compute: number };
  shaderReadbacks?: ShaderReadbackRequest[];
};

export type RendererTaskState = RendererShaders & {
  inputs?: ShaderInput[];
  uniformValues?: Record<string, number | number[] | boolean>;
  overlays?: ViewportOverlays;
  simulation?: SimulationSettings;
  scene: Scene;
};

export type SimulationSettings = {
  stepsPerFrame: number;
  running: boolean;
  speed: number;
};


type Geometry = {
  geometry: THREE.BufferGeometry;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
};

type Part = {
  node: THREE.Object3D;
  geometry: GpuGeometry;
  objectIndex: number;
  wireframe: boolean;
  lineWidth: number;
};

type PickTarget = { framebuffer: WebGLFramebuffer; color: WebGLRenderbuffer; depth: WebGLRenderbuffer };

export class Renderer implements LinkedCamera {
  private readonly device = GpuDevice.shared();
  private readonly gl = this.device.gl;
  private readonly three = this.device.renderer;
  private readonly overlayScene = new THREE.Scene();
  private readonly gridScene = new THREE.Scene();
  private readonly gizmoScene = new THREE.Scene();
  private readonly objectRoot = new THREE.Group();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private readonly inputs: ShaderInputs;
  private program?: Program;
  private pickProgram?: Program;
  private computeProgram?: Program;
  private simulation?: Simulation;
  private simulationSettings: SimulationSettings = { stepsPerFrame: 1, running: true, speed: 1 };
  private simulationTime = 0;
  private simulationFrame = 0;
  private simulationBacklog = 0;
  private simulationResetPending = false;
  private orbitEnabled = true;
  private readonly pointer = new THREE.Vector2();
  private readonly pointerPrevious = new THREE.Vector2();
  private readonly pointerVelocity = new THREE.Vector2();
  private pointerInside = false;
  private pointerDown = false;
  private pickTarget?: PickTarget;
  private readonly pickingPixel = new Uint8Array(4);

  readonly element: HTMLElement;
  private readonly container: HTMLElement;
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
  private acceptedTransform?: ViewportTransform;
  private insetScale = INSET_VIEW_SCALE;
  private insetResizing = false;
  private renderedWidth = 0;
  private renderedHeight = 0;
  private disposed = false;
  private applyingCamera = false;
  private cameraKey = '';
  private cameraPoseSaved = false;
  private cameraSavePending = false;
  private transformDragging = false;
  private sceneGeneration = 0;
  private autoFrame = false;
  private frameBox?: Scene['frameBox'];
  private background?: THREE.Color;
  private parts: Part[] = [];
  private transparent = false;
  private uniformValues: Record<string, UniformValue> = {};
  private readonly shaderReadback: ShaderReadback;
  private overlays: ViewportOverlays | undefined;
  private normals?: NormalsOverlay;
  private normalsVisible = false;
  private overlaysKey = '';
  private vectorsKey = '';
  private infiniteGrid?: InfiniteGrid;
  private transformControls?: TransformControls;
  private transformControlsHelper?: THREE.Object3D;
  private viewHelper?: ViewHelper;
  private viewHelperPointerUp?: (event: PointerEvent) => void;
  private transformProxy?: THREE.Object3D;
  private vectorHelpers = new Map<string, VectorArrow>();
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
  private renderRequested = true;
  private looping = false;
  private shaderReadsTime = false;
  private shaderReadsMouse = false;
  private vertexShader = '';
  private shaderReadbacks: ShaderReadbackRequest[] = [];
  private readonly cameraDirection = new THREE.Vector3();
  private readonly cameraPositionArray = [0, 0, 0];
  private readonly cameraDirectionArray = [0, 0, -1];
  private readonly mousePositionArray = [0, 0, 0];

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
    const cameraPose = defaultCameraPose();

    this.horizontalFov = cameraPose.fov;
    this.camera = new THREE.PerspectiveCamera(this.horizontalFov, 1, 0.1, 1_000);
    this.inputs = new ShaderInputs(this.gl, () => {
      this.three.resetState();
      this.requestRender();
    });
    this.shaderReadback = new ShaderReadback(this.gl, values => this.events.onShaderReadbacks?.(values));

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
      this.visible = entries.at(-1)?.isIntersecting ?? true;
      this.requestRender();
    });
    this.visibilityObserver.observe(this.container);
    this.resize();
    this.requestRender();
  }

  setUniformValues(values: Record<string, UniformValue>) {
    if (sameValues(this.uniformValues, values)) return;
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

  updateShaders({ vertexShader, fragmentShader, computeShader, lineOffsets, shaderReadbacks = [] }: RendererShaders) {
    this.shaderReadbacks = shaderReadbacks;
    const diagnostics: ShaderDiagnostics = { vertex: [], fragment: [], compute: [] };
    let vertex = vertexShader;
    let fragment = fragmentShader;
    let compute: { layout: BufferLayout; program?: Program } | undefined;
    if (computeShader !== undefined) {
      const parsed = parseComputeShader(computeShader);
      diagnostics.compute = parsed.diagnostics.map(diagnostic => ({ ...diagnostic, line: Math.max(1, diagnostic.line - lineOffsets.compute) }));
      if (parsed.layout && parsed.output) {
        const dispatch = computeFragmentShader({ layout: parsed.layout, output: parsed.output, source: parsed.source });
        const result = compileProgram(this.gl, dispatchVertexShader(parsed.layout), dispatch.source, { hiddenLines: { vertex: 0, fragment: dispatch.hiddenLines + lineOffsets.compute } });
        diagnostics.compute.push(...result.diagnostics.fragment);
        compute = { layout: parsed.layout, program: result.program };
        vertex = withBufferAccess(parsed.layout, vertexShader);
        fragment = withBufferAccess(parsed.layout, fragmentShader);
      }
    }
    const result = computeShader === undefined || compute
      ? compileProgram(this.gl, vertex, fragment, { hiddenLines: { vertex: lineOffsets.vertex, fragment: lineOffsets.fragment } })
      : undefined;
    this.three.resetState();
    if (result) {
      diagnostics.vertex = result.diagnostics.vertex;
      diagnostics.fragment = result.diagnostics.fragment;
    }
    const program = result?.program;
    let renderable = Boolean(program) && (computeShader === undefined || Boolean(compute?.program));
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
    if (computeShader === undefined) this.disposeCompute();
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

  setSimulation(settings: SimulationSettings) {
    this.simulationSettings = { ...settings, stepsPerFrame: Math.max(1, Math.floor(settings.stepsPerFrame)) };
    this.requestRender();
  }

  resetSimulation() {
    this.simulationResetPending = true;
    this.requestRender();
  }

  stepSimulation() {
    if (!this.shaderRenderable) return;
    this.advanceSimulation(SIMULATION_FRAME);
    this.requestRender();
  }

  private advanceSimulation(frameTime: number) {
    if (!this.simulation || !this.computeProgram || this.simulationResetPending) return;
    if (this.pointerInside && frameTime > 0) this.pointerVelocity.subVectors(this.pointer, this.pointerPrevious).divideScalar(frameTime);
    else this.pointerVelocity.set(0, 0);
    this.pointerPrevious.copy(this.pointer);
    const { stepsPerFrame, speed } = this.simulationSettings;
    const deltaTime = SIMULATION_FRAME / stepsPerFrame;
    this.simulationBacklog = Math.min(this.simulationBacklog + frameTime * speed, MAX_SIMULATION_FRAME * speed);
    for (; this.simulationBacklog >= deltaTime; this.simulationBacklog -= deltaTime) {
      this.simulationTime += deltaTime;
      this.dispatch(deltaTime);
    }
    this.three.resetState();
  }

  private runPendingReset() {
    if (!this.simulationResetPending || !this.simulation || !this.computeProgram) return;
    this.simulationResetPending = false;
    this.simulationTime = 0;
    this.simulationBacklog = 0;
    this.simulationFrame = 0;
    this.dispatch(0);
    this.three.resetState();
  }

  private dispatch(deltaTime: number) {
    const program = this.computeProgram!;
    this.setFrameUniforms(program, this.simulationTime);
    program.set('deltaTime', deltaTime);
    program.set('frame', this.simulationFrame++);
    this.simulation!.dispatch(program);
  }

  private setFrameUniforms(program: Program, time: number) {
    program.set('time', time);
    program.set('iResolution', [this.canvas.width, this.canvas.height]);
    program.set('iMouse', this.mousePositionArray);
    program.set('pointerPosition', this.pointer.toArray());
    program.set('pointerVelocity', this.pointerVelocity.toArray());
    program.set('pointerInside', this.pointerInside);
    program.set('pointerDown', this.pointerDown);
    for (const name of this.inputs.textureNames) program.setTexture(name, this.inputs.texture(name));
  }

  private handlePointer = (event: PointerEvent) => {
    if (this.renderedWidth <= 0 || this.renderedHeight <= 0) return;
    this.pointer.set(event.offsetX / this.renderedWidth * 2 - 1, 1 - event.offsetY / this.renderedHeight * 2);
    if (!this.pointerInside) this.pointerPrevious.copy(this.pointer);
    this.pointerInside = true;
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

  async replaceTaskState(state: RendererTaskState) {
    this.setInputs(state.inputs);
    this.setUniformValues(state.uniformValues ?? {});
    this.setOverlays(state.overlays);
    const sceneLoaded = this.setScene(state.scene);
    if (state.simulation) this.setSimulation(state.simulation);
    this.updateShaders(state);
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
    this.pickProgram = undefined;
    this.applyValues();
  }

  private applyValues() {
    for (const program of [this.program, this.pickProgram, this.computeProgram]) {
      if (!program) continue;
      for (const uniform of program.uniforms.values()) {
        if (uniform.unit !== undefined || RENDERER_UNIFORMS.has(uniform.name)) continue;
        program.set(uniform.name, this.uniformValues[uniform.name]);
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

  setNormalsVisible(visible: boolean) {
    this.normalsVisible = visible;
    this.requestRender();
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

  private attachObjectGizmo() {
    if (!this.transformControls || !this.transformProxy) return;
    if (this.transformControls.object !== this.transformProxy) this.transformControls.attach(this.transformProxy);
    this.transformControlsHelper?.updateMatrixWorld(true);
  }

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
    const key = JSON.stringify(vectors);
    if (key === this.vectorsKey) return;
    this.vectorsKey = key;
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
      const endpoint = new THREE.Vector3().fromArray(vector.value);
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
      const length = endpoint.length();
      let helper = this.vectorHelpers.get(vector.id);
      if (!helper) {
        helper = new VectorArrow(0xbf2732);
        this.vectorHelpers.set(vector.id, helper);
        this.overlayScene.add(helper);
      }
      helper.position.set(0, 0, 0);
      helper.userData.visualizationId = vector.id;
      helper.visible = length > Number.EPSILON;
      if (!helper.visible) continue;
      helper.setDirection(endpoint.clone().normalize());
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
      this.vectorEditProxy.position.fromArray(definition.value);
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
    this.events.onVectorChange?.(this.editingVectorId, this.vectorEditProxy.position.toArray() as [number, number, number]);
  }

  async setScene(sceneDefinition: Scene) {
    const generation = ++this.sceneGeneration;
    this.frameBox = sceneDefinition.frameBox;
    this.background = sceneDefinition.background && new THREE.Color().setRGB(...sceneDefinition.background, THREE.SRGBColorSpace);
    this.autoFrame = !this.cameraPoseSaved;
    this.editingVectorId = undefined;
    this.transformControls?.detach();
    this.gizmoSelection = null;
    this.clearParts();
    this.transparent = sceneDefinition.objects.some(object => object.wireframe);
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
      const instanceCount = Math.max(1, Math.floor(object.instanceCount ?? 1));
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
          lineWidth: this.getWireframeLineWidth(object)
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
    this.vectorsKey = '';
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

  private disposeVectorHelper(helper: VectorArrow) {
    this.overlayScene.remove(helper);
    helper.dispose();
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
    this.renderScene();
  }

  private updateTransformControlsSize(height = this.container.clientHeight) {
    if (height < 1) return;
    this.transformControls?.setSize(TRANSFORM_CONTROLS_REFERENCE_HEIGHT / height);
  }

  private restoreThree() {
    this.three.resetState();
    this.three.setRenderTarget(null);
    this.three.setViewport(0, 0, this.renderedWidth, this.renderedHeight);
  }

  private renderScene() {
    this.renderRequested = false;
    if (this.disposed || !this.renderedWidth || !this.renderedHeight) return;
    this.runPendingReset();
    const three = this.three;
    this.device.begin(this.renderedWidth, this.renderedHeight);
    this.camera.position.toArray(this.cameraPositionArray);
    this.camera.getWorldDirection(this.cameraDirection).toArray(this.cameraDirectionArray);
    three.autoClear = true;
    if (this.background) three.setClearColor(this.background, 1);
    if (this.infiniteGrid) three.render(this.gridScene, this.camera);
    else three.clear();
    three.setClearColor(0x000000, 0);
    three.autoClear = false;
    const program = this.shaderRenderable ? this.program : undefined;
    if (program) {
      if (this.transparent) three.render(this.overlayScene, this.camera);
      this.drawParts(program, false);
      if (this.normalsVisible && this.overlays?.normals) this.drawNormals();
      this.restoreThree();
      if (!this.transparent) three.render(this.overlayScene, this.camera);
      three.render(this.gizmoScene, this.camera);
      const insetAspect = this.insetAspect();
      if (insetAspect !== undefined) this.renderInsetView(program, insetAspect);
    }
    this.viewHelper?.render(three);
    three.autoClear = true;
    this.device.present(this.context);
  }

  private drawNormals() {
    const varyings = typeof this.overlays?.normals === 'object' ? this.overlays.normals : undefined;
    this.normals ??= new NormalsOverlay(this.gl);
    projectScreen.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    const parts = this.parts.map(part => ({ source: part.geometry.source, matrixWorld: part.node.matrixWorld }));
    this.normals.draw(this.vertexShader, varyings, parts, this.prepareNormalsCapture, projectScreen);
  }

  private prepareNormalsCapture = (program: Program, index: number) => {
    for (const uniform of program.uniforms.values()) {
      if (uniform.unit === undefined && !RENDERER_UNIFORMS.has(uniform.name)) program.set(uniform.name, this.uniformValues[uniform.name]);
    }
    this.setViewUniforms(program, false);
    this.setPartUniforms(program, this.parts[index]);
  };

  private setViewUniforms(program: Program, inset: boolean) {
    const camera = this.camera;
    this.setFrameUniforms(program, this.shaderTime);
    program.set('cameraFov', this.horizontalFov * Math.PI / 180);
    program.set('cameraPosition', this.cameraPositionArray);
    program.set('cameraDirection', this.cameraDirectionArray);
    program.set('viewMatrix', camera.matrixWorldInverse.elements);
    program.set('projectionMatrix', camera.projectionMatrix.elements);
    program.set('uInsetView', inset);
    this.simulation?.textures.forEach((texture, slot) => program.setTexture(bufferSampler(slot), texture));
  }

  private setPartUniforms(program: Program, part: Part) {
    const world = part.node.matrixWorld;
    modelView.multiplyMatrices(this.camera.matrixWorldInverse, world);
    normalMatrix.getNormalMatrix(modelView);
    program.set('modelMatrix', world.elements);
    program.set('modelViewMatrix', modelView.elements);
    program.set('normalMatrix', normalMatrix.elements);
    program.set('uObjectIndex', part.objectIndex);
    program.set('uWireframe', part.wireframe);
    program.set('uWireframeLineWidth', part.lineWidth);
  }

  private drawParts(program: Program, inset: boolean, pick = false) {
    const gl = this.gl;
    const camera = this.camera;
    camera.updateMatrixWorld();
    this.objectRoot.updateMatrixWorld(true);
    const transparent = this.transparent && !pick;
    projectScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const order = this.parts.map((part, index) => ({ part, index, depth: clipPosition.setFromMatrixPosition(part.node.matrixWorld).applyMatrix4(projectScreen).z }));
    order.sort((a, b) => (transparent ? b.depth - a.depth : a.depth - b.depth) || a.index - b.index);

    this.setViewUniforms(program, inset);

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
      this.setPartUniforms(program, part);
      program.bind();
      const mirrored = part.node.matrixWorld.determinant() < 0;
      if (transparent) {
        gl.enable(gl.CULL_FACE);
        gl.frontFace(mirrored ? gl.CCW : gl.CW);
        part.geometry.draw(program);
        gl.frontFace(mirrored ? gl.CW : gl.CCW);
        part.geometry.draw(program);
      } else {
        gl.disable(gl.CULL_FACE);
        gl.frontFace(mirrored ? gl.CW : gl.CCW);
        part.geometry.draw(program);
      }
    }
  }

  private insetAspect() {
    if (!this.overlays?.insetView) return undefined;
    const aspect = this.uniformValues[INSET_VIEW_ASPECT_UNIFORM];
    if (typeof aspect === 'number' && aspect > 0) return aspect;
    return this.renderedHeight > 0 ? this.renderedWidth / this.renderedHeight : undefined;
  }

  private insetSize(aspect: number) {
    const boxWidth = this.renderedWidth * this.insetScale;
    const boxHeight = this.renderedHeight * this.insetScale;
    return new THREE.Vector2(Math.round(Math.min(boxWidth, boxHeight * aspect)), Math.round(Math.min(boxHeight, boxWidth / aspect)));
  }

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
    this.drawParts(program, true);
    this.restoreThree();
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
    if (!this.looping) this.clock.getDelta();
    this.looping = true;
    this.animationFrame = requestAnimationFrame(this.frame);
  }

  private frame = () => {
    this.animationFrame = 0;
    const delta = this.clock.getDelta();
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
    this.normals?.dispose();
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
