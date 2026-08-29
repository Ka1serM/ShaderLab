<script lang="ts">
  import { teachingStore, type TeachingControl, type TeachingDefinition, type TeachingValue } from '$lib/stores/teachingStore';
  import SliderControl from './teaching/SliderControl.svelte';
  import ColorControl from './teaching/ColorControl.svelte';
  import Vector3Control from './teaching/Vector3Control.svelte';
  import CheckboxControl from './teaching/CheckboxControl.svelte';
  import Matrix4Control from './teaching/Matrix4Control.svelte';

  export let definition: TeachingDefinition;
  export let controls: TeachingControl[] = [];
  export let values: Record<string, TeachingValue> = {};
</script>

<div class="teaching-controls">
  {#if !controls.length}
    <p class="teaching-empty">Keine Parameter. Markiere ein Uniform im Editor mit <code>// @control</code>, um hier einen Regler zu erzeugen.</p>
  {/if}
  {#each controls as control (control.id)}
    <!-- Read values inline: a helper call would be untracked and stop reflecting external changes. -->
    {@const current = values[control.id] ?? control.default}
    <div class="teaching-control-slot">
      {#if control.type === 'slider'}
        <SliderControl label={control.label} value={current as number} min={control.min ?? 0} max={control.max ?? 1} step={control.step ?? 0.01} onChange={(value) => teachingStore.setValue(control.id, value)} />
      {:else if control.type === 'color'}
        <ColorControl label={control.label} value={current as string | number[]} onChange={(value) => teachingStore.setValue(control.id, value)} />
      {:else if control.type === 'checkbox'}
        <CheckboxControl label={control.label} value={current as boolean} onChange={(value) => teachingStore.setValue(control.id, value)} />
      {:else if control.type === 'matrix4'}
        <Matrix4Control label={control.label} value={current as number[]} step={control.step ?? 0.1} readOnly={control.readOnly ?? false} onChange={(value) => teachingStore.setValue(control.id, value)} />
      {:else}
        <Vector3Control label={control.label} value={current as number[]} min={control.min} max={control.max} step={control.step ?? 0.1} onChange={(value) => teachingStore.setValue(control.id, value)} />
      {/if}
    </div>
  {/each}

  {#if definition.presets?.length}
    <div class="teaching-presets">
      <p class="teaching-presets-title">Voreinstellungen</p>
      <div class="teaching-presets-list">
        {#each definition.presets as preset}
          <button class="teaching-preset" onclick={() => teachingStore.applyPreset(preset.values)}>{preset.name}</button>
        {/each}
      </div>
    </div>
  {/if}
</div>
