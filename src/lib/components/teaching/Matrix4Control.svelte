<script lang="ts">
  import { onDestroy } from 'svelte';
  import ControlField from './ControlField.svelte';
  import { enteredNumber, mirrorNumber } from '$lib/actions/mirrorNumber';

  export let value: number[] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  export let label = '';
  export let step = 0.1;
  export let readOnly = false;
  export let onChange: (value: number[]) => void = () => {};
  export let onReset: (() => void) | undefined = undefined;

  let recentlyChanged = new Set<number>();
  let clearChangeHighlight: ReturnType<typeof setTimeout> | undefined;

  function markChanged(index: number) {
    recentlyChanged = new Set([...recentlyChanged, index]);
    if (clearChangeHighlight) clearTimeout(clearChangeHighlight);
    clearChangeHighlight = setTimeout(() => recentlyChanged = new Set(), 700);
  }

  function update(row: number, column: number, event: Event) {
    if (readOnly) return;
    const entry = enteredNumber(event.currentTarget as HTMLInputElement);
    if (entry === null) return;
    const next = [...value];
    next[column * 4 + row] = entry;
    onChange(next);
  }

  onDestroy(() => clearChangeHighlight && clearTimeout(clearChangeHighlight));
</script>

<ControlField {label} {onReset} stacked>
  <div class="teaching-matrix-grid">
    {#each [0, 1, 2, 3] as row}
      {#each [0, 1, 2, 3] as column}
        <input
          aria-label={`${label}, row ${row + 1}, column ${column + 1}`}
          type="number"
          {step}
          readonly={readOnly}
          use:mirrorNumber={{ value: value[column * 4 + row] ?? 0, onValueChange: () => markChanged(column * 4 + row) }}
          oninput={(event) => update(row, column, event)}
          class="teaching-matrix-input"
          class:teaching-matrix-input--changed={recentlyChanged.has(column * 4 + row)}
        />
      {/each}
    {/each}
  </div>
</ControlField>
