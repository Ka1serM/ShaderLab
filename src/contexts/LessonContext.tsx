import { createContext, useContext, useState, useMemo, useEffect, ReactNode } from "react";
import { useParams } from "react-router-dom";
import lessonsData from "@/data/lessons.json";

export interface Lesson {
  title: string;
  task: string;
  theory: string;
  hints: string[];
  starterVertexShader: string;
  starterFragmentShader: string;
  referenceVertexShader: string;
  referenceFragmentShader: string;
  modelPath: string;
  type: "2D" | "3D";
}

export interface ShaderError {
  line: number;
  message: string;
  type: "vertex" | "fragment";
}

export interface RawShaderError {
  type: "vertex" | "fragment";
  log: string | null;
}

// centralized error processing function
export const processShaderErrors = (rawErrors: RawShaderError[]): ShaderError[] => {
  const parsed: ShaderError[] = [];

  rawErrors.forEach(({ type, log }) => {
    if (!log) return;

    const regex = /ERROR:\s*\d+:(\d+):\s*(.*)/g;
    let match;
    let matched = false;

    while ((match = regex.exec(log))) {
      matched = true;
      parsed.push({
        type,
        line: parseInt(match[1], 10),
        message: match[2],
      });
    }

    if (!matched) {
      console.warn(`Shader ${type} error (unparsed):\n${log}`);
      parsed.push({ type, line: 1, message: log });
    } else {
      console.error(`Shader ${type} errors:\n${log}`);
    }
  });

  return parsed;
};


interface LessonContextType {
  lesson: Lesson;
  allLessons: Lesson[];
  vertexShader: string;
  fragmentShader: string;
  setVertexShader: (s: string) => void;
  setFragmentShader: (s: string) => void;
  shaderErrors: ShaderError[];
  setShaderErrors: (raw: RawShaderError[]) => void;
  horizontalSizes: number[];
  verticalSizes: number[];
  setHorizontalSizes: (sizes: number[]) => void;
  setVerticalSizes: (sizes: number[]) => void;
}

const LessonContext = createContext<LessonContextType | undefined>(undefined);

export const useLessonContext = () => {
  const ctx = useContext(LessonContext);
  if (!ctx) throw new Error("useLessonContext must be used within LessonProvider");
  return ctx;
};

export const LessonProvider = ({ children }: { children: ReactNode }) => {
  const { idOrName } = useParams();

  const findLesson = (): Lesson => {
    if (!idOrName) return lessonsData.lessons[0] as Lesson;
    const found = lessonsData.lessons.find((l) => l.title.toLowerCase() === idOrName.toLowerCase());
    if (found) return found as Lesson;
    const idx = parseInt(idOrName) - 1;
    return idx >= 0 && lessonsData.lessons[idx] ? (lessonsData.lessons[idx] as Lesson) : (lessonsData.lessons[0] as Lesson);
  };

  const lesson = findLesson();
  const allLessons = lessonsData.lessons as Lesson[];

  const lessonIdKey = useMemo(() => `shader-progress-${lesson.title.replace(/\s/g, "_")}`, [lesson.title]);

  const loadShader = (type: "vertex" | "fragment", fallback: string) => {
    const saved = localStorage.getItem(`${lessonIdKey}-${type}`);
    return saved ?? fallback;
  };

  const [vertexShader, setVertexShader] = useState(() => loadShader("vertex", lesson.starterVertexShader));
  const [fragmentShader, setFragmentShader] = useState(() => loadShader("fragment", lesson.starterFragmentShader));

  useEffect(() => {
    setVertexShader(loadShader("vertex", lesson.starterVertexShader));
    setFragmentShader(loadShader("fragment", lesson.starterFragmentShader));
  }, [lessonIdKey, lesson.starterVertexShader, lesson.starterFragmentShader]);

  useEffect(() => localStorage.setItem(`${lessonIdKey}-vertex`, vertexShader), [vertexShader, lessonIdKey]);
  useEffect(() => localStorage.setItem(`${lessonIdKey}-fragment`, fragmentShader), [fragmentShader, lessonIdKey]);

  const [horizontalSizes, setHorizontalSizes] = useState<number[]>(() => {
    const saved = localStorage.getItem("shader-hsplit");
    return saved ? JSON.parse(saved) : [30, 70];
  });
  const [verticalSizes, setVerticalSizes] = useState<number[]>(() => {
    const saved = localStorage.getItem("shader-vsplit");
    return saved ? JSON.parse(saved) : [60, 40];
  });

  useEffect(() => localStorage.setItem("shader-hsplit", JSON.stringify(horizontalSizes)), [horizontalSizes]);
  useEffect(() => localStorage.setItem("shader-vsplit", JSON.stringify(verticalSizes)), [verticalSizes]);

  const [shaderErrors, setShaderErrorsProcesed] = useState<ShaderError[]>([]);

  const setShaderErrors = (raw: RawShaderError[]) => {
    const processed = processShaderErrors(raw);
    setShaderErrorsProcesed(processed);
  };

  return (
    <LessonContext.Provider
      value={{
        lesson,
        allLessons,
        vertexShader,
        fragmentShader,
        setVertexShader,
        setFragmentShader,
        shaderErrors,
        setShaderErrors,
        horizontalSizes,
        verticalSizes,
        setHorizontalSizes,
        setVerticalSizes,
      }}
    >
      {children}
    </LessonContext.Provider>
  );
};