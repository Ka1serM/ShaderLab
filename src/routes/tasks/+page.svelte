<script lang="ts">
import * as Card from "$lib/components/ui/card/index.js";
import { Input } from "$lib/components/ui/input/index.js";
import BookOpen from "phosphor-svelte/lib/BookOpenIcon";
import Search from "phosphor-svelte/lib/MagnifyingGlassIcon";
import { goto } from "$app/navigation";
import { resolve } from "$app/paths"; // <-- use resolve
import tasks from "$lib/data/tasks.json";
import { slugify } from '$lib/utils/slugify';

let query = $state("");

const filteredTasks = $derived(
  tasks.filter(
    (task) =>
      task.title.toLowerCase().includes(query.toLowerCase()) ||
      task.category?.toLowerCase().includes(query.toLowerCase()) ||
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

<div class="library-page">
  <div class="library-toolbar">
    <div>
      <p class="library-kicker">Computergrafik Labor</p>
      <h1 class="library-title">Aufgaben</h1>
      <p class="library-description">Shader entwickeln, direkt ausführen und mit einer Referenz vergleichen.</p>
    </div>
    <div class="library-search relative">
      <Search class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
      <Input
        type="text"
        placeholder="Aufgaben filtern …"
        bind:value={query}
        class="pl-10 py-6 text-base focus-visible:ring-1"
      />
    </div>
  </div>

  <main class="library-content">
    <div class="library-grid">
      {#if filteredTasks.length > 0}
        {#each filteredTasks as task, index (task.title)}
          <Card.Root
            class="library-card cursor-pointer pointer-events-auto"
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
              <div class="mb-2 flex items-center gap-2 text-primary"><BookOpen class="h-4 w-4" /><span class="text-xs uppercase tracking-wide">{task.category}</span></div>
              <Card.Title class="library-card-title font-semibold">
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
          Keine Aufgaben gefunden.
        </p>
      {/if}
    </div>
  </main>
</div>
