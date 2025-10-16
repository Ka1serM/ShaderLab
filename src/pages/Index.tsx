import { ShaderLesson } from "@/components/ShaderLesson";
import lessonsData from "@/data/lessons.json";
import { useParams } from "react-router-dom";

const Index = () => {
  const { idOrName } = useParams();
  
  const findLesson = () => {
    if (!idOrName) return lessonsData.lessons[0];

    // Try to parse as number first
    const numericIndex = parseInt(idOrName) - 1;
    if (!isNaN(numericIndex) && numericIndex >= 0) {
      return lessonsData.lessons[numericIndex] || lessonsData.lessons[0];
    }

    // If not a number, try to match by name
    const normalizedName = idOrName.toLowerCase();
    const foundLesson = lessonsData.lessons.find(
      lesson => lesson.title.toLowerCase() === normalizedName
    );
    
    return foundLesson || lessonsData.lessons[0];
  };

  const lesson = findLesson();

  return <ShaderLesson lesson={lesson} />;
};

export default Index;