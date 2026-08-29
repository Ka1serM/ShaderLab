<script lang="ts">
  export let value: number[] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  export let label = '';
  export let step = 0.1;
  export let readOnly = false;
  export let onChange: (value: number[]) => void = () => {};

  function format(entry: number) {
    return String(Math.round(entry * 1000) / 1000);
  }

  /** Mirrors external changes (gizmo drags, presets) into the input without overwriting what is being typed. */
  function sync(node: HTMLInputElement, entry: number) {
    let current = entry;
    const apply = () => {
      if (document.activeElement === node) return;
      const text = format(current);
      if (node.value !== text) node.value = text;
    };
    node.addEventListener('blur', apply);
    apply();
    return {
      update(next: number) {
        current = next;
        apply();
      },
      destroy() {
        node.removeEventListener('blur', apply);
      }
    };
  }

  function update(row: number, column: number, event: Event) {
    const entry = Number((event.currentTarget as HTMLInputElement).value);
    // Intermediate input like "-" parses to NaN and would poison the gizmo transform.
    if (!Number.isFinite(entry)) return;
    const next = [...value];
    next[column * 4 + row] = entry;
    onChange(next);
  }
</script>

<div class="teaching-control-body">
  <div class="teaching-control-heading"><span class="teaching-control-label">{label}</span>{#if readOnly}<span class="teaching-readonly">nur lesbar</span>{/if}</div>
  <div class="teaching-matrix-grid">
    {#each [0, 1, 2, 3] as row}
      {#each [0, 1, 2, 3] as column}
        <input
          aria-label={`${label}, Zeile ${row + 1}, Spalte ${column + 1}`}
          type="number"
          {step}
          readonly={readOnly}
          use:sync={value[column * 4 + row] ?? 0}
          oninput={(event) => update(row, column, event)}
          class="teaching-matrix-input"
        />
      {/each}
    {/each}
  </div>
</div>
