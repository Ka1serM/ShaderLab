<script lang="ts">
  export let value: number[] = [0, 0, 0];
  export let label = '';
  export let min: number | undefined;
  export let max: number | undefined;
  export let step = 0.1;
  export let axes = ['X', 'Y', 'Z'];
  export let readOnly = false;
  export let onChange: (value: number[]) => void = () => {};

  function update(index: number, event: Event) {
    if (readOnly) return;
    const next = [...value];
    next[index] = Number((event.currentTarget as HTMLInputElement).value);
    onChange(next);
  }
</script>

<div class="teaching-control-body"><div class="teaching-control-heading"><span class="teaching-control-label">{label}</span>{#if readOnly}<span class="teaching-readonly">read-only</span>{/if}</div><div class:teaching-vector-grid--four={axes.length === 4} class="teaching-vector-grid">
  {#each axes as axis, index}
    <label class="teaching-vector-field"><span class={`teaching-axis teaching-axis-${axis.toLowerCase()}`}>{axis}</span>
      <input aria-label={`${label} ${axis}`} type="number" {min} {max} {step} value={value[index]} readonly={readOnly} oninput={(event) => update(index, event)} />
    </label>
  {/each}
</div></div>
