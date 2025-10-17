import { useNavigate, useParams } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { BookOpen } from "lucide-react";
import lessonsData from "@/data/lessons.json";

export const LessonSidebar = () => {
  const navigate = useNavigate();
  const { idOrName } = useParams();

  return (
    <aside className="h-full flex flex-col">
      <header className="p-4">
        <h2 className="text-2xl font-bold">Tasks</h2>
      </header>

      <ScrollArea className="flex-1">
        <nav className="p-2 space-y-1">
          {lessonsData.lessons.map((lesson, index) => (
          <Button
            key={index}
            variant={
              lesson.title.toLowerCase() === idOrName?.toLowerCase()
                ? "secondary"
                : "ghost"
            }
            className="w-full flex flex-row items-center gap-2 py-2 justify-start"
            onClick={() => navigate(`/task/${lesson.title.toLowerCase()}`)}
          >
            <BookOpen className="h-4 w-4" />
            <span>{lesson.title}</span>
          </Button>
          ))}
        </nav>
      </ScrollArea>
    </aside>
  );
};
