import { Portal } from "@/components/portal";
import { redirect } from "next/navigation";
export default async function AdminSection({params,searchParams}:{params:Promise<{section:string}>;searchParams:Promise<{q?:string;userId?:string}>}){const [{section},{q,userId}]=await Promise.all([params,searchParams]);if(section==="calificaciones")redirect("/admin");return <Portal role="administrador" section={section} query={q} userId={userId}/>}
