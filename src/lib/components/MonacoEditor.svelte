<script context="module" lang="ts">
  let editorInstance = 0;
</script>

<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import * as Tabs from '$lib/components/ui/tabs/index.js';
  import { browser } from '$app/environment';
  import type { GLSLError } from '$lib/stores/taskStore';
  import MaximizeButton from './MaximizeButton.svelte';
  import ResetButton from './ResetButton.svelte';
  import { maximizedPanel } from '$lib/stores/panelStore';
  import { maximizable } from '$lib/actions/maximizable';
  import Users from 'phosphor-svelte/lib/UsersIcon';
  import Copy from 'phosphor-svelte/lib/CopyIcon';
  import SignOut from 'phosphor-svelte/lib/SignOutIcon';

  type ShaderSource = 'vertex' | 'fragment';
  export let sources: Partial<Record<ShaderSource, string>> = {};
  export let visibleSources: ShaderSource[] = ['vertex', 'fragment'];
  export let activeSource: ShaderSource = 'fragment';
  export let diagnostics: Partial<Record<ShaderSource, GLSLError[]>> = {};
  export let defaultSources: Partial<Record<ShaderSource, string>> = {};
  export let editorId = 'shader';
  export let workspaceKey = editorId;
  export let onSourceChange: (source: ShaderSource, value: string) => void = () => {};
  export let onActiveSourceChange: (source: ShaderSource) => void = () => {};

  const conf: import('monaco-editor').languages.LanguageConfiguration = { comments: { lineComment: '//', blockComment: ['/*', '*/'] }, brackets: [['{', '}'], ['[', ']'], ['(', ')']], autoClosingPairs: [{ open: '[', close: ']' }, { open: '{', close: '}' }, { open: '"', close: '"', notIn: ['string', 'comment'] }] };
  const keywords = 'const uniform break continue do for while if else switch case in out inout true false invariant discard return sampler2D samplerCube sampler3D struct radians degrees sin cos tan asin acos atan pow exp log sqrt abs floor ceil fract mod min max clamp mix step smoothstep length distance dot cross normalize reflect refract texture textureSize vec2 vec3 vec4 ivec2 ivec3 ivec4 mat2 mat3 mat4 float int uint void bool'.split(' ');
  const language: import('monaco-editor').languages.IMonarchLanguage = { tokenPostfix: '.glsl', defaultToken: 'invalid', keywords, operators: ['=', '>', '<', '!', '~', '?', ':', '==', '<=', '>=', '!=', '&&', '||', '+', '-', '*', '/', '%'], symbols: /[=><!~?:&|+\-*\/\^%]+/, tokenizer: { root: [[/[a-zA-Z_]\w*/, { cases: { '@keywords': 'keyword', '@default': 'identifier' } }], [/^\s*#\s*\w+/, 'keyword.directive'], { include: '@whitespace' }, [/[{}()\[\]]/, '@brackets'], [/@symbols/, { cases: { '@operators': 'operator', '@default': '' } }], [/\d*\.\d+([eE][\-+]?\d+)?/, 'number.float'], [/\d+/, 'number'], [/[;,.]/, 'delimiter']], whitespace: [[/[ \t\r\n]+/, 'white'], [/\/\*/, 'comment', '@comment'], [/\/\/.*$/, 'comment']], comment: [[/[^\/*]+/, 'comment'], [/\/\*/, 'comment', '@push'], ['\\*/', 'comment', '@pop'], [/[^\/*]/, 'comment']] } };

  let container: HTMLDivElement;
  let editor: import('monaco-editor').editor.IStandaloneCodeEditor | null = null;
  let monaco: typeof import('monaco-editor') | null = null;
  let models: Partial<Record<ShaderSource, import('monaco-editor').editor.ITextModel>> = {};
  let decoration: import('monaco-editor').editor.IEditorDecorationsCollection | null = null;
  let errorList: GLSLError[] = [];
  let showErrorConsole = false;
  let destroyed = false;
  let observer: MutationObserver | undefined;
  let synchronizingModels = false;
  let modelListeners: import('monaco-editor').IDisposable[] = [];
  let collaborationDocument: import('yjs').Doc | undefined;
  let collaborationProvider: import('y-webrtc').WebrtcProvider | undefined;
  let collaborationPersistence: import('y-indexeddb').IndexeddbPersistence | undefined;
  let collaborationBindings: import('y-monaco').MonacoBinding[] = [];
  let collaborationRoom = '';
  let collaborationToken = '';
  let collaborationConnected = false;
  let collaborationPeers = 0;
  let collaborationAwarenessListener: (() => void) | undefined;
  let collaborationPeerListener: (() => void) | undefined;
  let collaborationPresenceInterval = 0;
  let collaborationMessage = '';
  let collaborationLifecycle = 0;
  let currentWorkspaceKey = workspaceKey;
  const PUBLIC_SIGNALING_SERVERS = ['wss://y-webrtc-eu.fly.dev'];

  function updateTheme() {
    if (!editor || !monaco) return;
    const theme = document.documentElement.classList.contains('dark') ? 'vs-dark' : 'vs-light';
    editor.updateOptions({ theme });
    monaco.editor.setTheme(theme);
  }

  function handleSourceChange(source: ShaderSource) {
    if (source === activeSource) return;
    onActiveSourceChange(source);
  }

  function collaborationParameters() {
    const parameters = new URLSearchParams(window.location.search);
    const token = parameters.get('collab') ?? '';
    return /^[a-f0-9]{64}$/.test(token) ? token : '';
  }

  async function roomNameFromToken(token: string) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function shareUrl() {
    const url = new URL(window.location.href);
    url.searchParams.set('collab', collaborationToken);
    return url.toString();
  }

  function removeCollaborationParameters() {
    const url = new URL(window.location.href);
    url.searchParams.delete('collab');
    url.searchParams.delete('collabSource');
    window.history.replaceState({}, '', url);
  }

  function participantLabel() {
    const total = collaborationPeers + 1;
    return `${total} ${total === 1 ? 'Person' : 'Personen'}`;
  }

  async function copyCollaborationLink() {
    const url = shareUrl();
    try {
      await navigator.clipboard.writeText(url);
      collaborationMessage = 'Einladungslink kopiert';
    } catch {
      window.prompt('Einladungslink kopieren:', url);
      collaborationMessage = 'Einladungslink geöffnet';
    }
    window.setTimeout(() => { collaborationMessage = ''; }, 2200);
  }

  function destroyCollaborationBindings() {
    for (const binding of collaborationBindings) binding.destroy();
    collaborationBindings = [];
  }

  function updateParticipantCount() {
    const awarenessTotal = collaborationProvider?.awareness.getStates().size ?? 1;
    const transportTotal = collaborationProvider?.room
      ? 1 + collaborationProvider.room.bcConns.size + collaborationProvider.room.webrtcConns.size
      : 1;
    collaborationPeers = Math.max(0, Math.max(awarenessTotal, transportTotal) - 1);
  }

  async function startCollaboration(room: string, token: string, seedDocument: boolean) {
    if (!editor || collaborationDocument || collaborationToken) return;
    const lifecycle = ++collaborationLifecycle;
    collaborationRoom = room;
    collaborationToken = token;
    try {
      const [{ Doc }, { WebrtcProvider }, { IndexeddbPersistence }, { MonacoBinding }] = await Promise.all([
        import('yjs'), import('y-webrtc'), import('y-indexeddb'), import('y-monaco')
      ]);
      if (destroyed || lifecycle !== collaborationLifecycle) return;
      collaborationDocument = new Doc();
      collaborationPersistence = new IndexeddbPersistence(`shaderlab-collab:${room}`, collaborationDocument);
      await collaborationPersistence.whenSynced;
      if (destroyed || lifecycle !== collaborationLifecycle || !collaborationDocument) return;
      if (seedDocument) {
        for (const source of visibleSources) {
          const sharedText = collaborationDocument.getText(`shader:${source}`);
          if (sharedText.length === 0) sharedText.insert(0, sources[source] ?? '');
        }
      }
      collaborationProvider = new WebrtcProvider(room, collaborationDocument, {
        password: token,
        signaling: PUBLIC_SIGNALING_SERVERS
      });
      collaborationProvider.awareness.setLocalStateField('user', {
        name: `ShaderLab ${collaborationDocument.clientID.toString().slice(-4)}`,
        color: '#bf2732'
      });
      collaborationProvider.on('status', ({ connected }) => {
        if (lifecycle === collaborationLifecycle) collaborationConnected = connected;
      });
      collaborationAwarenessListener = updateParticipantCount;
      collaborationPeerListener = updateParticipantCount;
      collaborationProvider.awareness.on('change', collaborationAwarenessListener);
      collaborationProvider.on('peers', collaborationPeerListener);
      collaborationPresenceInterval = window.setInterval(updateParticipantCount, 750);
      collaborationBindings = visibleSources.flatMap(source => {
        const sourceModel = models[source];
        return sourceModel
          ? [new MonacoBinding(collaborationDocument!.getText(`shader:${source}`), sourceModel)]
          : [];
      });
      updateParticipantCount();
    } catch (error) {
      console.error('Failed to start collaboration:', error);
      if (lifecycle === collaborationLifecycle) {
        disconnectCollaboration(false, true, 'Kollaboration konnte nicht gestartet werden');
      }
    }
  }

  async function createCollaboration() {
    const token = `${crypto.randomUUID().replaceAll('-', '')}${crypto.randomUUID().replaceAll('-', '')}`;
    const room = await roomNameFromToken(token);
    const url = new URL(window.location.href);
    url.searchParams.set('collab', token);
    window.history.replaceState({}, '', url);
    await startCollaboration(room, token, true);
    if (collaborationToken === token) await copyCollaborationLink();
  }

  function disconnectCollaboration(preserveLocalSources: boolean, removeParameters: boolean, message = '') {
    ++collaborationLifecycle;
    const localSources = preserveLocalSources && collaborationDocument
      ? Object.fromEntries(visibleSources.map(source => [
          source,
          collaborationDocument!.getText(`shader:${source}`).toString()
        ])) as Partial<Record<ShaderSource, string>>
      : preserveLocalSources
        ? Object.fromEntries(visibleSources.flatMap(source => {
            const sourceModel = models[source];
            return sourceModel ? [[source, sourceModel.getValue()]] : [];
          })) as Partial<Record<ShaderSource, string>>
        : {};
    destroyCollaborationBindings();
    if (collaborationProvider && collaborationAwarenessListener) {
      collaborationProvider.awareness.off('change', collaborationAwarenessListener);
    }
    if (collaborationProvider && collaborationPeerListener) collaborationProvider.off('peers', collaborationPeerListener);
    window.clearInterval(collaborationPresenceInterval);
    collaborationProvider?.destroy();
    void collaborationPersistence?.destroy();
    collaborationDocument?.destroy();
    collaborationProvider = undefined;
    collaborationPersistence = undefined;
    collaborationDocument = undefined;
    collaborationRoom = '';
    collaborationToken = '';
    collaborationConnected = false;
    collaborationPeers = 0;
    collaborationAwarenessListener = undefined;
    collaborationPeerListener = undefined;
    collaborationPresenceInterval = 0;

    if (removeParameters) removeCollaborationParameters();
    for (const [source, value] of Object.entries(localSources) as [ShaderSource, string][]) {
      onSourceChange(source, value);
    }
    if (message) {
      collaborationMessage = message;
      window.setTimeout(() => { collaborationMessage = ''; }, 2600);
    }
  }

  function leaveCollaboration() {
    if (!collaborationToken && !collaborationDocument) return;
    disconnectCollaboration(true, true, 'Sitzung verlassen · Stand lokal gespeichert');
  }

  function toDecoration(monacoApi: typeof import('monaco-editor'), error: GLSLError) {
    const line = Math.max(1, error.line);
    return {
      range: new monacoApi.Range(line, 1, line, 1),
      options: {
        isWholeLine: true,
        className: 'shader-error-line',
        glyphMarginClassName: 'shader-error-glyph',
        hoverMessage: { value: error.message }
      }
    };
  }

  function applyDiagnostics() {
    if (!monaco || !editor) return;
    const errors = diagnostics[activeSource] ?? [];
    if (!decoration) decoration = editor.createDecorationsCollection([]);
    decoration.set(errors.map(error => toDecoration(monaco!, error)));
    errorList = [...errors];
    showErrorConsole = errors.length > 0;
  }

  function createSourceModels() {
    if (!monaco) return;
    const instance = ++editorInstance;
    for (const source of visibleSources) {
      const uri = monaco.Uri.parse(`inmemory://${editorId}-${instance}/${source}.glsl`);
      const sourceModel = monaco.editor.createModel(sources[source] ?? '', 'glsl', uri);
      models[source] = sourceModel;
      modelListeners.push(sourceModel.onDidChangeContent(() => {
        if (!synchronizingModels) onSourceChange(source, sourceModel.getValue());
      }));
    }
  }

  function replaceWorkspace() {
    if (!editor || !monaco) return;
    disconnectCollaboration(false, true);
    const previousModels = models;
    const previousListeners = modelListeners;
    models = {};
    modelListeners = [];
    createSourceModels();
    editor.setModel(models[activeSource] ?? models[visibleSources[0]] ?? null);
    for (const listener of previousListeners) listener.dispose();
    for (const sourceModel of Object.values(previousModels)) sourceModel?.dispose();
  }

  async function setup() {
    await tick();
    if (!browser || !container) return;
    monaco = await import('monaco-editor');
    if (destroyed) return;
    (window as any).MonacoEnvironment = { getWorker: () => new Worker(new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url), { type: 'module' }) };
    if (!monaco.languages.getLanguages().some(item => item.id === 'glsl')) { monaco.languages.register({ id: 'glsl' }); monaco.languages.setMonarchTokensProvider('glsl', language); monaco.languages.setLanguageConfiguration('glsl', conf); }
    currentWorkspaceKey = workspaceKey;
    createSourceModels();
    const initialModel = models[activeSource] ?? models[visibleSources[0]];
    if (!initialModel) return;
    editor = monaco.editor.create(container, { model: initialModel, minimap: { enabled: false }, fontSize: 14, lineNumbers: 'on', automaticLayout: true, scrollBeyondLastLine: true, renderWhitespace: 'selection', tabSize: 2, glyphMargin: true });
    updateTheme();
    observer = new MutationObserver(updateTheme); observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    applyDiagnostics();
    const token = collaborationParameters();
    if (token) await startCollaboration(await roomNameFromToken(token), token, false);
  }

  $: if (editor && monaco) {
    // Keep diagnostics as an explicit dependency of this reactive block. Svelte
    // cannot see values read inside applyDiagnostics(), so updates delivered by
    // the teaching viewport otherwise remain invisible until another editor
    // dependency changes (for example after a page reload).
    diagnostics;
    sources;
    visibleSources;
    if (workspaceKey !== currentWorkspaceKey) {
      currentWorkspaceKey = workspaceKey;
      replaceWorkspace();
    }
    const activeModel = models[activeSource];
    if (activeModel && editor.getModel() !== activeModel) editor.setModel(activeModel);
    if (!collaborationDocument) {
      synchronizingModels = true;
      try {
        for (const source of visibleSources) {
          const sourceModel = models[source];
          const value = sources[source] ?? '';
          if (sourceModel && sourceModel.getValue() !== value) sourceModel.setValue(value);
        }
      } finally {
        synchronizingModels = false;
      }
    }
    applyDiagnostics();
  }

  function jumpToError(error: GLSLError) { if (!editor) return; const line = Math.min(Math.max(1, error.line), editor.getModel()?.getLineCount() ?? 1); editor.revealLineInCenter(line); editor.setPosition({ lineNumber: line, column: 1 }); editor.focus(); }
  function resetCurrentSource() {
    const value = defaultSources[activeSource];
    if (value === undefined) return;
    if (collaborationDocument && models[activeSource]) models[activeSource]!.setValue(value);
    else onSourceChange(activeSource, value);
  }
  onMount(setup);
  onDestroy(() => { destroyed = true; disconnectCollaboration(false, true); for (const listener of modelListeners) listener.dispose(); editor?.dispose(); for (const sourceModel of Object.values(models)) sourceModel?.dispose(); decoration?.clear(); observer?.disconnect(); });
</script>

<div use:maximizable={{ active: $maximizedPanel === editorId }} class="workspace-panel">
  <Tabs.Root data-tutorial="editor" value={activeSource} onValueChange={(value) => handleSourceChange(value as ShaderSource)} class="app-editor flex h-full flex-col overflow-hidden rounded-md bg-background">
    <div class="flex shrink-0 items-center justify-between"><Tabs.List class="h-10 justify-start gap-0 bg-muted/25 p-0">{#each visibleSources as source}<Tabs.Trigger value={source} class="h-10 border-none px-4 transition-colors hover:bg-muted/50 data-[state=active]:bg-background">{source}.glsl</Tabs.Trigger>{/each}</Tabs.List><div class="flex items-center gap-1">{#if collaborationRoom}<span class="collaboration-status" title={collaborationConnected ? `${participantLabel()} insgesamt` : 'Verbindung wird aufgebaut'}><Users class="h-3.5 w-3.5" />{participantLabel()}</span><button class="collaboration-button" title="Einladungslink kopieren" onclick={copyCollaborationLink}><Copy class="h-4 w-4" /></button><button class="collaboration-button" title="Kollaboration verlassen und lokal weiterarbeiten" onclick={leaveCollaboration}><SignOut class="h-4 w-4" /></button>{:else}<button class="collaboration-button" title="Gemeinsam bearbeiten" onclick={createCollaboration}><Users class="h-4 w-4" /></button>{/if}<MaximizeButton isMaximized={$maximizedPanel === editorId} onClick={() => $maximizedPanel = $maximizedPanel === editorId ? null : editorId} /><ResetButton description={`${activeSource}.glsl auf den Ausgangscode zurücksetzen?`} onReset={resetCurrentSource} /></div></div>
    {#if collaborationMessage}<div class="collaboration-message">{collaborationMessage}</div>{/if}
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden"><div bind:this={container} class="relative min-h-0 w-full flex-1 overflow-hidden rounded-md"></div>{#if showErrorConsole}<div class="shader-error-console shrink-0 p-2 font-mono text-xs"><div class="mb-1 flex items-center justify-between"><span class="shader-error-title font-semibold">SHADER-FEHLER ({errorList.length})</span><button class="shader-error-close" onclick={() => showErrorConsole = false}>✕</button></div><div class="max-h-48 space-y-1 overflow-auto">{#each errorList as error}<button class="shader-error-entry flex w-full gap-2 rounded px-1 text-left" onclick={() => jumpToError(error)}><span class="shader-error-location">[{error.type}:{error.line}]</span><span>{error.message}</span></button>{/each}</div></div>{/if}</div>
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
  .collaboration-message { position: absolute; z-index: 20; top: 2.75rem; right: .5rem; border: 1px solid #bf2732; border-radius: .375rem; background: var(--background); padding: .4rem .6rem; color: var(--foreground); font-size: .75rem; box-shadow: 0 4px 14px rgb(0 0 0 / 16%); }
  :global(.yRemoteSelection) { background: rgb(191 39 50 / 18%); }
  :global(.yRemoteSelectionHead) { border-left: 2px solid #bf2732; }
</style>
