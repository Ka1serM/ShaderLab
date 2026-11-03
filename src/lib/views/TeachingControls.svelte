<script lang="ts">
  import SliderControl from '$lib/components/teaching/SliderControl.svelte';
  import ColorControl from '$lib/components/teaching/ColorControl.svelte';
  import Vector3Control from '$lib/components/teaching/Vector3Control.svelte';
  import CheckboxControl from '$lib/components/teaching/CheckboxControl.svelte';
  import Matrix4Control from '$lib/components/teaching/Matrix4Control.svelte';
  import OptionsControl from '$lib/components/teaching/OptionsControl.svelte';
  import { useApplication } from '$lib/app/application.svelte';
  import type { Teach, TeachingControl, TeachingValue } from '$lib/app/types';

  let { definition, controls, values }: {
    definition: Teach;
    controls: TeachingControl[];
    values: Record<string, TeachingValue>;
  } = $props();

  const controller = useApplication().teaching;
</script>

<div class="teaching-controls">
  {#if !controls.length}
    <p class="teaching-empty">No parameters yet. Mark a uniform with <code>// @control</code> in the editor to add a control here.</p>
  {/if}
  {#each controls.filter(control => !control.hidden) as control (control.id)}
    {@const current = values[control.id] ?? control.default}
    {@const reset = control.uniform ? () => controller.resetValue(control.id) : undefined}
    {@const set = (value: TeachingValue) => controller.setValue(control.id, value)}
    <div>
      {#if control.type === 'slider'}
        <SliderControl label={control.label} value={current as number} min={control.min ?? 0} max={control.max ?? 1} step={control.step ?? 0.01} readOnly={control.readOnly ?? false} onChange={set} onReset={reset} />
      {:else if control.type === 'color'}
        <ColorControl label={control.label} value={current as string | number[]} readOnly={control.readOnly ?? false} onChange={set} onReset={reset} />
      {:else if control.type === 'checkbox'}
        <CheckboxControl label={control.label} value={current as boolean} readOnly={control.readOnly ?? false} onChange={set} onReset={reset} />
      {:else if control.type === 'options'}
        <OptionsControl label={control.label} value={current as number} options={control.options ?? []} readOnly={control.readOnly ?? false} onChange={set} onReset={reset} />
      {:else if control.type === 'matrix4'}
        <Matrix4Control label={control.label} value={current as number[]} step={control.step ?? 0.1} readOnly={control.readOnly ?? false} onChange={set} onReset={reset} />
      {:else}
        <Vector3Control label={control.label} value={current as number[]} axes={control.type === 'vector4' ? ['L', 'R', 'B', 'T'] : ['X', 'Y', 'Z']} min={control.min} max={control.max} step={control.step ?? 0.1} readOnly={control.readOnly ?? false} onChange={set} onReset={reset} />
      {/if}
    </div>
  {/each}

  {#if definition.presets?.length}
    <div class="teaching-presets">
      <p class="teaching-presets-title">Presets</p>
      <div class="teaching-presets-list">
        {#each definition.presets as preset}
          <button class="teaching-preset" onclick={() => controller.applyPreset(preset.values)}>{preset.name}</button>
        {/each}
      </div>
    </div>
  {/if}
</div>
