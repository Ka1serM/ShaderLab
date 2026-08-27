<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Splitpanes, Pane } from 'svelte-splitpanes';
  import TaskPanel from '$lib/components/TaskPanel.svelte';
  import MonacoEditor from '$lib/components/MonacoEditor.svelte';
  import Viewport from '$lib/components/Viewport.svelte';
  import { taskStore, getTaskShaderStages } from '$lib/stores/taskStore';
  import { maximizedPanel } from '$lib/stores/panelStore';
  import type { PageData } from './$types';
  import { IsMobile } from '$lib/hooks/is-mobile.svelte';
  import AppTutorial from '$lib/components/AppTutorial.svelte';
  import { loadSplitterSizes, saveSplitterSizes, type SplitterSizes } from '$lib/utils/splitPaneStorage';

  const mobileQuery = new IsMobile();
  const defaultSplitterSizes: SplitterSizes = { outer: 35, inner: 60 };
  export let data: PageData;

  let mounted = false;
  let splitterSizes: SplitterSizes = { ...defaultSplitterSizes };
  let loadedSplitterKey = '';

  function splitterStorageKey() {
    return `shaderlab:splitters:task:${data.slug}`;
  }

  function handleSplitterResize(slot: keyof SplitterSizes, event: CustomEvent<Array<{ size: number }>>) {
    const size = event.detail?.[0]?.size;
    if (!Number.isFinite(size) || size <= 0 || size >= 100) return;
    splitterSizes = { ...splitterSizes, [slot]: size };
    saveSplitterSizes(splitterStorageKey(), splitterSizes);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && $maximizedPanel) {
      $maximizedPanel = null;
    }
  }

  $: if (mounted && data.slug) {
    taskStore.loadTask(data.slug);
  }

  $: if (mounted && data.slug && data.slug !== loadedSplitterKey) {
    loadedSplitterKey = data.slug;
    splitterSizes = loadSplitterSizes(splitterStorageKey(), defaultSplitterSizes);
  }

  onMount(() => {
    mounted = true;
    loadedSplitterKey = data.slug;
    splitterSizes = loadSplitterSizes(splitterStorageKey(), defaultSplitterSizes);
    if (data.slug) {
      taskStore.loadTask(data.slug);
    }
    window.addEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeydown);
  });
</script>

{#if $taskStore.task}
  <div class="h-full w-full overflow-hidden relative">
    {#if !mobileQuery.current}
      <!-- Desktop layout -->
      <div class="h-full w-full" class:hidden={$maximizedPanel !== null}>
        <Splitpanes class="splitpanes-root" theme="my-theme" on:resized={(event) => handleSplitterResize('outer', event)}>
          <Pane size={splitterSizes.outer}>
            <TaskPanel />
          </Pane>
          <Pane size={100 - splitterSizes.outer}>
            <Splitpanes horizontal class="splitpanes-nested" theme="my-theme" on:resized={(event) => handleSplitterResize('inner', event)}>
              <Pane size={splitterSizes.inner}>
                <MonacoEditor
                  sources={{ vertex: $taskStore.vertexShader, fragment: $taskStore.fragmentShader }}
                  defaultSources={{ vertex: $taskStore.task.starterVertexShader, fragment: $taskStore.task.starterFragmentShader }}
                  visibleSources={getTaskShaderStages($taskStore.task)}
                  activeSource={$taskStore.activeTab}
                  diagnostics={$taskStore.shaderErrors}
                  editorId="task-desktop"
                  onSourceChange={(source, value) => source === 'vertex' ? taskStore.setVertexShader(value) : taskStore.setFragmentShader(value)}
                  onActiveSourceChange={(source) => taskStore.setActiveTab(source)}
                />
              </Pane>
              <Pane size={100 - splitterSizes.inner}>
                <div class="grid h-full grid-cols-2 gap-4" data-tutorial="viewports">
                  <Viewport
                    task={$taskStore.task}
                    vertexShader={$taskStore.task.referenceVertexShader}
                    fragmentShader={$taskStore.task.referenceFragmentShader}
                    cameraPose={$taskStore.cameraPose}
                    overlays={$taskStore.task.overlays}
                    reportErrors={false}
                    title="Reference"
                    panelId="reference"
                  />
                  <Viewport
                    task={$taskStore.task}
                    vertexShader={$taskStore.vertexShader}
                    fragmentShader={$taskStore.fragmentShader}
                    cameraPose={$taskStore.cameraPose}
                    overlays={$taskStore.task.overlays}
                    reportErrors={true}
                    useStudentTemplates={true}
                    title="Output"
                    panelId="output"
                  />
                </div>
              </Pane>
            </Splitpanes>
          </Pane>
        </Splitpanes>
      </div>
    {:else}
      <!-- Mobile layout -->
      <div class="flex flex-col h-full overflow-auto gap-4 p-2" class:hidden={$maximizedPanel !== null}>
        <div class="min-h-[400px]">
          <TaskPanel />
        </div>
        <div class="min-h-[400px]">
          <MonacoEditor sources={{ vertex: $taskStore.vertexShader, fragment: $taskStore.fragmentShader }} defaultSources={{ vertex: $taskStore.task.starterVertexShader, fragment: $taskStore.task.starterFragmentShader }} visibleSources={getTaskShaderStages($taskStore.task)} activeSource={$taskStore.activeTab} diagnostics={$taskStore.shaderErrors} editorId="task-mobile" onSourceChange={(source, value) => source === 'vertex' ? taskStore.setVertexShader(value) : taskStore.setFragmentShader(value)} onActiveSourceChange={(source) => taskStore.setActiveTab(source)} />
        </div>
        <div class="min-h-[400px]">
          <Viewport
            task={$taskStore.task}
            vertexShader={$taskStore.task.referenceVertexShader}
            fragmentShader={$taskStore.task.referenceFragmentShader}
            cameraPose={$taskStore.cameraPose}
            overlays={$taskStore.task.overlays}
            reportErrors={false}
            title="Reference"
            panelId="reference"
          />
        </div>
        <div class="min-h-[400px]">
          <Viewport
            task={$taskStore.task}
            vertexShader={$taskStore.vertexShader}
            fragmentShader={$taskStore.fragmentShader}
            cameraPose={$taskStore.cameraPose}
            overlays={$taskStore.task.overlays}
            reportErrors={true}
            useStudentTemplates={true}
            title="Output"
            panelId="output"
          />
        </div>
      </div>
    {/if}

    <AppTutorial mode="task" />

    <!-- Maximized panel (shared desktop + mobile) -->
    {#if $maximizedPanel}
      <div class="absolute inset-0 z-50 bg-background">
        {#if $maximizedPanel === 'task' || $maximizedPanel === 'theory'}
          <TaskPanel />
        {:else if $maximizedPanel === 'task-desktop' || $maximizedPanel === 'task-mobile'}
          <MonacoEditor
            sources={{ vertex: $taskStore.vertexShader, fragment: $taskStore.fragmentShader }}
            defaultSources={{ vertex: $taskStore.task.starterVertexShader, fragment: $taskStore.task.starterFragmentShader }}
            visibleSources={getTaskShaderStages($taskStore.task)}
            activeSource={$taskStore.activeTab}
            diagnostics={$taskStore.shaderErrors}
            editorId={$maximizedPanel}
            onSourceChange={(source, value) => source === 'vertex' ? taskStore.setVertexShader(value) : taskStore.setFragmentShader(value)}
            onActiveSourceChange={(source) => taskStore.setActiveTab(source)}
          />
        {:else if $maximizedPanel === 'reference'}
          <Viewport
            task={$taskStore.task}
            vertexShader={$taskStore.task.referenceVertexShader}
            fragmentShader={$taskStore.task.referenceFragmentShader}
            cameraPose={$taskStore.cameraPose}
            overlays={$taskStore.task.overlays}
            reportErrors={false}
            title="Reference"
            panelId="reference"
          />
        {:else if $maximizedPanel === 'output'}
          <Viewport
            task={$taskStore.task}
            vertexShader={$taskStore.vertexShader}
            fragmentShader={$taskStore.fragmentShader}
            cameraPose={$taskStore.cameraPose}
            overlays={$taskStore.task.overlays}
            reportErrors={true}
            useStudentTemplates={true}
            title="Output"
            panelId="output"
          />
        {/if}
      </div>
    {/if}
  </div>
{:else}
  <div class="flex items-center justify-center h-full">
    <p class="text-muted-foreground">Loading task...</p>
  </div>
{/if}

<style>
:global(.splitpanes-root),
:global(.splitpanes-nested) {
  height: 100%;
  width: 100%;
  overflow: hidden;
}

:global(.pane-content) {
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;
  box-sizing: border-box;
}

:global(.splitpanes.my-theme .splitpanes__pane) {
  background-color: transparent;
  overflow: hidden !important;
  box-sizing: border-box;
}

:global(.splitpanes.my-theme.splitpanes--vertical > .splitpanes__splitter) {
  width: 8px;
  background-color: transparent;
  cursor: col-resize;
  position: relative;
  z-index: 10;
  transition: background-color 0.2s;
}

:global(.splitpanes.my-theme.splitpanes--vertical > .splitpanes__splitter:hover) {
  background-color: rgba(74, 74, 74, 0.15);
}

:global(.splitpanes.my-theme.splitpanes--vertical > .splitpanes__splitter::before) {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 2px;
  height: 30px;
  background-color: rgba(74, 74, 74, 0.4);
  border-radius: 2px;
  pointer-events: none;
  transition: background-color 0.2s;
}

:global(.splitpanes.my-theme.splitpanes--vertical > .splitpanes__splitter:hover::before) {
  background-color: rgba(74, 74, 74, 0.4);
}

:global(.splitpanes.my-theme.splitpanes--horizontal > .splitpanes__splitter) {
  height: 8px;
  background-color: transparent;
  cursor: row-resize;
  position: relative;
  z-index: 10;
  transition: background-color 0.2s;
}

:global(.splitpanes.my-theme.splitpanes--horizontal > .splitpanes__splitter:hover) {
  background-color: rgba(74, 74, 74, 0.15);
}

:global(.splitpanes.my-theme.splitpanes--horizontal > .splitpanes__splitter::before) {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 30px;
  height: 2px;
  background-color: rgba(74, 74, 74, 0.4);
  border-radius: 2px;
  pointer-events: none;
  transition: background-color 0.2s;
}

:global(.splitpanes.my-theme.splitpanes--horizontal > .splitpanes__splitter:hover::before) {
  background-color: rgba(74, 74, 74, 0.4);
}

:global(.splitpanes.my-theme .splitpanes__splitter::after) {
  content: '';
  position: absolute;
  z-index: 1;
}

</style>
