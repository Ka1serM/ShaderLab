<script lang="ts">
  import ControlField from './ControlField.svelte';

  let { value = [0, 0, 0], label = '', onChange = () => {}, readOnly = false, onReset }: {
    value?: string | number[];
    label?: string;
    onChange?: (value: number[]) => void;
    readOnly?: boolean;
    onReset?: () => void;
  } = $props();

  function toHex(v: string | number[]): string {
    if (typeof v === 'string') return /^#[0-9a-f]{6}$/i.test(v) ? v : '#000000';
    const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n * 255)));
    return '#' + v.map(n => clamp(n).toString(16).padStart(2, '0')).join('');
  }

  function fromHex(hex: string): number[] {
    const h = hex.replace('#', '');
    return [0, 1, 2].map(i => parseInt(h.slice(i * 2, i * 2 + 2), 16) / 255);
  }

  const hex = $derived(toHex(value));

  // Set as a property, not an attribute: hydration removes a server-rendered
  // value attribute, and a color input warns about the empty value in between.
  const colorValue = (input: HTMLInputElement) => { input.value = hex; };
</script>

<ControlField {label} {onReset}>
  <label class="teaching-color-picker">
    <span class="teaching-color-hex">{hex}</span>
    <input aria-label={label} type="color" {@attach colorValue} disabled={readOnly} oninput={(event) => onChange(fromHex((event.currentTarget as HTMLInputElement).value))} />
  </label>
</ControlField>
