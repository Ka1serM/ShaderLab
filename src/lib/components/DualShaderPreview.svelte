<script lang="ts">
  import ShaderPreview from './ShaderPreview.svelte';
  import * as THREE from 'three';
  import { taskStore } from '$lib/stores/taskStore';

  let sharedCameraRef: THREE.PerspectiveCamera | null = null;
  let sharedTargetRef = new THREE.Vector3(0, 0, 0);

  let shaderErrors: string[] = [];

  function setShaderErrors(errors: string[]) {
    shaderErrors = errors;
  }
</script>

<div class="relative w-full h-full p-4">
  <div class="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-4 h-full">
    <!-- Reference Shader -->
    <div class="flex flex-col min-h-[200px] md:min-h-0 h-full">
      <h3 class="text-xl font-medium text-muted-background pb-2">Reference</h3>
      <div class="relative flex-1">
        {#if $taskStore.task}
          <ShaderPreview
            task={$taskStore.task}
            vertexShader={$taskStore.task.referenceVertexShader}
            fragmentShader={$taskStore.task.referenceFragmentShader}
            bind:sharedCameraRef
            bind:sharedTargetRef
          />
        {:else}
          <div class="flex items-center justify-center h-full text-muted-foreground">
            loading reference...
          </div>
        {/if}
      </div>
    </div>

    <!-- User Output Shader -->
    <div class="flex flex-col min-h-[200px] md:min-h-0 h-full">
      <h3 class="text-xl font-medium text-muted-background pb-2">Output</h3>
      <div class="relative flex-1">
        {#if $taskStore.task}
          <ShaderPreview
            task={$taskStore.task}
            vertexShader={$taskStore.vertexShader}
            fragmentShader={$taskStore.fragmentShader}
            bind:sharedCameraRef
            bind:sharedTargetRef
            on:error={(e) => setShaderErrors(e.detail)}
          />
        {:else}
          <div class="flex items-center justify-center h-full text-muted-foreground">
            loading output...
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>
