<script lang="ts">
  import { Splitpanes, Pane } from 'svelte-splitpanes';
  import AppTutorial from '$lib/components/AppTutorial.svelte';
  import { useApplication } from '$lib/app/application.svelte';
  import type { Splitter } from '$lib/app/controllers/layout.svelte';
  import TeachingPanel from './TeachingPanel.svelte';
  import EditorView from './EditorView.svelte';
  import ViewportView from './ViewportView.svelte';

  const app = useApplication();
  const controller = app.teaching;
  const model = controller.model;
  const layout = app.layout;

  const resized = (splitter: Splitter) => (event: CustomEvent<Array<{ size: number }>>) => layout.resize(splitter, event.detail?.[0]?.size);
</script>

{#if model.definition}
  {@const definition = model.definition}
  <div class="h-full w-full relative">
    <div class="workspace-layout workspace-tree h-full w-full">
      <Splitpanes class="splitpanes-root" theme="my-theme" on:resized={resized('outer')}>
        <Pane size={layout.sizes.outer} class="workspace-leaf workspace-leaf--panel">
          <TeachingPanel {definition} />
        </Pane>
        <Pane size={100 - layout.sizes.outer}>
          <Splitpanes horizontal class="splitpanes-nested" theme="my-theme" on:resized={resized('inner')}>
            <Pane size={layout.sizes.inner} class="workspace-leaf workspace-leaf--editor">
              <EditorView
                stages={definition.shaderStages}
                activeStage={model.activeStage}
                diagnostics={model.diagnostics[model.activeStage]}
                onStageChange={stage => controller.setStage(stage)}
                onReset={() => controller.resetShader()}
              />
            </Pane>
            <Pane size={100 - layout.sizes.inner} class="workspace-leaf workspace-leaf--output">
              <ViewportView viewport={app.viewports.output} title="Output" panelId="output" scenes={definition.scenes} sceneIndex={model.sceneIndex} onSelectScene={index => controller.selectScene(index)} transformControls={Boolean(model.overlays?.transformControls)} normals={Boolean(model.overlays?.normals)} showTimeControl={definition.showTimeControl ?? false} />
            </Pane>
          </Splitpanes>
        </Pane>
      </Splitpanes>
    </div>

    <AppTutorial mode="teaching" />

    <div class="pointer-events-none absolute inset-0 z-50" data-panel-maximizer></div>
  </div>
{/if}
