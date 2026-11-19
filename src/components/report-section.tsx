import { redirect } from "next/navigation";
import { ActivityReports, type ActivityReportData } from "@/components/activity-reports";
import { createClient } from "@/lib/supabase/server";
import { isAppRole } from "@/lib/roles";

type QueryResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

class ReportDataError extends Error {}

async function readAll<T>(
  table: string,
  query: (from: number, to: number) => PromiseLike<QueryResult<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await query(from, from + pageSize - 1);
    if (error) {
      console.error(`Could not load ${table} for activity reports.`, error);
      throw new ReportDataError(table);
    }
    if (!data) {
      console.error(`The ${table} query returned no result payload for activity reports.`);
      throw new ReportDataError(table);
    }
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}

export async function ReportSection({
  scope = "administrador",
}: {
  scope?: "administrador" | "docente";
}) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    console.error("Could not authenticate an activity reports request.", authError);
    return <ReportUnavailable message="No se pudo verificar tu sesión. Recarga la página e inténtalo de nuevo." />;
  }
  if (!user) redirect("/login");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role,is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("Could not verify access to activity reports.", profileError);
    return <ReportUnavailable message="No se pudieron verificar tus permisos. Recarga la página e inténtalo de nuevo." />;
  }
  if (
    profile?.is_active !== true ||
    (scope === "administrador" && profile.role !== "administrador") ||
    (scope === "docente" && profile.role !== "docente")
  ) {
    redirect(profile?.role === "docente" ? "/docente" : profile?.role === "administrador" ? "/admin" : "/acceso-pendiente");
  }
  if (
    user.app_metadata?.must_change_password === true ||
    user.user_metadata?.must_change_password === true
  ) {
    redirect("/recuperar/nueva?required=1");
  }

  try {
    const [
      profiles,
      students,
      teachers,
      subjects,
      careers,
      periods,
      groups,
      teacherGroups,
      materials,
      downloads,
      views,
      posts,
    ] = await Promise.all([
      readAll("profiles", (from, to) =>
        supabase
          .from("profiles")
          .select("id,first_name,last_name,role,is_active,created_at")
          .range(from, to),
      ),
      readAll("students", (from, to) =>
        supabase.from("students").select("id,career_id,semester,specialty").range(from, to),
      ),
      readAll("teachers", (from, to) =>
        supabase.from("teachers").select("id,department").range(from, to),
      ),
      readAll("subjects", (from, to) =>
        supabase
          .from("subjects")
          .select("id,career_id,code,name,semester,active")
          .range(from, to),
      ),
      readAll("careers", (from, to) =>
        supabase.from("careers").select("id,name,active").range(from, to),
      ),
      readAll("academic_periods", (from, to) =>
        supabase
          .from("academic_periods")
          .select("id,name,starts_on,ends_on,is_current")
          .order("starts_on", { ascending: false })
          .range(from, to),
      ),
      readAll("groups", (from, to) =>
        supabase.from("groups").select("id,code,subject_id,period_id").range(from, to),
      ),
      readAll("teacher_groups", (from, to) =>
        supabase.from("teacher_groups").select("teacher_id,group_id").range(from, to),
      ),
      readAll("materials", (from, to) =>
        supabase
          .from("materials")
          .select("id,title,description,status,career_id,subject_id,group_id,semester,material_type,storage_path,created_by,created_at,download_count")
          .order("created_at", { ascending: false })
          .range(from, to),
      ),
      readAll("material_downloads", (from, to) =>
        supabase
          .from("material_downloads")
          .select("material_id,user_id,downloaded_at")
          .order("downloaded_at", { ascending: true })
          .range(from, to),
      ),
      readAll("material_views", (from, to) =>
        supabase
          .from("material_views")
          .select("material_id,user_id,viewed_at")
          .order("viewed_at", { ascending: true })
          .range(from, to),
      ),
      readAll("posts", (from, to) =>
        supabase
          .from("posts")
          .select("id,title,created_at,created_by,group_id,subject_id")
          .order("created_at", { ascending: false })
          .range(from, to),
      ),
    ]);

    const data: ActivityReportData = {
      profiles: profiles.map((item) => {
        if (!isAppRole(item.role)) throw new ReportDataError("profiles (rol no válido)");
        return {
          id: item.id,
          name: [item.first_name, item.last_name].filter(Boolean).join(" ") || "Usuario",
          role: item.role,
          active: item.is_active,
          createdAt: item.created_at,
        };
      }),
      students: students.map((item) => ({
        id: item.id,
        careerId: item.career_id,
        semester: item.semester,
        specialty: item.specialty,
      })),
      teachers: teachers.map((item) => ({ id: item.id, department: item.department })),
      subjects,
      careers,
      periods,
      groups,
      teacherGroups,
      materials: materials.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        status: item.status,
        careerId: item.career_id,
        subjectId: item.subject_id,
        groupId: item.group_id,
        semester: item.semester,
        materialType: item.material_type,
        storagePath: item.storage_path,
        authorId: item.created_by,
        createdAt: item.created_at,
        downloadCount: Number(item.download_count ?? 0),
      })),
      downloads: downloads.map((item) => ({
        materialId: item.material_id,
        userId: item.user_id,
        occurredAt: item.downloaded_at,
      })),
      views: views.map((item) => ({
        materialId: item.material_id,
        userId: item.user_id,
        occurredAt: item.viewed_at,
      })),
      posts: posts.map((item) => ({
        id: item.id,
        title: item.title,
        createdAt: item.created_at,
        authorId: item.created_by,
        groupId: item.group_id,
        subjectId: item.subject_id,
      })),
    };

    return <ActivityReports scope={scope} data={data} />;
  } catch (error) {
    if (!(error instanceof ReportDataError)) throw error;
    return (
      <ReportUnavailable message={`No se pudieron cargar los datos de actividad (${error.message}). Verifica las políticas RLS y aplica las migraciones pendientes, incluida la 0017, en una base de pruebas antes de actualizar la base existente.`} />
    );
  }
}

function ReportUnavailable({ message }: { message: string }) {
  return (
    <section className="panel" role="alert">
      <h2>No se pudo cargar el reporte</h2>
      <p className="muted">{message}</p>
    </section>
  );
}
