<script lang="ts">
  import ControlResetButton from './ControlResetButton.svelte';

  export let label = '';
  export let onReset: (() => void) | undefined = undefined;
  /** Puts the editor below the label, for editors too wide to share a row with it. */
  export let stacked = false;
</script>

<div class="teaching-control" class:teaching-control--stacked={stacked}>
  <span class="teaching-control-label">{label}</span>
  <div class="teaching-control-editor"><slot /></div>
  <ControlResetButton {label} {onReset} />
</div>
