<script lang="ts">
  import * as Card from '$lib/components/ui/card/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import { Search, Presentation } from 'lucide-svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import teaching from '$lib/data/teaching.json';

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
  <div class="library-toolbar">
    <div>
      <p class="library-kicker">Computergrafik Labor</p>
      <h1 class="library-title">Lehr-Demos</h1>
      <p class="library-description">Rendering-Konzepte mit interaktiven Parametern untersuchen und sichtbar machen.</p>
    </div>
    <div class="library-search relative">
      <Search class="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
      <Input bind:value={query} type="text" placeholder="Lehr-Demos filtern …"
        class="py-6 pl-10 text-base focus-visible:ring-1" />
    </div>
  </div>

  <main class="library-content">
    <div class="library-grid">
      {#if filteredTeaching.length}
        {#each filteredTeaching as demo (demo.id)}
          <Card.Root class="library-card cursor-pointer" role="button" tabindex={0}
            onclick={() => goto(resolve(`/teach/${demo.id}`))}
            onkeydown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); goto(resolve(`/teach/${demo.id}`)); } }}>
            <Card.Header>
              <div class="mb-2 flex items-center gap-2 text-primary"><Presentation class="h-4 w-4" /><span class="text-xs uppercase tracking-wide">{demo.category}</span></div>
              <Card.Title class="library-card-title font-semibold">{demo.title}</Card.Title>
            </Card.Header>
            <Card.Content class="line-clamp-3 text-sm text-muted-foreground">{preview(demo.overview)}</Card.Content>
          </Card.Root>
        {/each}
      {:else}
        <p class="col-span-full text-center text-muted-foreground">No teaching demos found.</p>
      {/if}
    </div>
  </main>
</div>
