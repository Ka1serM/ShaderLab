<script lang="ts">
  import ArrowCounterClockwise from 'phosphor-svelte/lib/ArrowCounterClockwiseIcon';

  export let label = '';
  export let onReset: (() => void) | undefined = undefined;
</script>

{#if onReset}
  <button class="teaching-control-reset" type="button" title={`Reset ${label}`} aria-label={`Reset ${label}`} onclick={onReset}><ArrowCounterClockwise /></button>
{/if}
