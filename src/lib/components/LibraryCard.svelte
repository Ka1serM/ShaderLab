<script lang="ts">
  import BookOpen from 'phosphor-svelte/lib/BookOpenIcon';
  import Presentation from 'phosphor-svelte/lib/PresentationIcon';

  export let href: string;
  export let category = '';
  export let title: string;
  export let description = '';
  export let kind: 'task' | 'teaching' = 'task';
  export let compact = false;
  export let active = false;
</script>

<a {href} class:compact class:active class="library-card library-card-link">
  <span class="library-card-category">
    {#if kind === 'task'}
      <BookOpen class="h-4 w-4" />
    {:else}
      <Presentation class="h-4 w-4" />
    {/if}
    {category}
  </span>
  <strong class="library-card-title">{title}</strong>
  <p>{description}</p>
</a>

<style>
  .library-card-link {
    display: flex;
    flex-direction: column;
    gap: .55rem;
    padding: 1.5rem;
    color: var(--foreground);
    text-decoration: none;
  }

  .library-card-category {
    display: inline-flex;
    align-items: center;
    gap: .5rem;
    color: var(--app-red);
    font-size: .75rem;
    font-weight: 600;
    letter-spacing: .05em;
    text-transform: uppercase;
  }

  .library-card-link p {
    display: -webkit-box;
    margin: 0;
    overflow: hidden;
    color: var(--muted-foreground);
    font-size: .875rem;
    line-height: 1.4;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
  }

  .library-card-link.compact {
    min-height: 8.5rem;
    gap: .35rem;
    padding: .75rem;
  }

  .library-card-link.compact .library-card-category { font-size: .65rem; }
  .library-card-link.compact .library-card-category :global(svg) { width: .875rem; height: .875rem; }
  .library-card-link.compact .library-card-title { font-size: 1rem; }
  .library-card-link.compact p { font-size: .75rem; line-height: 1.3; }

  .library-card-link.active {
    border-color: var(--app-red);
    background: color-mix(in srgb, var(--app-red) 15%, transparent);
  }
</style>
