import { Portal } from "@/components/portal";
export default async function StudentSection({params}:{params:Promise<{section:string}>}){const {section}=await params;return <Portal role="alumno" section={section}/>}
