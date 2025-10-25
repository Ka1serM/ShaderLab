<script lang="ts">
  import ShaderPreview from './ShaderPreview.svelte';
  import * as THREE from 'three';
  import { taskStore } from '$lib/stores/taskStore';

  let sharedCameraRef: THREE.PerspectiveCamera | null = null;
  let sharedTargetRef = new THREE.Vector3(0, 0, 0);
  let shaderErrors: string[] = [];

  // Store reference shaders separately, these dont change during editing
  let referenceVertex = '';
  let referenceFragment = '';
  
  // Update reference shaders only when task changes, not when user edits
  $: if ($taskStore.task) {
    referenceVertex = $taskStore.task.referenceVertexShader;
    referenceFragment = $taskStore.task.referenceFragmentShader;
  }

  function setShaderErrors(errors: string[]) {
    shaderErrors = errors;
  }
</script>

<div class="relative w-full h-full px-4 pt-4">
  <div class="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-4 h-full">
    <!-- Reference Shader - Only recompiles when task changes -->
    <div class="flex flex-col min-h-[200px] md:min-h-0 h-full">
      <h3 class="text-xl font-medium text-muted-background pb-2">Reference</h3>
      <div class="relative flex-1">
        {#if $taskStore.task}
          <ShaderPreview
            task={$taskStore.task}
            vertexShader={referenceVertex}
            fragmentShader={referenceFragment}
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

    <!-- User Output Shader - Recompiles on every edit -->
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