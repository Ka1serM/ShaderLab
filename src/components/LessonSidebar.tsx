import { useNavigate, useParams } from "react-router-dom";
import { BookOpen } from "lucide-react";
import { useLessonContext } from "@/contexts/LessonContext";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

export const LessonSidebar = () => {
  const navigate = useNavigate();
  const { idOrName } = useParams();
  const { allLessons } = useLessonContext();

  return (
    <Sidebar collapsible="icon" className="border-r bg-muted/10">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Tasks</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {allLessons.map((lesson, index) => (
                <SidebarMenuItem key={index}>
                  <SidebarMenuButton
                    asChild
                    isActive={lesson.title.toLowerCase() === idOrName?.toLowerCase()}
                  >
                    <a
                      href={`/task/${lesson.title.toLowerCase()}`}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate(`/task/${lesson.title.toLowerCase()}`);
                      }}
                      className="flex items-center gap-2"
                    >
                      <BookOpen className="h-4 w-4" />
                      <span>{lesson.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
};
