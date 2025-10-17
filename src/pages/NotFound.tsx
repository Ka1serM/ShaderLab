import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-background text-foreground px-4">
      {/* Large 404 */}
      <h1 className="text-[6rem] font-extrabold text-center text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary mb-6">
        404
      </h1>

      {/* Message */}
      <p className="text-lg sm:text-xl text-center text-muted-foreground mb-6 max-w-md">
        Oops! Die Seite <span className="font-medium">{location.pathname}</span> existiert leider nicht. 
        Wie bist du denn hier gelandet? ;)
      </p>

      {/* Back to home button */}
      <Button onClick={() => (window.location.href = "/")} className="text-lg">
        Zur Startseite
      </Button>

      {/* Optional subtle background pattern */}
      <div className="absolute inset-0 pointer-events-none">
        <svg
          className="w-full h-full opacity-5"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
        >
          <defs>
            <pattern
              id="dots"
              x="0"
              y="0"
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="1" cy="1" r="1" fill="currentColor" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dots)" />
        </svg>
      </div>
    </div>
  );
};