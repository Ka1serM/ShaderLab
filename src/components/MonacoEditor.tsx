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

    const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<typeof monaco | null>(null);
    const decorations = useRef<string[]>([]);

    const [activeTab, setActiveTab] = useState(lesson.type === "2D" ? "fragment" : "vertex");
    const [showErrorConsole, setShowErrorConsole] = useState(false);
    const [errorList, setErrorList] = useState<typeof shaderErrors>([]);

    // Dark mode detection
    const [isDark, setIsDark] = useState(false);
    useEffect(() => {
      const root = window.document.documentElement;
      setIsDark(root.classList.contains("dark"));
      const observer = new MutationObserver(() => {
        setIsDark(root.classList.contains("dark"));
      });
      observer.observe(root, { attributes: true, attributeFilter: ["class"] });
      return () => observer.disconnect();
    }, []);

    /* ---------------------- GLSL Setup ---------------------- */
    const handleBeforeMount: BeforeMount = (monacoInstance) => {
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

    /* ---------------------- Apply Shader Errors ---------------------- */
    const applyShaderErrors = useCallback(() => {
      if (!monacoRef.current || !editorRef.current) return;
      const m = monacoRef.current;
      const ed = editorRef.current;

      // Clear old decorations
      decorations.current = ed.deltaDecorations(decorations.current, []);
      const model = ed.getModel();
      if (model) m.editor.setModelMarkers(model, "shader", []);

      const relevantErrors = shaderErrors.filter((e) => e.type === activeTab);
      if (relevantErrors.length === 0) return;

      const decos = relevantErrors.map((err) => ({
        range: new m.Range(err.line, 1, err.line, 1),
        options: {
          isWholeLine: true,
          className: "shader-error-line",
          glyphMarginClassName: "shader-error-glyph",
          hoverMessage: { value: err.message },
        },
      }));

      decorations.current = ed.deltaDecorations([], decos);

      const markers = relevantErrors.map((err) => ({
        startLineNumber: err.line,
        startColumn: 1,
        endLineNumber: err.line,
        endColumn: Number.MAX_VALUE,
        message: err.message,
        severity: m.MarkerSeverity.Error,
      }));
      if (model) m.editor.setModelMarkers(model, "shader", markers);

      setErrorList(relevantErrors);
      setShowErrorConsole(relevantErrors.length > 0);
    }, [shaderErrors, activeTab]);

    useEffect(() => applyShaderErrors(), [applyShaderErrors]);

    /* ---------------------- Handle Change ---------------------- */
    const handleChange = (value?: string) => {
      if (activeTab === "vertex") setVertexShader(value || "");
      else setFragmentShader(value || "");

      if (!editorRef.current || !monacoRef.current) return;

      // Clear decorations while typing
      editorRef.current.deltaDecorations(decorations.current, []);
      const model = editorRef.current.getModel();
      if (model) monacoRef.current.editor.setModelMarkers(model, "shader", []);

      setErrorList([]);
      setShowErrorConsole(false);
    };

    /* ---------------------- Reset ---------------------- */
    const [openResetModal, setOpenResetModal] = useState(false);
    const handleReset = () => {
      if (activeTab === "vertex") setVertexShader(lesson.starterVertexShader);
      else setFragmentShader(lesson.starterFragmentShader);
      setOpenResetModal(false);
    };

    /* ---------------------- Current Value ---------------------- */
    const currentValue = activeTab === "vertex" ? vertexShader : fragmentShader;

    /* ------------------------------ JSX ------------------------------ */
    return (
      <div className="panel h-full flex flex-col">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 overflow-hidden">
          <TabsList className="w-full justify-start panel">
            {lesson.type === "3D" && <TabsTrigger value="vertex">vertex.glsl</TabsTrigger>}
            <TabsTrigger value="fragment">fragment.glsl</TabsTrigger>
          </TabsList>

          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <Editor
              height="100%"
              language="glsl"
              theme={isDark ? "vs-dark" : "vs-light"}
              value={currentValue}
              beforeMount={handleBeforeMount}
              onMount={handleEditorMount}
              onChange={handleChange}
              options={{ minimap: { enabled: false }, fontSize: 14, lineNumbers: "on", automaticLayout: true }}
            />

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

        {/* Fixed Button Bar */}
        <div className="p-1 flex justify-end">
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
