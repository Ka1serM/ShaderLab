<script lang="ts">
  export let value = 0;
  export let label = '';
  export let min = 0;
  export let max = 1;
  export let step = 0.01;
  export let readOnly = false;
  export let onChange: (value: number) => void = () => {};
</script>

<div class="teaching-control-body">
  <div class="teaching-control-heading"><span class="teaching-control-label">{label}</span><output class="teaching-control-value">{value.toFixed(step < 1 ? 2 : 0)}</output></div>
  {#if !readOnly}
    <input aria-label={label} type="range" {min} {max} {step} {value} oninput={(event) => onChange(Number((event.currentTarget as HTMLInputElement).value))} class="teaching-range" />
  {/if}
</div>
