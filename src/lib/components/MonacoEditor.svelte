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

  type ShaderSource = 'vertex' | 'fragment';
  export let sources: Partial<Record<ShaderSource, string>> = {};
  export let visibleSources: ShaderSource[] = ['vertex', 'fragment'];
  export let activeSource: ShaderSource = 'fragment';
  export let diagnostics: Partial<Record<ShaderSource, GLSLError[]>> = {};
  export let defaultSources: Partial<Record<ShaderSource, string>> = {};
  export let editorId = 'shader';
  export let onSourceChange: (source: ShaderSource, value: string) => void = () => {};
  export let onActiveSourceChange: (source: ShaderSource) => void = () => {};

  const conf: import('monaco-editor').languages.LanguageConfiguration = { comments: { lineComment: '//', blockComment: ['/*', '*/'] }, brackets: [['{', '}'], ['[', ']'], ['(', ')']], autoClosingPairs: [{ open: '[', close: ']' }, { open: '{', close: '}' }, { open: '"', close: '"', notIn: ['string', 'comment'] }] };
  const keywords = 'const uniform break continue do for while if else switch case in out inout true false invariant discard return sampler2D samplerCube sampler3D struct radians degrees sin cos tan asin acos atan pow exp log sqrt abs floor ceil fract mod min max clamp mix step smoothstep length distance dot cross normalize reflect refract texture textureSize vec2 vec3 vec4 ivec2 ivec3 ivec4 mat2 mat3 mat4 float int uint void bool'.split(' ');
  const language: import('monaco-editor').languages.IMonarchLanguage = { tokenPostfix: '.glsl', defaultToken: 'invalid', keywords, operators: ['=', '>', '<', '!', '~', '?', ':', '==', '<=', '>=', '!=', '&&', '||', '+', '-', '*', '/', '%'], symbols: /[=><!~?:&|+\-*\/\^%]+/, tokenizer: { root: [[/[a-zA-Z_]\w*/, { cases: { '@keywords': 'keyword', '@default': 'identifier' } }], [/^\s*#\s*\w+/, 'keyword.directive'], { include: '@whitespace' }, [/[{}()\[\]]/, '@brackets'], [/@symbols/, { cases: { '@operators': 'operator', '@default': '' } }], [/\d*\.\d+([eE][\-+]?\d+)?/, 'number.float'], [/\d+/, 'number'], [/[;,.]/, 'delimiter']], whitespace: [[/[ \t\r\n]+/, 'white'], [/\/\*/, 'comment', '@comment'], [/\/\/.*$/, 'comment']], comment: [[/[^\/*]+/, 'comment'], [/\/\*/, 'comment', '@push'], ['\\*/', 'comment', '@pop'], [/[^\/*]/, 'comment']] } };

  let container: HTMLDivElement;
  let editor: import('monaco-editor').editor.IStandaloneCodeEditor | null = null;
  let monaco: typeof import('monaco-editor') | null = null;
  let model: import('monaco-editor').editor.ITextModel | null = null;
  let decoration: import('monaco-editor').editor.IEditorDecorationsCollection | null = null;
  let errorList: GLSLError[] = [];
  let showErrorConsole = false;
  let destroyed = false;
  let observer: MutationObserver | undefined;
  let synchronizingModels = false;
  let modelListener: import('monaco-editor').IDisposable | undefined;

  function updateTheme() {
    if (!editor || !monaco) return;
    const theme = document.documentElement.classList.contains('dark') ? 'vs-dark' : 'vs-light';
    editor.updateOptions({ theme });
    monaco.editor.setTheme(theme);
  }

  function handleSourceChange(source: ShaderSource) {
    onActiveSourceChange(source);
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
    if (!monaco || !editor || !model) return;
    const errors = diagnostics[activeSource] ?? [];
    if (!decoration) decoration = editor.createDecorationsCollection([]);
    decoration.set(errors.map(error => toDecoration(monaco!, error)));
    errorList = [...errors];
    showErrorConsole = errors.length > 0;
  }

  async function setup() {
    await tick();
    if (!browser || !container) return;
    monaco = await import('monaco-editor');
    if (destroyed) return;
    (window as any).MonacoEnvironment = { getWorker: () => new Worker(new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url), { type: 'module' }) };
    if (!monaco.languages.getLanguages().some(item => item.id === 'glsl')) { monaco.languages.register({ id: 'glsl' }); monaco.languages.setMonarchTokensProvider('glsl', language); monaco.languages.setLanguageConfiguration('glsl', conf); }
    const uri = monaco.Uri.parse(`inmemory://${editorId}-${++editorInstance}/shader.glsl`);
    model = monaco.editor.createModel(sources[activeSource] ?? '', 'glsl', uri);
    modelListener = model.onDidChangeContent(() => {
      if (synchronizingModels || !model) return;
      onSourceChange(activeSource, model.getValue());
    });
    editor = monaco.editor.create(container, { model, minimap: { enabled: false }, fontSize: 14, lineNumbers: 'on', automaticLayout: true, scrollBeyondLastLine: true, renderWhitespace: 'selection', tabSize: 2, glyphMargin: true });
    updateTheme();
    observer = new MutationObserver(updateTheme); observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    applyDiagnostics();
  }

  $: if (editor && monaco && model) {
    synchronizingModels = true;
    try {
      const value = sources[activeSource] ?? '';
      if (model.getValue() !== value) model.setValue(value);
    } finally {
      synchronizingModels = false;
    }
    applyDiagnostics();
  }

  function jumpToError(error: GLSLError) { if (!editor) return; const line = Math.min(Math.max(1, error.line), editor.getModel()?.getLineCount() ?? 1); editor.revealLineInCenter(line); editor.setPosition({ lineNumber: line, column: 1 }); editor.focus(); }
  function resetCurrentSource() {
    const value = defaultSources[activeSource];
    if (value !== undefined) onSourceChange(activeSource, value);
  }
  onMount(setup);
  onDestroy(() => { destroyed = true; modelListener?.dispose(); editor?.dispose(); model?.dispose(); decoration?.clear(); observer?.disconnect(); });
</script>

<Tabs.Root data-tutorial="editor" value={activeSource} onValueChange={(value) => handleSourceChange(value as ShaderSource)} class="app-editor flex h-full flex-col overflow-hidden rounded-xl bg-background pt-2">
  <div class="flex shrink-0 items-center justify-between"><Tabs.List class="h-10 justify-start gap-0 bg-muted/25 p-0">{#each visibleSources as source}<Tabs.Trigger value={source} class="h-10 border-none px-4 transition-colors hover:bg-muted/50 data-[state=active]:bg-background">{source}.glsl</Tabs.Trigger>{/each}</Tabs.List><div class="mr-2 flex items-center gap-1"><MaximizeButton isMaximized={$maximizedPanel === editorId} onClick={() => $maximizedPanel = $maximizedPanel === editorId ? null : editorId} /><ResetButton description={`Reset the ${activeSource} shader to its default text?`} onReset={resetCurrentSource} /></div></div>
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden"><div bind:this={container} class="relative min-h-0 w-full flex-1 overflow-hidden rounded-t-xl"></div>{#if showErrorConsole}<div class="shrink-0 border-t border-red-800 bg-red-950 p-2 font-mono text-xs text-red-200"><div class="mb-1 flex items-center justify-between"><span class="font-semibold text-red-400">SHADER ERRORS ({errorList.length})</span><button class="text-red-400" onclick={() => showErrorConsole = false}>✕</button></div><div class="max-h-48 space-y-1 overflow-auto">{#each errorList as error}<button class="flex w-full gap-2 rounded px-1 text-left hover:bg-red-900" onclick={() => jumpToError(error)}><span class="text-red-400">[{error.type}:{error.line}]</span><span>{error.message}</span></button>{/each}</div></div>{/if}</div>
</Tabs.Root>

<style>
  :global(.shader-error-line) { background: rgba(255, 0, 0, 0.08); }
  :global(.shader-error-glyph) { background: #ff4d4f; width: 3px !important; margin-left: 3px; }
</style>
