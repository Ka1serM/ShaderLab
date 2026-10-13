<script lang="ts">
  import { onMount } from 'svelte';
  import { afterNavigate } from '$app/navigation';
  import { navigating } from '$app/state';
  import TopNavigation from '$lib/components/TopNavigation.svelte';
  import { ModeWatcher } from "mode-watcher";
  import { checkStorageVersion } from '$lib/config';
  import { Toaster } from '$lib/components/ui/sonner';
  import '../App.css';

  checkStorageVersion();

  let mainElement: HTMLElement;
  let pageReplay = 0;

  // Keep route transitions opacity-only for WebGL and Monaco workspaces.
  afterNavigate(() => {
    if (!mainElement || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    mainElement.classList.remove('motion-fade');
    void mainElement.offsetWidth;
    mainElement.classList.add('motion-fade');
  });

  onMount(() => {
    const replayPage = () => { pageReplay += 1; };
    const replayCurrentLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target as Element | null;
      const link = target?.closest<HTMLAnchorElement>('a[href]');
      if (!link || link.target || link.hasAttribute('download')) return;
      const destination = new URL(link.href);
      const current = window.location;
      if (destination.origin !== current.origin
        || destination.pathname !== current.pathname
        || destination.search !== current.search
        || destination.hash !== current.hash) return;
      event.preventDefault();
      replayPage();
    };
    window.addEventListener('shaderlab:replay-page', replayPage);
    document.addEventListener('click', replayCurrentLink, true);
    return () => {
      window.removeEventListener('shaderlab:replay-page', replayPage);
      document.removeEventListener('click', replayCurrentLink, true);
    };
  });
</script>

<ModeWatcher defaultMode="dark" />
{#if navigating.to}<div class="navigation-progress" role="progressbar" aria-label="Loading page"></div>{/if}
<Toaster />
<div class="app-shell flex flex-col overflow-hidden">
  <a class="skip-link" href="#main-content">Skip to main content</a>
  <TopNavigation />
  <main id="main-content" bind:this={mainElement} class="app-main motion-fade flex min-h-0 flex-1 flex-col overflow-hidden" tabindex="-1">
    {#key pageReplay}
      <slot />
    {/key}
  </main>
</div>
