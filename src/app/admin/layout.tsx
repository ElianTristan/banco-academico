import { PageTransition } from "@/components/page-transition";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <PageTransition className="app-shell-page">{children}</PageTransition>;
}
