<script lang="ts">
  import ShaderLabLogo from './ShaderLabLogo.svelte';

  let { label }: { label: string } = $props();
</script>

<div class="loading-overlay" role="status" aria-label={label}>
  <ShaderLabLogo animation="spinner" className="h-10 w-10" />
  <span class="sr-only">{label}</span>
</div>

<style>
  /* The short delay keeps loads that finish instantly (cached assets) from flashing a spinner. */
  .loading-overlay {
    position: absolute;
    inset: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    animation: loading-overlay-in .2s ease .15s both;
  }

  @keyframes loading-overlay-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
</style>
