import { Portal } from "@/components/portal";
export default async function AdminSection({params,searchParams}:{params:Promise<{section:string}>;searchParams:Promise<{q?:string;userId?:string}>}){const [{section},{q,userId}]=await Promise.all([params,searchParams]);return <Portal role="administrador" section={section} query={q} userId={userId}/>}
