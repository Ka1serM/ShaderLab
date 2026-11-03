<script lang="ts">
  import TeachingControls from './TeachingControls.svelte';
  import * as Tabs from '$lib/components/ui/tabs';
  import MaximizeButton from '$lib/components/MaximizeButton.svelte';
  import ResetButton from '$lib/components/ResetButton.svelte';
  import { maximizable } from '$lib/actions/maximizable';
  import { useApplication } from '$lib/app/application.svelte';
  import type { Teach } from '$lib/app/types';

  let { definition }: { definition: Teach } = $props();

  const app = useApplication();
  const layout = app.layout;
  const controller = app.teaching;
  const model = controller.model;
</script>

<div use:maximizable={{ active: layout.maximized === 'controls' }} class="workspace-panel">
<div class="app-panel h-full flex flex-col overflow-hidden" data-tutorial="instructions">
  <div class="teaching-panel-header app-panel-header flex items-center justify-between shrink-0">
    <h1 class="app-panel-title text-2xl font-bold text-foreground">{definition.title}</h1>
    <div class="flex items-center gap-1">
      <MaximizeButton isMaximized={layout.maximized === 'controls'} onClick={() => layout.toggleMaximized('controls')} />
      <ResetButton description="Reset all parameters to their defaults?" onReset={() => controller.resetValues()} />
    </div>
  </div>
  <Tabs.Root value={model.panelTab} class="flex flex-1 min-h-0 flex-col overflow-hidden" onValueChange={(value) => controller.setPanelTab(value as 'parameters' | 'theory')}>
    <div class="flex items-center">
      <Tabs.List class="h-10 justify-start gap-0 bg-muted/25 p-0">
        <Tabs.Trigger value="parameters" class="h-10 border-none px-4 transition-colors hover:bg-muted/50 data-[state=active]:bg-background">
          Parameters
        </Tabs.Trigger>
        <Tabs.Trigger value="theory" class="h-10 border-none px-4 transition-colors hover:bg-muted/50 data-[state=active]:bg-background">
          Theory
        </Tabs.Trigger>
      </Tabs.List>
    </div>

    <Tabs.Content value="parameters" class="mt-0 h-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto p-0 data-[state=inactive]:hidden">
      <TeachingControls {definition} controls={model.controls} values={model.values} />
    </Tabs.Content>

    <Tabs.Content value="theory" class="mt-0 h-0 flex-1 overflow-x-hidden overflow-y-auto p-0 data-[state=inactive]:hidden">
      <div class="prose prose-neutral dark:prose-invert max-w-none text-foreground">
        {@html definition.explanation}
      </div>
    </Tabs.Content>
  </Tabs.Root>
</div>
</div>
