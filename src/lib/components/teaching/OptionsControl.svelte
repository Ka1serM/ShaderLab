<script lang="ts">
  import ControlField from './ControlField.svelte';
  import SegmentedControl from '../SegmentedControl.svelte';

  export let value = 0;
  export let label = '';
  export let options: string[] = [];
  export let readOnly = false;
  export let onChange: (value: number) => void = () => {};
  export let onReset: (() => void) | undefined = undefined;
</script>

<ControlField {label} {onReset}>
  <SegmentedControl
    size="small"
    ariaLabel={label}
    value={String(value)}
    options={options.map((option, index) => ({ value: String(index), label: option }))}
    disabled={readOnly}
    onChange={selected => onChange(Number(selected))}
  />
</ControlField>
