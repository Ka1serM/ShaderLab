<script lang="ts">
  import { Maximize, Minimize } from 'lucide-svelte';

  export let isMaximized = false;
  export let onClick: () => void = () => {};
</script>

<button
  class="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
  title={isMaximized ? 'Minimize' : 'Maximize'}
  onclick={onClick}
>
  {#if isMaximized}
    <Minimize class="h-4 w-4" />
  {:else}
    <Maximize class="h-4 w-4" />
  {/if}
</button>
