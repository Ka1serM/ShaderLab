import { browser } from '$app/environment';
import { replaceState } from '$app/navigation';
import { toast } from 'svelte-sonner';
import type { Persistence } from './persistence';
import type { ShaderDiagnostic, ShaderStage } from '../types';

type Monaco = typeof import('monaco-editor/editor/editor.api.js');
type CodeEditor = import('monaco-editor').editor.IStandaloneCodeEditor;
type TextModel = import('monaco-editor').editor.ITextModel;

export const DEFAULT_EDITOR_FONT_SIZE = 14;
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 32;
const PUBLIC_SIGNALING_SERVERS = ['wss://y-webrtc-eu.fly.dev'];

export type EditorWorkspace = {
  key: string;
  stages: ShaderStage[];
  initialText: Partial<Record<ShaderStage, string>>;
  onChange: (stage: ShaderStage, text: string) => void;
};

const conf: import('monaco-editor').languages.LanguageConfiguration = { comments: { lineComment: '//', blockComment: ['/*', '*/'] }, brackets: [['{', '}'], ['[', ']'], ['(', ')']], autoClosingPairs: [{ open: '[', close: ']' }, { open: '{', close: '}' }, { open: '"', close: '"', notIn: ['string', 'comment'] }] };
const keywords = 'const uniform break continue do for while if else switch case in out inout true false invariant discard return sampler2D samplerCube sampler3D struct radians degrees sin cos tan asin acos atan pow exp log sqrt abs floor ceil fract mod min max clamp mix step smoothstep length distance dot cross normalize reflect refract texture textureSize vec2 vec3 vec4 ivec2 ivec3 ivec4 mat2 mat3 mat4 float int uint void bool'.split(' ');
const language: import('monaco-editor').languages.IMonarchLanguage = { tokenPostfix: '.glsl', defaultToken: 'invalid', keywords, operators: ['=', '>', '<', '!', '~', '?', ':', '==', '<=', '>=', '!=', '&&', '||', '+', '-', '*', '/', '%'], symbols: /[=><!~?:&|+\-*\/\^%]+/, tokenizer: { root: [[/[a-zA-Z_]\w*/, { cases: { '@keywords': 'keyword', '@default': 'identifier' } }], [/^\s*#\s*\w+/, 'keyword.directive'], { include: '@whitespace' }, [/[{}()\[\]]/, '@brackets'], [/@symbols/, { cases: { '@operators': 'operator', '@default': '' } }], [/\d*\.\d+([eE][\-+]?\d+)?/, 'number.float'], [/\d+/, 'number'], [/[;,.]/, 'delimiter']], whitespace: [[/[ \t\r\n]+/, 'white'], [/\/\*/, 'comment', '@comment'], [/\/\/.*$/, 'comment']], comment: [[/[^\/*]+/, 'comment'], [/\/\*/, 'comment', '@push'], ['\\*/', 'comment', '@pop'], [/[^\/*]/, 'comment']] } };

const monacoModule: Promise<Monaco> | undefined = browser ? import('monaco-editor/editor/editor.api.js') : undefined;
monacoModule?.catch(() => {});

function clampFontSize(size: number) {
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(size)));
}

type Collaboration = {
  lifecycle: number;
  token: string;
  room: string;
  document?: import('yjs').Doc;
  provider?: import('y-webrtc').WebrtcProvider;
  persistence?: import('y-indexeddb').IndexeddbPersistence;
  bindings: import('y-monaco').MonacoBinding[];
};

export class EditorHost {
  ready = $state(false);
  failed = $state(false);
  fontSize = $state(DEFAULT_EDITOR_FONT_SIZE);
  collaboration = $state<{ connected: boolean } | null>(null);

  private readonly element = browser ? document.createElement('div') : undefined;
  private monaco?: Monaco;
  private editor?: CodeEditor;
  private decorations?: import('monaco-editor').editor.IEditorDecorationsCollection;
  private readonly models = new Map<string, TextModel>();
  private readonly listeners = new Map<string, import('monaco-editor').IDisposable>();
  private workspace?: EditorWorkspace;
  private stage: ShaderStage = 'fragment';
  private diagnostics: ShaderDiagnostic[] = [];
  private applying = false;
  private session?: Collaboration;
  private lifecycle = 0;
  private loading?: Promise<void>;

  constructor(private readonly persistence: Persistence) {
    this.fontSize = clampFontSize(persistence.editorFontSize() ?? DEFAULT_EDITOR_FONT_SIZE);
    if (this.element) {
      this.element.style.cssText = 'position: absolute; inset: 0;';
      this.element.addEventListener('wheel', this.handleZoomWheel, { capture: true, passive: false });
    }
  }

  attach(parent: HTMLElement) {
    if (!this.element) return;
    if (this.element.parentNode !== parent) parent.appendChild(this.element);
    void this.load();
    this.editor?.layout();
  }

  detach(parent: HTMLElement) {
    if (this.element?.parentNode === parent) parent.removeChild(this.element);
  }

  open(workspace: EditorWorkspace, stage: ShaderStage) {
    if (this.workspace?.key !== workspace.key) this.disconnect(false, Boolean(this.workspace));
    this.workspace = workspace;
    this.stage = stage;
    this.diagnostics = [];
    this.applyWorkspace();
  }

  show(stage: ShaderStage) {
    this.stage = stage;
    this.applyWorkspace();
  }

  setDiagnostics(diagnostics: ShaderDiagnostic[]) {
    this.diagnostics = diagnostics;
    this.applyDiagnostics();
  }

  replaceText(stage: ShaderStage, text: string) {
    const model = this.workspace && this.models.get(this.modelKey(this.workspace.key, stage));
    if (!model) {
      this.workspace?.onChange(stage, text);
      return;
    }
    if (model.getValue() === text) return;
    model.pushEditOperations([], [{ range: model.getFullModelRange(), text }], () => null);
  }

  revealLine(line: number) {
    if (!this.editor) return;
    const target = Math.min(Math.max(1, line), this.editor.getModel()?.getLineCount() ?? 1);
    this.editor.revealLineInCenter(target);
    this.editor.setPosition({ lineNumber: target, column: 1 });
    this.editor.focus();
  }

  setFontSize(size: number) {
    this.fontSize = clampFontSize(size);
    this.editor?.updateOptions({ fontSize: this.fontSize });
    this.persistence.saveEditorFontSize(this.fontSize);
  }

  async startCollaboration() {
    const token = `${crypto.randomUUID().replaceAll('-', '')}${crypto.randomUUID().replaceAll('-', '')}`;
    const url = new URL(window.location.href);
    url.searchParams.set('collab', token);
    replaceState(url, {});
    await this.connect(token, true);
    if (this.session?.token === token) await this.copyInviteLink();
  }

  async copyInviteLink() {
    if (!this.session) return;
    const url = new URL(window.location.href);
    url.searchParams.set('collab', this.session.token);
    try {
      await navigator.clipboard.writeText(url.toString());
      toast.success('Einladungslink kopiert');
    } catch {
      window.prompt('Einladungslink kopieren:', url.toString());
      toast.info('Invite link opened');
    }
  }

  leaveCollaboration() {
    if (!this.session) return;
    this.disconnect(true, true, 'Sitzung verlassen · Stand lokal gespeichert');
  }

  private modelKey(workspaceKey: string, stage: ShaderStage) {
    return `${workspaceKey}/${stage}`;
  }

  private load() {
    if (!this.loading && monacoModule) {
      this.loading = monacoModule.then(monaco => this.create(monaco), error => {
        console.error('Failed to load the editor:', error);
        this.failed = true;
      });
    }
    return this.loading;
  }

  private async create(monaco: Monaco) {
    const { default: EditorWorker } = await import('monaco-editor/editor/editor.worker.js?worker');
    (window as any).MonacoEnvironment = { getWorker: () => new EditorWorker() };
    if (!monaco.languages.getLanguages().some(item => item.id === 'glsl')) {
      monaco.languages.register({ id: 'glsl' });
      monaco.languages.setMonarchTokensProvider('glsl', language);
      monaco.languages.setLanguageConfiguration('glsl', conf);
    }
    this.monaco = monaco;
    this.editor = monaco.editor.create(this.element!, {
      model: null, minimap: { enabled: false }, fontSize: this.fontSize, lineNumbers: 'on', automaticLayout: true,
      scrollBeyondLastLine: true, renderWhitespace: 'selection', tabSize: 2, glyphMargin: true
    });
    this.decorations = this.editor.createDecorationsCollection([]);
    this.updateTheme();
    new MutationObserver(() => this.updateTheme()).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    this.applyWorkspace();
    this.ready = true;
    const token = new URLSearchParams(window.location.search).get('collab') ?? '';
    if (/^[a-f0-9]{64}$/.test(token)) await this.connect(token, false);
  }

  private updateTheme() {
    if (!this.monaco) return;
    this.monaco.editor.setTheme(document.documentElement.classList.contains('dark') ? 'vs-dark' : 'vs-light');
  }

  private applyWorkspace() {
    const monaco = this.monaco, workspace = this.workspace;
    if (!monaco || !this.editor || !workspace) return;
    for (const stage of workspace.stages) {
      const key = this.modelKey(workspace.key, stage);
      let model = this.models.get(key);
      if (!model) {
        const uri = monaco.Uri.parse(`inmemory://shaderlab/${encodeURIComponent(workspace.key)}/${stage}.glsl`);
        monaco.editor.getModel(uri)?.dispose();
        model = monaco.editor.createModel(workspace.initialText[stage] ?? '', 'glsl', uri);
        this.models.set(key, model);
        const created = model;
        this.listeners.set(key, model.onDidChangeContent(() => {
          if (!this.applying && this.workspace?.key === workspace.key) this.workspace.onChange(stage, created.getValue());
        }));
      } else if (!this.session && model.getValue() !== (workspace.initialText[stage] ?? model.getValue())) {
        this.applying = true;
        try { model.setValue(workspace.initialText[stage] ?? ''); } finally { this.applying = false; }
      }
    }
    const stage = workspace.stages.includes(this.stage) ? this.stage : workspace.stages[0];
    const model = stage ? this.models.get(this.modelKey(workspace.key, stage)) : undefined;
    if (model && this.editor.getModel() !== model) this.editor.setModel(model);
    this.applyDiagnostics();
  }

  private applyDiagnostics() {
    const monaco = this.monaco;
    if (!monaco || !this.decorations) return;
    this.decorations.set(this.diagnostics.map(diagnostic => {
      const line = Math.max(1, diagnostic.line);
      return {
        range: new monaco.Range(line, 1, line, 1),
        options: { isWholeLine: true, className: 'shader-error-line', glyphMarginClassName: 'shader-error-glyph', hoverMessage: { value: diagnostic.message } }
      };
    }));
  }

  private handleZoomWheel = (event: WheelEvent) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    event.stopPropagation();
    this.setFontSize(this.fontSize + (event.deltaY < 0 ? 1 : -1));
  };

  private async connect(token: string, seed: boolean) {
    const workspace = this.workspace;
    if (!this.editor || !workspace || this.session) return;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    const room = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    const session: Collaboration = { lifecycle: ++this.lifecycle, token, room, bindings: [] };
    const current = () => this.session === session && this.workspace === workspace;
    this.session = session;
    this.collaboration = { connected: false };
    try {
      const [{ Doc }, { WebrtcProvider }, { IndexeddbPersistence }, { MonacoBinding }] = await Promise.all([
        import('yjs'), import('y-webrtc'), import('y-indexeddb'), import('y-monaco')
      ]);
      if (!current()) return;
      const document = session.document = new Doc();
      session.persistence = new IndexeddbPersistence(`shaderlab-collab:${room}`, document);
      await session.persistence.whenSynced;
      if (!current()) return;
      const models = workspace.stages.map(stage => [stage, this.models.get(this.modelKey(workspace.key, stage))] as const);
      if (seed) {
        for (const [stage, model] of models) {
          const text = document.getText(`shader:${stage}`);
          if (text.length === 0) text.insert(0, model?.getValue() ?? '');
        }
      }
      const provider = session.provider = new WebrtcProvider(room, document, { password: token, signaling: PUBLIC_SIGNALING_SERVERS });
      provider.awareness.setLocalStateField('user', { name: `ShaderLab ${document.clientID.toString().slice(-4)}`, color: '#bf2732' });
      provider.on('status', ({ connected }) => { if (current()) this.collaboration = { connected }; });
      if (!seed) await this.sharedContent(document, workspace.stages, current);
      if (!current()) return;
      session.bindings = models.flatMap(([stage, model]) => model ? [new MonacoBinding(document.getText(`shader:${stage}`), model, new Set([this.editor!]), provider.awareness)] : []);
    } catch (error) {
      console.error('Failed to start collaboration:', error);
      if (this.session === session) this.disconnect(false, true, 'Kollaboration konnte nicht gestartet werden');
    }
  }

  private sharedContent(document: import('yjs').Doc, stages: ShaderStage[], current: () => boolean) {
    const has = () => stages.some(stage => document.getText(`shader:${stage}`).length > 0);
    if (has()) return Promise.resolve();
    return new Promise<void>(resolve => {
      const update = () => {
        if (current() && !has()) return;
        document.off('update', update);
        resolve();
      };
      document.on('update', update);
    });
  }

  private disconnect(keepText: boolean, removeParameters: boolean, message = '') {
    const session = this.session;
    if (!session) return;
    this.session = undefined;
    this.collaboration = null;
    for (const binding of session.bindings) binding.destroy();
    session.provider?.destroy();
    void session.persistence?.destroy();
    session.document?.destroy();
    if (removeParameters) {
      const url = new URL(window.location.href);
      url.searchParams.delete('collab');
      url.searchParams.delete('collabSource');
      replaceState(url, {});
    }
    const workspace = this.workspace;
    if (keepText && workspace) {
      for (const stage of workspace.stages) {
        const model = this.models.get(this.modelKey(workspace.key, stage));
        if (model) workspace.onChange(stage, model.getValue());
      }
    }
    if (message) toast.info(message);
  }
}
