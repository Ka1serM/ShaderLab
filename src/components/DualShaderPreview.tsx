import { ShaderCanvas } from "./ShaderCanvas";
import { useLessonContext } from "@/contexts/LessonContext";

export const DualShaderPreview = () => {
  const { lesson, vertexShader, fragmentShader, setShaderErrors, sharedCameraRef, sharedTargetRef } =
    useLessonContext();

  return (
    <div className="panel relative w-full h-full p-4">
      <div className="grid grid-cols-2 gap-x-4 h-full">
        {/* Reference Shader */}
        <div className="flex flex-col h-full">
          <h3 className="text-xl font-medium text-muted-background pb-2">Reference</h3>
          <div className="relative flex-1">
            <ShaderCanvas
              lesson={lesson}
              vertexShader={lesson.referenceVertexShader}
              fragmentShader={lesson.referenceFragmentShader}
              sharedCameraRef={sharedCameraRef}
              sharedTargetRef={sharedTargetRef}
            />
          </div>
        </div>

        {/* User Output Shader */}
        <div className="flex flex-col h-full">
          <h3 className="text-xl font-medium text-muted-background pb-2">Output</h3>
          <div className="relative flex-1">
            <ShaderCanvas
              lesson={lesson}
              vertexShader={vertexShader}
              fragmentShader={fragmentShader}
              sharedCameraRef={sharedCameraRef}
              sharedTargetRef={sharedTargetRef}
              onError={setShaderErrors}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
