<script lang="ts">
  export let value: number[] = [0, 0, 0];
  export let label = '';
  export let min: number | undefined;
  export let max: number | undefined;
  export let step = 0.1;
  export let onChange: (value: number[]) => void = () => {};

  function update(index: number, event: Event) {
    const next = [...value];
    next[index] = Number((event.currentTarget as HTMLInputElement).value);
    onChange(next);
  }
</script>

<div class="teaching-control-body"><span class="teaching-control-label">{label}</span><div class="teaching-vector-grid">
  {#each ['X', 'Y', 'Z'] as axis, index}
    <label class="teaching-vector-field"><span class={`teaching-axis teaching-axis-${axis.toLowerCase()}`}>{axis}</span>
      <input aria-label={`${label} ${axis}`} type="number" {min} {max} {step} value={value[index]} oninput={(event) => update(index, event)} />
    </label>
  {/each}
</div></div>
