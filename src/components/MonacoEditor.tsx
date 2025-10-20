import { useRef, useState, useEffect, useCallback } from "react";
import Editor, { BeforeMount, OnMount } from "@monaco-editor/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import * as monaco from "monaco-editor";
import type { languages } from "monaco-editor";
import { useLessonContext } from "@/contexts/LessonContext";

/* ---------------------------- GLSL Language Setup ---------------------------- */
const conf: languages.LanguageConfiguration = {
  comments: { lineComment: "//", blockComment: ["/*", "*/"] },
  brackets: [
    ["{", "}"],
    ["[", "]"],
    ["(", ")"],
  ],
  autoClosingPairs: [
    { open: "[", close: "]" },
    { open: "{", close: "}" },
    { open: "(", close: ")" },
    { open: "'", close: "'", notIn: ["string", "comment"] },
    { open: '"', close: '"', notIn: ["string"] },
  ],
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

/* ------------------------------ Component ------------------------------ */
export const MonacoEditor = () => {
  const {
    lesson,
    vertexShader,
    fragmentShader,
    setVertexShader,
    setFragmentShader,
    shaderErrors,
  } = useLessonContext();

  const vertexEditorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const fragmentEditorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof monaco | null>(null);
  const decorations = useRef({ vertex: [] as string[], fragment: [] as string[] });

  const [activeTab, setActiveTab] = useState(lesson.type === "2D" ? "fragment" : "vertex");
  const [showErrorConsole, setShowErrorConsole] = useState(false);
  const [errorList, setErrorList] = useState<typeof shaderErrors>([]);

  // Only force fragment tab when switching to 2D
  useEffect(() => {
    if (lesson.type === "2D")
      setActiveTab("fragment");
  });

  /* ---------------------------- GLSL Setup ---------------------------- */
  const handleBeforeMount: BeforeMount = (monacoInstance) => {
    monacoRef.current = monacoInstance;
    if (!monacoInstance.languages.getLanguages().some((l) => l.id === "glsl")) {
      monacoInstance.languages.register({ id: "glsl" });
      monacoInstance.languages.setMonarchTokensProvider("glsl", language);
      monacoInstance.languages.setLanguageConfiguration("glsl", conf);
    }
  };

  const handleEditorMount = (type: "vertex" | "fragment"): OnMount =>
    (editor) => {
      if (type === "vertex")
        vertexEditorRef.current = editor;
      else
        fragmentEditorRef.current = editor;
    };

  /* ------------------------ Apply Shader Errors ------------------------ */
  const applyShaderErrors = useCallback(() => {
    if (!monacoRef.current) return;
    const m = monacoRef.current;
    const editors = { vertex: vertexEditorRef.current, fragment: fragmentEditorRef.current };

    const apply = (type: "vertex" | "fragment") => {
      const ed = editors[type];
      if (!ed) return;
      const model = ed.getModel();

      // Clear old decorations
      decorations.current[type] = ed.deltaDecorations(decorations.current[type], []);
      if (model) m.editor.setModelMarkers(model, "shader", []);

      // Filter relevant errors
      const errs = shaderErrors.filter((e) => e.type === type);
      if (errs.length === 0) return;

      const decos = errs.map((err) => ({
        range: new m.Range(err.line, 1, err.line, 1),
        options: {
          isWholeLine: true,
          className: "shader-error-line",
          glyphMarginClassName: "shader-error-glyph",
          hoverMessage: { value: err.message },
        },
      }));
      decorations.current[type] = ed.deltaDecorations([], decos);

      const markers = errs.map((err) => ({
        startLineNumber: err.line,
        startColumn: 1,
        endLineNumber: err.line,
        endColumn: Number.MAX_VALUE,
        message: err.message,
        severity: m.MarkerSeverity.Error,
      }));
      if (model) m.editor.setModelMarkers(model, "shader", markers);
    };

    apply("vertex");
    apply("fragment");

    // Update visible console
    const relevant = shaderErrors.filter((e) => e.type === activeTab);
    setErrorList(relevant);
    setShowErrorConsole(relevant.length > 0);
  }, [shaderErrors, activeTab]);
  useEffect(() => applyShaderErrors(), [applyShaderErrors]);

  /* ---------------------- Typing & Reset Handling ---------------------- */
  const handleChange = (type: "vertex" | "fragment") => (value?: string) => {
    if (type === "vertex") setVertexShader(value || "");
    else setFragmentShader(value || "");

    // Clear decorations while typing
    const ed = type === "vertex" ? vertexEditorRef.current : fragmentEditorRef.current;
    const m = monacoRef.current;
    if (ed && m) {
      const model = ed.getModel();
      ed.deltaDecorations(decorations.current[type], []);
      if (model) m.editor.setModelMarkers(model, "shader", []);
    }

    setErrorList([]);
    setShowErrorConsole(false);
  };

  const [openResetModal, setOpenResetModal] = useState(false);

 const handleReset = () => {
    if (activeTab === "vertex") {
      setVertexShader(lesson.starterVertexShader);
    } else {
      setFragmentShader(lesson.starterFragmentShader);
    }
    setOpenResetModal(false);
  };

  /* ------------------------------ JSX UI ------------------------------ */
  return (
  <div className="panel h-full flex flex-col">
    {/* Resizable Editor Area */}
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
        <TabsList className="w-full justify-start">
          {lesson.type === "3D" && <TabsTrigger value="vertex">vertex.glsl</TabsTrigger>}
          <TabsTrigger value="fragment">fragment.glsl</TabsTrigger>
        </TabsList>

        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0">
            {lesson.type === "3D" && (
              <TabsContent value="vertex" className="h-full mt-0">
                <Editor
                  height="100%"
                  language="glsl"
                  theme="vs-light"
                  value={vertexShader}
                  beforeMount={handleBeforeMount}
                  onMount={handleEditorMount("vertex")}
                  onChange={handleChange("vertex")}
                  options={{ minimap: { enabled: false }, fontSize: 14, lineNumbers: "on", automaticLayout: true }}
                />
              </TabsContent>
            )}
            <TabsContent value="fragment" className="h-full mt-0">
              <Editor
                height="100%"
                language="glsl"
                theme="vs-light"
                value={fragmentShader}
                beforeMount={handleBeforeMount}
                onMount={handleEditorMount("fragment")}
                onChange={handleChange("fragment")}
                options={{ minimap: { enabled: false }, fontSize: 14, lineNumbers: "on", automaticLayout: true }}
              />
            </TabsContent>
          </div>

          {showErrorConsole && (
            <div className="bg-red-950 border-t border-red-800 p-2 max-h-32 overflow-y-auto text-xs font-mono text-red-200">
              <div className="flex items-center justify-between mb-1">
                <span className="text-red-400 font-semibold">SHADER ERRORS ({errorList.length})</span>
                <button onClick={() => setShowErrorConsole(false)} className="text-red-400 hover:text-red-300 text-xs">✕</button>
              </div>
              <div className="space-y-1">
                {errorList.map((err, idx) => (
                  <div key={idx} className="flex gap-2">
                    <span className="text-red-400">[{err.type}:{err.line}]</span>
                    <span>{err.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Tabs>
    </div>

    {/* Fixed Button Bar */}
    <div className="p-1 pr-2 flex justify-end border-t">
      <Dialog open={openResetModal} onOpenChange={setOpenResetModal}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">Reset</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Code?</DialogTitle>
          </DialogHeader>
          <p className="py-2">
            Are you sure you want to reset the code? Any changes in the open Tab will be lost.
          </p>
          <DialogFooter className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpenResetModal(false)}>Cancel</Button>
            <Button onClick={handleReset}>Confirm Reset</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>

    <style>{`
      .shader-error-line { background: rgba(255,0,0,0.08); }
      .shader-error-glyph { background: #ff4d4f; width: 3px !important; margin-left: 3px; }
    `}</style>
  </div>
);
};
