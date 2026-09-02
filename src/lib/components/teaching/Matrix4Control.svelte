<script lang="ts">
  import { onDestroy } from 'svelte';

  export let value: number[] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  export let label = '';
  export let step = 0.1;
  export let readOnly = false;
  export let onChange: (value: number[]) => void = () => {};

  let recentlyChanged = new Set<number>();
  let clearChangeHighlight: ReturnType<typeof setTimeout> | undefined;

  function format(entry: number) {
    return String(Math.round(entry * 1000) / 1000);
  }

  /** Mirrors external changes (gizmo drags, presets) into the input without overwriting what is being typed. */
  function markChanged(index: number) {
    recentlyChanged = new Set([...recentlyChanged, index]);
    if (clearChangeHighlight) clearTimeout(clearChangeHighlight);
    clearChangeHighlight = setTimeout(() => recentlyChanged = new Set(), 700);
  }

  function sync(node: HTMLInputElement, { entry, index }: { entry: number; index: number }) {
    let current = entry;
    const apply = () => {
      if (document.activeElement === node) return;
      const text = format(current);
      if (node.value !== text) node.value = text;
    };
    node.addEventListener('blur', apply);
    apply();
    return {
      update(next: { entry: number; index: number }) {
        if (Math.abs(next.entry - current) >= 0.0005) markChanged(next.index);
        current = next.entry;
        apply();
      },
      destroy() {
        node.removeEventListener('blur', apply);
      }
    };
  }

  function update(row: number, column: number, event: Event) {
    if (readOnly) return;
    const entry = Number((event.currentTarget as HTMLInputElement).value);
    // Intermediate input like "-" parses to NaN and would poison the gizmo transform.
    if (!Number.isFinite(entry)) return;
    const next = [...value];
    next[column * 4 + row] = entry;
    onChange(next);
  }

  onDestroy(() => clearChangeHighlight && clearTimeout(clearChangeHighlight));
</script>

<div class="teaching-control-body">
  <div class="teaching-control-heading"><span class="teaching-control-label">{label}</span>{#if readOnly}<span class="teaching-readonly">read-only</span>{/if}</div>
  <div class="teaching-matrix-grid">
    {#each [0, 1, 2, 3] as row}
      {#each [0, 1, 2, 3] as column}
        <input
          aria-label={`${label}, row ${row + 1}, column ${column + 1}`}
          type="number"
          {step}
          readonly={readOnly}
          use:sync={{ entry: value[column * 4 + row] ?? 0, index: column * 4 + row }}
          oninput={(event) => update(row, column, event)}
          class="teaching-matrix-input"
          class:teaching-matrix-input--changed={recentlyChanged.has(column * 4 + row)}
        />
      {/each}
    {/each}
  </div>
</div>
