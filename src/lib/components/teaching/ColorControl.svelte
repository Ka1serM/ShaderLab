<script lang="ts">
  import ControlResetButton from './ControlResetButton.svelte';

  export let value: string | number[] = [0, 0, 0];
  export let label = '';
  export let onChange: (value: number[]) => void = () => {};
  export let readOnly = false;
  export let onReset: (() => void) | undefined = undefined;

  function toHex(v: string | number[]): string {
    if (typeof v === 'string') return v.startsWith('#') ? v : '#000000';
    const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n * 255)));
    return '#' + v.map(n => clamp(n).toString(16).padStart(2, '0')).join('');
  }

  function fromHex(hex: string): number[] {
    const h = hex.replace('#', '');
    return [0, 1, 2].map(i => parseInt(h.slice(i * 2, i * 2 + 2), 16) / 255);
  }

  $: hex = toHex(value);
  $: displayRgb = typeof value === 'string'
    ? value
    : `rgb(${value.map(n => Math.round(n * 255)).join(', ')})`;
</script>

<div class="teaching-control-body">
  <div class="teaching-control-heading"><span class="teaching-control-label">{label}</span><div class="teaching-control-heading-actions"><output class="teaching-control-value">{hex}</output><ControlResetButton {label} {onReset} /></div></div>
  <label class="teaching-color-picker">
    <input aria-label={label} type="color" value={hex} disabled={readOnly} oninput={(event) => onChange(fromHex((event.currentTarget as HTMLInputElement).value))} />
    <span class="teaching-color-rgb">{displayRgb}</span>
  </label>
</div>
