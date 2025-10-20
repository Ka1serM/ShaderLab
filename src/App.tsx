import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Tasks } from "@/pages/Tasks";
import { Task } from "@/pages/Task";
import { MainLayout } from "@/layouts/MainLayout";
import { NotFound } from "@/pages/NotFound";

const queryClient = new QueryClient();

export const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter basename={import.meta.env.DEV ? "/" : "/ShaderLab"}>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path='/' element={<Navigate to='/tasks' replace />} />

          {/* All tasks list */}
          <Route path='/tasks' element={<Tasks />} />

          {/* Individual task view */}
          <Route path='/task/:idOrName' element={<Task />} />

          {/* Fallback */}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </QueryClientProvider>
);