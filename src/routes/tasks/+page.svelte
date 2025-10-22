<script lang="ts">
import * as Card from "$lib/components/ui/card/index.js";
import { Input } from "$lib/components/ui/input/index.js";
import { Search } from "lucide-svelte";
import { goto } from "$app/navigation";
import { resolve } from "$app/paths"; // <-- use resolve
import tasks from "$lib/data/tasks.json";
import { slugify } from '$lib/utils/slugify';

let query = $state("");

const filteredTasks = $derived(
  tasks.filter(
    (task) =>
      task.title.toLowerCase().includes(query.toLowerCase()) ||
      task.task.toLowerCase().includes(query.toLowerCase()) ||
      task.theory.toLowerCase().includes(query.toLowerCase())
  )
);

function navigateToTask(title: string) {
  goto(resolve(`/task/${slugify(title)}`));
}

function getPreview(html: string, maxLength: number = 90): string {
  const text = html.replace(/<[^>]+>/g, "");
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}
</script>

<div class="flex flex-col bg-background text-foreground h-full">
  <!-- Search bar -->
  <div class="p-6 flex justify-center border-b border-border bg-card/50 backdrop-blur-sm">
    <div class="relative w-full max-w-xl">
      <Search class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
      <Input
        type="text"
        placeholder="Task Filter..."
        bind:value={query}
        class="pl-10 py-6 rounded-2xl text-base shadow-sm focus-visible:ring-1"
      />
    </div>
  </div>

  <!-- Tasks Grid -->
  <main class="flex-1 min-h-0 overflow-auto p-6">
    <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {#if filteredTasks.length > 0}
        {#each filteredTasks as task, index (task.title)}
          <Card.Root
            class="hover:shadow-md hover:scale-[1.02] transition-all cursor-pointer"
            onclick={() => navigateToTask(task.title)}
            role="button"
            tabindex={0}
            onkeydown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                navigateToTask(task.title);
              }
            }}
          >
            <Card.Header>
              <Card.Title class="text-lg font-semibold">
                {task.title}
              </Card.Title>
            </Card.Header>
            <Card.Content class="text-sm text-muted-foreground line-clamp-3">
              {getPreview(task.task)}
            </Card.Content>
          </Card.Root>
        {/each}
      {:else}
        <p class="text-center text-muted-foreground col-span-full">
          No tasks found.
        </p>
      {/if}
    </div>
  </main>
</div>