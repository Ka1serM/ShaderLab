import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Lessons } from "@/pages/Lessons";
import { Lesson } from "@/pages/Lesson";
import { MainLayout } from "@/layouts/MainLayout";
import { NotFound } from "@/pages/NotFound";

export const ROUTES = {
  ROOT: '/',
  LESSONS: '/tasks',
  LESSON: '/task/:idOrName',
} as const;

const queryClient = new QueryClient();

export const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter basename={import.meta.env.DEV ? "/" : "/ShaderLab"}>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path={ROUTES.ROOT} element={<Navigate to={ROUTES.LESSONS} replace />} />

          {/* All lessons list */}
          <Route path={ROUTES.LESSONS} element={<Lessons />} />

          {/* Individual lesson view */}
          <Route path={ROUTES.LESSON} element={<Lesson />} />

          {/* Fallback */}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </QueryClientProvider>
);