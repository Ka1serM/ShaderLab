import { useRef } from "react";
import Editor, { OnBeforeMount, OnMount } from "@monaco-editor/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import * as monaco from "monaco-editor";
import type { languages } from "monaco-editor";

interface MonacoEditorProps {
  vertexShader: string;
  fragmentShader: string;
  onVertexChange: (value: string) => void;
  onFragmentChange: (value: string) => void;
  type: "2D" | "3D";
}

const conf: languages.LanguageConfiguration = {
  comments: { lineComment: '//', blockComment: ['/*', '*/'] },
  brackets: [['{', '}'], ['[', ']'], ['(', ')']],
  autoClosingPairs: [
    { open: '[', close: ']' },
    { open: '{', close: '}' },
    { open: '(', close: ')' },
    { open: "'", close: "'", notIn: ['string', 'comment'] },
    { open: '"', close: '"', notIn: ['string'] }
  ],
  surroundingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' },
    { open: "'", close: "'" }
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
  'bvec2', 'bvec3', 'bvec4', 'mat2', 'mat3', 'mat2x2', 'mat2x3', 'mat2x4', 'mat3x2',
  'mat3x3', 'mat3x4', 'mat4x2', 'mat4x3', 'mat4x4', 'mat4', 'float', 'int', 'uint',
  'void', 'bool',
];

const language: languages.IMonarchLanguage = {
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

export const MonacoEditor = ({
  vertexShader,
  fragmentShader,
  onVertexChange,
  onFragmentChange,
  type,
}: MonacoEditorProps) => {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof monaco | null>(null);

  const editorOptions = {
    minimap: { enabled: false },
    fontSize: 14,
    lineNumbers: "on" as const,
    roundedSelection: false,
    scrollBeyondLastLine: false,
    readOnly: false,
    theme: "vs-dark",
    automaticLayout: true,
  };

  const handleEditorWillMount: OnBeforeMount = (monacoInstance) => {
    monacoRef.current = monacoInstance;
    if (!monacoInstance.languages.getLanguages().some((l) => l.id === "glsl")) {
      monacoInstance.languages.register({ id: "glsl" });
      monacoInstance.languages.setMonarchTokensProvider("glsl", language);
      monacoInstance.languages.setLanguageConfiguration("glsl", conf);
    }
  };

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

  // function to update errors from ShaderPreview
  const setErrors = (errors: { line: number; message: string }[], target: "vertex" | "fragment") => {
    if (!editorRef.current) return;
    const model = editorRef.current.getModel();
    if (!model) return;

    const markers: monaco.editor.IMarkerData[] = errors.map((e) => ({
      severity: monaco.MarkerSeverity.Error,
      startLineNumber: e.line + 1,
      startColumn: 1,
      endLineNumber: e.line + 1,
      endColumn: 100,
      message: e.message,
    }));

    monaco.editor.setModelMarkers(model, `shader-${target}`, markers);
  };

  return (
    <div className="code-editor h-full flex flex-col">
      <Tabs defaultValue={type === "2D" ? "fragment" : "vertex"} className="flex-1 flex flex-col">
        <div className="flex items-center justify-between border-b border-panel-border bg-secondary">
          <TabsList className="h-12 bg-transparent border-0 rounded-none">
            {type === "3D" && (
              <TabsTrigger
                value="vertex"
                className="data-[state=active]:bg-editor-bg data-[state=active]:text-primary rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
              >
                vertex.glsl
              </TabsTrigger>
            )}
            <TabsTrigger
              value="fragment"
              className="data-[state=active]:bg-editor-bg data-[state=active]:text-primary rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
            >
              fragment.glsl
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-hidden">
          {type === "3D" && (
            <TabsContent value="vertex" className="h-full mt-0">
              <Editor
                height="100%"
                language="glsl"
                value={vertexShader}
                onChange={(value) => onVertexChange(value || "")}
                options={editorOptions}
                theme="vs-dark"
                beforeMount={handleEditorWillMount}
                onMount={handleEditorMount}
              />
            </TabsContent>
          )}

          <TabsContent value="fragment" className="h-full mt-0">
            <Editor
              height="100%"
              language="glsl"
              value={fragmentShader}
              onChange={(value) => onFragmentChange(value || "")}
              options={editorOptions}
              theme="vs-dark"
              beforeMount={handleEditorWillMount}
              onMount={handleEditorMount}
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};