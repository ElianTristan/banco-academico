import { Portal } from "@/components/portal";
export default async function TeacherSection({params}:{params:Promise<{section:string}>}){const {section}=await params;return <Portal role="docente" section={section}/>}
