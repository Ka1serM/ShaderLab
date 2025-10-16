import { ShaderLesson } from "@/components/ShaderLesson";
import lessonsData from "@/data/lessons.json";
import { useParams } from "react-router-dom";

const Index = () => {
  const { id } = useParams();
  
  // Get the specified lesson or default to first lesson
  const lessonIndex = id ? parseInt(id) - 1 : 0;
  const lesson = lessonsData.lessons[lessonIndex] || lessonsData.lessons[0];

  return <ShaderLesson lesson={lesson} />;
};

export default Index;