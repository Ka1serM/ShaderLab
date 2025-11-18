<script>
import { page } from '$app/stores';
import { taskStore, loadTask } from '$lib/stores/taskStore.js';
import tasks from '$lib/data/tasks.json';
import { slugify } from '$lib/utils/slugify.js';

import TaskPanel from '$lib/components/TaskPanel.svelte';
import MonacoEditor from '$lib/components/MonacoEditor.svelte';
import DualShaderPreview from '$lib/components/DualShaderPreview.svelte';
import { Splitpanes, Pane } from 'svelte-splitpanes';
import { IsMobile } from '$lib/hooks/is-mobile.js';

const mobileQuery = new IsMobile();

// bind to the slug change
$: if ($page.data.slug) {
  const taskData = tasks.find(t => slugify(t.title) === $page.data.slug);
  loadTask(taskData);
}
</script>

{#if $taskStore && $taskStore.session}
<div class="h-full w-full overflow-hidden">
  {#if !mobileQuery.current}
    <Splitpanes class="splitpanes-root" theme="my-theme">
      <Pane size={35} minSize={20}>
        <TaskPanel taskVM={taskStore} />
      </Pane>
      <Pane size={65} minSize={20}>
        <Splitpanes horizontal class="splitpanes-nested" theme="my-theme">
          <Pane size={60} minSize={20}>
            <MonacoEditor taskVM={taskStore} />
          </Pane>
          <Pane size={40} minSize={20}>
            <!-- <DualShaderPreview taskVM={taskStore} /> -->
          </Pane>
        </Splitpanes>
      </Pane>
    </Splitpanes>
  {:else}
    <div class="flex flex-col h-full overflow-auto gap-4 p-2">
      <TaskPanel taskVM={taskStore} />
      <MonacoEditor taskVM={taskStore} />
      <DualShaderPreview taskVM={taskStore} />
    </div>
  {/if}
</div>
{:else}
<p class="text-center text-gray-400 mt-4">Task not found</p>
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
  background-color: rgba(74, 74, 74, 0.4);
  border-radius: 2px;
}
</style>
