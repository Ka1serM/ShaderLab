<script lang="ts">
import { Input } from "$lib/components/ui/input/index.js";
import Search from "phosphor-svelte/lib/MagnifyingGlassIcon";
import { resolve } from "$app/paths";
import LibraryCard from '$lib/components/LibraryCard.svelte';
import { reveal, writeIn } from '$lib/actions/motion';

let { data } = $props();
let query = $state("");

const filteredTasks = $derived(
  data.taskCatalog.filter(task => data.searchText[task.id].includes(query.toLowerCase()))
);
</script>

<div class="library-page">
  <div class="library-toolbar motion-reveal" use:reveal>
    <div>
      <p class="library-kicker">HSD Computer Graphics Lab</p>
      <h1 class="library-title motion-letters" use:writeIn={{ delay: 90, step: 38 }}>Tasks</h1>
      <p class="library-description">Build shaders, run them instantly, and compare them with a reference.</p>
    </div>
    <div class="library-search relative">
      <Search class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
      <Input
        type="text"
        placeholder="Filter tasks …"
        bind:value={query}
        class="pl-10 py-6 text-base focus-visible:ring-1"
      />
    </div>
  </div>

  <main class="library-content">
    <div class="library-grid">
      {#if filteredTasks.length > 0}
        {#each filteredTasks as task (task.id)}
          <LibraryCard
            href={resolve(`/task/${task.id}/`)}
            category={task.category}
            title={task.title}
            description={task.description}
            kind="task"
          />
        {/each}
      {:else}
        <p class="text-center text-muted-foreground col-span-full">
          No tasks found.
        </p>
      {/if}
    </div>
  </main>
</div>
