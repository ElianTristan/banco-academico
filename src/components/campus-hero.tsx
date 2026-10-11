import Image from "next/image";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, BookOpen, CalendarDays, GraduationCap, Library, Sparkles } from "lucide-react";
import type { AppRole } from "@/lib/roles";

type Props = { role: AppRole; name: string; semester?: number | null; available: number; enrolled: number; favorites: number; materials: number };

const content: Record<AppRole, { eyebrow: string; title: string; accent: string; description: string; primary: string; primaryHref: string; secondary: string; secondaryHref: string; orbit: string }> = {
  alumno: { eyebrow: "Tu campus, conectado", title: "Aprende y comparte.", accent: "Avanza a tu ritmo.", description: "Materiales, materias y comunidad en un mismo lugar. Entra por lo que necesitas hoy y sigue avanzando.", primary: "Explorar biblioteca", primaryHref: "/alumno/explorar", secondary: "Ver mi horario", secondaryHref: "/alumno/horario", orbit: "Un banco de conocimiento que crece contigo" },
  docente: { eyebrow: "Enseñar, compartir, acompañar", title: "Enseña y acompaña.", accent: "Comparte lo que sabes.", description: "Organiza tus grupos, comparte recursos y acompaña el avance de tus estudiantes desde un mismo espacio.", primary: "Ver mis grupos", primaryHref: "/docente/grupos", secondary: "Compartir material", secondaryHref: "/docente/subir", orbit: "Conecta tus clases con nuevos recursos" },
  administrador: { eyebrow: "Gestión académica", title: "La comunidad académica.", accent: "Conectada para avanzar.", description: "Personas, recursos y solicitudes institucionales con contexto para tomar decisiones claras.", primary: "Revisar solicitudes", primaryHref: "/admin/solicitudes", secondary: "Ver directorio", secondaryHref: "/admin/usuarios", orbit: "Personas y recursos conectados" },
};

export function CampusHero({ role, name, semester, available, enrolled, favorites, materials }: Props) {
  const copy = content[role];
  const shortName = name.trim().split(/\s+/)[0] || "";
  return <section className={`campus-hero campus-hero-${role}`} aria-labelledby="campus-hero-title">
    <div className="campus-hero-copy">
      <div className="hero-institution" aria-label="Instituto Tecnológico de San Luis Potosí y Tecnológico Nacional de México">
        <span className="hero-logo hero-logo-itslp"><Image src="/brand/itslp.png" alt="Instituto Tecnológico de San Luis Potosí" width={299} height={280} priority /></span>
        <span className="hero-logo hero-logo-tecnm"><Image src="/brand/tecnm.png" alt="Tecnológico Nacional de México" width={447} height={447} priority /></span>
        <span className="hero-institution-divider" aria-hidden="true" />
        <span className="hero-institution-caption">Plataforma académica<br/>ITSLP · TecNM</span>
      </div>
      <span className="hero-eyebrow"><Sparkles size={14}/>{shortName ? `Hola, ${shortName} · ${copy.eyebrow}` : copy.eyebrow}</span>
      <h1 id="campus-hero-title">{copy.title} <em>{copy.accent}</em></h1>
      <p className="campus-hero-description">{copy.description}</p>
      {semester ? <span className="hero-context"><GraduationCap size={15}/> Semestre {semester}</span> : null}
      <div className="campus-hero-actions"><Link className="hero-primary" href={copy.primaryHref}>{copy.primary}<ArrowUpRight size={17}/></Link><Link className="hero-secondary" href={copy.secondaryHref}>{copy.secondary}<ArrowDownRight size={16}/></Link></div>
      <div className="hero-signal"><span className="hero-signal-line"/><span>{copy.orbit}</span></div>
    </div>
    <div className="hero-graphic" aria-label="Material académico, materias y comunidad conectados">
      <div className="hero-graphic-wash"/>
      <div className="hero-orbit hero-orbit-one"/><div className="hero-orbit hero-orbit-two"/><div className="hero-orbit hero-orbit-three"/>
      <div className="hero-core"><span className="hero-core-kicker">BANCO</span><strong>BA</strong><span className="hero-core-caption">conocimiento<br/>compartido</span></div>
      <div className="hero-node hero-node-library"><span><Library size={18}/></span><div><strong>Biblioteca</strong><small>{available || materials} recursos</small></div></div>
      <div className="hero-node hero-node-classes"><span><BookOpen size={18}/></span><div><strong>Materias</strong><small>{enrolled} en tu espacio</small></div></div>
      <div className="hero-node hero-node-schedule"><span><CalendarDays size={18}/></span><div><strong>Comunidad</strong><small>{favorites} guardados</small></div></div>
      <span className="hero-star hero-star-one"/><span className="hero-star hero-star-two"/><span className="hero-star hero-star-three"/>
      <div className="hero-graphic-caption"><span>01</span><span>Conocimiento en circulación</span><span>ITSLP</span></div>
    </div>
    <div className="hero-index" aria-hidden="true"><span>BA</span><span>01 / 03</span></div>
  </section>;
}
