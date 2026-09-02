<script lang="ts">
  import { Input } from '$lib/components/ui/input/index.js';
  import Search from 'phosphor-svelte/lib/MagnifyingGlassIcon';
  import { resolve } from '$app/paths';
  import { teaching } from '$lib/content';
  import LibraryCard from '$lib/components/LibraryCard.svelte';
  import { reveal, writeIn } from '$lib/actions/motion';

  let query = $state('');
  const filteredTeaching = $derived(teaching.filter(demo =>
    demo.title.toLowerCase().includes(query.toLowerCase()) ||
    demo.category?.toLowerCase().includes(query.toLowerCase()) ||
    demo.overview.toLowerCase().includes(query.toLowerCase())
  ));

  function preview(html: string, maxLength = 100) {
    const text = html.replace(/<[^>]+>/g, '');
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
  }
</script>

<div class="library-page">
  <div class="library-toolbar motion-reveal" use:reveal>
    <div>
      <p class="library-kicker">HSD Computer Graphics Lab</p>
      <h1 class="library-title motion-letters" use:writeIn={{ delay: 90, step: 38 }}>Teaching demos</h1>
      <p class="library-description">Explore rendering concepts through interactive parameters.</p>
    </div>
    <div class="library-search relative">
      <Search class="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
      <Input bind:value={query} type="text" placeholder="Filter teaching demos …"
        class="py-6 pl-10 text-base focus-visible:ring-1" />
    </div>
  </div>

  <main class="library-content">
    <div class="library-grid">
      {#if filteredTeaching.length}
        {#each filteredTeaching as demo (demo.id)}
          <LibraryCard
            href={resolve(`/teach/${demo.id}/`)}
            category={demo.category}
            title={demo.title}
            description={preview(demo.overview)}
            kind="teaching"
          />
        {/each}
      {:else}
        <p class="col-span-full text-center text-muted-foreground">No teaching demos found.</p>
      {/if}
    </div>
  </main>
</div>
