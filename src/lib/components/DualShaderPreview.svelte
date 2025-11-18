<script>
  import ShaderPreview from './ShaderPreview.svelte';
  import * as THREE from 'three';
  export let taskVM;

  let sharedCameraRef = null;
  let sharedTargetRef = null;
</script>

<div class="relative w-full h-full px-4 pt-4">
  <div class="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">

    <!-- Reference Shader -->
    <div class="flex flex-col min-h-[200px] md:min-h-0 h-full">
      <h3 class="text-xl font-medium text-muted-background pb-2">Reference</h3>
      <div class="relative flex-1">
        {#if taskVM.task}
          <ShaderPreview
            task={taskVM.task}
            inputs={taskVM.session.inputs}
            vertexShader={taskVM.task.starterVertexShader}
            fragmentShader={taskVM.task.starterFragmentShader}
            bind:sharedCameraRef
            bind:sharedTargetRef
          />
        {:else}
          <div class="flex items-center justify-center h-full text-muted-foreground">
            Loading reference...
          </div>
        {/if}
      </div>
    </div>

    <!-- User Output Shader -->
    <div class="flex flex-col min-h-[200px] md:min-h-0 h-full">
      <h3 class="text-xl font-medium text-muted-background pb-2">Output</h3>
      <div class="relative flex-1">
        {#if taskVM.session}
          <ShaderPreview
            task={taskVM.task}
            inputs={taskVM.session.inputs}
            vertexShader={taskVM.session.vertexShader}
            fragmentShader={taskVM.session.fragmentShader}
            bind:sharedCameraRef
            bind:sharedTargetRef
            on:error={(e) => {
              taskVM.session.shaderErrors.vertex.set(e.detail.vertex || []);
              taskVM.session.shaderErrors.fragment.set(e.detail.fragment || []);
            }}
          />
        {:else}
          <div class="flex items-center justify-center h-full text-muted-foreground">
            Loading output...
          </div>
        {/if}
      </div>
    </div>

  </div>
</div>
