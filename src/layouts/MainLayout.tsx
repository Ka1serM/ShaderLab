"use client"

import { Outlet } from "react-router-dom"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/Sidebar"

export const MainLayout = () => {
  return (
    <SidebarProvider>
      <div className="flex h-screen w-screen overflow-hidden">
        {/* Sidebar */}
        <AppSidebar />

        {/* Main content next to sidebar */}
        <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
          <main className="flex flex-1 min-h-0">
            {/* Outlet fills the remaining space */}
            <div className="flex-1 min-h-0 flex overflow-hidden">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  )
}
