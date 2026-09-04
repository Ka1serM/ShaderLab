<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { teachingStore } from '$lib/stores/teachingStore';
  import { assembleStudentShader, type GLSLError } from '$lib/stores/taskStore';
  import { controlValues, parseShaderControls, type TeachingControl, type TeachingValue } from '$lib/utils/shaderControls';
  import TeachingPanel from '$lib/components/TeachingPanel.svelte';
  import MonacoEditor from '$lib/components/MonacoEditor.svelte';
  import Viewport from '$lib/components/Viewport.svelte';
  import { maximizedPanel } from '$lib/stores/panelStore';
  import { Splitpanes, Pane } from 'svelte-splitpanes';
  import * as THREE from 'three';
  import type { ViewportTransform, ViewportVector } from '$lib/renderer/Renderer';
  import type { ShaderReadbackType, ShaderReadbackValue } from '$lib/renderer/shaderReadback';
  import type { PageData } from './$types';
  import { isMobile } from '$lib/hooks/is-mobile.svelte';
  import AppTutorial from '$lib/components/AppTutorial.svelte';
  import ShaderLabLogo from '$lib/components/ShaderLabLogo.svelte';
  import { loadSplitterSizes, saveSplitterSizes, type SplitterSizes } from '$lib/utils/splitPaneStorage';

  const defaultSplitterSizes: SplitterSizes = { outer: 35, inner: 34, viewports: 50 };
  type TeachingShaderSource = 'vertex' | 'fragment';

  export let data: PageData;
  let mounted = false;
  let loadedTeachingTitle = '';
  let teachingSource: TeachingShaderSource = 'fragment';
  let editorSources: Partial<Record<TeachingShaderSource, string>> = {};
  let defaultEditorSources: Partial<Record<TeachingShaderSource, string>> = {};
  let displayedValues: Record<string, TeachingValue> = {};
  let readbackValues: Record<string, ShaderReadbackValue> = {};
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
  $: visibleSources = definition ? definition.shaderStages : [];
  $: if (!visibleSources.includes(teachingSource)) teachingSource = visibleSources[0] ?? 'fragment';
  $: editorSources = {
    vertex: visibleSources.includes('vertex') ? $teachingStore.userCode.vertex ?? definition?.vertexShader ?? '' : definition?.vertexShader ?? '',
    fragment: visibleSources.includes('fragment') ? $teachingStore.userCode.fragment ?? definition?.fragmentShader ?? '' : definition?.fragmentShader ?? ''
  };
  $: defaultEditorSources = { vertex: definition?.vertexShader ?? '', fragment: definition?.fragmentShader ?? '' };
  $: compiledVertexCode = assembleStudentShader(editorSources.vertex ?? '', definition?.vertexShaderTemplate);
  $: compiledFragmentCode = assembleStudentShader(editorSources.fragment ?? '', definition?.fragmentShaderTemplate);
  $: errorLineOffsets = {
    vertex: definition?.vertexShaderTemplate?.prefix ? definition.vertexShaderTemplate.prefix.split('\n').length : 0,
    fragment: definition?.fragmentShaderTemplate?.prefix ? definition.fragmentShaderTemplate.prefix.split('\n').length : 0
  };
  $: viewportVertexShader = compiledVertexCode;
  $: viewportFragmentShader = compiledFragmentCode;
  $: controls = parseShaderControls(`${compiledVertexCode}\n${compiledFragmentCode}`);
  $: values = controlValues(controls, $teachingStore.values);
  $: shaderReadbacks = controls.flatMap(control => {
    const type = readbackType(control);
    return control.readback && type ? [{ id: control.id, variable: control.readback, type }] : [];
  });
  $: transformMatrix = definition?.overlays?.transformControls ? readbackValues.pointMatrix as number[] | undefined : undefined;
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
  function colorToVec3(value: string | number[]): number[] {
    if (Array.isArray(value)) return value;
    const hex = value.replace('#', '');
    return [0, 1, 2].map(index => parseInt(hex.slice(index * 2, index * 2 + 2), 16) / 255);
  }

  function readbackType(control: TeachingControl): ShaderReadbackType | undefined {
    if (control.type === 'slider') return 'float';
    if (control.type === 'vector3') return 'vector3';
    if (control.type === 'vector4') return 'vector4';
    if (control.type === 'matrix4') return 'matrix4';
    return undefined;
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

  function uniformValue(control: TeachingControl, value: TeachingValue) {
    if (control.type === 'color') return colorToVec3(value as string | number[]);
    return typeof value === 'string' ? undefined : value;
  }

  function updateTeachingCode(source: TeachingShaderSource, value: string) {
    shaderDiagnostics = { vertex: [], fragment: [] };
    readbackValues = {};
    readbackValuesKey = '';
    teachingStore.setCode(source, value);
  }

  function applyShaderReadbacks(values: Record<string, ShaderReadbackValue>) {
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
    if (typeof window !== 'undefined') window.removeEventListener('keydown', handleKeydown);
  });
</script>

<svelte:head><title>{$teachingStore.definition?.title ?? 'Lehr-Demo'} · ShaderLab</title></svelte:head>

{#key data.title}
{#if definition}
  {#if definition}
    <div class="h-full w-full relative">
      {#if !$isMobile}
        <div class="workspace-layout h-full w-full">
          <Splitpanes class="splitpanes-root" theme="my-theme" on:resized={(event) => handleSplitterResize('outer', event)}>
            <Pane size={splitterSizes.outer}>
              <TeachingPanel {definition} {controls} values={displayedValues} />
            </Pane>
            <Pane size={100 - splitterSizes.outer}>
              <Splitpanes horizontal class="splitpanes-nested" theme="my-theme" on:resized={(event) => handleSplitterResize('inner', event)}>
                <Pane size={splitterSizes.inner}>
                  <MonacoEditor editorId={`${definition.id}-desktop`} workspaceKey={definition.id} sources={editorSources} defaultSources={defaultEditorSources} {visibleSources} activeSource={teachingSource} diagnostics={shaderDiagnostics} onActiveSourceChange={(source) => teachingSource = source} onSourceChange={(source, value) => updateTeachingCode(source, value)} />
                </Pane>
                <Pane size={100 - splitterSizes.inner}>
                  <Viewport
                      inputs={definition.inputs ?? []}
                      scenes={definition.scenes}
                      vertexShader={viewportVertexShader}
                      fragmentShader={viewportFragmentShader}
                      cameraPose={$teachingStore.cameraPose}
                      cameraPoseSaved={$teachingStore.cameraPoseSaved}
                      onCameraChange={teachingStore.setCameraPose}
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
                      title="Output"
                      showTimeControl={definition.showTimeControl ?? false}
                      panelId="output"
                    />
                </Pane>
              </Splitpanes>
            </Pane>
          </Splitpanes>
        </div>
      {:else}
        <div class="workspace-layout flex flex-col h-full overflow-auto gap-0">
          <div class="min-h-[400px]">
            <TeachingPanel {definition} {controls} values={displayedValues} />
          </div>
          <div class="min-h-[400px]">
            <MonacoEditor editorId={`${definition.id}-mobile`} workspaceKey={definition.id} sources={editorSources} defaultSources={defaultEditorSources} {visibleSources} activeSource={teachingSource} diagnostics={shaderDiagnostics} onActiveSourceChange={(source) => teachingSource = source} onSourceChange={(source, value) => updateTeachingCode(source, value)} />
          </div>
          <div class="min-h-[400px]">
              <Viewport
                inputs={definition.inputs ?? []}
                scenes={definition.scenes}
                vertexShader={viewportVertexShader}
                fragmentShader={viewportFragmentShader}
                cameraPose={$teachingStore.cameraPose}
                cameraPoseSaved={$teachingStore.cameraPoseSaved}
                onCameraChange={teachingStore.setCameraPose}
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
                title="Output"
                showTimeControl={definition.showTimeControl ?? false}
                panelId="output"
              />
            </div>
          </div>
      {/if}

      <AppTutorial mode="teaching" />

      <div class="pointer-events-none absolute inset-0 z-50" data-panel-maximizer></div>
    </div>
  {/if}
{:else}
  <div class="flex h-full items-center justify-center" role="status" aria-label="Loading teaching demo">
    <ShaderLabLogo animation="spinner" className="h-10 w-10" />
    <span class="sr-only">Loading teaching demo</span>
  </div>
{/if}
{/key}
