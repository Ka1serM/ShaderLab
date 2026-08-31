<script lang="ts">
import { Input } from "$lib/components/ui/input/index.js";
import Search from "phosphor-svelte/lib/MagnifyingGlassIcon";
import { resolve } from "$app/paths";
import tasks from "$lib/data/tasks.json";
import { slugify } from '$lib/utils/slugify';
import LibraryCard from '$lib/components/LibraryCard.svelte';
import { reveal, writeIn } from '$lib/actions/motion';

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

function getPreview(html: string, maxLength: number = 90): string {
  const text = html.replace(/<[^>]+>/g, "");
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}
</script>

<div class="library-page">
  <div class="library-toolbar motion-reveal" use:reveal>
    <div>
      <p class="library-kicker">Computergrafik Labor HSD</p>
      <h1 class="library-title motion-letters" use:writeIn={{ delay: 90, step: 38 }}>Aufgaben</h1>
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
        {#each filteredTasks as task (task.title)}
          <LibraryCard
            href={resolve(`/task/${slugify(task.title)}`)}
            category={task.category}
            title={task.title}
            description={getPreview(task.task)}
            kind="task"
          />
        {/each}
      {:else}
        <p class="text-center text-muted-foreground col-span-full">
          Keine Aufgaben gefunden.
        </p>
      {/if}
    </div>
  </main>
</div>
