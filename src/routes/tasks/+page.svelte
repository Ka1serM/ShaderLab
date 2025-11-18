<script>
  import * as Card from "$lib/components/ui/card/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Search } from "lucide-svelte";
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import tasks from "$lib/data/tasks.json";
  import { slugify } from '$lib/utils/slugify.js';
  import { writable, derived } from 'svelte/store';

  let query = writable("");
  let loading = writable(true);

  // simulate async load for demo purposes
  let allTasks = [];
  setTimeout(() => {
    allTasks = tasks;
    loading.set(false);
  }, 300);

  const filteredTasks = derived([query, loading], ([$query, $loading]) => {
    if ($loading) return [];
    return allTasks.filter(
      (task) =>
        task.title.toLowerCase().includes($query.toLowerCase()) ||
        task.task.toLowerCase().includes($query.toLowerCase()) ||
        task.theory.toLowerCase().includes($query.toLowerCase())
    );
  });

  function navigateToTask(title) {
    goto(resolve(`/task/${slugify(title)}`));
  }

  // Limit HTML preview length (truncated but keep HTML)
  function getPreviewHTML(html, maxLength = 120) {
    if (!html) return '';
    if (html.length <= maxLength) return html;
    return html.slice(0, maxLength) + '…';
  }
</script>

<div class="flex flex-col bg-background text-foreground h-full">
  <div class="p-6 flex justify-center border-b border-border bg-card/50 backdrop-blur-sm">
    <div class="relative w-full max-w-xl">
      <Search class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
      <Input
        type="text"
        placeholder="Task Filter..."
        bind:value={$query}
        class="pl-10 py-6 rounded-2xl text-base shadow-sm focus-visible:ring-1"
      />
    </div>
  </div>

  <main class="flex-1 min-h-0 overflow-auto p-6">
    <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {#if $loading}
        {#each Array(16) as _, i}
          <Card.Root
            key={i}
            class="pointer-events-none animate-pulse"
          >
            <Card.Header>
              <div class="h-6 w-3/4 bg-muted rounded-md mb-2" />
            </Card.Header>
            <Card.Content>
              <div class="h-4 w-full bg-muted rounded-md mb-1" />
              <div class="h-4 w-full bg-muted rounded-md mb-1" />
              <div class="h-4 w-5/6 bg-muted rounded-md" />
            </Card.Content>
          </Card.Root>
        {/each}
      {:else}
        {#if $filteredTasks.length > 0}
          {#each $filteredTasks as task (task.title)}
            <Card.Root
              class="hover:shadow-md hover:scale-[1.02] transition-all cursor-pointer pointer-events-auto"
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
                {@html getPreviewHTML(task.task)}
              </Card.Content>
            </Card.Root>
          {/each}
        {:else}
          <p class="text-center text-muted-foreground col-span-full">
            No tasks found.
          </p>
        {/if}
      {/if}
    </div>
  </main>
</div>
