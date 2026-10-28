import type { TableDefinition } from "./types";

/**
 * Catálogo ordenado de tablas que componen la base de datos de Banco Académico.
 * El orden es topológico estricto: primero entidades independientes (catálogos),
 * luego dependientes directas, hasta registros de relaciones y bitácoras.
 * Este orden garantiza integridad referencial tanto al exportar como al restaurar.
 */
export const BACKUP_TABLES: readonly TableDefinition[] = [
  // 1. Catálogos raíz
  {
    name: "careers",
    primaryKey: "id",
    label: "Carreras Institucionales",
    category: "catalogo",
  },
  {
    name: "academic_specialties",
    primaryKey: "code",
    dependencies: ["careers"],
    label: "Especialidades Académicas",
    category: "catalogo",
  },
  {
    name: "academic_periods",
    primaryKey: "id",
    label: "Periodos Escolares",
    category: "catalogo",
  },
  {
    name: "classrooms",
    primaryKey: "id",
    label: "Aulas y Edificios",
    category: "catalogo",
  },
  {
    name: "subjects",
    primaryKey: "id",
    dependencies: ["careers"],
    label: "Materias y Asignaturas",
    category: "catalogo",
  },
  {
    name: "subject_specialties",
    primaryKey: ["subject_id", "specialty_code"],
    dependencies: ["subjects", "academic_specialties"],
    label: "Asociaciones Materia-Especialidad",
    category: "catalogo",
  },

  // 2. Usuarios y perfiles (Sanitizados contra contraseñas o secretos)
  {
    name: "profiles",
    primaryKey: "id",
    allowedFields: [
      "id",
      "email",
      "first_name",
      "last_name",
      "role",
      "is_active",
      "avatar_path",
      "preferred_theme",
      "created_at",
      "updated_at",
    ],
    label: "Perfiles de Usuario",
    category: "usuario",
  },
  {
    name: "students",
    primaryKey: "id",
    dependencies: ["profiles", "careers"],
    label: "Expedientes de Alumnos",
    category: "usuario",
  },
  {
    name: "teachers",
    primaryKey: "id",
    dependencies: ["profiles"],
    label: "Expedientes de Docentes",
    category: "usuario",
  },

  // 3. Estructura académica activa
  {
    name: "groups",
    primaryKey: "id",
    dependencies: ["subjects", "academic_periods", "classrooms"],
    label: "Grupos Académicos",
    category: "academico",
  },
  {
    name: "schedules",
    primaryKey: "id",
    dependencies: ["groups", "classrooms"],
    label: "Horarios de Sesión",
    category: "academico",
  },
  {
    name: "teacher_groups",
    primaryKey: "id",
    dependencies: ["teachers", "groups"],
    label: "Asignaciones Docente-Grupo",
    category: "academico",
  },
  {
    name: "enrollments",
    primaryKey: "id",
    dependencies: ["students", "groups"],
    label: "Inscripciones a Grupos",
    category: "academico",
  },
  {
    name: "grades",
    primaryKey: "id",
    dependencies: ["enrollments", "teachers"],
    label: "Calificaciones y Evaluaciones",
    category: "academico",
  },

  // 4. Materiales de estudio, comunidad y solicitudes
  {
    name: "materials",
    primaryKey: "id",
    dependencies: ["profiles", "subjects"],
    allowedFields: [
      "id",
      "title",
      "description",
      "career_id",
      "subject_id",
      "group_id",
      "semester",
      "unit",
      "material_type",
      "storage_path",
      "status",
      "created_by",
      "reviewed_by",
      "reviewed_at",
      "review_note",
      "download_count",
      "created_at",
      "updated_at",
    ],
    label: "Materiales y Recursos",
    category: "comunidad",
  },
  {
    name: "material_favorites",
    primaryKey: ["student_id", "material_id"],
    dependencies: ["materials", "profiles"],
    label: "Favoritos de Materiales",
    category: "comunidad",
  },
  {
    name: "material_downloads",
    primaryKey: "id",
    dependencies: ["materials", "profiles"],
    label: "Registro de Descargas de Recursos",
    category: "comunidad",
  },
  {
    name: "posts",
    primaryKey: "id",
    dependencies: ["profiles", "groups", "subjects"],
    label: "Publicaciones y Avisos",
    category: "comunidad",
  },
  {
    name: "advisory_sessions",
    primaryKey: "id",
    dependencies: ["teachers", "subjects"],
    label: "Sesiones de Asesoría",
    category: "comunidad",
  },
  {
    name: "advisory_reservations",
    primaryKey: "id",
    dependencies: ["advisory_sessions", "students"],
    label: "Reservaciones de Asesoría",
    category: "comunidad",
  },
  {
    name: "teacher_applications",
    primaryKey: "id",
    dependencies: ["profiles"],
    label: "Solicitudes de Acceso Docente",
    category: "comunidad",
  },

  // 5. Bitácoras de auditoría
  {
    name: "access_logs",
    primaryKey: "id",
    dependencies: ["profiles"],
    allowedFields: [
      "id",
      "user_id",
      "occurred_at",
      "event_type",
      "succeeded",
      "session_info",
    ],
    label: "Bitácora de Accesos",
    category: "auditoria",
  },
  {
    name: "activity_logs",
    primaryKey: "id",
    dependencies: ["profiles"],
    allowedFields: [
      "id",
      "user_id",
      "occurred_at",
      "action",
      "module",
      "record_id",
      "description",
      "details",
    ],
    label: "Bitácora de Actividades",
    category: "auditoria",
  },
] as const;

export const TABLE_NAMES = BACKUP_TABLES.map((t) => t.name);

export function getTableDefinition(tableName: string): TableDefinition | undefined {
  return BACKUP_TABLES.find((t) => t.name === tableName);
}
