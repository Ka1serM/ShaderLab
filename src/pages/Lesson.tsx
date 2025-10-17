import { useState, useMemo, useEffect } from "react";
import Split from "react-split";
import { useParams } from "react-router-dom";
import lessonsData from "@/data/lessons.json";
import { TaskPanel } from "@/components/TaskPanel";
import { MonacoEditor } from "@/components/MonacoEditor";
import { DualOutputPanel } from "@/components/DualOutputPanel";
import { LessonSidebar } from "@/components/LessonSidebar";

export const Lesson = () => {
  const { idOrName } = useParams();

  const findLesson = () => {
    if (!idOrName) return lessonsData.lessons[0];

    const foundLesson = lessonsData.lessons.find(
      lesson => lesson.title.toLowerCase() === idOrName.toLowerCase()
    );

    if (foundLesson) return foundLesson;

    const numericIndex = parseInt(idOrName) - 1;
    return numericIndex >= 0 && lessonsData.lessons[numericIndex]
      ? lessonsData.lessons[numericIndex]
      : lessonsData.lessons[0];
  };

  const lesson = findLesson();

  // State Persistence Logic
  // 1. Calculate a unique, stable key for the current lesson's state
  const lessonIdKey = useMemo(() => 
    `shader-progress-${lesson.title.replace(/\s/g, '_')}`, 
    [lesson.title]
  );

  // Helper function to load state from localStorage or use fallback starter code
  const loadShader = (type: 'vertex' | 'fragment', fallback: string) => {
    const key = `${lessonIdKey}-${type}`;
    const saved = localStorage.getItem(key);
    return saved !== null ? saved : fallback;
  };

  // 2. Initialize state by loading saved data
  const [vertexShader, setVertexShader] = useState(() =>
    loadShader('vertex', lesson.starterVertexShader)
  );
  const [fragmentShader, setFragmentShader] = useState(() =>
    loadShader('fragment', lesson.starterFragmentShader)
  );

  // 3. Effect to RESET/LOAD state when the lesson changes (lesson switch)
  // This ensures that when lessonIdKey (based on lesson.title) changes, the component loads the new lesson's saved state.
  useEffect(() => {
    setVertexShader(loadShader('vertex', lesson.starterVertexShader));
    setFragmentShader(loadShader('fragment', lesson.starterFragmentShader));
  }, [lessonIdKey, lesson.starterVertexShader, lesson.starterFragmentShader]);

  // 4. Effects to SAVE state whenever the shaders change
  useEffect(() => {
    localStorage.setItem(`${lessonIdKey}-vertex`, vertexShader);
  }, [vertexShader, lessonIdKey]);

  useEffect(() => {
    localStorage.setItem(`${lessonIdKey}-fragment`, fragmentShader);
  }, [fragmentShader, lessonIdKey]);

  const [horizontalSizes, setHorizontalSizes] = useState<number[]>(() => {
    const saved = localStorage.getItem("shader-hsplit");
    return saved ? JSON.parse(saved) : [30, 70];
  });

  const [verticalSizes, setVerticalSizes] = useState<number[]>(() => {
    const saved = localStorage.getItem("shader-vsplit");
    return saved ? JSON.parse(saved) : [60, 40];
  });

  useEffect(() => {
    localStorage.setItem("shader-hsplit", JSON.stringify(horizontalSizes));
  }, [horizontalSizes]);

  useEffect(() => {
    localStorage.setItem("shader-vsplit", JSON.stringify(verticalSizes));
  }, [verticalSizes]);

  return (
    <div className="flex flex-1 min-h-0 w-full bg-background overflow-hidden">
      {/* Sidebar */}
      <LessonSidebar />

      {/* Main content */}
      <div className="flex-1 min-h-0 flex">
        {/* Horizontal Split */}
        <Split
          sizes={horizontalSizes}
          minSize={200}
          gutterSize={8}
          className="flex flex-1 min-h-0"
          gutterAlign="center"
          onDragEnd={setHorizontalSizes}
        >
          {/* Left Panel */}
            <TaskPanel
              title={lesson.title}
              task={lesson.task}
              theory={lesson.theory}
              hints={lesson.hints}
            />

          {/* Right Vertical Split */}
          <Split
            direction="vertical"
            sizes={verticalSizes}
            minSize={100}
            gutterSize={6}
            className="flex flex-col flex-1 min-h-0"
            gutterAlign="center"
            onDragEnd={setVerticalSizes}
          >
            {/* Monaco Editor */}
            <div className="overflow-hidden min-h-0">
              <MonacoEditor
                vertexShader={vertexShader}
                fragmentShader={fragmentShader}
                onVertexChange={setVertexShader}
                onFragmentChange={setFragmentShader}
                type={lesson.type as "3D" | "2D"}
                originalFragmentShader={lesson.starterFragmentShader}
                originalVertexShader={lesson.starterVertexShader}
              />
            </div>

            {/* Dual Output Panel */}
            <div className="overflow-hidden min-h-0">
              <DualOutputPanel
                referenceVertexShader={lesson.referenceVertexShader}
                referenceFragmentShader={lesson.referenceFragmentShader}
                userVertexShader={vertexShader}
                userFragmentShader={fragmentShader}
                modelPath={lesson.modelPath}
              />
            </div>
          </Split>
        </Split>
      </div>
    </div>
  );
};
