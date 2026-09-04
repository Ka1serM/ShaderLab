<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Renderer, type Scene, type SceneDefinition, type ViewportCameraPose, type ViewportOverlays, type ViewportShaderError, type ViewportTransform, type ViewportVector } from '$lib/renderer/Renderer';
  import type { ShaderInput } from '$lib/renderer/ShaderTaskMaterial';
  import type { ShaderReadbackRequest, ShaderReadbackValue } from '$lib/renderer/shaderReadback';
  import { rewriteRowMajorMatrixLiterals } from '$lib/utils/glslMatrixLiterals';
  import MaximizeButton from './MaximizeButton.svelte';
  import Play from 'phosphor-svelte/lib/PlayIcon';
  import Pause from 'phosphor-svelte/lib/PauseIcon';
  import { maximizedPanel } from '$lib/stores/panelStore';
  import { maximizable } from '$lib/actions/maximizable';
  import * as ToggleGroup from '$lib/components/ui/toggle-group';

  export let vertexShader: string;
  export let fragmentShader: string;
  export let cameraPose: ViewportCameraPose;
  export let cameraPoseSaved = false;
  export let reportErrors = false;
  export let errorLineOffsets: { vertex: number; fragment: number } | undefined = undefined;
  export let onShaderErrors: ((errors: { vertex: ViewportShaderError[]; fragment: ViewportShaderError[] }) => void) | undefined = undefined;
  export let shaderReadbacks: ShaderReadbackRequest[] = [];
  export let onShaderReadbacks: (values: Record<string, ShaderReadbackValue>) => void = () => {};
  export let uniformValues: Record<string, number | number[] | boolean> = {};
  /** The first scene is rendered initially; `label` enables the optional switcher. */
  export let inputs: ShaderInput[] = [];
  export let scenes: Array<Scene | SceneDefinition>;
  export let shaderTemplates: { vertex?: { prefix: string; suffix: string }; fragment?: { prefix: string; suffix: string } } = {};
  export let useShaderTemplates = false;
  export let overlays: ViewportOverlays | undefined = undefined;
  export let transformMatrix: number[] | undefined = undefined;
  export let vectorVisualizations: ViewportVector[] = [];
  export let onTransformChange: (transform: ViewportTransform) => void = () => {};
  export let onCameraChange: ((pose: ViewportCameraPose) => void) | undefined = undefined;
  export let title = '';
  export let panelId = '';
  export let showTimeControl = false;

  let transformMode: 'translate' | 'rotate' | 'scale' = 'translate';
  let transformSpace: 'local' | 'world' = 'local';
  let selectedSceneIndex = 0;
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
  let previousRenderKey = '';
  let previousSceneIndex = 0;
  let previousVertexShader = '';
  let previousFragmentShader = '';
  let shaderUpdateTimer: ReturnType<typeof setTimeout> | undefined;

  // Applied to every shader that reaches the GPU (reference and student alike), so mat4/mat3
  // literals can be authored in ordinary row-major reading order everywhere in this course.
  function compiledVertexShader() {
    const assembled = useShaderTemplates ? assembleShader(vertexShader, shaderTemplates.vertex) : vertexShader;
    return rewriteRowMajorMatrixLiterals(assembled);
  }

  function compiledFragmentShader() {
    const assembled = useShaderTemplates ? assembleShader(fragmentShader, shaderTemplates.fragment) : fragmentShader;
    return rewriteRowMajorMatrixLiterals(assembled);
  }

  function shaderLineOffsets() {
    if (errorLineOffsets) return errorLineOffsets;
    const lineOffset = (prefix?: string) => prefix ? prefix.split('\n').length : 0;
    return {
      vertex: useShaderTemplates ? lineOffset(shaderTemplates.vertex?.prefix) : 0,
      fragment: useShaderTemplates ? lineOffset(shaderTemplates.fragment?.prefix) : 0
    };
  }

  function assembleShader(source: string, template?: { prefix: string; suffix: string }) {
    if (!template) return source;
    return [template.prefix, source, template.suffix].filter(Boolean).join('\n');
  }

  function resolvedScene() {
    return scenes[selectedSceneIndex]!;
  }

  function sceneLabel(value: Scene | SceneDefinition, index: number) {
    return 'label' in value ? value.label : `Scene ${index + 1}`;
  }

  function currentRenderKey() {
    return JSON.stringify({
      scene: resolvedScene(),
      inputs,
      overlays: overlays ?? {}
    });
  }

  function reportShaderErrors(errors: { vertex: ViewportShaderError[]; fragment: ViewportShaderError[] }) {
    if (reportErrors) onShaderErrors?.(errors);
  }

  function clearShaderErrors() {
    const empty = { vertex: [], fragment: [] };
    if (reportErrors) onShaderErrors?.(empty);
  }

  function toggleTime() {
    timePaused = !timePaused;
    viewport?.setTimePaused(timePaused);
  }

  $: if (selectedSceneIndex >= scenes.length) {
    selectedSceneIndex = 0;
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
      inputs,
      uniformValues,
      overlays,
      shaderLineOffsets: shaderLineOffsets(),
      vertexShader: compiledVertexShader(),
      fragmentShader: compiledFragmentShader(),
      scene: resolvedScene()
    });
  }

  onMount(() => {
    viewport = new Renderer({
      container, vertexShader: compiledVertexShader(), fragmentShader: compiledFragmentShader(), inputs, uniformValues, cameraPose, cameraPoseSaved,
      overlays,
      onTransformChange,
      shaderLineOffsets: shaderLineOffsets(),
      reportErrors,
      onCameraChange,
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
    previousRenderKey = currentRenderKey();
    previousSceneIndex = selectedSceneIndex;
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

  $: if (mounted && viewport && (currentRenderKey() !== previousRenderKey || selectedSceneIndex !== previousSceneIndex)) {
    previousRenderKey = currentRenderKey();
    previousSceneIndex = selectedSceneIndex;
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
          value={String(selectedSceneIndex)}
          class="relative z-10 flex-none gap-0 bg-muted p-0"
          onValueChange={value => selectedSceneIndex = Number(value)}
        >
          {#each scenes as definedScene, index}
            <ToggleGroup.Item
              value={String(index)}
              class="h-10 border-none px-4 transition-colors hover:bg-muted/50 data-[state=on]:rounded-md data-[state=on]:bg-background data-[state=on]:shadow-sm dark:data-[state=on]:bg-input/30"
            >{sceneLabel(definedScene, index)}</ToggleGroup.Item>
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
              class="h-10 border-none px-4 transition-colors hover:bg-muted/50 data-[state=on]:rounded-md data-[state=on]:bg-background data-[state=on]:shadow-sm dark:data-[state=on]:bg-input/30"
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
              class="h-10 border-none px-4 transition-colors hover:bg-muted/50 data-[state=on]:rounded-md data-[state=on]:bg-background data-[state=on]:shadow-sm dark:data-[state=on]:bg-input/30"
            >{space === 'local' ? 'Lokal' : 'Global'}</ToggleGroup.Item>
          {/each}
        </ToggleGroup.Root>
      {/if}
    </div>
  </div>
</div>
