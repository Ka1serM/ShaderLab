<script lang="ts">
  import ControlResetButton from './ControlResetButton.svelte';

  export let value = false;
  export let label = '';
  export let onChange: (value: boolean) => void = () => {};
  export let readOnly = false;
  export let onReset: (() => void) | undefined = undefined;
</script>

<div class="teaching-checkbox-row">
  <label class="teaching-checkbox-control">
    <input aria-label={label} type="checkbox" checked={value} disabled={readOnly} oninput={(event) => onChange((event.currentTarget as HTMLInputElement).checked)} />
    <span class="teaching-checkbox-label">{label}</span>
    <span class="teaching-checkbox-status">{value ? 'Active' : 'Inactive'}</span>
  </label>
  <ControlResetButton {label} {onReset} />
</div>
