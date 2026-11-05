import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { BrandLockup } from "@/components/brand-lockup";
import { InstitutionalFooter } from "@/components/institutional-footer";
import { PageTransition } from "@/components/page-transition";
import { appInfo } from "@/lib/app-info";

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
      <aside className="auth-info-panel" aria-label="Información del sistema">
        <span className="auth-info-kicker">Plataforma académica</span>
        <h2>{appInfo.name}</h2>
        <p className="auth-info-institution">{appInfo.institution}</p>
        <dl className="auth-info-list">
          <div><dt>Versión</dt><dd>{appInfo.version}</dd></div>
          <div><dt>Pantalla</dt><dd>{appInfo.moduleName}</dd></div>
          <div><dt>Equipo</dt><dd>{appInfo.teamName}</dd></div>
          <div><dt>Interfaz actualizada</dt><dd>{appInfo.interfaceUpdatedAt}</dd></div>
        </dl>
        <p className="auth-info-note">Consulta materias, recursos y servicios académicos desde el espacio correspondiente a tu perfil.</p>
      </aside>
      <InstitutionalFooter variant="auth"/>
    </div>
  </PageTransition>;
}
