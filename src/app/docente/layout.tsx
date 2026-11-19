import { PageTransition } from "@/components/page-transition";

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return <PageTransition className="app-shell-page">{children}</PageTransition>;
}
