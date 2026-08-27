<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { assembleStudentShader, taskStore, type Task, type GLSLError, type CameraPose } from '$lib/stores/taskStore';
  import { Renderer, type Scene, type ViewportOverlays, type ViewportTransform } from '$lib/renderer/Renderer';
  import { rewriteRowMajorMatrixLiterals } from '$lib/utils/glslMatrixLiterals';
  import MaximizeButton from './MaximizeButton.svelte';
  import { maximizedPanel } from '$lib/stores/panelStore';
  import * as Tabs from '$lib/components/ui/tabs';

  export let task: Task;
  export let vertexShader: string;
  export let fragmentShader: string;
  export let cameraPose: CameraPose;
  export let reportErrors = false;
  export let errorLineOffsets: { vertex: number; fragment: number } | undefined = undefined;
  export let onShaderErrors: ((errors: { vertex: GLSLError[]; fragment: GLSLError[] }) => void) | undefined = undefined;
  export let uniformValues: Record<string, number | number[] | boolean> = {};
  export let scene: Scene | undefined = undefined;
  export let useStudentTemplates = false;
  export let overlays: ViewportOverlays | undefined = undefined;
  export let transformMatrix: number[] | undefined = undefined;
  export let onTransformChange: (transform: ViewportTransform) => void = () => {};
  export let title = '';
  export let panelId = '';

  let transformMode: 'translate' | 'rotate' | 'scale' = 'translate';

  let container: HTMLDivElement;
  let viewport: Renderer;
  let mounted = false;
  let previousTaskKey = '';
  let previousVertexShader = '';
  let previousFragmentShader = '';

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
      return { objects: [{ id: 'canvas', source: { type: 'primitive', geometry: 'plane' } }] };
    }
    return { objects: [{
      id: 'task-model',
      source: { type: 'model', path: value.modelPath },
      instances: value.instanceCount && value.instanceCount > 1 ? { count: value.instanceCount } : undefined
    }] };
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

  onMount(() => {
    viewport = new Renderer({
      container, vertexShader: compiledVertexShader(), fragmentShader: compiledFragmentShader(), inputs: task.inputs, uniformValues, cameraPose,
      overlays,
      onTransformChange,
      shaderLineOffsets: shaderLineOffsets(),
      reportErrors, onCameraChange: pose => taskStore.setCameraPose(pose), onShaderErrors: reportShaderErrors
    });
    // Apply every prop explicitly on mount. Teaching initializes its shader
    // controls in the same update that mounts the viewport, so relying on a
    // later reactive run can leave its material in an incomplete state until
    // an unrelated camera-store update occurs.
    viewport.setUniformValues(uniformValues);
    viewport.setCameraPose(cameraPose);
    viewport.setOverlays(overlays);
    viewport.setTransformOverlayMatrix(transformMatrix);
    mounted = true;
    previousTaskKey = task.title;
    previousVertexShader = vertexShader;
    previousFragmentShader = fragmentShader;
    void viewport.setScene(scene ?? taskScene(task));
  });

  $: if (mounted && viewport) {
    viewport.setUniformValues(uniformValues);
    viewport.setCameraPose(cameraPose);
    viewport.setOverlays(overlays);
    viewport.setTransformOverlayMatrix(transformMatrix);
    viewport.setShaderLineOffsets(shaderLineOffsets());
  }

  $: if (mounted && viewport && task && task.title !== previousTaskKey) {
    previousTaskKey = task.title;
    previousVertexShader = vertexShader;
    previousFragmentShader = fragmentShader;
    viewport.setInputs(task.inputs);
    viewport.setShaderLineOffsets(shaderLineOffsets());
    void viewport.setScene(scene ?? taskScene(task));
    viewport.updateShaders(compiledVertexShader(), compiledFragmentShader());
  } else if (mounted && viewport && (vertexShader !== previousVertexShader || fragmentShader !== previousFragmentShader)) {
    clearShaderErrors();
    viewport.updateShaders(compiledVertexShader(), compiledFragmentShader());
    previousVertexShader = vertexShader;
    previousFragmentShader = fragmentShader;
  }

  onDestroy(() => viewport?.dispose());
</script>

<div class="app-viewport h-full flex flex-col overflow-hidden" data-tutorial={panelId || 'viewport'}>
  {#if title}
    <div class="app-panel-header flex items-center justify-between shrink-0">
      <h3 class="app-panel-title text-xl font-medium text-foreground">{title}</h3>
      {#if panelId}
        <MaximizeButton isMaximized={$maximizedPanel === panelId} onClick={() => $maximizedPanel = $maximizedPanel === panelId ? null : panelId} />
      {/if}
    </div>
  {/if}
  <div class="relative flex-1 min-h-0" class:px-4={!title} class:pb-4={!title}>
    <div bind:this={container} class="absolute inset-0 h-full w-full overflow-hidden rounded-xl bg-background"></div>
    {#if overlays?.transformControls}
      <Tabs.Root
        bind:value={transformMode}
        class="absolute left-3 top-3 z-10 flex-none gap-0"
        onValueChange={mode => viewport?.setTransformMode(mode as typeof transformMode)}
      >
        <Tabs.List class="h-10 justify-start bg-muted p-0 gap-0">
          {#each ['translate', 'rotate', 'scale'] as mode}
            <Tabs.Trigger
              value={mode}
              class="h-10 px-4 border-none capitalize data-[state=active]:bg-background hover:bg-muted/50 transition-colors"
            >{mode}</Tabs.Trigger>
          {/each}
        </Tabs.List>
      </Tabs.Root>
    {/if}
  </div>
</div>
