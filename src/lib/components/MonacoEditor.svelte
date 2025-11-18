<script>
import { onMount, onDestroy, tick } from 'svelte';
import * as Tabs from "$lib/components/ui/tabs/index.js";
import { Button } from "$lib/components/ui/button";
import { taskStore } from '$lib/stores/taskStore';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogClose } from "$lib/components/ui/dialog";
import { browser } from '$app/environment';

/* ---------------------------- GLSL Language Setup ---------------------------- */
const conf = {
  comments: { lineComment: "//", blockComment: ["/*", "*/"] },
  brackets: [["{", "}"], ["[", "]"], ["(", ")"]],
  autoClosingPairs: [
    { open: "[", close: "]" },
    { open: "{", close: "}" },
    { open: "(", close: ")" },
    { open: "'", close: "'", notIn: ["string", "comment"] },
    { open: '"', close: '"', notIn: ["string"] },
  ]
};

const keywords = [
  'const', 'uniform', 'break', 'continue', 'do', 'for', 'while', 'if', 'else',
  'switch', 'case', 'in', 'out', 'inout', 'true', 'false', 'invariant', 'discard',
  'return', 'sampler2D', 'samplerCube', 'sampler3D', 'struct', 'radians', 'degrees',
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'pow', 'sinh', 'cosh', 'tanh',
  'asinh', 'acosh', 'atanh', 'exp', 'log', 'exp2', 'log2', 'sqrt', 'inversesqrt',
  'abs', 'sign', 'floor', 'ceil', 'round', 'roundEven', 'trunc', 'fract', 'mod',
  'modf', 'min', 'max', 'clamp', 'mix', 'step', 'smoothstep', 'length', 'distance',
  'dot', 'cross', 'determinant', 'inverse', 'normalize', 'faceforward', 'reflect',
  'refract', 'matrixCompMult', 'outerProduct', 'transpose', 'lessThan', 'lessThanEqual',
  'greaterThan', 'greaterThanEqual', 'equal', 'notEqual', 'any', 'all', 'not',
  'packUnorm2x16', 'unpackUnorm2x16', 'packSnorm2x16', 'unpackSnorm2x16',
  'packHalf2x16', 'unpackHalf2x16', 'dFdx', 'dFdy', 'fwidth', 'textureSize',
  'texture', 'textureProj', 'textureLod', 'textureGrad', 'texelFetch',
  'texelFetchOffset', 'textureProjLod', 'textureLodOffset', 'textureGradOffset',
  'textureProjLodOffset', 'textureProjGrad', 'intBitsToFloat', 'uintBitsToFloat',
  'floatBitsToInt', 'floatBitsToUint', 'isnan', 'isinf',
  'vec2', 'vec3', 'vec4', 'ivec2', 'ivec3', 'ivec4', 'uvec2', 'uvec3', 'uvec4',
  'bvec2', 'bvec3', 'bvec4', 'mat2', 'mat3', 'mat4', 'mat2x2', 'mat2x3', 'mat2x4',
  'mat3x2', 'mat3x3', 'mat3x4', 'mat4x2', 'mat4x3', 'mat4x4',
  'float', 'int', 'uint', 'void', 'bool',
];

const language = {
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

/* ---------------------------- Component State ---------------------------- */
let editorContainer;
let editor = null;
let monaco = null;
let vertexModel = null;
let fragmentModel = null;
let showErrorConsole = false;
let errorList = [];
let openConfirm = false;
let observer = null;
let decorationCollections = { vertex: null, fragment: null };
let isUpdatingFromStore = false;

// Store unsubscribe functions
let unsubscribers = [];

// Local reactive state
let task = null;
let session = null;
let currentTab = 'fragment';
let vertexShader = '';
let fragmentShader = '';
let vertexErrors = [];
let fragmentErrors = [];

/* ---------------------------- Store Subscriptions ---------------------------- */
// Subscribe to the main taskStore
unsubscribers.push(
  taskStore.subscribe(value => {
    if (!value) {
      task = null;
      session = null;
      return;
    }
    
    task = value.task;
    session = value.session;
    
    // Clean up old subscriptions
    while (unsubscribers.length > 1) {
      unsubscribers.pop()();
    }
    
    // Subscribe to session stores
    if (session) {
      unsubscribers.push(
        session.vertexShader.subscribe(v => {
          vertexShader = v;
          if (editor && vertexModel && !isUpdatingFromStore) {
            if (vertexModel.getValue() !== v) {
              vertexModel.setValue(v);
            }
          }
        })
      );
      
      unsubscribers.push(
        session.fragmentShader.subscribe(v => {
          fragmentShader = v;
          if (editor && fragmentModel && !isUpdatingFromStore) {
            if (fragmentModel.getValue() !== v) {
              fragmentModel.setValue(v);
            }
          }
        })
      );
      
      unsubscribers.push(
        session.activeTab.subscribe(v => {
          currentTab = v;
          if (editor && vertexModel && fragmentModel) {
            const targetModel = v === 'vertex' ? vertexModel : fragmentModel;
            if (editor.getModel() !== targetModel) {
              editor.setModel(targetModel);
            }
          }
        })
      );
      
      unsubscribers.push(
        session.shaderErrors.vertex.subscribe(v => {
          vertexErrors = v;
          if (editor && vertexModel) {
            applyErrors(v, 'vertex');
          }
        })
      );
      
      unsubscribers.push(
        session.shaderErrors.fragment.subscribe(v => {
          fragmentErrors = v;
          if (editor && fragmentModel) {
            applyErrors(v, 'fragment');
          }
        })
      );
    }
  })
);

/* ---------------------------- Helper functions ---------------------------- */
function jumpToError(err) {
  if (!editor) return;
  const model = editor.getModel();
  if (!model) return;
  const targetLine = Math.min(Math.max(1, err.line), model.getLineCount());
  editor.revealLineInCenter(targetLine);
  editor.setPosition({ lineNumber: targetLine, column: 1 });
  editor.focus();
}

function applyErrors(errors, type) {
  if (!editor || !vertexModel || !fragmentModel) return;
  const model = type === 'vertex' ? vertexModel : fragmentModel;
  if (!decorationCollections[type]) {
    decorationCollections[type] = editor.createDecorationsCollection([]);
  }
  const decos = (errors || []).map(err => ({
    range: new monaco.Range(Math.max(1, err.line), 1, Math.max(1, err.line), 1),
    options: {
      isWholeLine: true,
      className: 'shader-error-line',
      glyphMarginClassName: 'shader-error-glyph',
      hoverMessage: { value: err.message }
    }
  }));
  decorationCollections[type].set(decos);
}

/* ---------------------------- Editor Setup ---------------------------- */
async function setupMonaco() {
  await tick();
  if (!editorContainer || !browser || !session) return;

  monaco = await import('monaco-editor');
  window.MonacoEnvironment = {
    getWorker: () => new Worker(new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url), { type: 'module' })
  };

  if (!monaco.languages.getLanguages().some(l => l.id === 'glsl')) {
    monaco.languages.register({ id: 'glsl' });
    monaco.languages.setMonarchTokensProvider('glsl', language);
    monaco.languages.setLanguageConfiguration('glsl', conf);
  }

  const vertexUri = monaco.Uri.parse('inmemory://model/vertex.glsl');
  const fragmentUri = monaco.Uri.parse('inmemory://model/fragment.glsl');

  vertexModel = monaco.editor.getModel(vertexUri) ?? monaco.editor.createModel(vertexShader, 'glsl', vertexUri);
  fragmentModel = monaco.editor.getModel(fragmentUri) ?? monaco.editor.createModel(fragmentShader, 'glsl', fragmentUri);

  editor = monaco.editor.create(editorContainer, {
    model: currentTab === 'vertex' ? vertexModel : fragmentModel,
    language: 'glsl',
    theme: document.documentElement.classList.contains('dark') ? 'vs-dark' : 'vs-light',
    minimap: { enabled: false },
    fontSize: 14,
    lineNumbers: 'on',
    automaticLayout: true,
    scrollBeyondLastLine: true,
    renderWhitespace: 'selection',
    tabSize: 2,
    glyphMargin: true
  });

  observer = new MutationObserver(() => {
    const isDark = document.documentElement.classList.contains('dark');
    monaco.editor.setTheme(isDark ? 'vs-dark' : 'vs-light');
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

  // Update store when user edits
  editor.onDidChangeModelContent(() => {
    if (!session) return;
    
    isUpdatingFromStore = true;
    const val = editor.getValue();
    const currentModel = editor.getModel();
    
    if (currentModel === vertexModel) {
      session.vertexShader.set(val);
    } else if (currentModel === fragmentModel) {
      session.fragmentShader.set(val);
    }
    
    // Clear errors for current tab
    const tab = currentModel === vertexModel ? 'vertex' : 'fragment';
    decorationCollections[tab]?.clear();
    errorList = [];
    showErrorConsole = false;
    
    isUpdatingFromStore = false;
  });

  editor.onMouseDown(e => {
    if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
      const line = e.target.position?.lineNumber;
      const err = errorList.find(err => err.line === line);
      if (err) jumpToError(err);
    }
  });

  applyErrors(vertexErrors, 'vertex');
  applyErrors(fragmentErrors, 'fragment');
}

function handleReset() {
  if (!session || !task) return;
  
  if (currentTab === 'vertex') {
    session.vertexShader.set(task.starterVertexShader || '');
  } else {
    session.fragmentShader.set(task.starterFragmentShader || '');
  }
  
  // Clear errors for the reset shader
  if (currentTab === 'vertex') {
    session.shaderErrors.vertex.set([]);
  } else {
    session.shaderErrors.fragment.set([]);
  }
  
  openConfirm = false;
}

/* ---------------------------- Lifecycle ---------------------------- */
onMount(setupMonaco);

onDestroy(() => {
  editor?.dispose();
  vertexModel?.dispose();
  fragmentModel?.dispose();
  Object.values(decorationCollections).forEach(c => c?.clear());
  observer?.disconnect();
  
  // Clean up all subscriptions
  unsubscribers.forEach(unsub => unsub());
});
</script>

<div class="h-full flex flex-col overflow-hidden pt-2">
  <Tabs.Root
    value={currentTab}
    onValueChange={tab => session?.activeTab.set(tab)}
    class="flex flex-col flex-1 min-h-0"
  >
    <div class="flex items-center border-b shrink-0 justify-between">
      <Tabs.List class="h-10 justify-start bg-muted/25 p-0 gap-0">
        {#if task?.type === '3D'}
          <Tabs.Trigger value="vertex" class="h-10 px-4 border-none data-[state=active]:bg-background hover:bg-muted/50 transition-colors">
            vertex.glsl
          </Tabs.Trigger>
        {/if}
        <Tabs.Trigger value="fragment" class="h-10 px-4 border-none data-[state=active]:bg-background hover:bg-muted/50 transition-colors">
          fragment.glsl
        </Tabs.Trigger>
      </Tabs.List>
      <Dialog bind:open={openConfirm}>
        <DialogTrigger asChild>
          <Button variant="outline" class="mr-2">Reset</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Reset</DialogTitle>
            <DialogDescription>
              Are you sure you want to reset the {currentTab} shader? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter class="flex justify-end gap-2">
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button on:click={handleReset}>Yes, Reset</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    <div class="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div bind:this={editorContainer} class="flex-1 w-full relative min-h-0"></div>

      {#if showErrorConsole}
        <div class="bg-red-950 border-t border-red-800 p-2 text-xs font-mono text-red-200 flex-shrink-0">
          <div class="flex items-center justify-between mb-1">
            <span class="text-red-400 font-semibold">SHADER ERRORS ({errorList.length})</span>
            <button on:click={() => showErrorConsole = false} class="text-red-400 hover:text-red-300 text-xs">✕</button>
          </div>
          <div class="space-y-1 overflow-auto max-h-48">
            {#each errorList as err, idx (idx)}
              <button class="flex gap-2 cursor-pointer hover:bg-red-900 rounded px-1 w-full text-left" on:click={() => jumpToError(err)}>
                <span class="text-red-400">[{err.type}:{err.line}]</span>
                <span>{err.message}</span>
              </button>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </Tabs.Root>
</div>

<style>
:global(.shader-error-line) { background: rgba(255, 0, 0, 0.08); }
:global(.shader-error-glyph) { background: #ff4d4f; width: 3px !important; margin-left: 3px; }
</style>