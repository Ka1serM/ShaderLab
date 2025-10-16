import { useState } from "react";
import Split from "react-split";
import { TaskPanel } from "./TaskPanel";
import { MonacoEditor } from "./MonacoEditor";
import { DualOutputPanel } from "./DualOutputPanel";

export type LessonType = "3D" | "2D";

export interface Lesson {
  type: LessonType;
  title: string;
  task: string;
  theory: string;
  hints: string[];
  expectedVertexShader: string;
  expectedFragmentShader: string;
  starterVertexShader: string;
  starterFragmentShader: string;
}

interface ShaderLessonProps {
  lesson: Lesson;
}

export const ShaderLesson = ({ lesson }: ShaderLessonProps) => {
  const [vertexShader, setVertexShader] = useState(lesson.starterVertexShader);
  const [fragmentShader, setFragmentShader] = useState(lesson.starterFragmentShader);

  return (
    <div className="min-h-screen bg-background">
      <Split
        sizes={[30, 70]}
        minSize={200}
        gutterSize={8}
        className="flex h-screen"
        gutterAlign="center"
      >
        {/* Left Task Panel */}
        <div className="flex flex-col">
          <TaskPanel
            title={lesson.title}
            task={lesson.task}
            theory={lesson.theory}
            hints={lesson.hints}
          />
        </div>

        {/* Right Side (Editor + Output) */}
        <Split
          direction="vertical"
          sizes={[50, 50]}
          minSize={100}
          gutterSize={6}
          className="flex flex-col flex-1"
          gutterAlign="center"
        >
          {/* Monaco Editor */}
          <div className="flex-1">
            <MonacoEditor
              vertexShader={vertexShader}
              fragmentShader={fragmentShader}
              onVertexChange={setVertexShader}
              onFragmentChange={setFragmentShader}
              type={lesson.type} // <-- fix here
            />
          </div>

          {/* Shader Preview */}
          <div className="flex-1">
            <DualOutputPanel
              expectedVertexShader={lesson.expectedVertexShader}
              expectedFragmentShader={lesson.expectedFragmentShader}
              userVertexShader={vertexShader}
              userFragmentShader={fragmentShader}
            />
          </div>
        </Split>
      </Split>
    </div>
  );
};
