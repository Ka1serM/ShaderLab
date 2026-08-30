<script lang="ts">
  import { onMount } from 'svelte';
  import TopNavigation from '$lib/components/TopNavigation.svelte';
  import { ModeWatcher } from "mode-watcher";
  import { checkStorageVersion } from '$lib/config';
  import { Toaster } from '$lib/components/ui/sonner';
  import { toast } from 'svelte-sonner';
  import '../App.css';

  checkStorageVersion();

  let isPreparingOfflineCache = false;

  onMount(() => {
    const isStandaloneApp = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!isStandaloneApp || !('serviceWorker' in navigator) || navigator.serviceWorker.controller) return;
    isPreparingOfflineCache = true;
    let completed = false;
    const timeout = window.setTimeout(() => {
      if (!completed) toast.error('Offline-Inhalte konnten nicht vollständig geladen werden.');
    }, 90_000);
    navigator.serviceWorker.ready.then(() => {
      completed = true;
      window.clearTimeout(timeout);
      isPreparingOfflineCache = false;
      toast.success('ShaderLab ist jetzt vollständig offline bereit.');
    }).catch(() => {
      completed = true;
      window.clearTimeout(timeout);
      isPreparingOfflineCache = false;
      toast.error('Offline-Inhalte konnten nicht vollständig geladen werden.');
    });
    return () => window.clearTimeout(timeout);
  });
</script>

<!-- Global tracker for the theme. -->
<ModeWatcher defaultMode="light" />
<Toaster />
<div class="app-shell flex flex-col overflow-hidden">
  <TopNavigation />
  <main class="app-main flex min-h-0 flex-1 flex-col overflow-hidden">
    <slot />
  </main>
</div>

{#if isPreparingOfflineCache}
  <div class="offline-cache-status" role="status" aria-live="polite">
    <span class="offline-cache-spinner" aria-hidden="true"></span>
    Offline-Inhalte werden heruntergeladen …
  </div>
{/if}
