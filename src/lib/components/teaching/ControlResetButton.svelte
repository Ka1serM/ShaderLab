<script lang="ts">
  export let label = '';
  export let onReset: (() => void) | undefined = undefined;
</script>

{#if onReset}
  <button class="teaching-control-reset" type="button" title={`Reset ${label}`} aria-label={`Reset ${label}`} onclick={onReset}>↺</button>
{/if}
