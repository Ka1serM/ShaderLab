"use client"

import * as React from "react"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { Home, BookOpen, User2, ChevronUp, ChevronDown, PanelLeftClose, PanelLeft } from "lucide-react"
import { useNavigate } from "react-router-dom"
import lessonsData from "@/data/lessons.json"
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible"

// Group lessons by category
const groupLessonsByCategory = (lessons: typeof lessonsData.lessons) => {
  return lessons.reduce((acc, lesson) => {
    const category = lesson.category || "Uncategorized"
    if (!acc[category]) acc[category] = []
    acc[category].push(lesson)
    return acc
  }, {} as Record<string, typeof lessonsData.lessons>)
}

export const AppSidebar = () => {
  const navigate = useNavigate()
  const { open, toggleSidebar } = useSidebar()
  const lessonsByCategory = groupLessonsByCategory(lessonsData.lessons)

  return (
    <Sidebar collapsible="icon" className="transition-none panel">
      {/* Header */}
      <SidebarHeader className="px-3 py-2">
        <div className="flex items-center justify-between">
          {open && (
            <div className="flex items-center gap-2">
              <img src="./favicon.ico" alt="Logo" className="w-5 h-5 dark:invert" />
              <span className="font-semibold text-lg">ShaderLab</span>
            </div>
          )}
          <button
            onClick={toggleSidebar}
            className="rounded hover:bg-sidebar-accent transition-colors"
            title={open ? "Collapse sidebar" : "Expand sidebar"}
          >
            {open ? <PanelLeftClose className="p-1" /> : <PanelLeft className="p-1" />}
          </button>
        </div>
      </SidebarHeader>

      {/* Content */}
      <SidebarContent className="flex-1">
        {/* Home */}
        <SidebarGroup>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <a
                    href="/"
                    onClick={(e) => {
                      e.preventDefault()
                      navigate("/")
                    }}
                  >
                    <Home className="w-4 h-4" />
                    <span>Übersicht</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
        </SidebarGroup>

        {/* Lessons by Category */}
        {Object.entries(lessonsByCategory).map(([category, lessons]) => {
          return (
            <Collapsible key={category} defaultOpen className="group/collapsible">
              <SidebarGroup>
                <SidebarGroupLabel asChild>
                  <CollapsibleTrigger className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      {/* Always show the category text/icon */}
                      <BookOpen className="w-4 h-4" />
                      <span>{category}</span>
                    </div>
                    <ChevronDown className="ml-auto w-4 h-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                  </CollapsibleTrigger>
                </SidebarGroupLabel>

                <CollapsibleContent>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {lessons.map((lesson) => (
                        <SidebarMenuItem key={lesson.title}>
                          <SidebarMenuButton asChild>
                            <a
                              href={`/task/${lesson.title.toLowerCase()}`}
                              onClick={(e) => {
                                e.preventDefault()
                                navigate(`/task/${lesson.title.toLowerCase()}`)
                              }}
                            >
                              <BookOpen />
                              <span>{lesson.title}</span>
                            </a>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
          )
        })}
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton>
              <User2 className="w-4 h-4" />
              {open && <span>Marcel</span>}
              <ChevronUp className="ml-auto w-4 h-4" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      {/* SidebarRail for collapsing */}
      <SidebarRail />
    </Sidebar>
  )
}