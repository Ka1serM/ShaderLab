// DualOutputPanel.tsx
import { useRef } from "react";
import { ShaderPreview } from "./ShaderPreview";
import * as THREE from "three";

interface DualOutputPanelProps {
  referenceVertexShader: string;
  referenceFragmentShader: string;
  userVertexShader: string;
  userFragmentShader: string;
  modelPath: string;
}

export const DualOutputPanel = ({
  referenceVertexShader,
  referenceFragmentShader,
  userVertexShader,
  userFragmentShader,
  modelPath,
}: DualOutputPanelProps) => {
  const sharedCameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  return (
    <div className="panel relative w-full h-full p-8">
      <div className="grid grid-cols-2 gap-x-4 h-full">
        {/* Reference */}
        <div className="flex flex-col h-full">
          <h3 className="text-xl font-medium text-muted-foreground pb-2">
            Reference
          </h3>
          <div className="relative flex-1">
            <ShaderPreview
              vertexShader={referenceVertexShader}
              fragmentShader={referenceFragmentShader}
              sharedCameraRef={sharedCameraRef}
              modelPath={modelPath}
            />
          </div>
        </div>

        {/* User Output */}
        <div className="flex flex-col h-full">
          <h3 className="text-xl font-medium text-muted-foreground pb-2">
            Output
          </h3>
          <div className="relative flex-1">
            <ShaderPreview
              vertexShader={userVertexShader}
              fragmentShader={userFragmentShader}
              sharedCameraRef={sharedCameraRef}
              modelPath={modelPath}
            />
          </div>
        </div>
      </div>
    </div>
  );
};