<script lang="ts">
  import ControlField from './ControlField.svelte';
  import { Slider } from '$lib/components/ui/slider';

  export let value = 0;
  export let label = '';
  export let min = 0;
  export let max = 1;
  export let step = 0.01;
  export let readOnly = false;
  export let onChange: (value: number) => void = () => {};
  export let onReset: (() => void) | undefined = undefined;
</script>

<ControlField {label} {onReset}>
  {#if !readOnly}
    <Slider type="single" aria-label={label} {min} {max} {step} {value} onValueChange={onChange} class="py-1.5 [&_[data-slot=slider-range]]:bg-foreground [&_[data-slot=slider-thumb]]:border-foreground [&_[data-slot=slider-thumb]]:ring-foreground/15" />
  {/if}
  <output class="teaching-control-value">{value.toFixed(step < 1 ? 2 : 0)}</output>
</ControlField>
