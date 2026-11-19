import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, GraduationCap } from "lucide-react";
import type { AppRole } from "@/lib/roles";

type Props = { role: AppRole; name: string; semester?: number | null };

const content: Record<AppRole, { title: string; accent: string; description: string; primary: string; primaryHref: string; secondary: string; secondaryHref: string }> = {
  alumno: { title: "Aprende y comparte.", accent: "Avanza a tu ritmo.", description: "Materiales, materias y comunidad en un mismo lugar. Entra por lo que necesitas hoy y sigue avanzando.", primary: "Explorar biblioteca", primaryHref: "/alumno/explorar", secondary: "Ver mi horario", secondaryHref: "/alumno/horario" },
  docente: { title: "Enseña y acompaña.", accent: "Comparte lo que sabes.", description: "Organiza tus grupos, comparte recursos y acompaña el avance de tus estudiantes desde un mismo espacio.", primary: "Ver mis grupos", primaryHref: "/docente/grupos", secondary: "Compartir material", secondaryHref: "/docente/subir" },
  administrador: { title: "La comunidad académica.", accent: "Conectada para avanzar.", description: "Personas, recursos y solicitudes institucionales con contexto para tomar decisiones claras.", primary: "Revisar solicitudes", primaryHref: "/admin/solicitudes", secondary: "Ver directorio", secondaryHref: "/admin/usuarios" },
};

export function CampusHero({ role, name, semester }: Props) {
  const copy = content[role];
  const shortName = name.trim().split(/\s+/)[0] || "";
  return <section className={`campus-hero campus-hero-${role}`} aria-labelledby="campus-hero-title">
    <div className="campus-hero-copy">
      {shortName && <p className="hero-greeting">Hola, {shortName}</p>}
      <h1 id="campus-hero-title">{copy.title} <em>{copy.accent}</em></h1>
      <p className="campus-hero-description">{copy.description}</p>
      {semester ? <span className="hero-context"><GraduationCap size={15}/> Semestre {semester}</span> : null}
      <div className="campus-hero-actions"><Link className="hero-primary" href={copy.primaryHref}>{copy.primary}<ArrowUpRight size={17}/></Link><Link className="hero-secondary" href={copy.secondaryHref}>{copy.secondary}<ArrowDownRight size={16}/></Link></div>
    </div>
  </section>;
}
