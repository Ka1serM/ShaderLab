<script lang="ts">
  import * as Tabs from '$lib/components/ui/tabs/index.js';
  import * as Collapsible from '$lib/components/ui/collapsible/index.js';
  import ChevronDown from 'phosphor-svelte/lib/CaretDownIcon';
  import Lightbulb from 'phosphor-svelte/lib/LightbulbIcon';
  import MaximizeButton from '$lib/components/MaximizeButton.svelte';
  import { maximizable } from '$lib/actions/maximizable';
  import { useApplication } from '$lib/app/application.svelte';
  import type { Task } from '$lib/app/types';

  let { task }: { task: Task } = $props();

  const app = useApplication();
  const layout = app.layout;
  const controller = app.task;
  const model = controller.model;
</script>

<div use:maximizable={{ active: layout.maximized === 'instructions' }} class="workspace-panel">
<div class="app-panel h-full flex flex-col overflow-hidden" data-tutorial="instructions">
  <div class="task-panel-header app-panel-header flex items-center justify-between shrink-0">
    <h1 class="app-panel-title text-2xl font-bold text-foreground">{task.title}</h1>
    <MaximizeButton isMaximized={layout.maximized === 'instructions'} onClick={() => layout.toggleMaximized('instructions')} />
  </div>

  <Tabs.Root value={model.panelTab} class="flex-1 flex flex-col min-h-0 overflow-hidden" onValueChange={(value) => controller.setPanelTab(value as 'task' | 'theory')}>
    <div class="flex items-center">
      <Tabs.List class="h-10 justify-start bg-muted/25 p-0 gap-0">
        <Tabs.Trigger value="task" class="h-10 px-4 border-none data-[state=active]:bg-background hover:bg-muted/50 transition-colors">Task</Tabs.Trigger>
        <Tabs.Trigger value="theory" class="h-10 px-4 border-none data-[state=active]:bg-background hover:bg-muted/50 transition-colors">Theory</Tabs.Trigger>
      </Tabs.List>
    </div>

    <Tabs.Content value="task" class="flex-1 h-0 overflow-y-auto overflow-x-hidden p-0 mt-0 space-y-4 data-[state=inactive]:hidden">
      <div class="prose prose-neutral dark:prose-invert max-w-none text-foreground">
        {@html task.task}
      </div>

      {#if task.hints?.length > 0}
        <div class="space-y-2 mt-6">
          <div class="flex items-center gap-2 mb-3">
            <Lightbulb class="w-4 h-4 text-primary" />
            <h4 class="text-sm font-semibold text-foreground">Hints</h4>
          </div>

          {#each task.hints as hint, index}
            {@const open = model.openHints.includes(index)}
            <Collapsible.Root {open} onOpenChange={(next) => controller.toggleHint(index, next)}>
              <Collapsible.Trigger class="flex items-center justify-between w-full p-3 bg-secondary hover:bg-muted rounded-lg transition-smooth text-left">
                <span class="text-sm text-foreground">Hint {index + 1}</span>
                <ChevronDown class="w-4 h-4 text-muted-background transition-transform" style="transform: rotate({open ? 180 : 0}deg);" />
              </Collapsible.Trigger>
              <Collapsible.Content class="px-3 py-2">
                <div class="prose prose-sm dark:prose-invert max-w-none text-muted-foreground">
                  {@html hint}
                </div>
              </Collapsible.Content>
            </Collapsible.Root>
          {/each}
        </div>
      {/if}
    </Tabs.Content>

    <Tabs.Content value="theory" class="flex-1 h-0 overflow-y-auto overflow-x-hidden p-0 mt-0 space-y-4 data-[state=inactive]:hidden">
      <div class="prose prose-neutral dark:prose-invert max-w-none text-foreground">
        {@html task.theory}
      </div>
    </Tabs.Content>
  </Tabs.Root>
</div>
</div>
