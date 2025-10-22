<script lang="ts">
import { onMount, onDestroy, tick } from 'svelte';
import * as Tabs from "$lib/components/ui/tabs/index.js";
import { taskStore } from '$lib/stores/taskStore';
import { browser } from '$app/environment';

/* ---------------------------- GLSL Language Setup ---------------------------- */
const conf: import('monaco-editor').languages.LanguageConfiguration = {
  comments: { lineComment: "//", blockComment: ["/*", "*/"] },
  brackets: [["{","}"], ["[","]"], ["(",")"]],
  autoClosingPairs: [
    { open: "[", close: "]" },
    { open: "{", close: "}" },
    { open: "(", close: ")" },
    { open: "'", close: "'", notIn: ["string","comment"] },
    { open: '"', close: '"', notIn: ["string"] },
  ]
};

const keywords = [
  'const','uniform','break','continue','do','for','while','if','else',
  'switch','case','in','out','inout','true','false','invariant','discard',
  'return','sampler2D','samplerCube','sampler3D','struct','radians','degrees',
  'sin','cos','tan','asin','acos','atan','pow','sinh','cosh','tanh',
  'asinh','acosh','atanh','exp','log','exp2','log2','sqrt','inversesqrt',
  'abs','sign','floor','ceil','round','roundEven','trunc','fract','mod',
  'modf','min','max','clamp','mix','step','smoothstep','length','distance',
  'dot','cross','determinant','inverse','normalize','faceforward','reflect',
  'refract','matrixCompMult','outerProduct','transpose','lessThan','lessThanEqual',
  'greaterThan','greaterThanEqual','equal','notEqual','any','all','not',
  'packUnorm2x16','unpackUnorm2x16','packSnorm2x16','unpackSnorm2x16',
  'packHalf2x16','unpackHalf2x16','dFdx','dFdy','fwidth','textureSize',
  'texture','textureProj','textureLod','textureGrad','texelFetch',
  'texelFetchOffset','textureProjLod','textureLodOffset','textureGradOffset',
  'textureProjLodOffset','textureProjGrad','intBitsToFloat','uintBitsToFloat',
  'floatBitsToInt','floatBitsToUint','isnan','isinf',
  'vec2','vec3','vec4','ivec2','ivec3','ivec4','uvec2','uvec3','uvec4',
  'bvec2','bvec3','bvec4','mat2','mat3','mat2x2','mat2x3','mat2x4','mat3x2',
  'mat3x3','mat3x4','mat4x2','mat4x3','mat4x4','mat4','float','int','uint','void','bool',
];

const language: import('monaco-editor').languages.IMonarchLanguage = {
  tokenPostfix: '.glsl',
  defaultToken: 'invalid',
  keywords,
  operators: [
    '=', '>', '<', '!', '~', '?', ':', '==', '<=', '>=', '!=', '&&', '||',
    '++', '--', '+', '-', '*', '/', '&', '|', '^', '%', '<<', '>>', '>>>',
    '+=', '-=', '*=', '/=', '&=', '|=', '^=', '%=', '<<=', '>>=', '>>>='
  ],
  symbols: /[=><!~?:&|+\-*\/\^%]+/,
  tokenizer: {
    root: [
      [/[a-zA-Z_]\w*/, { cases: { '@keywords': 'keyword', '@default': 'identifier' } }],
      [/^\s*#\s*\w+/, 'keyword.directive'],
      { include: '@whitespace' },
      [/[{}()\[\]]/, '@brackets'],
      [/@symbols/, { cases: { '@operators': 'operator', '@default': '' } }],
      [/\d*\.\d+([eE][\-+]?\d+)?/, 'number.float'],
      [/\d+/, 'number'],
      [/[;,.]/, 'delimiter']
    ],
    whitespace: [
      [/[ \t\r\n]+/, 'white'],
      [/\/\*/, 'comment', '@comment'],
      [/\/\/.*$/, 'comment']
    ],
    comment: [
      [/[^\/*]+/, 'comment'],
      [/\/\*/, 'comment', '@push'],
      ['\\*/', 'comment', '@pop'],
      [/[\/*]/, 'comment']
    ]
  }
};

/* ---------------------------- Component ---------------------------- */
let editorContainer: HTMLDivElement;
let editor: import('monaco-editor').editor.IStandaloneCodeEditor | null = null;
let monaco: typeof import('monaco-editor') | null = null;
let darkObserver: MutationObserver | null = null;

let vertexModel: import('monaco-editor').editor.ITextModel | null = null;
let fragmentModel: import('monaco-editor').editor.ITextModel | null = null;

let isDark = false;
let decorations: string[] = [];
let showErrorConsole = false;
type ShaderError = { type: 'vertex' | 'fragment', line: number, message: string };
let errorList: ShaderError[] = [];

// Subscribe to store
let storeState = { 
  task: null, 
  vertexShader: '', 
  fragmentShader: '', 
  activeTab: 'fragment' as 'vertex' | 'fragment'
};

const unsubscribe = taskStore.subscribe(state => {
  storeState = state;
});

/* ---------------------------- Reactive values ---------------------------- */
$: task = storeState.task;
$: vertexShader = storeState.vertexShader;
$: fragmentShader = storeState.fragmentShader;
$: currentTab = storeState.activeTab;
$: shaderErrors = (storeState as any).shaderErrors || [];

/* ---------------------------- Methods ---------------------------- */
function handleChange(value: string) {
  // Prevent infinite loops by checking if value actually changed
  const currentValue = currentTab === 'vertex' ? vertexShader : fragmentShader;
  if (value === currentValue) return;

  if (currentTab === 'vertex') {
    taskStore.setVertexShader(value);
  } else {
    taskStore.setFragmentShader(value);
  }

  if (editor && monaco) {
    decorations = editor.deltaDecorations(decorations, []);
    const model = editor.getModel();
    if (model) monaco.editor.setModelMarkers(model, "shader", []);
  }

  errorList = [];
  showErrorConsole = false;
}

function handleTabChange(newTab: 'vertex' | 'fragment') {
  taskStore.setActiveTab(newTab);
}

function applyShaderErrors() {
  if (!monaco || !editor) return;

  const model = editor.getModel();
  if (model) monaco.editor.setModelMarkers(model, "shader", []);
  decorations = editor.deltaDecorations(decorations, []);

  const relevantErrors = shaderErrors.filter(e => e.type === currentTab);
  if (relevantErrors.length === 0) {
    errorList = [];
    showErrorConsole = false;
    return;
  }

  const decos = relevantErrors.map(err => ({
    range: new monaco!.Range(err.line, 1, err.line, 1),
    options: {
      isWholeLine: true,
      className: "shader-error-line",
      glyphMarginClassName: "shader-error-glyph",
      hoverMessage: { value: err.message },
    }
  }));

  decorations = editor.deltaDecorations([], decos);

  const markers = relevantErrors.map(err => ({
    startLineNumber: err.line,
    startColumn: 1,
    endLineNumber: err.line,
    endColumn: Number.MAX_VALUE,
    message: err.message,
    severity: monaco.MarkerSeverity.Error
  }));

  if (model) monaco.editor.setModelMarkers(model, "shader", markers);

  errorList = relevantErrors;
  showErrorConsole = relevantErrors.length > 0;
}

/* ---------------------------- Lifecycle ---------------------------- */
onMount(async () => {
  await tick();
  if (!editorContainer || !browser) return;

  // Dark mode detection
  const root = document.documentElement;
  isDark = root.classList.contains("dark");
  darkObserver = new MutationObserver(() => {
    isDark = root.classList.contains("dark");
    editor?.updateOptions({ theme: isDark ? 'vs-dark' : 'vs-light' });
  });
  darkObserver.observe(root, { attributes: true, attributeFilter: ["class"] });

  monaco = await import('monaco-editor');

  (window as any).MonacoEnvironment = {
    getWorker: (_workerId: string, label: string) =>
      new Worker(new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url), { type: 'module' })
  };

  if (!monaco.languages.getLanguages().some(l => l.id === "glsl")) {
    monaco.languages.register({ id: "glsl" });
    monaco.languages.setMonarchTokensProvider("glsl", language);
    monaco.languages.setLanguageConfiguration("glsl", conf);
  }

  vertexModel = monaco.editor.createModel(vertexShader, 'glsl', monaco.Uri.parse('inmemory://model/vertex.glsl'));
  fragmentModel = monaco.editor.createModel(fragmentShader, 'glsl', monaco.Uri.parse('inmemory://model/fragment.glsl'));

  editor = monaco.editor.create(editorContainer, {
    model: currentTab === 'vertex' ? vertexModel : fragmentModel,
    language: 'glsl',
    theme: isDark ? 'vs-dark' : 'vs-light',
    minimap: { enabled: false },
    fontSize: 14,
    lineNumbers: 'on',
    automaticLayout: true
  });

  editor.onDidChangeModelContent(() => {
    const value = editor!.getValue();
    handleChange(value);
  });

  applyShaderErrors();
});

// Switch model when tab changes
$: if (editor && vertexModel && fragmentModel) {
  const model = currentTab === 'vertex' ? vertexModel : fragmentModel;
  if (editor.getModel() !== model) {
    const pos = editor.getPosition();
    editor.setModel(model);
    if (pos) editor.setPosition(pos);
    editor.focus();
  }
}

// Sync editor models with store
$: if (vertexModel && vertexShader !== vertexModel.getValue()) {
  const pos = editor?.getPosition();
  vertexModel.setValue(vertexShader);
  if (pos && editor && currentTab === 'vertex') {
    editor.setPosition(pos);
  }
}

$: if (fragmentModel && fragmentShader !== fragmentModel.getValue()) {
  const pos = editor?.getPosition();
  fragmentModel.setValue(fragmentShader);
  if (pos && editor && currentTab === 'fragment') {
    editor.setPosition(pos);
  }
}

// Apply errors when they change
$: if (editor && monaco) {
  applyShaderErrors();
}

onDestroy(() => {
  editor?.dispose();
  vertexModel?.dispose();
  fragmentModel?.dispose();
  darkObserver?.disconnect();
  unsubscribe();
});
</script>

<div class="h-full flex flex-col">
<Tabs.Root
  value={currentTab}
  onValueChange={handleTabChange}
  class="flex flex-col flex-1 min-h-0 overflow-hidden py-2"
>
<div class="flex items-center border-b">
 <!-- Tab triggers -->
<Tabs.List class="h-10 justify-start bg-muted/25 p-0 gap-0">
    {#if task?.type === '3D'}
    <Tabs.Trigger
        value="vertex"
        class="h-10 px-4 border-none data-[state=active]:bg-background hover:bg-muted/50 transition-colors"
    >
        vertex.glsl
    </Tabs.Trigger>
    {/if}
    <Tabs.Trigger
    value="fragment"
    class="h-10 px-4 border-none data-[state=active]:bg-background hover:bg-muted/50 transition-colors"
    >
    fragment.glsl
    </Tabs.Trigger>
</Tabs.List>
</div>

    <div class="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div bind:this={editorContainer} class="flex-1 w-full relative"></div>

      {#if showErrorConsole}
      <div class="bg-red-950 border-t border-red-800 p-2 max-h-32 overflow-y-auto text-xs font-mono text-red-200">
        <div class="flex items-center justify-between mb-1">
          <span class="text-red-400 font-semibold">SHADER ERRORS ({errorList.length})</span>
          <button on:click={() => (showErrorConsole = false)} class="text-red-400 hover:text-red-300 text-xs">✕</button>
        </div>
        <div class="space-y-1">
          {#each errorList as err, idx (idx)}
            <div class="flex gap-2">
              <span class="text-red-400">[{err.type}:{err.line}]</span>
              <span>{err.message}</span>
            </div>
          {/each}
        </div>
      </div>
      {/if}
    </div>
  </Tabs.Root>
</div>

<style>
:global(.shader-error-line) { background: rgba(255,0,0,0.08); }
:global(.shader-error-glyph) { background: #ff4d4f; width: 3px !important; margin-left: 3px; }
</style>