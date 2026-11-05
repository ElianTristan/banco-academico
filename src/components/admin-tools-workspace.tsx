import Link from "next/link";
import {
  Activity, ArchiveRestore, BookOpen, ClipboardList, FileBarChart2,
  GraduationCap, HardDriveDownload, Library, Megaphone, ScrollText,
  Settings2, ShieldCheck, Users, UserRound, CalendarDays,
} from "lucide-react";

const groups = [
  {
    title: "Directorio y acceso",
    items: [
      { label: "Usuarios", description: "Cuentas y estado de acceso.", href: "/admin/usuarios", icon: Users },
      { label: "Alumnos", description: "Directorio de estudiantes.", href: "/admin/alumnos", icon: GraduationCap },
      { label: "Docentes", description: "Directorio de docentes.", href: "/admin/docentes", icon: UserRound },
      { label: "Solicitudes docentes", description: "Solicitudes pendientes de revisión.", href: "/admin/solicitudes", icon: ShieldCheck },
    ],
  },
  {
    title: "Estructura académica",
    items: [
      { label: "Materias", description: "Catálogo de asignaturas.", href: "/admin/materias", icon: BookOpen },
      { label: "Carreras", description: "Programas académicos.", href: "/admin/carreras", icon: Library },
      { label: "Grupos", description: "Grupos académicos.", href: "/admin/grupos", icon: ClipboardList },
      { label: "Periodos", description: "Periodos escolares.", href: "/admin/periodos", icon: CalendarDays },
      { label: "Calificaciones", description: "Registros de evaluación.", href: "/admin/calificaciones", icon: FileBarChart2 },
    ],
  },
  {
    title: "Operación",
    items: [
      { label: "Biblioteca y revisión", description: "Materiales compartidos y su estado.", href: "/admin/materiales", icon: Library },
      { label: "Asesorías", description: "Sesiones y reservaciones.", href: "/admin/asesorias", icon: Users },
      { label: "Avisos", description: "Publicaciones institucionales.", href: "/admin/avisos", icon: Megaphone },
      { label: "Reportes", description: "Indicadores disponibles.", href: "/admin/reportes", icon: FileBarChart2 },
    ],
  },
  {
    title: "Respaldo y seguridad",
    items: [
      { label: "Respaldos", description: "Genera y consulta copias de seguridad.", href: "/admin/respaldos", icon: HardDriveDownload },
      { label: "Recuperación", description: "Valida y revisa un archivo de respaldo.", href: "/admin/recuperacion", icon: ArchiveRestore },
      { label: "Historial de respaldos", description: "Actividad de respaldo y recuperación.", href: "/admin/historial-respaldos", icon: Activity },
      { label: "Bitácora", description: "Registro de actividad administrativa.", href: "/admin/bitacora", icon: ScrollText },
      { label: "Accesos", description: "Eventos de autenticación registrados.", href: "/admin/accesos", icon: ShieldCheck },
    ],
  },
  {
    title: "Preferencias",
    items: [
      { label: "Configuración", description: "Información general del entorno.", href: "/admin/configuracion", icon: Settings2 },
      { label: "Perfil", description: "Tus datos y preferencias personales.", href: "/admin/perfil", icon: UserRound },
    ],
  },
];

export function AdminToolsWorkspace() {
  return (
    <div className="admin-tools-page">
      <div className="admin-tools-intro">
        <span className="eyebrow">Accesos administrativos</span>
        <p>Abre cada módulo directamente. Las opciones se muestran según tus permisos de administrador.</p>
      </div>
      {groups.map((group) => (
        <section className="admin-tool-group" key={group.title} aria-labelledby={`tools-${group.title}`}>
          <h2 id={`tools-${group.title}`}>{group.title}</h2>
          <div className="admin-tool-grid">
            {group.items.map(({ label, description, href, icon: Icon }) => (
              <Link className="admin-tool-link" href={href} key={href}>
                <span className="admin-tool-icon"><Icon size={17} aria-hidden="true" /></span>
                <span className="admin-tool-copy"><strong>{label}</strong><small>{description}</small></span>
                <span className="admin-tool-arrow" aria-hidden="true">↗</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
