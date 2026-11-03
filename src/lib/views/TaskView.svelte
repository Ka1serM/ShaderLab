<script lang="ts">
  import { Splitpanes, Pane } from 'svelte-splitpanes';
  import AppTutorial from '$lib/components/AppTutorial.svelte';
  import { useApplication } from '$lib/app/application.svelte';
  import type { Splitter } from '$lib/app/controllers/layout.svelte';
  import TaskPanel from './TaskPanel.svelte';
  import EditorView from './EditorView.svelte';
  import ViewportView from './ViewportView.svelte';

  const app = useApplication();
  const controller = app.task;
  const model = controller.model;
  const layout = app.layout;

  const resized = (splitter: Splitter) => (event: CustomEvent<Array<{ size: number }>>) => layout.resize(splitter, event.detail?.[0]?.size);
</script>

{#if model.task}
  {@const task = model.task}
  <div class="h-full w-full overflow-hidden relative">
    <!-- One layout for every screen. Below the desktop breakpoint, CSS stacks the panes. -->
    <div class="workspace-layout workspace-tree workspace-tree--task h-full w-full">
      <Splitpanes class="splitpanes-root" theme="my-theme" on:resized={resized('outer')}>
        <Pane size={layout.sizes.outer} class="workspace-leaf workspace-leaf--panel">
          <TaskPanel {task} />
        </Pane>
        <Pane size={100 - layout.sizes.outer}>
          <Splitpanes horizontal class="splitpanes-nested" theme="my-theme" on:resized={resized('inner')}>
            <Pane size={layout.sizes.inner} class="workspace-leaf workspace-leaf--editor">
              <EditorView
                stages={task.shaderStages}
                activeStage={model.activeStage}
                diagnostics={model.diagnostics[model.activeStage]}
                onStageChange={stage => controller.setStage(stage)}
                onReset={() => controller.resetShader()}
              />
            </Pane>
            <Pane size={100 - layout.sizes.inner}>
              <div class="workspace-group h-full" data-tutorial="viewports">
                <Splitpanes class="splitpanes-nested" theme="my-theme" on:resized={resized('viewports')}>
                  <Pane size={layout.sizes.viewports} class="workspace-leaf workspace-leaf--reference">
                    <ViewportView viewport={app.viewports.reference} title="Reference" panelId="reference" scenes={task.scenes} sceneIndex={model.sceneIndex} onSelectScene={index => controller.selectScene(index)} transformControls={Boolean(task.overlays?.transformControls)} showTimeControl={task.showTimeControl ?? false} simulation={task.referenceComputeShader !== undefined ? controller.simulation : undefined} />
                  </Pane>
                  <Pane size={100 - layout.sizes.viewports} class="workspace-leaf workspace-leaf--output">
                    <ViewportView viewport={app.viewports.output} title="Output" panelId="output" scenes={task.scenes} sceneIndex={model.sceneIndex} onSelectScene={index => controller.selectScene(index)} transformControls={Boolean(task.overlays?.transformControls)} showTimeControl={task.showTimeControl ?? false} simulation={task.referenceComputeShader !== undefined ? controller.simulation : undefined} />
                  </Pane>
                </Splitpanes>
              </div>
            </Pane>
          </Splitpanes>
        </Pane>
      </Splitpanes>
    </div>

    <AppTutorial mode="task" />

    <div class="pointer-events-none absolute inset-0 z-50" data-panel-maximizer></div>
  </div>
{/if}
