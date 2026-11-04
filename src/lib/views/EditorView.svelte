<script lang="ts">
  import * as Tabs from '$lib/components/ui/tabs/index.js';
  import MaximizeButton from '$lib/components/MaximizeButton.svelte';
  import ResetButton from '$lib/components/ResetButton.svelte';
  import LoadingOverlay from '$lib/components/LoadingOverlay.svelte';
  import { maximizable } from '$lib/actions/maximizable';
  import { useApplication } from '$lib/app/application.svelte';
  import { DEFAULT_EDITOR_FONT_SIZE } from '$lib/app/services/editor.svelte';
  import type { ShaderDiagnostic, ShaderStage } from '$lib/app/types';
  import Users from 'phosphor-svelte/lib/UsersIcon';
  import Copy from 'phosphor-svelte/lib/CopyIcon';
  import SignOut from 'phosphor-svelte/lib/SignOutIcon';
  import ZoomIn from 'phosphor-svelte/lib/MagnifyingGlassPlusIcon';
  import ZoomOut from 'phosphor-svelte/lib/MagnifyingGlassMinusIcon';

  let { stages, activeStage, diagnostics, onStageChange, onReset }: {
    stages: ShaderStage[];
    activeStage: ShaderStage;
    diagnostics: ShaderDiagnostic[];
    onStageChange: (stage: ShaderStage) => void;
    onReset: () => void;
  } = $props();

  const app = useApplication();
  const editor = app.editor;
  const layout = app.layout;

  let dismissed = $state.raw<ShaderDiagnostic[] | null>(null);
  const showConsole = $derived(diagnostics.length > 0 && dismissed !== diagnostics);

  function host(node: HTMLElement) {
    editor.attach(node);
    return { destroy: () => editor.detach(node) };
  }
</script>

<div use:maximizable={{ active: layout.maximized === 'editor' }} class="workspace-panel">
  <Tabs.Root data-tutorial="editor" value={activeStage} onValueChange={(value) => onStageChange(value as ShaderStage)} class="app-editor flex h-full flex-col overflow-hidden rounded-md bg-background">
    <div class="flex shrink-0 items-center justify-between">
      <Tabs.List class="h-10 justify-start gap-0 bg-muted/25 p-0">
        {#each stages as stage}
          <Tabs.Trigger value={stage} class="h-10 border-none px-4 transition-colors hover:bg-muted/50 data-[state=active]:bg-background">{stage}.glsl</Tabs.Trigger>
        {/each}
      </Tabs.List>
      <div class="flex items-center gap-1">
        {#if editor.collaboration}
          <span class="collaboration-status" title={editor.collaboration.connected ? 'Live collaboration active' : 'Connecting'}><Users class="h-3.5 w-3.5" />Live</span>
          <button class="collaboration-button" title="Copy invite link" onclick={() => editor.copyInviteLink()}><Copy class="h-4 w-4" /></button>
          <button class="collaboration-button" title="Leave collaboration and continue locally" onclick={() => editor.leaveCollaboration()}><SignOut class="h-4 w-4" /></button>
        {:else}
          <button class="collaboration-button" title="Collaborate" onclick={() => editor.startCollaboration()}><Users class="h-4 w-4" /></button>
        {/if}
        <button class="collaboration-button" title="Decrease font size (Ctrl + scroll)" onclick={() => editor.setFontSize(editor.fontSize - 1)}><ZoomOut class="h-4 w-4" /></button>
        <button class="font-size-label" title="Reset font size" onclick={() => editor.setFontSize(DEFAULT_EDITOR_FONT_SIZE)}>{editor.fontSize}px</button>
        <button class="collaboration-button" title="Increase font size (Ctrl + scroll)" onclick={() => editor.setFontSize(editor.fontSize + 1)}><ZoomIn class="h-4 w-4" /></button>
        <MaximizeButton isMaximized={layout.maximized === 'editor'} onClick={() => layout.toggleMaximized('editor')} />
        <ResetButton description={`Reset ${activeStage}.glsl to its starter code?`} onReset={onReset} />
      </div>
    </div>
    <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {#if editor.failed}
        <p class="absolute inset-0 z-10 flex items-center justify-center p-6 text-center text-sm text-muted-foreground" role="alert">The editor could not be loaded. Reload the page to try again.</p>
      {:else if !editor.ready}
        <LoadingOverlay label="Loading editor" />
      {/if}
      <div use:host class="relative min-h-0 w-full flex-1 overflow-hidden rounded-md transition-opacity duration-300" class:opacity-0={!editor.ready}></div>
      {#if showConsole}
        <div class="shader-error-console shrink-0 p-2 font-mono text-xs">
          <div class="mb-1 flex items-center justify-between">
            <span class="shader-error-title font-semibold">SHADER ERRORS ({diagnostics.length})</span>
            <button class="shader-error-close" onclick={() => dismissed = diagnostics}>✕</button>
          </div>
          <div class="max-h-48 space-y-1 overflow-auto">
            {#each diagnostics as error}
              <button class="shader-error-entry flex w-full gap-2 rounded px-1 text-left" onclick={() => editor.revealLine(error.line)}><span class="shader-error-location">[{error.type}:{error.line}]</span><span>{error.message}</span></button>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </Tabs.Root>
</div>

<style>
  :global(.shader-error-line) { background: rgb(191 39 50 / 8%); }
  :global(.shader-error-glyph) { background: #bf2732; width: 3px !important; margin-left: 3px; }
  .shader-error-console { border-top: 1px solid #bf2732; background: rgb(191 39 50 / 12%); color: var(--foreground); }
  .shader-error-title, .shader-error-close, .shader-error-location { color: #bf2732; }
  .shader-error-entry:hover { background: rgb(191 39 50 / 14%); }
  .collaboration-button { display: flex; width: 1.75rem; height: 1.75rem; flex: none; align-items: center; justify-content: center; border-radius: .375rem; color: var(--muted-foreground); transition: color .15s, background .15s; }
  .collaboration-button:hover { color: #bf2732; background: rgb(191 39 50 / 10%); }
  .collaboration-status { display: inline-flex; height: 1.5rem; align-items: center; justify-content: center; gap: .25rem; border: 1px solid #bf2732; border-radius: 999px; padding: 0 .5rem; color: #bf2732; font-size: .6875rem; white-space: nowrap; }
  .font-size-label { min-width: 2.5rem; height: 1.75rem; border-radius: .375rem; color: var(--muted-foreground); font-size: .6875rem; font-variant-numeric: tabular-nums; transition: color .15s, background .15s; }
  .font-size-label:hover { color: #bf2732; background: rgb(191 39 50 / 10%); }
  :global(.yRemoteSelection) { background: rgb(191 39 50 / 18%); }
  :global(.yRemoteSelectionHead) { border-left: 2px solid #bf2732; }
</style>
