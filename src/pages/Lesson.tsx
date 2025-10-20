"use client"

import Split from "react-split"
import { LessonProvider, useLessonContext } from "@/contexts/LessonContext"
import { TaskPanel } from "@/components/TaskPanel"
import { MonacoEditor } from "@/components/MonacoEditor"
import { DualOutputPanel } from "@/components/DualOutputPanel"

const LessonContent = () => {
  const {
    horizontalSizes,
    verticalSizes,
    setHorizontalSizes,
    setVerticalSizes,
  } = useLessonContext()

  return (
    <div className="flex flex-1 flex-col overflow-hidden min-h-0">
      {/* Main split layout */}
      <main className="flex-1 overflow-hidden p-4 min-h-0">
        <Split
          sizes={horizontalSizes}
          minSize={200}
          gutterSize={8}
          className="flex h-full"
          gutterAlign="center"
          onDragEnd={setHorizontalSizes}
        >
          <TaskPanel />

          <Split
            direction="vertical"
            sizes={verticalSizes}
            minSize={120}
            gutterSize={6}
            gutterAlign="center"
            className="flex flex-col h-full"
            onDragEnd={setVerticalSizes}
          >
            <div className="flex-1 overflow-hidden min-h-0">
              <MonacoEditor />
            </div>

            <div className="flex-1 overflow-hidden min-h-0">
              <DualOutputPanel />
            </div>
          </Split>
        </Split>
      </main>
    </div>
  )
}

export const Lesson = () => (
  <LessonProvider>
    <div className="flex flex-1 flex-col min-h-screen">
      <LessonContent />
    </div>
  </LessonProvider>
)
