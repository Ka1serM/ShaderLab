import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Lightbulb } from "lucide-react";
import { useLessonContext } from "@/contexts/LessonContext";

export const TaskPanel = () => {
  const { lesson } = useLessonContext();
  const [openHints, setOpenHints] = useState<number[]>([]);

  return (
    <div className="panel h-full flex flex-col rounded-none overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-6 flex-shrink-0">
        <h1 className="text-2xl font-bold text-foreground">{lesson.title}</h1>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="task" className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <TabsList className="justify-start rounded-none bg-secondary px-6 flex-shrink-0">
          <TabsTrigger value="task" className="data-[state=active]:bg-muted">Task</TabsTrigger>
          <TabsTrigger value="theory" className="data-[state=active]:bg-muted">Theory</TabsTrigger>
        </TabsList>

        {/* Task Tab */}
        <TabsContent value="task" className="flex-1 overflow-y-auto overflow-x-hidden p-6 mt-0 space-y-4">

          <div
            className="prose dark:prose-invert min-w-0 w-full" // This has a fixed height defined by its content
            dangerouslySetInnerHTML={{ __html: lesson.task }}
          />
          
          {lesson.hints.length > 0 && (
            <div className="space-y-2 mt-6">
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb className="w-4 h-4 text-primary" />
                <h4 className="text-sm font-semibold text-foreground">Tipps</h4>
              </div>
              
              {lesson.hints.map((hint, index) => (
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
                      className={`w-4 h-4 text-muted-background transition-transform ${
                        openHints.includes(index) ? "rotate-180" : ""
                      }`}
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="px-3 py-2">
                    <p className="text-sm text-muted-background">{hint}</p>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Theory Tab */}
        <TabsContent value="theory" className="flex-1 overflow-y-auto overflow-x-hidden p-6 mt-0">
          <div
            className="prose dark:prose-invert min-w-0 w-full"
            dangerouslySetInnerHTML={{ __html: lesson.theory }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};