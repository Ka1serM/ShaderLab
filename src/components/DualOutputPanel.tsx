// components/DualOutputPanel.tsx
import { useRef } from "react";
import { ShaderPreview } from "./ShaderPreview";
import * as THREE from "three";
import { useLessonContext } from "@/contexts/LessonContext";

export const DualOutputPanel = () => {
  const {
    lesson,
    vertexShader,
    fragmentShader,
    setShaderErrors
  } = useLessonContext();

  const sharedCameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  return (
    <div className="panel relative w-full h-full p-8">
      <div className="grid grid-cols-2 gap-x-4 h-full">
        {/* Reference */}
        <div className="flex flex-col h-full">
          <h3 className="text-xl font-medium text-muted-background pb-2">
            Reference
          </h3>
          <div className="relative flex-1">
            <ShaderPreview
              vertexShader={lesson.referenceVertexShader}
              fragmentShader={lesson.referenceFragmentShader}
              sharedCameraRef={sharedCameraRef}
              modelPath={lesson.modelPath}
              type={lesson.type}
            />
          </div>
        </div>

        {/* User Output */}
        <div className="flex flex-col h-full">
          <h3 className="text-xl font-medium text-muted-background pb-2">
            Output
          </h3>
          <div className="relative flex-1">
            <ShaderPreview
              vertexShader={vertexShader}
              fragmentShader={fragmentShader}
              sharedCameraRef={sharedCameraRef}
              modelPath={lesson.modelPath}
              onError={setShaderErrors}
              type={lesson.type}
            />
          </div>
        </div>
      </div>
    </div>
  );
};