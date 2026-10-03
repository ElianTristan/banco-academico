import { Portal } from "@/components/portal";
export default async function AdminSection({params}:{params:Promise<{section:string}>}){const {section}=await params;return <Portal role="administrador" section={section}/>}
