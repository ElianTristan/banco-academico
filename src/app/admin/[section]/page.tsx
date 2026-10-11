import { Portal } from "@/components/portal";
export default async function AdminSection({params,searchParams}:{params:Promise<{section:string}>;searchParams:Promise<{q?:string}>}){const [{section},{q}]=await Promise.all([params,searchParams]);return <Portal role="administrador" section={section} query={q}/>}
