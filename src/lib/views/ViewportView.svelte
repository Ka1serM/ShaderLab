<script lang="ts">
  import { onMount } from 'svelte';
  import MaximizeButton from '$lib/components/MaximizeButton.svelte';
  import LoadingOverlay from '$lib/components/LoadingOverlay.svelte';
  import SegmentedControl from '$lib/components/SegmentedControl.svelte';
  import { maximizable } from '$lib/actions/maximizable';
  import { useApplication } from '$lib/app/application.svelte';
  import type { PanelId } from '$lib/app/controllers/layout.svelte';
  import type { ViewportSlot } from '$lib/app/controllers/viewport.svelte';
  import type { SimulationController } from '$lib/app/controllers/simulation.svelte';
  import type { Scene, SceneDefinition, TransformMode } from '$lib/renderer/Renderer';
  import Play from 'phosphor-svelte/lib/PlayIcon';
  import Pause from 'phosphor-svelte/lib/PauseIcon';
  import SkipForward from 'phosphor-svelte/lib/SkipForwardIcon';
  import ArrowCounterClockwise from 'phosphor-svelte/lib/ArrowCounterClockwiseIcon';

  let { viewport: slot, title, panelId, scenes, sceneIndex, onSelectScene, transformControls = false, showTimeControl = false, simulation }: {
    viewport: ViewportSlot;
    title: string;
    panelId: PanelId;
    scenes: Array<Scene | SceneDefinition>;
    sceneIndex: number;
    onSelectScene: (index: number) => void;
    transformControls?: boolean;
    showTimeControl?: boolean;
    /** Controls for a compute stage. They drive every viewport of the page together. */
    simulation?: SimulationController;
  } = $props();

  const headerButton = 'motion-press h-7 min-w-7 px-1 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground shrink-0';

  const layout = useApplication().layout;
  const transformModes: TransformMode[] = ['translate', 'rotate', 'scale'];
  const transformModeLabels = { translate: 'Translate', rotate: 'Rotate', scale: 'Scale' } as const;
  // Keys as in common 3D editors.
  const transformModeKeys: Record<string, TransformMode> = { w: 'translate', e: 'rotate', r: 'scale' };
  const transformSpaces = ['local', 'world'] as const;

  function sceneLabel(scene: Scene | SceneDefinition, index: number) {
    return 'label' in scene ? scene.label : `Scene ${index + 1}`;
  }

  function host(node: HTMLElement) {
    slot.attach(node);
    return { destroy: () => slot.detach(node) };
  }

  onMount(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (!transformControls || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      // Typing in the shader editor or a field must not switch the gizmo.
      // Monaco types into a role="textbox" element, not into a textarea.
      if (target?.isContentEditable || target?.closest('input, textarea, select, [role="textbox"]')) return;
      const mode = transformModeKeys[event.key.toLowerCase()];
      if (!mode) return;
      event.preventDefault();
      slot.setTransformMode(mode);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  });
</script>

<div use:maximizable={{ active: layout.maximized === panelId }} class="workspace-panel">
  <div class="app-viewport h-full flex flex-col overflow-hidden" data-tutorial={panelId}>
    <div class="viewport-panel-header app-panel-header flex items-center justify-between shrink-0">
      <h3 class="app-panel-title text-xl font-medium text-foreground">{title}</h3>
      <div class="flex items-center gap-1">
        {#if simulation}
          <button class={headerButton} title={simulation.running ? 'Pause simulation' : 'Run simulation'} aria-label={simulation.running ? 'Pause simulation' : 'Run simulation'} aria-pressed={!simulation.running} onclick={() => simulation.toggle()}>
            {#if simulation.running}<Pause class="h-4 w-4" />{:else}<Play class="h-4 w-4" />{/if}
          </button>
          <button class={headerButton} title="Advance one frame" aria-label="Advance one frame" onclick={() => simulation.step()}><SkipForward class="h-4 w-4" /></button>
          <button class={headerButton} title="Restart from init()" aria-label="Restart simulation" onclick={() => simulation.reset()}><ArrowCounterClockwise class="h-4 w-4" /></button>
          <button class="{headerButton} text-xs tabular-nums" title="Simulation speed" aria-label="Simulation speed {simulation.speed}×" onclick={() => simulation.nextSpeed()}>{simulation.speed}×</button>
        {/if}
        {#if showTimeControl}
          <button
            class="motion-press h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground shrink-0"
            title={slot.timePaused ? 'Resume animation' : 'Pause animation'}
            aria-label={slot.timePaused ? 'Resume animation' : 'Pause animation'}
            aria-pressed={slot.timePaused}
            onclick={() => slot.toggleTime()}
          >
            {#if slot.timePaused}<Play class="h-4 w-4" />{:else}<Pause class="h-4 w-4" />{/if}
          </button>
        {/if}
        <MaximizeButton isMaximized={layout.maximized === panelId} onClick={() => layout.toggleMaximized(panelId)} />
      </div>
    </div>
    <div class="viewport-overlay-controls relative flex min-h-0 flex-1 items-start gap-2 p-3">
      <div use:host class="absolute inset-0 h-full w-full overflow-hidden rounded-md transition-opacity duration-300" class:opacity-0={!slot.revealed} style="background: var(--viewport-background);"></div>
      {#if slot.loading && !slot.unavailable}<LoadingOverlay label="Loading scene" />{/if}
      {#if slot.unavailable}<p class="absolute inset-0 z-10 flex items-center justify-center p-6 text-center text-sm text-muted-foreground" role="alert">WebGL is unavailable, so this viewport cannot render.</p>{/if}
      {#if scenes.length > 1}
        <SegmentedControl
          class="transform-mode-toggle absolute right-3 top-3 z-10 flex-none"
          value={String(sceneIndex)}
          options={scenes.map((scene, index) => ({ value: String(index), label: sceneLabel(scene, index) }))}
          onChange={value => onSelectScene(Number(value))}
        />
      {/if}
      {#if transformControls}
        <SegmentedControl
          class="relative z-10 flex-none"
          value={slot.transformMode}
          options={transformModes.map(mode => ({ value: mode, label: transformModeLabels[mode] }))}
          onChange={mode => slot.setTransformMode(mode, true)}
        />
        <SegmentedControl
          class="transform-space-toggle relative z-10 flex-none"
          value={slot.transformSpace}
          options={transformSpaces.map(space => ({ value: space, label: space === 'local' ? 'Local' : 'World' }))}
          onChange={space => slot.setTransformSpace(space)}
        />
      {/if}
    </div>
  </div>
</div>
