<script lang="ts">
  import TeachingControls from './TeachingControls.svelte';
  import * as Tabs from '$lib/components/ui/tabs';
  import MaximizeButton from './MaximizeButton.svelte';
  import ResetButton from './ResetButton.svelte';
  import { maximizedPanel } from '$lib/stores/panelStore';
  import { maximizable } from '$lib/actions/maximizable';
  import { teachingStore, type Teach, type TeachingControl, type TeachingValue } from '$lib/stores/teachingStore';

  export let definition: Teach;
  export let controls: TeachingControl[] = [];
  export let values: Record<string, TeachingValue> = {};

  const panelId = 'controls';
  let activeTab = 'parameters';

  function toggleMaximize() {
    $maximizedPanel = $maximizedPanel === panelId ? null : panelId;
  }
</script>

<div use:maximizable={{ active: $maximizedPanel === panelId }} class="workspace-panel">
<div class="app-panel h-full flex flex-col overflow-hidden" data-tutorial="instructions">
  <div class="teaching-panel-header app-panel-header flex items-center justify-between shrink-0">
    <h1 class="app-panel-title text-2xl font-bold text-foreground">{definition.title}</h1>
    <div class="flex items-center gap-1">
      <MaximizeButton isMaximized={$maximizedPanel === panelId} onClick={toggleMaximize} />
      <ResetButton description="Reset all parameters to their defaults?" onReset={teachingStore.resetValues} />
    </div>
  </div>
  <Tabs.Root value={activeTab} class="flex flex-1 min-h-0 flex-col overflow-hidden" onValueChange={(value) => activeTab = value}>
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
      <TeachingControls {definition} {controls} {values} />
    </Tabs.Content>

    <Tabs.Content value="theory" class="mt-0 h-0 flex-1 overflow-x-hidden overflow-y-auto p-0 data-[state=inactive]:hidden">
      <div class="prose prose-neutral dark:prose-invert max-w-none text-foreground">
        {@html definition.explanation}
      </div>
    </Tabs.Content>
  </Tabs.Root>
</div>
</div>
