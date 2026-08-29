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
  const defaultSplitterSizes: SplitterSizes = { outer: 35, inner: 60, viewports: 50 };
  export let data: PageData;

  let mounted = false;
  let splitterSizes: SplitterSizes = { ...defaultSplitterSizes };
  let loadedSplitterKey = '';

  function splitterStorageKey() {
    return `shaderlab:splitters:task:${data.slug}`;
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
      <div class="workspace-layout h-full w-full">
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
                  workspaceKey={data.slug}
                  onSourceChange={(source, value) => source === 'vertex' ? taskStore.setVertexShader(value) : taskStore.setFragmentShader(value)}
                  onActiveSourceChange={(source) => taskStore.setActiveTab(source)}
                />
              </Pane>
              <Pane size={100 - splitterSizes.inner}>
                <div class="h-full" data-tutorial="viewports">
                  <Splitpanes class="splitpanes-nested" theme="my-theme" on:resized={(event) => handleSplitterResize('viewports', event)}>
                    <Pane size={splitterSizes.viewports}>
                      <Viewport
                        task={$taskStore.task}
                        vertexShader={$taskStore.task.referenceVertexShader}
                        fragmentShader={$taskStore.task.referenceFragmentShader}
                        cameraPose={$taskStore.cameraPose}
                        overlays={$taskStore.task.overlays}
                        reportErrors={false}
                        title="Referenz"
                        panelId="reference"
                      />
                    </Pane>
                    <Pane size={100 - splitterSizes.viewports}>
                      <Viewport
                        task={$taskStore.task}
                        vertexShader={$taskStore.vertexShader}
                        fragmentShader={$taskStore.fragmentShader}
                        cameraPose={$taskStore.cameraPose}
                        overlays={$taskStore.task.overlays}
                        reportErrors={true}
                        useStudentTemplates={true}
                        title="Ausgabe"
                        panelId="output"
                      />
                    </Pane>
                  </Splitpanes>
                </div>
              </Pane>
            </Splitpanes>
          </Pane>
        </Splitpanes>
      </div>
    {:else}
      <!-- Mobile layout -->
      <div class="workspace-layout flex flex-col h-full overflow-auto gap-0">
        <div class="min-h-[400px]">
          <TaskPanel />
        </div>
        <div class="min-h-[400px]">
          <MonacoEditor sources={{ vertex: $taskStore.vertexShader, fragment: $taskStore.fragmentShader }} defaultSources={{ vertex: $taskStore.task.starterVertexShader, fragment: $taskStore.task.starterFragmentShader }} visibleSources={getTaskShaderStages($taskStore.task)} activeSource={$taskStore.activeTab} diagnostics={$taskStore.shaderErrors} editorId="task-mobile" workspaceKey={data.slug} onSourceChange={(source, value) => source === 'vertex' ? taskStore.setVertexShader(value) : taskStore.setFragmentShader(value)} onActiveSourceChange={(source) => taskStore.setActiveTab(source)} />
        </div>
        <div class="min-h-[400px]">
          <Viewport
            task={$taskStore.task}
            vertexShader={$taskStore.task.referenceVertexShader}
            fragmentShader={$taskStore.task.referenceFragmentShader}
            cameraPose={$taskStore.cameraPose}
            overlays={$taskStore.task.overlays}
            reportErrors={false}
            title="Referenz"
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
            title="Ausgabe"
            panelId="output"
          />
        </div>
      </div>
    {/if}

    <AppTutorial mode="task" />

    <div class="pointer-events-none absolute inset-0 z-50" data-panel-maximizer></div>
  </div>
{:else}
  <div class="flex items-center justify-center h-full">
    <p class="text-muted-foreground">Aufgabe wird geladen …</p>
  </div>
{/if}
