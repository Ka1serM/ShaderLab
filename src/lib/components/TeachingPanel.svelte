<script lang="ts">
  import TeachingControls from './TeachingControls.svelte';
  import MaximizeButton from './MaximizeButton.svelte';
  import ResetButton from './ResetButton.svelte';
  import { maximizedPanel } from '$lib/stores/panelStore';
  import { maximizable } from '$lib/actions/maximizable';
  import { teachingStore, type TeachingControl, type TeachingDefinition, type TeachingValue } from '$lib/stores/teachingStore';

  export let definition: TeachingDefinition;
  export let controls: TeachingControl[] = [];
  export let values: Record<string, TeachingValue> = {};

  const panelId = 'controls';

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
      <ResetButton description="Alle Parameter auf ihre Ausgangswerte zurücksetzen?" onReset={teachingStore.resetValues} />
    </div>
  </div>
  <div class="flex-1 min-h-0 overflow-y-auto p-0">
    <TeachingControls {definition} {controls} {values} />
  </div>
</div>
</div>
