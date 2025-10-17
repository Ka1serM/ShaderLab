import { useRef, useState, useEffect } from "react";
import Editor, { BeforeMount, OnMount } from "@monaco-editor/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import * as monaco from "monaco-editor";
import type { languages } from "monaco-editor";

interface MonacoEditorProps {
  vertexShader: string;
  fragmentShader: string;
  onVertexChange: (value: string) => void;
  onFragmentChange: (value: string) => void;
  type: "2D" | "3D";
  originalVertexShader?: string;
  originalFragmentShader: string;
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
    'const','uniform','break','continue','do','for','while','if','else',
    'switch','case','in','out','inout','true','false','invariant','discard',
    'return','sampler2D','samplerCube','sampler3D','struct','radians','degrees',
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


// ----------------- MonacoEditor Component -----------------
export const MonacoEditor = ({
  vertexShader,
  fragmentShader,
  onVertexChange,
  onFragmentChange,
  originalVertexShader,
  originalFragmentShader,
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

  const handleEditorWillMount: BeforeMount = (monacoInstance) => {
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


  const [activeTab, setActiveTab] = useState(
    type === "2D" ? "fragment" : "vertex"
  );

  // Only force fragment tab when switching to 2D
  useEffect(() => {
    if (type === "2D") {
      setActiveTab("fragment");
    }
  }, [type]);

  const [openResetModal, setOpenResetModal] = useState(false);

  const handleReset = () => {
    if (activeTab === "vertex") {
      onVertexChange(originalVertexShader || "");
    } else {
      onFragmentChange(originalFragmentShader);
    }
    setOpenResetModal(false);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Editor Tabs */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <TabsList className="w-full justify-start rounded-none bg-secondary">
            {type === "3D" && <TabsTrigger value="vertex">vertex.glsl</TabsTrigger>}
            <TabsTrigger value="fragment">fragment.glsl</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-auto">
            {type === "3D" && (
              <TabsContent value="vertex" className="h-full mt-0">
                <Editor
                  height="100%"
                  language="glsl"
                  theme="vs-dark"
                  value={vertexShader}
                  onChange={(v) => onVertexChange(v || "")}
                  beforeMount={handleEditorWillMount}
                  onMount={handleEditorMount}
                  options={editorOptions}
                />
              </TabsContent>
            )}
            <TabsContent value="fragment" className="h-full mt-0">
              <Editor
                height="100%"
                language="glsl"
                theme="vs-dark"
                value={fragmentShader}
                onChange={(v) => onFragmentChange(v || "")}
                beforeMount={handleEditorWillMount}
                onMount={handleEditorMount}
                options={editorOptions}
              />
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* Reset Button at Bottom */}
      <div className="p-1 pr-2 flex justify-end bg-secondary rounded-b-xl">
        <Dialog open={openResetModal} onOpenChange={setOpenResetModal}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              Reset
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reset Code?</DialogTitle>
            </DialogHeader>
            <p className="py-2">
              Are you sure you want to reset the code? Any unsaved changes will be lost.
            </p>
            <DialogFooter className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpenResetModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleReset}>Confirm Reset</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};
