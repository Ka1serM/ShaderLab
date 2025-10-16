import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Lightbulb } from "lucide-react";

interface TaskPanelProps {
  title: string;
  task: string;
  theory: string;
  hints: string[];
}

export const TaskPanel = ({ title, task, theory, hints }: TaskPanelProps) => {
  const [openHints, setOpenHints] = useState<number[]>([]);
  return (
    <div className="panel h-full flex flex-col">
      <div className="flex items-center justify-between p-6 border-b border-panel-border">
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
      </div>

      <Tabs defaultValue="task" className="flex-1 flex flex-col">
        <TabsList className="w-full justify-start rounded-none bg-secondary border-b border-panel-border px-6">
          <TabsTrigger value="task" className="data-[state=active]:bg-muted">Task</TabsTrigger>
          <TabsTrigger value="theory" className="data-[state=active]:bg-muted">Theory</TabsTrigger>
        </TabsList>
        
        <div className="flex-1 overflow-auto">
          <TabsContent value="task" className="p-6 mt-0 space-y-4">
            <p className="text-foreground leading-relaxed whitespace-pre-wrap">{task}</p>
            
            {hints && hints.length > 0 && (
              <div className="space-y-2 mt-6">
                <div className="flex items-center gap-2 mb-3">
                  <Lightbulb className="w-4 h-4 text-primary" />
                  <h4 className="text-sm font-semibold text-foreground">Tipps</h4>
                </div>
                {hints.map((hint, index) => (
                  <Collapsible
                    key={index}
                    open={openHints.includes(index)}
                    onOpenChange={(open) => {
                      setOpenHints(prev =>
                        open ? [...prev, index] : prev.filter(i => i !== index)
                      );
                    }}
                  >
                    <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-secondary hover:bg-muted rounded-lg transition-smooth text-left">
                      <span className="text-sm text-foreground">Tipp {index + 1}</span>
                      <ChevronDown
                        className={`w-4 h-4 text-muted-foreground transition-transform ${
                          openHints.includes(index) ? "rotate-180" : ""
                        }`}
                      />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="px-3 py-2">
                      <p className="text-sm text-muted-foreground">{hint}</p>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="theory" className="p-6 mt-0">
            <p className="text-foreground leading-relaxed whitespace-pre-wrap">{theory}</p>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};
