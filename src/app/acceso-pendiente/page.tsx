import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { BrandLockup } from "@/components/brand-lockup";
import { InstitutionalFooter } from "@/components/institutional-footer";
import { appInfo } from "@/lib/app-info";

export default function PendingAccess() {
  return <div className="auth-layout">
    <main className="auth-main">
      <header className="auth-brand-row"><Link className="auth-brand-link" href="/login" aria-label={`${appInfo.name}, acceso`}><BrandLockup size="compact"/></Link></header>
      <section className="auth-card"><span className="eyebrow">{appInfo.name}</span><h1>Acceso pendiente</h1><p className="muted">Tu cuenta todavía no tiene un perfil académico asignado. Contacta a la administración de tu institución.</p><form action={signOut}><button className="button" type="submit">Cerrar sesión</button></form><p className="auth-bottom"><Link className="text-link" href="/login">Volver al acceso</Link></p></section>
    </main>
    <aside className="auth-info-panel"><span className="auth-info-kicker">{appInfo.moduleName}</span><h2>{appInfo.name}</h2><p className="auth-info-institution">{appInfo.institution}</p><dl className="auth-info-list"><div><dt>Versión</dt><dd>{appInfo.version}</dd></div><div><dt>Equipo</dt><dd>{appInfo.teamName}</dd></div><div><dt>Interfaz actualizada</dt><dd>{appInfo.interfaceUpdatedAt}</dd></div></dl></aside>
    <InstitutionalFooter variant="auth"/>
  </div>;
}
