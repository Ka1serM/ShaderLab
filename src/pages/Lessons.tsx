import { useState, useMemo } from "react";
import lessonsData from "@/data/lessons.json";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Search } from "lucide-react";
import { useNavigate } from "react-router-dom";

export const Lessons = () => {
  const navigate = useNavigate();
  const lessons = lessonsData.lessons || [];

  const [query, setQuery] = useState("");

  // Efficiently filter lessons when query changes
  const filteredLessons = useMemo(() => {
    return lessons.filter(
      (lesson) =>
        lesson.title.toLowerCase().includes(query.toLowerCase()) ||
        lesson.task.toLowerCase().includes(query.toLowerCase()) ||
        lesson.theory.toLowerCase().includes(query.toLowerCase())
    );
  }, [lessons, query]);

  return (
<div className="flex flex-col bg-background text-foreground">
  {/* Search bar */}
  <div className="p-6 flex justify-center border-b border-border bg-card/50 backdrop-blur-sm">
    <div className="relative w-full max-w-xl">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-background w-5 h-5" />
      <Input
        type="text"
        placeholder="Aufgaben Filter..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="pl-10 py-6 rounded-2xl text-base shadow-sm focus-visible:ring-1"
      />
    </div>
  </div>

  {/* Lessons Grid */}
  <main className="flex-1 min-h-0 overflow-auto p-6">
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {filteredLessons.length > 0 ? (
        filteredLessons.map((lesson, index) => (
          <Card
            key={index}
            className="hover:shadow-md hover:scale-[1.02] transition-all cursor-pointer"
            onClick={() => navigate(`/task/${lesson.title.toLowerCase()}`)}
          >
            <CardHeader>
              <CardTitle className="text-lg font-semibold">
                {lesson.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-background line-clamp-3">
              {lesson.task.replace(/<[^>]+>/g, "").slice(0, 120)}...
            </CardContent>
          </Card>
        ))
      ) : (
        <p className="text-center text-muted-background col-span-full">
          No lessons found.
        </p>
      )}
    </div>
  </main>
</div>

  );
};
