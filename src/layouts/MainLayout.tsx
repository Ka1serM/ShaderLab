"use client"

import { Outlet } from "react-router-dom"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/Sidebar"

export const MainLayout = () => {
  return (
    <SidebarProvider>
      {/* Root sets the fixed height */}
      <div className="flex h-screen w-screen overflow-hidden">
        <AppSidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <main className="flex-1 flex overflow-hidden">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  )
}