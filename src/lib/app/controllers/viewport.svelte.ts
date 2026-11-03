import { browser } from '$app/environment';
import { Renderer, type RendererEvents, type RendererTaskState, type TransformMode } from '$lib/renderer/Renderer';
import type { CameraLink } from '$lib/renderer/CameraLink';
import type { CameraPose } from '../types';

export type TransformSpace = 'local' | 'world';

/**
 * One viewport of the workspace. The slot exists for the whole session; pages
 * load content into it and views place it in their layout.
 * Everything a view shows about the viewport lives in the `$state` fields.
 *
 * Each fresh load gets a new renderer, so no state a previous page or task set
 * (helpers, gizmo, uniforms, selection, ...) can leak into the next one. That is
 * cheap: all renderers draw on one shared WebGL context.
 */
export class ViewportSlot {
  /** True from the start of a load until its scene is complete. */
  loading = $state(true);
  /** The canvas fades in once the first scene is complete, so objects never pop in one by one. */
  revealed = $state(false);
  unavailable = $state(false);
  timePaused = $state(false);
  transformMode = $state<TransformMode>('translate');
  transformSpace = $state<TransformSpace>('local');

  private instance?: Renderer;
  /** Where the view placed the viewport. A replaced renderer takes the old one's place. */
  private parent?: HTMLElement;
  private loadToken = 0;

  /** The renderer, created on first use. Undefined where WebGL is unavailable. */
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

  /**
   * Replaces everything the viewport shows. The view state starts over, and a
   * load that a newer one overtook never ends the newer one's loading state.
   * A `fresh` load is new content: it starts on a new renderer and fades in
   * like a newly opened page. Other loads reuse the renderer, and the caller
   * passes the complete state again.
   */
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
      this.transformMode = state.overlays?.transformControls?.mode ?? 'translate';
      this.transformSpace = 'local';
      renderer.setTimePaused(false);
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

  /** Stops reporting to the page that loaded it. The content stays until the next load. */
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
