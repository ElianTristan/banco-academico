import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { BrandLockup } from "@/components/brand-lockup";
import { InstitutionalFooter } from "@/components/institutional-footer";
import { PageTransition } from "@/components/page-transition";
import { RemotePhoto } from "@/components/remote-photo";
import { appInfo } from "@/lib/app-info";
import { visualAssets } from "@/lib/visual-assets";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <PageTransition className="auth-page-shell">
    <div className="auth-layout">
      <main className="auth-main">
        <header className="auth-brand-row">
          <Link className="auth-brand-link" href="/login" aria-label={`${appInfo.name}, acceso`}><BrandLockup size="compact"/></Link>
          <span className="auth-secure-label"><LockKeyhole size={14} aria-hidden="true"/> Acceso institucional</span>
        </header>
        <section className="auth-card">{children}</section>
      </main>
      <aside className="auth-visual-panel" aria-label="Banco Académico, plataforma académica del ITSLP">
        <RemotePhoto className="auth-visual-photo" src={visualAssets.classroom} sizes="(max-width: 760px) 100vw, 52vw" priority alt="Comunidad académica en un espacio de aprendizaje" />
        <div className="auth-visual-gradient" aria-hidden="true" />
        <div className="auth-visual-content">
          <BrandLockup size="splash" />
          <span className="auth-visual-kicker">{appInfo.institution}</span>
          <h2>Un espacio para aprender, compartir y avanzar.</h2>
          <p>Consulta tus materias, descubre recursos y mantente cerca de tu comunidad académica.</p>
        </div>
      </aside>
      <InstitutionalFooter variant="auth"/>
    </div>
  </PageTransition>;
}
