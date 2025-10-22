<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { Splitpanes, Pane } from 'svelte-splitpanes';
  import TaskPanel from '$lib/components/TaskPanel.svelte';
  import MonacoEditor from '$lib/components/MonacoEditor.svelte';
  import DualShaderPreview from '$lib/components/DualShaderPreview.svelte';
  import { taskStore } from '$lib/stores/taskStore';
  import type { PageData } from './$types';
  import { IsMobile } from '$lib/hooks/is-mobile.svelte';

  const mobileQuery = new IsMobile();
  export let data: PageData;

  let mounted = false;

  // Load task when slug changes
  $: if (mounted && data.slug) {
    taskStore.loadTask(data.slug);
  }

  onMount(() => {
    mounted = true;
    if (data.slug) {
      taskStore.loadTask(data.slug);
    }
  });
</script>

{#if $taskStore.task}
  <div class="h-full w-full overflow-hidden">
    {#if !mobileQuery.current}
      <!-- Desktop layout -->
      <Splitpanes class="splitpanes-root" theme="my-theme">
        <Pane size={35} minSize={20}>
          <TaskPanel />
        </Pane>
        <Pane size={65} minSize={20}>
          <Splitpanes horizontal class="splitpanes-nested" theme="my-theme">
            <Pane size={60} minSize={20}>
              <MonacoEditor />
            </Pane>
            <Pane size={40} minSize={20}>
              <DualShaderPreview />
            </Pane>
          </Splitpanes>
        </Pane>
      </Splitpanes>
    {:else}
      <!-- Mobile layout -->
      <div class="flex flex-col h-full overflow-auto gap-4 p-2">
        <TaskPanel />
        <MonacoEditor />
        <DualShaderPreview />
      </div>
    {/if}
  </div>
{:else}
  <div class="flex items-center justify-center h-full">
    <p class="text-muted-foreground">Loading task...</p>
  </div>
{/if}

<style>
/* ... your existing styles ... */
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
  background-color: transparent;
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
  background-color: transparent;
  border-radius: 2px;
  pointer-events: none;
  transition: background-color 0.2s;
}

:global(.splitpanes.my-theme.splitpanes--horizontal > .splitpanes__splitter::before) {
  background-color: rgba(74, 74, 74, 0.4);
}

:global(.splitpanes.my-theme .splitpanes__splitter::after) {
  content: '';
  position: absolute;
  z-index: 1;
}

:global(.splitpanes.my-theme.splitpanes--vertical > .splitpanes__splitter::after) {
  left: -10px;
  right: -10px;
  top: 0;
  bottom: 0;
}

:global(.splitpanes.my-theme.splitpanes--horizontal > .splitpanes__splitter::after) {
  left: 0;
  right: 0;
  top: -10px;
  bottom: -10px;
}
</style>