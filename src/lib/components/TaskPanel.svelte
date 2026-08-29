<script lang="ts">
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import * as Collapsible from "$lib/components/ui/collapsible/index.js";
  import ChevronDown from "phosphor-svelte/lib/CaretDownIcon";
  import Lightbulb from "phosphor-svelte/lib/LightbulbIcon";
  import { taskStore } from "$lib/stores/taskStore";
  import MaximizeButton from "./MaximizeButton.svelte";
  import { maximizedPanel } from "$lib/stores/panelStore";
  import { maximizable } from '$lib/actions/maximizable';

  let activeTab = 'task';
  const panelId = 'instructions';
  let openHints: number[] = [];

  function toggleMaximize() {
    $maximizedPanel = $maximizedPanel === panelId ? null : panelId;
  }

  function toggleHint(index: number, open: boolean) {
    if (open) openHints = [...openHints, index];
    else openHints = openHints.filter(i => i !== index);
  }

  function isHintOpen(index: number) {
    return openHints.includes(index);
  }
</script>

<div class="workspace-panel">
<div use:maximizable={{ active: $maximizedPanel === panelId }} class="app-panel h-full flex flex-col overflow-hidden" data-tutorial="instructions">
  <!-- Header -->
  <div class="app-panel-header flex items-center justify-between shrink-0">
    {#if $taskStore?.task}
      <h1 class="app-panel-title text-2xl font-bold text-foreground">
        {$taskStore.task.title}
      </h1>
    {:else}
      <div class="text-muted-foreground">Aufgabe wird geladen …</div>
    {/if}
    <MaximizeButton isMaximized={$maximizedPanel === panelId} onClick={toggleMaximize} />
  </div>

  <!-- Tabs -->
  {#if $taskStore?.task}
    <Tabs.Root
      value="task"
      class="flex-1 flex flex-col min-h-0 overflow-hidden"
      onValueChange={(v) => activeTab = v}
    >
      <!-- Tab List -->
      <div class="flex items-center px-4">
        <Tabs.List class="h-10 justify-start bg-muted/25 p-0 gap-0">
          <Tabs.Trigger 
            value="task" 
            class="h-10 px-4 border-none data-[state=active]:bg-background hover:bg-muted/50 transition-colors"
          >
            Aufgabe
          </Tabs.Trigger>
          <Tabs.Trigger 
            value="theory" 
            class="h-10 px-4 border-none data-[state=active]:bg-background hover:bg-muted/50 transition-colors"
          >
            Theorie
          </Tabs.Trigger>
        </Tabs.List>
      </div>

      <!-- Task Tab -->
      <Tabs.Content
        value="task"
        class="flex-1 h-0 overflow-y-auto overflow-x-hidden p-4 mt-0 space-y-4 data-[state=inactive]:hidden"
      >
        <div class="prose prose-neutral dark:prose-invert max-w-none text-foreground">
          {@html $taskStore.task.task}
        </div>

        {#if $taskStore.task.hints?.length > 0}
          <div class="space-y-2 mt-6">
            <div class="flex items-center gap-2 mb-3">
              <Lightbulb class="w-4 h-4 text-primary" />
              <h4 class="text-sm font-semibold text-foreground">Tipps</h4>
            </div>

            {#each $taskStore.task.hints as hint, index}
              <Collapsible.Root
                open={isHintOpen(index)}
                onOpenChange={(open) => toggleHint(index, open)}
              >
                <Collapsible.Trigger
                  class="flex items-center justify-between w-full p-3 bg-secondary hover:bg-muted rounded-lg transition-smooth text-left"
                >
                  <span class="text-sm text-foreground">Tipp {index + 1}</span>
                  <ChevronDown
                    class="w-4 h-4 text-muted-background transition-transform"
                    style="transform: rotate({isHintOpen(index) ? 180 : 0}deg);"
                  />
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

      <!-- Theory Tab -->
      <Tabs.Content
        value="theory"
        class="flex-1 h-0 overflow-y-auto overflow-x-hidden p-4 mt-0 space-y-4 data-[state=inactive]:hidden"
      >
        <div class="prose prose-neutral dark:prose-invert max-w-none text-foreground">
          {@html $taskStore.task.theory}
        </div>
      </Tabs.Content>
    </Tabs.Root>
  {/if}
</div>
</div>
