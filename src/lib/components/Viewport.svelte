<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { assembleStudentShader, taskStore, type Task, type GLSLError, type CameraPose } from '$lib/stores/taskStore';
  import { Renderer, type Scene, type SceneDefinition, type ViewportOverlays, type ViewportTransform, type ViewportVector } from '$lib/renderer/Renderer';
  import type { ShaderReadbackRequest, ShaderReadbackValue } from '$lib/renderer/shaderReadback';
  import { rewriteRowMajorMatrixLiterals } from '$lib/utils/glslMatrixLiterals';
  import MaximizeButton from './MaximizeButton.svelte';
  import Play from 'phosphor-svelte/lib/PlayIcon';
  import Pause from 'phosphor-svelte/lib/PauseIcon';
  import { maximizedPanel } from '$lib/stores/panelStore';
  import { maximizable } from '$lib/actions/maximizable';
  import * as ToggleGroup from '$lib/components/ui/toggle-group';

  export let task: Task;
  export let vertexShader: string;
  export let fragmentShader: string;
  export let cameraPose: CameraPose;
  export let cameraPoseSaved = false;
  export let reportErrors = false;
  export let errorLineOffsets: { vertex: number; fragment: number } | undefined = undefined;
  export let onShaderErrors: ((errors: { vertex: GLSLError[]; fragment: GLSLError[] }) => void) | undefined = undefined;
  export let shaderReadbacks: ShaderReadbackRequest[] = [];
  export let onShaderReadbacks: (values: Record<string, ShaderReadbackValue>) => void = () => {};
  export let uniformValues: Record<string, number | number[] | boolean> = {};
  export let scene: Scene | undefined = undefined;
  export let scenes: SceneDefinition[] = [];
  export let useStudentTemplates = false;
  export let overlays: ViewportOverlays | undefined = undefined;
  export let transformMatrix: number[] | undefined = undefined;
  export let vectorVisualizations: ViewportVector[] = [];
  export let onTransformChange: (transform: ViewportTransform) => void = () => {};
  export let onCameraChange: ((pose: CameraPose) => void) | undefined = undefined;
  export let title = '';
  export let panelId = '';
  export let showTimeControl = false;

  let transformMode: 'translate' | 'rotate' | 'scale' = 'translate';
  let transformSpace: 'local' | 'world' = 'local';
  let selectedSceneId = '';
  let timePaused = false;
  const transformModes = ['translate', 'rotate', 'scale'] as const;
  const transformSpaces = ['local', 'world'] as const;
  const transformModeLabels = {
    translate: 'Verschieben',
    rotate: 'Rotieren',
    scale: 'Skalieren'
  } as const;

  let container: HTMLDivElement;
  let viewport: Renderer;
  let mounted = false;
  let previousTaskKey = '';
  let previousSceneId = '';
  let previousVertexShader = '';
  let previousFragmentShader = '';
  let shaderUpdateTimer: ReturnType<typeof setTimeout> | undefined;

  // Applied to every shader that reaches the GPU (reference and student alike), so mat4/mat3
  // literals can be authored in ordinary row-major reading order everywhere in this course.
  function compiledVertexShader() {
    const assembled = useStudentTemplates ? assembleStudentShader(vertexShader, task.starterVertexShaderTemplate) : vertexShader;
    return rewriteRowMajorMatrixLiterals(assembled);
  }

  function compiledFragmentShader() {
    const assembled = useStudentTemplates ? assembleStudentShader(fragmentShader, task.starterFragmentShaderTemplate) : fragmentShader;
    return rewriteRowMajorMatrixLiterals(assembled);
  }

  function shaderLineOffsets() {
    if (errorLineOffsets) return errorLineOffsets;
    const lineOffset = (prefix?: string) => prefix ? prefix.split('\n').length : 0;
    return {
      vertex: useStudentTemplates ? lineOffset(task.starterVertexShaderTemplate?.prefix) : 0,
      fragment: useStudentTemplates ? lineOffset(task.starterFragmentShaderTemplate?.prefix) : 0
    };
  }

  function taskScene(value: Task): Scene {
    if (value.scene) return value.scene;
    if (value.type !== '3D' || !value.modelPath) {
      return { objects: [{ source: 'models/Canvas.glb' }] };
    }
    return { objects: [{
      source: value.modelPath,
      instanceCount: value.instanceCount
    }] };
  }

  function resolvedScene(value: Task) {
    return scenes.find(candidate => candidate.id === selectedSceneId) ?? scene ?? taskScene(value);
  }

  function currentTaskKey(value: Task) {
    return JSON.stringify({
      title: value.title,
      scene: resolvedScene(value),
      inputs: value.inputs ?? [],
      overlays: overlays ?? {}
    });
  }

  function reportShaderErrors(errors: { vertex: GLSLError[]; fragment: GLSLError[] }) {
    if (reportErrors && !onShaderErrors) taskStore.setShaderErrors(errors);
    onShaderErrors?.(errors);
  }

  function clearShaderErrors() {
    const empty = { vertex: [], fragment: [] };
    if (reportErrors && !onShaderErrors) taskStore.clearShaderErrors();
    else onShaderErrors?.(empty);
  }

  function toggleTime() {
    timePaused = !timePaused;
    viewport?.setTimePaused(timePaused);
  }

  $: if (scenes.length && !scenes.some(candidate => candidate.id === selectedSceneId)) {
    selectedSceneId = scenes[0].id;
  }

  function scheduleShaderUpdate() {
    clearTimeout(shaderUpdateTimer);
    shaderUpdateTimer = setTimeout(() => {
      if (!viewport) return;
      viewport.updateShaders(compiledVertexShader(), compiledFragmentShader());
    }, 120);
  }

  function replaceTaskState() {
    clearTimeout(shaderUpdateTimer);
    void viewport.replaceTaskState({
      inputs: task.inputs,
      uniformValues,
      overlays,
      shaderLineOffsets: shaderLineOffsets(),
      vertexShader: compiledVertexShader(),
      fragmentShader: compiledFragmentShader(),
      scene: resolvedScene(task)
    });
  }

  onMount(() => {
    viewport = new Renderer({
      container, vertexShader: compiledVertexShader(), fragmentShader: compiledFragmentShader(), inputs: task.inputs, uniformValues, cameraPose, cameraPoseSaved,
      overlays,
      onTransformChange,
      shaderLineOffsets: shaderLineOffsets(),
      reportErrors,
      onCameraChange: pose => (onCameraChange ?? taskStore.setCameraPose)(pose),
      onShaderErrors: reportShaderErrors,
      shaderReadbacks,
      onShaderReadbacks
    });
    // Apply every prop explicitly on mount. Teaching initializes its shader
    // controls in the same update that mounts the viewport, so relying on a
    // later reactive run can leave its material in an incomplete state until
    // an unrelated camera-store update occurs.
    viewport.setUniformValues(uniformValues);
    viewport.setCameraPose(cameraPose, cameraPoseSaved);
    viewport.setTransformOverlayMatrix(transformMatrix);
    viewport.setVectorVisualizations(vectorVisualizations);
    viewport.setShaderReadbacks(shaderReadbacks);
    mounted = true;
    previousTaskKey = currentTaskKey(task);
    previousSceneId = selectedSceneId;
    previousVertexShader = vertexShader;
    previousFragmentShader = fragmentShader;
    replaceTaskState();
  });

  $: if (mounted && viewport) {
    viewport.setUniformValues(uniformValues);
    viewport.setCameraPose(cameraPose, cameraPoseSaved);
    viewport.setTransformOverlayMatrix(transformMatrix);
    viewport.setVectorVisualizations(vectorVisualizations);
    viewport.setShaderReadbacks(shaderReadbacks);
  }

  $: if (mounted && viewport && task && (currentTaskKey(task) !== previousTaskKey || selectedSceneId !== previousSceneId)) {
    previousTaskKey = currentTaskKey(task);
    previousSceneId = selectedSceneId;
    previousVertexShader = vertexShader;
    previousFragmentShader = fragmentShader;
    replaceTaskState();
  } else if (mounted && viewport && (vertexShader !== previousVertexShader || fragmentShader !== previousFragmentShader)) {
    clearShaderErrors();
    scheduleShaderUpdate();
    previousVertexShader = vertexShader;
    previousFragmentShader = fragmentShader;
  }

  onDestroy(() => {
    clearTimeout(shaderUpdateTimer);
    viewport?.dispose();
  });
</script>

<div use:maximizable={{ active: $maximizedPanel === panelId }} class="workspace-panel">
  <div class="app-viewport h-full flex flex-col overflow-hidden" data-tutorial={panelId || 'viewport'}>
    {#if title}
      <div class="viewport-panel-header app-panel-header flex items-center justify-between shrink-0">
        <h3 class="app-panel-title text-xl font-medium text-foreground">{title}</h3>
        {#if panelId}
          <div class="flex items-center gap-1">
            {#if showTimeControl}
              <button
                class="motion-press h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground shrink-0"
                title={timePaused ? 'Resume animation' : 'Pause animation'}
                aria-label={timePaused ? 'Resume animation' : 'Pause animation'}
                aria-pressed={timePaused}
                onclick={toggleTime}
              >
                {#if timePaused}<Play class="h-4 w-4" />{:else}<Pause class="h-4 w-4" />{/if}
              </button>
            {/if}
            <MaximizeButton isMaximized={$maximizedPanel === panelId} onClick={() => $maximizedPanel = $maximizedPanel === panelId ? null : panelId} />
          </div>
        {/if}
      </div>
    {/if}
    <div class="viewport-overlay-controls relative flex min-h-0 flex-1 items-start gap-2 p-3">
      <div bind:this={container} class="absolute inset-0 h-full w-full overflow-hidden rounded-md" style="background: var(--viewport-background);"></div>
      {#if scenes.length > 1}
        <ToggleGroup.Root
          type="single"
          bind:value={selectedSceneId}
          class="relative z-10 flex-none gap-0 bg-muted p-0"
        >
          {#each scenes as definedScene}
            <ToggleGroup.Item
              value={definedScene.id}
              class="h-10 px-4 data-[state=on]:bg-background"
            >{definedScene.label}</ToggleGroup.Item>
          {/each}
        </ToggleGroup.Root>
      {/if}
      {#if overlays?.transformControls}
        <ToggleGroup.Root
          type="single"
          bind:value={transformMode}
          class="relative z-10 flex-none gap-0 bg-muted p-0"
          onValueChange={mode => viewport?.setTransformMode(mode as typeof transformMode)}
        >
          {#each transformModes as mode}
            <ToggleGroup.Item
              value={mode}
              class="h-10 px-4 data-[state=on]:bg-background"
            >{transformModeLabels[mode]}</ToggleGroup.Item>
          {/each}
        </ToggleGroup.Root>
        <span class="transform-controls-line-break" aria-hidden="true"></span>
        <ToggleGroup.Root
          type="single"
          bind:value={transformSpace}
          class="transform-space-toggle relative z-10 flex-none gap-0 bg-muted p-0"
          onValueChange={space => viewport?.setTransformSpace(space as typeof transformSpace)}
        >
          {#each transformSpaces as space}
            <ToggleGroup.Item
              value={space}
              class="h-10 px-4 data-[state=on]:bg-background"
            >{space === 'local' ? 'Lokal' : 'Global'}</ToggleGroup.Item>
          {/each}
        </ToggleGroup.Root>
      {/if}
    </div>
  </div>
</div>
