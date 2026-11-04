import { browser } from '$app/environment';
import { Renderer, type RendererEvents, type RendererTaskState, type TransformMode } from '$lib/renderer/Renderer';
import type { CameraLink } from '$lib/renderer/CameraLink';
import type { CameraPose } from '../types';

export type TransformSpace = 'local' | 'world';

export class ViewportSlot {
  loading = $state(true);
  revealed = $state(false);
  unavailable = $state(false);
  timePaused = $state(false);
  normalsVisible = $state(false);
  transformMode = $state<TransformMode>('translate');
  transformSpace = $state<TransformSpace>('local');

  private instance?: Renderer;
  private parent?: HTMLElement;
  private loadToken = 0;

  get renderer(): Renderer | undefined {
    if (this.instance || this.unavailable || !browser) return this.instance;
    try {
      this.instance = new Renderer();
      if (this.parent) this.instance.attach(this.parent);
    } catch (error) {
      console.error('Viewport could not be created:', error);
      this.unavailable = true;
      this.loading = false;
    }
    return this.instance;
  }

  attach(parent: HTMLElement) {
    this.parent = parent;
    this.renderer?.attach(parent);
  }

  detach(parent: HTMLElement) {
    if (this.parent === parent) this.parent = undefined;
    this.instance?.detach(parent);
  }

  load(state: RendererTaskState, camera: { pose: CameraPose; saved: boolean }, events: RendererEvents, link: CameraLink | undefined, fresh = true) {
    if (fresh && this.instance) {
      this.instance.dispose();
      this.instance = undefined;
    }
    const renderer = this.renderer;
    if (!renderer) return;
    const token = ++this.loadToken;
    this.loading = true;
    if (fresh) {
      this.revealed = false;
      this.timePaused = false;
      this.normalsVisible = false;
      this.transformMode = state.overlays?.transformControls?.mode ?? 'translate';
      this.transformSpace = 'local';
      renderer.setTimePaused(false);
      renderer.setNormalsVisible(false);
      renderer.setTransformMode(this.transformMode);
      renderer.setTransformSpace(this.transformSpace);
    }
    renderer.events = events;
    renderer.setCameraLink(link);
    renderer.setCameraPose(camera.pose, camera.saved);
    void renderer.replaceTaskState(state).catch(error => {
      console.error('Scene could not be loaded:', error);
    }).finally(() => {
      if (token !== this.loadToken) return;
      this.loading = false;
      this.revealed = true;
    });
  }

  release() {
    this.loadToken++;
    if (!this.instance) return;
    this.instance.events = {};
    this.instance.setCameraLink(undefined);
  }

  toggleTime() {
    this.timePaused = !this.timePaused;
    this.instance?.setTimePaused(this.timePaused);
  }

  toggleNormals() {
    this.normalsVisible = !this.normalsVisible;
    this.instance?.setNormalsVisible(this.normalsVisible);
  }

  setTransformMode(mode: TransformMode, select = false) {
    this.transformMode = mode;
    this.instance?.setTransformMode(mode);
    if (select) this.instance?.selectObject();
  }

  setTransformSpace(space: TransformSpace) {
    this.transformSpace = space;
    this.instance?.setTransformSpace(space);
  }
}
