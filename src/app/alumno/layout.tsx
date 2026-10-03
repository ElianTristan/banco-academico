import { Portal } from "@/components/portal";
export default async function StudentLayout({children}:{children:React.ReactNode}){return children ?? <Portal role="alumno"/>}
