<script lang="ts">
  import { onMount } from 'svelte';
  import { afterNavigate } from '$app/navigation';
  import TopNavigation from '$lib/components/TopNavigation.svelte';
  import { ModeWatcher } from "mode-watcher";
  import { checkStorageVersion } from '$lib/config';
  import { Toaster } from '$lib/components/ui/sonner';
  import { toast } from 'svelte-sonner';
  import '../App.css';

  checkStorageVersion();

  let isPreparingOfflineCache = false;
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
    const isStandaloneApp = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!isStandaloneApp || !('serviceWorker' in navigator) || navigator.serviceWorker.controller) {
      return () => {
        window.removeEventListener('shaderlab:replay-page', replayPage);
        document.removeEventListener('click', replayCurrentLink, true);
      };
    }
    isPreparingOfflineCache = true;
    let completed = false;
    const timeout = window.setTimeout(() => {
      if (!completed) toast.error('Offline content could not be downloaded completely.');
    }, 90_000);
    navigator.serviceWorker.ready.then(() => {
      completed = true;
      window.clearTimeout(timeout);
      isPreparingOfflineCache = false;
      toast.success('ShaderLab is now ready to use offline.');
    }).catch(() => {
      completed = true;
      window.clearTimeout(timeout);
      isPreparingOfflineCache = false;
      toast.error('Offline content could not be downloaded completely.');
    });
    return () => {
      window.removeEventListener('shaderlab:replay-page', replayPage);
      document.removeEventListener('click', replayCurrentLink, true);
      window.clearTimeout(timeout);
    };
  });
</script>

<ModeWatcher defaultMode="dark" />
<Toaster />
<div class="app-shell flex flex-col overflow-hidden">
  <TopNavigation />
  <main bind:this={mainElement} class="app-main motion-fade flex min-h-0 flex-1 flex-col overflow-hidden">
    {#key pageReplay}
      <slot />
    {/key}
  </main>
</div>

{#if isPreparingOfflineCache}
  <div class="offline-cache-status" role="status" aria-live="polite">
    <span class="offline-cache-spinner" aria-hidden="true"></span>
    Offline-Inhalte werden heruntergeladen …
  </div>
{/if}
