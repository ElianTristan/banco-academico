import { Portal } from "@/components/portal";
import { PageTransition } from "@/components/page-transition";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  return <PageTransition className="app-shell-page">{children ?? <Portal role="alumno" />}</PageTransition>;
}
