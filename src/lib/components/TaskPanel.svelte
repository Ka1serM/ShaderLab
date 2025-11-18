<script>
import * as Tabs from "$lib/components/ui/tabs/index.js";
import * as Collapsible from "$lib/components/ui/collapsible/index.js";
import { ChevronDown, Lightbulb } from "lucide-svelte";

export let taskVM;

let openHints = [];
let activeTab = 'task';

// Reset UI state when a new task is loaded
$: if ($taskVM?.task) {
  openHints = [];
  activeTab = 'task';
}

function toggleHint(index, open) {
  if (open) openHints = [...openHints, index];
  else openHints = openHints.filter(i => i !== index);
}

function isHintOpen(index) {
  return openHints.includes(index);
}
</script>

<div class="h-full flex flex-col overflow-hidden">
  <div class="flex items-center justify-between p-6 shrink-0">
    {#if $taskVM.task}
      <h1 class="text-2xl font-bold text-foreground">
        {$taskVM.task.title}
      </h1>
    {:else}
      <div class="text-muted-foreground">Loading task...</div>
    {/if}
  </div>

  {#if $taskVM.task}
    <Tabs.Root bind:value={activeTab} class="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div class="flex items-center border-b px-6">
        <Tabs.List class="h-10 justify-start bg-muted/25 p-0 gap-0">
          <Tabs.Trigger value="task" class="h-10 px-4 border-none data-[state=active]:bg-background hover:bg-muted/50 transition-colors">
            Task
          </Tabs.Trigger>
          <Tabs.Trigger value="theory" class="h-10 px-4 border-none data-[state=active]:bg-background hover:bg-muted/50 transition-colors">
            Theory
          </Tabs.Trigger>
        </Tabs.List>
      </div>

      <Tabs.Content value="task" class="flex-1 h-0 overflow-y-auto overflow-x-hidden p-6 mt-0 space-y-4 data-[state=inactive]:hidden">
        <div class="prose prose-neutral dark:prose-invert max-w-none text-foreground">
          {@html $taskVM.task.task}
        </div>

        {#if $taskVM.task.hints?.length > 0}
        <div class="space-y-2 mt-6">
          <div class="flex items-center gap-2 mb-3">
            <Lightbulb class="w-4 h-4 text-primary" />
            <h4 class="text-sm font-semibold text-foreground">Tipps</h4>
          </div>

          {#each $taskVM.task.hints as hint, index}
            <Collapsible.Root open={isHintOpen(index)} onOpenChange={open => toggleHint(index, open)}>
              <Collapsible.Trigger class="flex items-center justify-between w-full p-3 bg-secondary hover:bg-muted rounded-lg transition-smooth text-left">
                <span class="text-sm text-foreground">Tipp {index + 1}</span>
                <ChevronDown class="w-4 h-4 text-muted-background transition-transform" style="transform: rotate({isHintOpen(index) ? 180 : 0}deg);" />
              </Collapsible.Trigger>
              <Collapsible.Content class="px-3 py-2">
                <p class="text-sm text-muted-background">{hint}</p>
              </Collapsible.Content>
            </Collapsible.Root>
          {/each}
        </div>
        {/if}
      </Tabs.Content>

      <Tabs.Content value="theory" class="flex-1 h-0 overflow-y-auto overflow-x-hidden p-6 mt-0 space-y-4 data-[state=inactive]:hidden">
        <div class="prose prose-sm dark:prose-invert max-w-full">
          {@html $taskVM.task.theory}
        </div>
      </Tabs.Content>
    </Tabs.Root>
  {/if}
</div>
