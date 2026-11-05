import Link from "next/link";
import type { AppRole } from "@/lib/roles";

const roleNames: Record<AppRole, string> = { alumno: "Alumno", docente: "Profesor", administrador: "Administrador" };
const homes: Record<AppRole, string> = { alumno: "/alumno", docente: "/docente", administrador: "/admin" };
const names: Record<string, string> = {
  herramientas: "Herramientas", usuarios: "Gestión de Usuarios", alumnos: "Alumnos", docentes: "Docentes", solicitudes: "Solicitudes",
  materias: "Mis materias", calificaciones: "Calificaciones", avisos: "Tareas y anuncios", publicaciones: "Tareas y anuncios",
  reportes: "Reportes", respaldos: "Respaldos", recuperacion: "Recuperación", "historial-respaldos": "Historial de respaldos",
  configuracion: "Configuración", perfil: "Perfil", asesorias: "Asesorías", explorar: "Catálogo", favoritos: "Favoritos",
  "mis-materiales": "Mis materiales", subir: "Compartir material", horario: "Horario", grupos: "Mis grupos", carreras: "Carreras",
  periodos: "Periodos", bitacora: "Bitácora", accesos: "Accesos", estadisticas: "Estadísticas", materiales: "Libros / Catálogo",
  "editar-usuario": "Editar", "agregar-usuario": "Agregar", "eliminar-usuario": "Eliminar",
};

export function PortalBreadcrumb({ role, section }: { role: AppRole; section?: string }) {
  const label = section ? names[section] ?? section.charAt(0).toUpperCase() + section.slice(1) : "Inicio";
  return <nav className="portal-breadcrumb" aria-label="Ruta de ubicación">
    <Link href={homes[role]}>{roleNames[role]}</Link>
    <span aria-hidden="true">/</span>
    <strong aria-current="page">{label}</strong>
  </nav>;
}
