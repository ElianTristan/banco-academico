import { redirect } from "next/navigation";
import { AcademicReports, type AcademicReportData } from "@/components/academic-reports";
import { createClient } from "@/lib/supabase/server";

type QueryResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

type ProfileRow = {
  id: string;
  first_name: string;
  last_name: string;
  role: "alumno" | "docente" | "administrador";
  is_active: boolean | null;
};

type StudentRow = {
  id: string;
  career_id: string | null;
  semester: number | null;
  specialty: string | null;
  created_at: string;
};
type TeacherRow = { id: string; department: string | null; created_at: string };
type SubjectRow = {
  id: string;
  career_id: string | null;
  code: string;
  name: string;
  semester: number | null;
  active: boolean;
  created_at: string;
};
type CareerRow = { id: string; name: string; active: boolean };
type PeriodRow = {
  id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  is_current: boolean;
};
type GroupRow = {
  id: string;
  code: string;
  subject_id: string;
  period_id: string;
  active: boolean;
};
type EnrollmentRow = {
  id: string;
  student_id: string;
  group_id: string;
  status: "active" | "withdrawn" | "completed";
};
type TeacherGroupRow = { teacher_id: string; group_id: string };
type GradeRow = {
  id: string;
  enrollment_id: string;
  score: number | null;
  assessment: string;
  recorded_by: string | null;
  recorded_at: string;
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
      console.error(`Could not load ${table} for academic reports.`, error);
      throw new ReportDataError(`Could not load ${table}.`);
    }
    if (!data) {
      console.error(`The ${table} query returned no result payload for academic reports.`);
      throw new ReportDataError(`The ${table} query returned no data.`);
    }

    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}

async function readByIds<T>(
  table: string,
  ids: string[],
  query: (ids: string[], from: number, to: number) => PromiseLike<QueryResult<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  const uniqueIds = [...new Set(ids)];
  for (let index = 0; index < uniqueIds.length; index += 200) {
    const batch = uniqueIds.slice(index, index + 200);
    rows.push(...await readAll<T>(table, (from, to) => query(batch, from, to)));
  }
  return rows;
}

async function readProfiles(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileIds: string[],
): Promise<ProfileRow[]> {
  const profiles: ProfileRow[] = [];
  const uniqueIds = [...new Set(profileIds)];

  for (let index = 0; index < uniqueIds.length; index += 200) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id,first_name,last_name,role,is_active")
      .in("id", uniqueIds.slice(index, index + 200));
    if (error) {
      console.error("Could not load profile labels for academic reports.", error);
      throw new ReportDataError("Could not load profile details.");
    }
    if (!data) {
      console.error("The profile query returned no result payload for academic reports.");
      throw new ReportDataError("The profile query returned no data.");
    }
    profiles.push(...data);
  }

  return profiles;
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
    console.error("Could not authenticate an academic reports request.", authError);
    return <ReportUnavailable message="No se pudo verificar tu sesión. Recarga la página e inténtalo de nuevo." />;
  }
  if (!user) redirect("/login");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role,is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("Could not verify access to academic reports.", profileError);
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
    const [grades, students, teachers, subjects, careers, periods] =
      await Promise.all([
        readAll<GradeRow>("grades", (from, to) =>
          supabase
            .from("grades")
            .select("id,enrollment_id,score,assessment,recorded_by,recorded_at")
            .order("recorded_at", { ascending: true })
            .range(from, to),
        ),
        readAll<StudentRow>("students", (from, to) =>
          supabase.from("students").select("id,career_id,semester,specialty,created_at").range(from, to),
        ),
        readAll<TeacherRow>("teachers", (from, to) =>
          supabase.from("teachers").select("id,department,created_at").range(from, to),
        ),
        readAll<SubjectRow>("subjects", (from, to) =>
          supabase
            .from("subjects")
            .select("id,career_id,code,name,semester,active,created_at")
            .range(from, to),
        ),
        readAll<CareerRow>("careers", (from, to) =>
          supabase.from("careers").select("id,name,active").range(from, to),
        ),
        readAll<PeriodRow>("academic_periods", (from, to) =>
          supabase
            .from("academic_periods")
            .select("id,name,starts_on,ends_on,is_current")
            .order("starts_on", { ascending: false })
            .range(from, to),
        ),
      ]);
    const enrollments = await readByIds<EnrollmentRow>(
      "enrollments",
      grades.map((grade) => grade.enrollment_id),
      (ids, from, to) =>
        supabase
          .from("enrollments")
          .select("id,student_id,group_id,status")
          .in("id", ids)
          .range(from, to),
    );
    const groupIds = enrollments.map((enrollment) => enrollment.group_id);
    const [groups, teacherGroups] = await Promise.all([
      readByIds<GroupRow>("groups", groupIds, (ids, from, to) =>
        supabase
          .from("groups")
          .select("id,code,subject_id,period_id,active")
          .in("id", ids)
          .range(from, to),
      ),
      readByIds<TeacherGroupRow>("teacher_groups", groupIds, (ids, from, to) =>
        supabase
          .from("teacher_groups")
          .select("teacher_id,group_id")
          .in("group_id", ids)
          .range(from, to),
      ),
    ]);

    const groupIdsByTeacher = new Map<string, string[]>();
    for (const assignment of teacherGroups) {
      const current = groupIdsByTeacher.get(assignment.group_id) ?? [];
      current.push(assignment.teacher_id);
      groupIdsByTeacher.set(assignment.group_id, current);
    }

    const profileIds = [
      ...students.map((student) => student.id),
      ...teachers.map((teacher) => teacher.id),
      ...grades.flatMap((grade) => (grade.recorded_by ? [grade.recorded_by] : [])),
    ];
    const profiles = await readProfiles(supabase, profileIds);
    const profileById = new Map(profiles.map((item) => [item.id, item]));
    const studentById = new Map(students.map((item) => [item.id, item]));
    const subjectById = new Map(subjects.map((item) => [item.id, item]));
    const careerById = new Map(careers.map((item) => [item.id, item]));
    const groupById = new Map(groups.map((item) => [item.id, item]));
    const periodById = new Map(periods.map((item) => [item.id, item]));
    const enrollmentById = new Map(enrollments.map((item) => [item.id, item]));
    const teacherById = new Map(teachers.map((item) => [item.id, item]));

    const records: AcademicReportData["records"] = grades.map((grade) => {
      const enrollment = enrollmentById.get(grade.enrollment_id);
      const group = enrollment ? groupById.get(enrollment.group_id) : undefined;
      const subject = group ? subjectById.get(group.subject_id) : undefined;
      if (!enrollment || !group || !subject) {
        console.error("An academic report record is missing a related enrollment, group, or subject.", {
          gradeId: grade.id,
          enrollmentId: grade.enrollment_id,
        });
        throw new ReportDataError("Some academic records could not be matched to their catalog data.");
      }

      const student = studentById.get(enrollment.student_id);
      const period = periodById.get(group.period_id);
      const careerId = student?.career_id ?? subject.career_id;
      const teacherIds = groupIdsByTeacher.get(group.id) ?? [];
      const teacherNames = teacherIds.map((teacherId) => {
        const teacherProfile = profileById.get(teacherId);
        const teacherName = [teacherProfile?.first_name, teacherProfile?.last_name]
          .filter(Boolean)
          .join(" ");
        return teacherName || teacherById.get(teacherId)?.department || "Docente";
      });
      const recordedByProfile = grade.recorded_by ? profileById.get(grade.recorded_by) : undefined;
      const recordedByName = recordedByProfile
        ? [recordedByProfile.first_name, recordedByProfile.last_name].filter(Boolean).join(" ")
        : "";
      const teacherDepartments = teacherIds.flatMap((teacherId) => {
        const department = teacherById.get(teacherId)?.department;
        return department ? [department] : [];
      });

      return {
        id: grade.id,
        enrollmentId: enrollment.id,
        studentId: enrollment.student_id,
        studentActive: profileById.get(enrollment.student_id)?.is_active ?? null,
        careerId,
        careerName: careerId ? careerById.get(careerId)?.name ?? null : null,
        specialty: student?.specialty ?? null,
        studentSemester: student?.semester ?? null,
        groupId: group.id,
        groupCode: group.code,
        groupActive: group.active,
        subjectId: subject.id,
        subjectCode: subject.code,
        subjectName: subject.name,
        subjectSemester: subject.semester,
        subjectActive: subject.active,
        periodId: period?.id ?? null,
        periodName: period?.name ?? null,
        periodStartsOn: period?.starts_on ?? null,
        periodEndsOn: period?.ends_on ?? null,
        teacherIds,
        teacherNames,
        teacherDepartments,
        recordedBy: grade.recorded_by,
        recordedByName: recordedByName || null,
        score: grade.score === null ? null : Number(grade.score),
        assessment: grade.assessment,
        recordedAt: grade.recorded_at,
        enrollmentStatus: enrollment.status,
      };
    });

    return (
      <AcademicReports
        scope={scope}
        records={records}
        students={students.map((student) => ({
          id: student.id,
          careerId: student.career_id,
          specialty: student.specialty,
          semester: student.semester,
          createdAt: student.created_at,
          active: profileById.get(student.id)?.is_active ?? null,
        }))}
        teachers={teachers
          .filter((teacher) => scope === "administrador" || teacherGroups.some((assignment) => assignment.teacher_id === teacher.id))
          .map((teacher) => ({
          id: teacher.id,
          department: teacher.department,
          createdAt: teacher.created_at,
          name:
            [profileById.get(teacher.id)?.first_name, profileById.get(teacher.id)?.last_name]
              .filter(Boolean)
              .join(" ") ||
            teacher.department ||
            "Docente",
          active: profileById.get(teacher.id)?.is_active ?? null,
          }))}
        subjects={subjects}
        careers={careers}
        periods={periods}
      />
    );
  } catch (error) {
    if (!(error instanceof ReportDataError)) throw error;
    console.error("Academic reports could not be assembled.", error);
    return (
      <ReportUnavailable message="No se pudieron cargar los datos académicos. Verifica las tablas y políticas RLS aplicadas y vuelve a actualizar." />
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
