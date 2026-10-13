<script lang="ts">
  import ControlField from './ControlField.svelte';
  import { Switch } from '$lib/components/ui/switch';

  export let value = false;
  export let label = '';
  export let onChange: (value: boolean) => void = () => {};
  export let readOnly = false;
  export let onReset: (() => void) | undefined = undefined;
</script>

<ControlField {label} {onReset}>
  <Switch aria-label={label} checked={value} disabled={readOnly} onCheckedChange={onChange} />
</ControlField>
