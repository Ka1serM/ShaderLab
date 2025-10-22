<script lang="ts">
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import * as Collapsible from "$lib/components/ui/collapsible/index.js";
  import { ChevronDown, Lightbulb } from "lucide-svelte";
  import { taskStore } from "$lib/stores/taskStore";

  // Track which hints are open
  let openHints: number[] = [];

  function toggleHint(index: number, open: boolean) {
    if (open) openHints = [...openHints, index];
    else openHints = openHints.filter(i => i !== index);
  }

  function isHintOpen(index: number) {
    return openHints.includes(index);
  }
</script>

<div class="h-full flex flex-col rounded-none overflow-hidden">
  <!-- Header -->
  <div class="flex items-center justify-between p-6 flex-shrink-0">
    {#if $taskStore?.task}
      <h1 class="text-2xl font-bold text-foreground">
        {$taskStore.task.title}
      </h1>
    {:else}
      <div class="text-muted-foreground">Loading task...</div>
    {/if}
  </div>

  <!-- Tabs -->
  {#if $taskStore?.task}
    <Tabs.Root
      value="task"
      class="flex-1 flex flex-col min-h-0 overflow-hidden"
    >
    <div class="flex items-center border-b px-6">
      <Tabs.List
        class="h-10 justify-start bg-muted/25 p-0 gap-0"
      >
        <Tabs.Trigger 
          value="task" 
          class="h-10 px-4 border-none data-[state=active]:bg-background hover:bg-muted/50 transition-colors"
        >
          Task
        </Tabs.Trigger>
        <Tabs.Trigger 
          value="theory" 
          class="h-10 px-4 border-none data-[state=active]:bg-background hover:bg-muted/50 transition-colors"
        >
          Theory
        </Tabs.Trigger>
      </Tabs.List>
    </div>

      <!-- Task Tab -->
      <Tabs.Content
        value="task"
        class="flex-1 h-0 overflow-y-hidden overflow-x-hidden p-6 mt-0 space-y-4 data-[state=inactive]:hidden"
      >
        <div class="prose dark:prose-invert min-w-0 w-full max-w-none">
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
                  <p class="text-sm text-muted-background">{hint}</p>
                </Collapsible.Content>
              </Collapsible.Root>
            {/each}
          </div>
        {/if}
      </Tabs.Content>

      <!-- Theory Tab -->
      <Tabs.Content
        value="theory"
        class="flex-1 h-0 overflow-y-hidden overflow-x-hidden p-6 mt-0 data-[state=inactive]:hidden"
      >
        <div class="prose prose-xl dark:prose-invert min-w-0 w-full max-w-none">
          {@html $taskStore.task.theory}
        </div>
      </Tabs.Content>
    </Tabs.Root>
  {/if}
</div>