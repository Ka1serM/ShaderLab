import { Outlet, Link, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { Rotate3D } from "lucide-react"; // ← import the flask icon

export const MainLayout = () => {
  const location = useLocation();

  return (
    <div className="flex flex-col min-h-screen w-full bg-background text-foreground overflow-x-hidden">
      {/* Top Navbar */}
      <header className="w-full border-b border-border bg-card/80 backdrop-blur-md">
        <div className="flex items-center justify-between h-14 px-4">
          {/* Left side: logo / home link */}
          <Link
            to="/"
            className="flex items-center gap-2 text-2xl font-bold hover:text-primary transition-colors"
          >
            <Rotate3D className="w-6 h-6" />
            ShaderLab
          </Link>

          {/* Center: navigation links */}
          <nav className="flex items-center gap-4 text-l">
            <Link
              to="/tasks"
              className={cn(
                "hover:text-primary transition-colors",
                location.pathname.startsWith("/tasks") &&
                  "text-primary font-medium"
              )}
            >
              Tasks
            </Link>

            <Link
              to="/about"
              className={cn(
                "hover:text-primary transition-colors",
                location.pathname === "/about" && "text-primary font-medium"
              )}
            >
              About
            </Link>
          </nav>
        </div>
      </header>

      {/* Routed pages */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <Outlet />
      </main>

      {/* Toasters (global notifications) */}
      <Toaster />
      <Sonner />

      {/* Footer */}
      <footer className="text-sm text-muted-foreground p-2 text-right">
        © {new Date().getFullYear()} Marcel Kazemi
      </footer>
    </div>
  );
};
