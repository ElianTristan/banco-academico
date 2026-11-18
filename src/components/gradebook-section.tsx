import { createClient } from "@/lib/supabase/server";
import { GradebookWorkspace, type GradebookGroup, type StudentGradeRow } from "@/components/gradebook-workspace";

type Props = { role: "alumno" | "docente" | "administrador"; userId: string };

function LoadError({ children }: { children: string }) {
  return <section className="panel" role="alert"><p className="form-error">{children}</p></section>;
}

export async function GradebookSection({ role, userId }: Props) {
  const supabase = await createClient();

  if (role === "alumno") {
    const { data: enrollments, error: enrollmentError } = await supabase
      .from("enrollments")
      .select("id,group_id")
      .eq("student_id", userId)
      .eq("status", "active")
      .order("enrolled_at", { ascending: false });
    if (enrollmentError) {
      console.error("Could not load student enrollments for grades.", enrollmentError);
      return <LoadError>No se pudieron cargar tus materias inscritas.</LoadError>;
    }
    if (!enrollments?.length) return <StudentGradeView rows={[]} />;

    const enrollmentIds = enrollments.map((item) => item.id);
    const groupIds = [...new Set(enrollments.map((item) => item.group_id))];
    const [{ data: groups, error: groupError }, { data: grades, error: gradesError }] = await Promise.all([
      supabase.from("groups").select("id,code,subject_id,period_id").in("id", groupIds),
      supabase.from("grades").select("id,enrollment_id,assessment,score,recorded_at").in("enrollment_id", enrollmentIds).order("recorded_at", { ascending: false }),
    ]);
    if (groupError || gradesError) {
      console.error("Could not load student grades or course groups.", groupError ?? gradesError);
      return <LoadError>No se pudieron cargar tus calificaciones.</LoadError>;
    }

    const subjectIds = [...new Set((groups ?? []).map((item) => item.subject_id))];
    const periodIds = [...new Set((groups ?? []).map((item) => item.period_id))];
    const [{ data: subjects, error: subjectError }, { data: periods, error: periodError }] = await Promise.all([
      subjectIds.length ? supabase.from("subjects").select("id,code,name").in("id", subjectIds) : Promise.resolve({ data: [], error: null }),
      periodIds.length ? supabase.from("academic_periods").select("id,name").in("id", periodIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (subjectError || periodError) {
      console.error("Could not load student grade labels.", subjectError ?? periodError);
      return <LoadError>No se pudieron cargar los nombres de tus materias y periodos.</LoadError>;
    }

    const groupById = new Map((groups ?? []).map((item) => [item.id, item]));
    const subjectById = new Map((subjects ?? []).map((item) => [item.id, item]));
    const periodById = new Map((periods ?? []).map((item) => [item.id, item]));
    const enrollmentLabels = new Map(enrollments.map((item) => {
      const group = groupById.get(item.group_id);
      const subject = group ? subjectById.get(group.subject_id) : null;
      const period = group ? periodById.get(group.period_id) : null;
      return [item.id, {
        subject: subject ? `${subject.code} · ${subject.name}` : "Materia no disponible",
        group: group?.code ?? "Grupo no disponible",
        period: period?.name ?? "Periodo no disponible",
      }] as const;
    }));
    const rows: StudentGradeRow[] = (grades ?? []).map((grade) => ({
      id: grade.id,
      assessment: grade.assessment,
      score: grade.score === null ? null : Number(grade.score),
      recordedAt: grade.recorded_at,
      ...(enrollmentLabels.get(grade.enrollment_id) ?? {
        subject: "Materia no disponible",
        group: "Grupo no disponible",
        period: "Periodo no disponible",
      }),
    }));
    return <StudentGradeView rows={rows} />;
  }

  let assignedGroupIds: string[] | null = null;
  if (role === "docente") {
    const { data: assignments, error } = await supabase
      .from("teacher_groups")
      .select("group_id")
      .eq("teacher_id", userId);
    if (error) {
      console.error("Could not load teacher group assignments for grades.", error);
      return <LoadError>No se pudieron cargar tus grupos asignados.</LoadError>;
    }
    assignedGroupIds = (assignments ?? []).map((item) => item.group_id);
    if (!assignedGroupIds.length) return <GradebookWorkspace role={role} groups={[]} />;
  }

  const groupRows: Array<{ id: string; code: string; subject_id: string; period_id: string }> = [];
  for (let from = 0; ; from += 500) {
    let query = supabase.from("groups").select("id,code,subject_id,period_id")
      .eq("active", true).order("code").range(from, from + 499);
    if (assignedGroupIds) query = query.in("id", assignedGroupIds);
    const { data, error } = await query;
    if (error) {
      console.error("Could not load active gradebook groups.", error);
      return <LoadError>No se pudieron cargar los grupos académicos.</LoadError>;
    }
    groupRows.push(...(data ?? []));
    if (!data || data.length < 500) break;
    if (groupRows.length >= 10000) return <LoadError>Hay demasiados grupos para cargar esta sección.</LoadError>;
  }
  if (!groupRows.length) return <GradebookWorkspace role={role} groups={[]} />;

  const subjectIds = [...new Set(groupRows.map((item) => item.subject_id))];
  const periodIds = [...new Set(groupRows.map((item) => item.period_id))];
  const [{ data: subjects, error: subjectError }, { data: periods, error: periodError }] = await Promise.all([
    supabase.from("subjects").select("id,code,name").in("id", subjectIds),
    supabase.from("academic_periods").select("id,name,is_current").in("id", periodIds),
  ]);
  if (subjectError || periodError) {
    console.error("Could not load gradebook group labels.", subjectError ?? periodError);
    return <LoadError>No se pudieron cargar las materias y periodos de los grupos.</LoadError>;
  }

  const subjectById = new Map((subjects ?? []).map((item) => [item.id, item]));
  const periodById = new Map((periods ?? []).map((item) => [item.id, item]));
  const groups: GradebookGroup[] = groupRows.flatMap((group) => {
    const subject = subjectById.get(group.subject_id);
    const period = periodById.get(group.period_id);
    if (!subject || !period || (role === "docente" && !period.is_current)) return [];
    return [{
      id: group.id,
      code: group.code,
      subject: `${subject.code} · ${subject.name}`,
      period: period.name,
    }];
  });

  return <GradebookWorkspace role={role} groups={groups} />;
}

function StudentGradeView({ rows }: { rows: StudentGradeRow[] }) {
  return <section className="panel gradebook-panel">
    <div className="table-head">
      <div><h2>Mis calificaciones</h2><p className="muted">Consulta los resultados registrados en tus materias activas.</p></div>
    </div>
    {!rows.length ? <p className="empty">Todavía no hay calificaciones registradas para tus materias activas.</p> : <div className="gradebook-table-wrap">
      <table className="gradebook-table">
        <thead><tr><th>Periodo</th><th>Materia / grupo</th><th>Evaluación</th><th>Calificación</th><th>Registro</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id}>
          <td>{row.period}</td><td>{row.subject}<small>{row.group}</small></td><td>{row.assessment}</td>
          <td>{row.score === null ? "Sin calificación" : row.score.toFixed(2)}</td>
          <td>{new Date(row.recordedAt).toLocaleDateString("es-MX")}</td>
        </tr>)}</tbody>
      </table>
    </div>}
  </section>;
}
