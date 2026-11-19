import Link from "next/link";
import { ArrowUpRight, BookOpenCheck } from "lucide-react";
import type { AppRole } from "@/lib/roles";
import { visualAssets } from "@/lib/visual-assets";
import { RemotePhoto } from "@/components/remote-photo";

export function CampusPhotoStory({ role }: { role: Extract<AppRole, "alumno" | "docente"> }) {
  const student = role === "alumno";
  return <section className={`campus-photo-story campus-photo-story-${role}`} aria-labelledby="campus-photo-title">
    <div className="campus-photo-frame"><RemotePhoto src={visualAssets.collaboration} alt="Estudiantes trabajan juntos en una mesa con sus equipos y apuntes" sizes="(max-width: 720px) 100vw, (max-width: 1100px) 50vw, 40vw"/></div>
    <div className="campus-photo-copy"><span className="photo-story-mark"><BookOpenCheck size={17}/>{student ? "Aprender en comunidad" : "Compartir conocimiento"}</span><h2 id="campus-photo-title">{student ? <>Las buenas ideas<br/>se construyen <em>en equipo.</em></> : <>Lo que enseñas<br/>puede abrir <em>nuevos caminos.</em></>}</h2><p>{student ? "Encuentra recursos compartidos por tu comunidad y guarda los que acompañan tus materias." : "Pon tus materiales al alcance de tus grupos y acompaña el aprendizaje desde el aula."}</p><Link href={student ? "/alumno/explorar" : "/docente/subir"}>{student ? "Ir a la biblioteca" : "Compartir material"}<ArrowUpRight size={16}/></Link></div>
    <span className="photo-story-index" aria-hidden="true">BA / CAMPUS</span>
  </section>;
}
