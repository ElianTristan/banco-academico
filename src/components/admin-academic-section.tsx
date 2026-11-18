import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAppRole, roleHomes } from "@/lib/roles";
import { AdminAcademicWorkspace, type AdminAcademicData } from "@/components/admin-academic-workspace";

type AdminSection = "alumnos" | "materias" | "carreras" | "grupos" | "periodos";

const emptyData: AdminAcademicData = {
  careers: [],
  subjects: [],
  periods: [],
  groups: [],
  students: [],
  teachers: [],
  teacherAssignments: [],
  enrollments: [],
};

async function readAll<T>(
  label: string,
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const rows: T[] = [];
  const batchSize = 500;
  for (let from = 0; ; from += batchSize) {
    const { data, error } = await query(from, from + batchSize - 1);
    if (error) {
      console.error(`Could not load ${label} for academic administration.`, error);
      return null;
    }
    if (!data) {
      console.error(`The ${label} query returned no data payload.`);
      return null;
    }
    rows.push(...data);
    if (data.length < batchSize) return rows;
  }
}

async function readProfiles<T>(
  ids: string[],
  load: (batch: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  label: string,
) {
  const rows: T[] = [];
  for (let index = 0; index < ids.length; index += 200) {
    const { data, error } = await load(ids.slice(index, index + 200));
    if (error) {
      console.error(`Could not load ${label}.`, error);
      return null;
    }
    if (!data) {
      console.error(`The ${label} query returned no data payload.`);
      return null;
    }
    rows.push(...data);
  }
  return rows;
}

export async function AdminAcademicSection({
  section,
  query,
}: {
  section: AdminSection;
  query?: string;
}) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login");
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role,is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) {
    console.error("Could not verify access to administrative academic records.", profileError);
    return <AdminAcademicWorkspace section={section} query={query ?? ""} data={emptyData} loadError="No se pudieron verificar tus permisos." />;
  }
  if (!isAppRole(profile?.role)) redirect("/acceso-pendiente");
  if (profile.is_active !== true) redirect("/login?error=inactive");
  if (profile.role !== "administrador") redirect(roleHomes[profile.role]);

  const data: AdminAcademicData = { ...emptyData };
  const errors: string[] = [];
  const safeQuery = query?.replace(/[^\p{L}\p{N}@.-]/gu, " ").trim().slice(0, 80) ?? "";

  if (section === "carreras" || section === "materias" || section === "alumnos" || section === "grupos") {
    const rows = await readAll("academic careers", (from, to) => supabase.from("careers")
      .select("id,name,code,description,active")
      .order("name")
      .range(from, to));
    if (rows) data.careers = rows;
    else errors.push("carreras");
  }

  if (section === "materias" || section === "grupos" || section === "alumnos") {
    const rows = await readAll("subjects", (from, to) => supabase.from("subjects")
      .select("id,career_id,code,name,credits,semester,active")
      .order("name")
      .range(from, to));
    if (rows) data.subjects = rows;
    else errors.push("materias");
  }

  if (section === "periodos" || section === "grupos" || section === "alumnos") {
    const rows = await readAll("academic periods", (from, to) => supabase.from("academic_periods")
      .select("id,name,starts_on,ends_on,is_current")
      .order("starts_on", { ascending: false })
      .range(from, to));
    if (rows) data.periods = rows;
    else errors.push("periodos");
  }

  if (section === "grupos" || section === "periodos" || section === "alumnos") {
    const rows = await readAll("academic groups", (from, to) => supabase.from("groups")
      .select("id,code,subject_id,period_id,active")
      .order("code")
      .range(from, to));
    if (rows) data.groups = rows;
    else errors.push("grupos");
  }

  if (section === "grupos") {
    const [teachersResult, assignmentsResult, enrollmentsResult] = await Promise.all([
      readAll("teachers", (from, to) => supabase.from("teachers").select("id,employee_number,department").order("employee_number").range(from, to)),
      readAll("group teacher assignments", (from, to) => supabase.from("teacher_groups").select("teacher_id,group_id").range(from, to)),
      readAll("group enrollments", (from, to) => supabase.from("enrollments").select("id,student_id,group_id,status,enrolled_at").order("enrolled_at", { ascending: false }).range(from, to)),
    ]);
    if (!teachersResult) {
      errors.push("docentes");
    } else {
      const teacherIds = teachersResult.map((teacher) => teacher.id);
      const profilesResult = await readProfiles(
        teacherIds,
        (batch) => supabase.from("profiles").select("id,first_name,last_name,is_active").in("id", batch),
        "teacher names for group assignment",
      );
      if (!profilesResult) {
        errors.push("perfiles docentes");
      } else {
        const profileById = new Map(profilesResult.map((item) => [item.id, item]));
        data.teachers = teachersResult.map((teacher) => ({
          ...teacher,
          first_name: profileById.get(teacher.id)?.first_name ?? "",
          last_name: profileById.get(teacher.id)?.last_name ?? "",
          is_active: profileById.get(teacher.id)?.is_active === true,
        }));
      }
    }
    if (!assignmentsResult) {
      errors.push("asignaciones docentes");
    } else data.teacherAssignments = assignmentsResult;
    if (!enrollmentsResult) {
      errors.push("inscripciones");
    } else data.enrollments = enrollmentsResult;
  }

  if (section === "alumnos") {
    const studentRows = await readAll("student academic records", (from, to) => supabase.from("students")
      .select("id,control_number,career_id,semester,specialty")
      .order("control_number")
      .range(from, to));
    if (!studentRows) {
      errors.push("alumnos");
    } else {
      const studentIds = studentRows.map((student) => student.id);
      const [profilesResult, enrollmentsResult] = await Promise.all([
        readProfiles(
          studentIds,
          (batch) => supabase.from("profiles").select("id,first_name,last_name,email,is_active").in("id", batch),
          "student profile details",
        ),
        readAll("student group enrollments", (from, to) => supabase.from("enrollments").select("id,student_id,group_id,status,enrolled_at").order("enrolled_at", { ascending: false }).range(from, to)),
      ]);
      if (!profilesResult) {
        errors.push("perfiles de alumnos");
      }
      if (!enrollmentsResult) {
        errors.push("inscripciones");
      } else data.enrollments = enrollmentsResult;
      const profileById = new Map((profilesResult ?? []).map((item) => [item.id, item]));
      data.students = studentRows.map((student) => ({
        ...student,
        first_name: profileById.get(student.id)?.first_name ?? "",
        last_name: profileById.get(student.id)?.last_name ?? "",
        email: profileById.get(student.id)?.email ?? "",
        is_active: profileById.get(student.id)?.is_active === true,
      }));
    }
  }

  const loadError = errors.length
    ? `No se pudieron cargar todos los datos (${errors.join(", ")}). Recarga la página antes de guardar cambios.`
    : null;
  return <AdminAcademicWorkspace section={section} query={safeQuery} data={data} loadError={loadError} />;
}
