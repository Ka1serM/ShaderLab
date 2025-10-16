import { ShaderPreview } from "./ShaderPreview";

interface DualOutputPanelProps {
  expectedVertexShader: string;
  expectedFragmentShader: string;
  userVertexShader: string;
  userFragmentShader: string;
}

export const DualOutputPanel = ({
  expectedVertexShader,
  expectedFragmentShader,
  userVertexShader,
  userFragmentShader,
}: DualOutputPanelProps) => {
  return (
    <div className="panel overflow-hidden h-full p-8">
      {/* Added gap-x-4 for horizontal spacing between the two views */}
      <div className="grid grid-cols-2 gap-x-4 divide-x divide-panel-border h-full">
        {/* Expected Output */}
        <div className="flex flex-col h-full">
            <h3 className="text-sm font-medium text-muted-foreground pb-2">Erwartet</h3>
          <div className="flex-1">
            <ShaderPreview
              vertexShader={expectedVertexShader}
              fragmentShader={expectedFragmentShader}
            />
          </div>
        </div>

        {/* User Output */}
        <div className="flex flex-col h-full">
            <h3 className="text-sm font-medium text-muted-foreground pb-2">Ausgabe</h3>
          <div className="flex-1">
            <ShaderPreview
              vertexShader={userVertexShader}
              fragmentShader={userFragmentShader}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
