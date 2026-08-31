<script lang="ts">
  import Viewport from './Viewport.svelte';
  import { taskStore } from '$lib/stores/taskStore';
  import MaximizeButton from './MaximizeButton.svelte';
  import ShaderLabLogo from './ShaderLabLogo.svelte';
  import { maximizedPanel } from '$lib/stores/panelStore';

  export let uniformValues: Record<string, number | number[] | boolean> = {};
  export let onMaximize: (panelId: string) => void = () => {};
  export let activeMaximizedPanel: 'reference' | 'output' | null = null;

  let referenceVertex = '';
  let referenceFragment = '';

  $: if ($taskStore.task) {
    referenceVertex = $taskStore.task.referenceVertexShader;
    referenceFragment = $taskStore.task.referenceFragmentShader;
  }
</script>

{#if activeMaximizedPanel}
  <div class="relative w-full h-full">
    {#if activeMaximizedPanel === 'reference'}
      {#if $taskStore.task}
        <Viewport task={$taskStore.task} vertexShader={referenceVertex} fragmentShader={referenceFragment} cameraPose={$taskStore.cameraPose} cameraPoseSaved={$taskStore.cameraPoseSaved} overlays={$taskStore.task.overlays} reportErrors={false} {uniformValues} />
      {:else}
        <div class="flex items-center justify-center h-full" role="status" aria-label="Referenz wird geladen">
          <ShaderLabLogo animation="spinner" className="h-10 w-10" />
          <span class="sr-only">Referenz wird geladen</span>
        </div>
      {/if}
    {:else}
      {#if $taskStore.task}
        <Viewport task={$taskStore.task} vertexShader={$taskStore.vertexShader} fragmentShader={$taskStore.fragmentShader} cameraPose={$taskStore.cameraPose} cameraPoseSaved={$taskStore.cameraPoseSaved} overlays={$taskStore.task.overlays} reportErrors={true} useStudentTemplates={true} {uniformValues} />
      {:else}
        <div class="flex items-center justify-center h-full" role="status" aria-label="Ausgabe wird geladen">
          <ShaderLabLogo animation="spinner" className="h-10 w-10" />
          <span class="sr-only">Ausgabe wird geladen</span>
        </div>
      {/if}
    {/if}
  </div>
{:else}
  <div class="relative w-full h-full px-4 pt-4">
    <div class="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-4 h-full">
      <div class="flex flex-col min-h-[200px] md:min-h-0 h-full">
        <div class="flex items-center justify-between pb-2">
          <h3 class="text-xl font-medium text-muted-background">Referenz</h3>
          <MaximizeButton isMaximized={$maximizedPanel === 'reference'} onClick={() => onMaximize('reference')} />
        </div>
        <div class="relative flex-1">
          {#if $taskStore.task}
            <Viewport task={$taskStore.task} vertexShader={referenceVertex} fragmentShader={referenceFragment} cameraPose={$taskStore.cameraPose} cameraPoseSaved={$taskStore.cameraPoseSaved} overlays={$taskStore.task.overlays} reportErrors={false} {uniformValues} />
          {:else}
            <div class="flex items-center justify-center h-full" role="status" aria-label="Referenz wird geladen">
              <ShaderLabLogo animation="spinner" className="h-10 w-10" />
              <span class="sr-only">Referenz wird geladen</span>
            </div>
          {/if}
        </div>
      </div>

      <div class="flex flex-col min-h-[200px] md:min-h-0 h-full">
        <div class="flex items-center justify-between pb-2">
          <h3 class="text-xl font-medium text-muted-background">Ausgabe</h3>
          <MaximizeButton isMaximized={$maximizedPanel === 'output'} onClick={() => onMaximize('output')} />
        </div>
        <div class="relative flex-1">
          {#if $taskStore.task}
            <Viewport task={$taskStore.task} vertexShader={$taskStore.vertexShader} fragmentShader={$taskStore.fragmentShader} cameraPose={$taskStore.cameraPose} cameraPoseSaved={$taskStore.cameraPoseSaved} overlays={$taskStore.task.overlays} reportErrors={true} useStudentTemplates={true} {uniformValues} />
          {:else}
            <div class="flex items-center justify-center h-full" role="status" aria-label="Ausgabe wird geladen">
              <ShaderLabLogo animation="spinner" className="h-10 w-10" />
              <span class="sr-only">Ausgabe wird geladen</span>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}
