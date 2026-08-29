<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import tasks from '$lib/data/tasks.json';
  import { teachingStore } from '$lib/stores/teachingStore';
  import { assembleStudentShader, taskStore, type GLSLError, type Task } from '$lib/stores/taskStore';
  import { slugify } from '$lib/utils/slugify';
  import { controlValues, parseShaderControls, type TeachingControl, type TeachingValue } from '$lib/utils/shaderControls';
  import TeachingPanel from '$lib/components/TeachingPanel.svelte';
  import MonacoEditor from '$lib/components/MonacoEditor.svelte';
  import Viewport from '$lib/components/Viewport.svelte';
  import { maximizedPanel } from '$lib/stores/panelStore';
  import { Splitpanes, Pane } from 'svelte-splitpanes';
  import * as THREE from 'three';
  import type { ViewportTransform, ViewportVector } from '$lib/renderer/Renderer';
  import type { PageData } from './$types';
  import { IsMobile } from '$lib/hooks/is-mobile.svelte';
  import AppTutorial from '$lib/components/AppTutorial.svelte';
  import { loadSplitterSizes, saveSplitterSizes, type SplitterSizes } from '$lib/utils/splitPaneStorage';

  const mobileQuery = new IsMobile();
  const defaultSplitterSizes: SplitterSizes = { outer: 35, inner: 60, viewports: 50 };
  type TeachingShaderSource = 'vertex' | 'fragment';

  export let data: PageData;
  let mounted = false;
  let loadedTeachingTitle = '';
  let loadedTaskTitle = '';
  let teachingSource: TeachingShaderSource = 'fragment';
  let editorSources: Partial<Record<TeachingShaderSource, string>> = {};
  let defaultEditorSources: Partial<Record<TeachingShaderSource, string>> = {};
  let displayedValues: Record<string, TeachingValue> = {};
  let readbackValues: Record<string, number[]> = {};
  let readbackValuesKey = '';
  let shaderDiagnostics: { vertex: GLSLError[]; fragment: GLSLError[] } = { vertex: [], fragment: [] };
  let splitterSizes: SplitterSizes = { ...defaultSplitterSizes };
  let loadedSplitterKey = '';

  function splitterStorageKey() {
    return `shaderlab:splitters:teaching:${data.title}`;
  }

  function handleSplitterResize(slot: keyof SplitterSizes, event: CustomEvent<Array<{ size: number }>>) {
    const size = event.detail?.[0]?.size;
    if (!Number.isFinite(size) || size < 0 || size > 100) return;
    splitterSizes = { ...splitterSizes, [slot]: size };
    saveSplitterSizes(splitterStorageKey(), splitterSizes);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && $maximizedPanel) {
      $maximizedPanel = null;
    }
  }

  $: if (mounted && data.title !== loadedTeachingTitle) {
    loadedTeachingTitle = data.title;
    teachingStore.load(data.title);
  }
  $: if (mounted && data.title && data.title !== loadedSplitterKey) {
    loadedSplitterKey = data.title;
    splitterSizes = loadSplitterSizes(splitterStorageKey(), defaultSplitterSizes);
  }
  $: definition = $teachingStore.definition;
  $: task = definition?.task ? (tasks as Task[]).find(item => item.title === definition.task) ?? null : null;
  $: teachingSource = definition?.vertexShader ? 'vertex' : 'fragment';
  $: editorSources = teachingSource === 'vertex' ? { vertex: $teachingStore.code } : { fragment: $teachingStore.code };
  $: defaultEditorSources = teachingSource === 'vertex' ? { vertex: definition?.vertexShader ?? '' } : { fragment: definition?.fragmentShader ?? '' };
  $: scene = definition?.scene;
  // The editor only shows the student portion; the hidden @prefix/@suffix are re-attached for the renderer.
  $: shaderTemplate = teachingSource === 'vertex' ? definition?.vertexShaderTemplate : definition?.fragmentShaderTemplate;
  $: compiledCode = assembleStudentShader($teachingStore.code, shaderTemplate);
  $: errorLineOffsets = {
    vertex: teachingSource === 'vertex' && shaderTemplate?.prefix ? shaderTemplate.prefix.split('\n').length : 0,
    fragment: teachingSource === 'fragment' && shaderTemplate?.prefix ? shaderTemplate.prefix.split('\n').length : 0
  };
  // The matching task is already available from the static task catalogue. Do not
  // source the other shader stage from taskStore here: the store is populated in
  // onMount and can briefly still be empty while the viewport is being created.
  $: viewportVertexShader = teachingSource === 'vertex' ? compiledCode : task?.referenceVertexShader ?? '';
  $: viewportFragmentShader = teachingSource === 'fragment' ? compiledCode : definition?.fragmentShader ?? task?.referenceFragmentShader ?? '';
  // Controls come from the live editor source, so a new annotated uniform shows up as you type it.
  $: controls = parseShaderControls(compiledCode);
  $: values = controlValues(controls, $teachingStore.values);
  $: shaderReadbacks = controls
    .filter(control => control.type === 'matrix4' && control.readback)
    .map(control => ({ id: control.id, variable: control.readback as string }));
  $: transformMatrix = definition?.overlays?.transformControls ? readbackValues.pointMatrix : undefined;
  $: displayedValues = {
    ...values,
    ...readbackValues
  };
  $: vectorVisualizations = controls
    .filter(control => control.type === 'vector3' && control.visualization)
    .map(control => ({
      id: control.id,
      value: displayedValues[control.id] as ViewportVector['value'],
      origin: control.visualizationOrigin,
      visualization: control.visualization as ViewportVector['visualization']
    }));
  $: if (mounted && task && task.title !== loadedTaskTitle) {
    loadedTaskTitle = task.title;
    taskStore.loadTask(slugify(task.title));
  }
  function colorToVec3(value: string | number[]): number[] {
    if (Array.isArray(value)) return value;
    const hex = value.replace('#', '');
    return [0, 1, 2].map(index => parseInt(hex.slice(index * 2, index * 2 + 2), 16) / 255);
  }

  function applyTransform(transform: ViewportTransform) {
    const def = get(teachingStore).definition;
    if (!def?.overlays?.transformControls) return;
    teachingStore.setValues({
      translationMatrix: Array.from(new THREE.Matrix4().makeTranslation(...transform.position).toArray()),
      rotationMatrix: Array.from(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().fromArray(transform.quaternion)).toArray()),
      scaleMatrix: Array.from(new THREE.Matrix4().makeScale(...transform.scale).toArray())
    });
  }

  // A malformed annotation can leave a value the renderer has no uniform type for; skip those.
  function uniformValue(control: TeachingControl, value: TeachingValue) {
    if (control.type === 'color') return colorToVec3(value as string | number[]);
    return typeof value === 'string' ? undefined : value;
  }

  function updateTeachingCode(value: string) {
    shaderDiagnostics = { vertex: [], fragment: [] };
    readbackValues = {};
    readbackValuesKey = '';
    teachingStore.setCode(value);
  }

  function applyShaderReadbacks(values: Record<string, number[]>) {
    const key = JSON.stringify(values);
    if (key === readbackValuesKey) return;
    readbackValuesKey = key;
    readbackValues = values;
  }

  $: uniformValues = Object.fromEntries(
    controls
      .filter(control => control.uniform)
      .map(control => [control.uniform as string, uniformValue(control, displayedValues[control.id])])
      .filter((entry): entry is [string, number | number[] | boolean] => entry[1] !== undefined)
  );

  onMount(() => {
    mounted = true;
    loadedSplitterKey = data.title;
    splitterSizes = loadSplitterSizes(splitterStorageKey(), defaultSplitterSizes);
    teachingStore.load(data.title);
    window.addEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeydown);
  });
</script>

<svelte:head><title>{$teachingStore.definition?.title ?? 'Lehr-Demo'} · ShaderLab</title></svelte:head>

{#if definition}
  {#if definition.type === 'shader-controls'}
    <div class="h-full w-full relative">
      {#if !mobileQuery.current}
        <!-- Desktop layout -->
        <div class="workspace-layout h-full w-full">
          <Splitpanes class="splitpanes-root" theme="my-theme" on:resized={(event) => handleSplitterResize('outer', event)}>
            <Pane size={splitterSizes.outer}>
              <TeachingPanel {definition} {controls} values={displayedValues} />
            </Pane>
            <Pane size={100 - splitterSizes.outer}>
              <Splitpanes horizontal class="splitpanes-nested" theme="my-theme" on:resized={(event) => handleSplitterResize('inner', event)}>
                <Pane size={splitterSizes.inner}>
                  <MonacoEditor editorId={`${definition.id}-desktop`} sources={editorSources} defaultSources={defaultEditorSources} visibleSources={[teachingSource]} activeSource={teachingSource} diagnostics={shaderDiagnostics} onSourceChange={(_, value) => updateTeachingCode(value)} />
                </Pane>
                <Pane size={100 - splitterSizes.inner}>
                  {#if task}
                    <Viewport
                      {task}
                      {scene}
                      vertexShader={viewportVertexShader}
                      fragmentShader={viewportFragmentShader}
                      cameraPose={$taskStore.cameraPose}
                      {uniformValues}
                      {shaderReadbacks}
                      onShaderReadbacks={applyShaderReadbacks}
                      overlays={definition.overlays}
                      {transformMatrix}
                      {vectorVisualizations}
                      onTransformChange={applyTransform}
                      reportErrors={true}
                      {errorLineOffsets}
                      onShaderErrors={(errors) => shaderDiagnostics = errors}
                      title="Ausgabe"
                      panelId="output"
                    />
                  {/if}
                </Pane>
              </Splitpanes>
            </Pane>
          </Splitpanes>
        </div>
      {:else}
        <!-- Mobile layout -->
        <div class="workspace-layout flex flex-col h-full overflow-auto gap-0">
          <div class="min-h-[400px]">
            <TeachingPanel {definition} {controls} values={displayedValues} />
          </div>
          <div class="min-h-[400px]">
            <MonacoEditor editorId={`${definition.id}-mobile`} sources={editorSources} defaultSources={defaultEditorSources} visibleSources={[teachingSource]} activeSource={teachingSource} diagnostics={shaderDiagnostics} onSourceChange={(_, value) => updateTeachingCode(value)} />
          </div>
          {#if task}
            <div class="min-h-[400px]">
              <Viewport
                {task}
                {scene}
                vertexShader={viewportVertexShader}
                fragmentShader={viewportFragmentShader}
                cameraPose={$taskStore.cameraPose}
                {uniformValues}
                {shaderReadbacks}
                onShaderReadbacks={applyShaderReadbacks}
                overlays={definition.overlays}
                {transformMatrix}
                {vectorVisualizations}
                onTransformChange={applyTransform}
                reportErrors={true}
                {errorLineOffsets}
                onShaderErrors={(errors) => shaderDiagnostics = errors}
                title="Ausgabe"
                panelId="output"
              />
            </div>
          {/if}
        </div>
      {/if}

      <AppTutorial mode="teaching" />

      <div class="pointer-events-none absolute inset-0 z-50" data-panel-maximizer></div>
    </div>
  {/if}
{:else}
  <div class="flex h-full items-center justify-center text-muted-foreground">Lehr-Demo nicht gefunden.</div>
{/if}
