"use client"

import Split from "react-split"
import { LessonProvider, useLessonContext } from "@/contexts/LessonContext"
import { TaskPanel } from "@/components/TaskPanel"
import { MonacoEditor } from "@/components/MonacoEditor"
import { DualShaderPreview } from "@/components/DualShaderPreview"

export const Task = () => {
  return (
    <LessonProvider>
      <div className="flex flex-1 flex-col h-full w-full">
        <main className="flex-1 overflow-hidden p-4 min-h-0">
          <Split
            sizes={[35, 65]}
            minSize={120}
            gutterSize={8}
            className="flex h-full w-full"
            gutterAlign="center"
          >
            <TaskPanel />

            <Split
              direction="vertical"
              sizes={[60, 40]}
              minSize={120}
              gutterSize={8}
              gutterAlign="center"
              className="flex flex-col h-full w-full"
            >
              <MonacoEditor />
              <DualShaderPreview />
            </Split>
          </Split>
        </main>
      </div>
    </LessonProvider>
  )
}