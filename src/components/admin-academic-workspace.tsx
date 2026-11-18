"use client";

import { useMemo, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { removeTeacherFromGroup, saveAcademicRecord, withdrawStudentFromGroup } from "@/app/admin/actions";

type Career = { id: string; name: string; code: string; description: string | null; active: boolean };
type Subject = { id: string; career_id: string | null; code: string; name: string; credits: number; semester: number | null; active: boolean };
type Period = { id: string; name: string; starts_on: string; ends_on: string; is_current: boolean };
type Group = { id: string; code: string; subject_id: string; period_id: string; active: boolean };
type Student = {
  id: string;
  control_number: string | null;
  career_id: string | null;
  semester: number | null;
  specialty: string | null;
  first_name: string;
  last_name: string;
  email: string;
  is_active: boolean;
};
type Teacher = { id: string; employee_number: string | null; department: string | null; first_name: string; last_name: string; is_active: boolean };
type TeacherAssignment = { teacher_id: string; group_id: string };
type Enrollment = { id: string; student_id: string; group_id: string; status: string; enrolled_at: string };

export type AdminAcademicData = {
  careers: Career[];
  subjects: Subject[];
  periods: Period[];
  groups: Group[];
  students: Student[];
  teachers: Teacher[];
  teacherAssignments: TeacherAssignment[];
  enrollments: Enrollment[];
};

type Section = "alumnos" | "materias" | "carreras" | "grupos" | "periodos";
type Result = { ok: true } | { ok: false; error: string };

function SearchBox({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  return <label className="admin-academic-search">
    <span>{label}</span>
    <input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder="Escribe para filtrar"/>
  </label>;
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="empty admin-academic-empty">{children}</p>;
}

export function AdminAcademicWorkspace({
  section,
  query,
  data,
  loadError,
}: {
  section: Section;
  query: string;
  data: AdminAcademicData;
  loadError: string | null;
}) {
  const [filter, setFilter] = useState(query);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const careers = useMemo(() => new Map(data.careers.map((item) => [item.id, item])), [data.careers]);
  const subjects = useMemo(() => new Map(data.subjects.map((item) => [item.id, item])), [data.subjects]);
  const periods = useMemo(() => new Map(data.periods.map((item) => [item.id, item])), [data.periods]);
  const students = useMemo(() => new Map(data.students.map((item) => [item.id, item])), [data.students]);
  const groups = useMemo(() => new Map(data.groups.map((item) => [item.id, item])), [data.groups]);
  const searchable = filter.trim().toLocaleLowerCase("es-MX");
  const filtered = <T,>(items: T[], text: (item: T) => string) => items.filter((item) => !searchable || text(item).toLocaleLowerCase("es-MX").includes(searchable));
  const paginate = <T,>(items: T[]) => items.slice(page * pageSize, (page + 1) * pageSize);
  const pageCount = (length: number) => Math.max(1, Math.ceil(length / pageSize));

  function showResult(result: Result, success: string, form?: HTMLFormElement) {
    setMessageIsError(!result.ok);
    setMessage(result.ok ? success : result.error);
    if (result.ok) {
      form?.reset();
      router.refresh();
    }
  }

  function submit(event: FormEvent<HTMLFormElement>, success: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setMessage("");
    startTransition(async () => showResult(await saveAcademicRecord(formData), success, form));
  }

  function withdraw(enrollment: Enrollment) {
    const student = students.get(enrollment.student_id);
    const group = groups.get(enrollment.group_id);
    if (!window.confirm(`¿Retirar a ${student?.control_number ?? "este alumno"} del grupo ${group?.code ?? ""}? Se conservarán sus calificaciones e historial.`)) return;
    setMessage("");
    startTransition(async () => showResult(await withdrawStudentFromGroup(enrollment.id), "Se retiró al alumno del grupo y se conservó su historial."));
  }

  function removeTeacher(assignment: TeacherAssignment) {
    const teacher = data.teachers.find((item) => item.id === assignment.teacher_id);
    if (!window.confirm(`¿Retirar a ${teacher?.employee_number ?? "este docente"} de la asignación del grupo?`)) return;
    setMessage("");
    startTransition(async () => showResult(await removeTeacherFromGroup(assignment.teacher_id, assignment.group_id), "Se retiró la asignación docente."));
  }

  const searchLabel = section === "alumnos"
    ? "Buscar alumno por nombre, correo o número de control"
    : section === "materias"
      ? "Buscar materia por nombre o clave"
      : section === "carreras"
        ? "Buscar carrera por nombre o clave"
        : section === "grupos"
          ? "Buscar grupo por clave"
        : "Buscar ciclo escolar por nombre";

  function footer(length: number) {
    return <div className="admin-academic-pagination">
      <label>Registros por página
        <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(0); }}>
          <option value={10}>10</option><option value={25}>25</option><option value={50}>50</option>
        </select>
      </label>
      <span>{length ? `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, length)} de ${length}` : "0 registros"}</span>
      <div>
        <button type="button" className="button button-secondary" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>Anterior</button>
        <button type="button" className="button button-secondary" disabled={page + 1 >= pageCount(length)} onClick={() => setPage((value) => Math.min(pageCount(length) - 1, value + 1))}>Siguiente</button>
      </div>
    </div>;
  }

  function activeField(value = true) {
    return <label className="field"><span>Estado</span><select name="active" defaultValue={String(value)}><option value="true">Activo</option><option value="false">Inactivo</option></select></label>;
  }

  return <div className="admin-academic-workspace">
    {message && <p className={messageIsError ? "form-error" : "form-success"} role={messageIsError ? "alert" : "status"}>{message}</p>}
    {loadError && <p className="form-error" role="alert">{loadError}</p>}
    {loadError ? <section className="panel"><Empty>Para evitar guardar datos con catálogos incompletos, corrige el problema de carga y recarga esta sección antes de continuar.</Empty></section> : <>
      {section === "carreras" && <>
        <section className="panel admin-directory">
          <div className="module-toolbar"><div><h2>Registrar carrera</h2><p className="muted">Las carreras existentes se conservan; puedes desactivarlas sin borrar sus relaciones académicas.</p></div></div>
          <form className="material-form" onSubmit={(event) => submit(event, "Se guardó la carrera.")}>
            <input type="hidden" name="type" value="career"/><input type="hidden" name="id" value=""/>
            <div className="form-grid">
              <label className="field"><span>Nombre de la carrera</span><input name="name" required minLength={2} maxLength={120}/></label>
              <label className="field"><span>Clave institucional</span><input name="code" required minLength={2} maxLength={30}/></label>
              <label className="field fullcol"><span>Descripción</span><textarea name="description" rows={2} maxLength={1000}/></label>
              {activeField()}
            </div>
            <button className="button" disabled={pending}>Guardar carrera</button>
          </form>
        </section>
        <section className="panel admin-directory"><div className="module-toolbar"><h2>Carreras registradas</h2><span className="pill">{data.careers.length} registros</span></div>
          <SearchBox value={filter} onChange={(value) => { setFilter(value); setPage(0); }} label={searchLabel}/>
          <div className="admin-academic-list">{paginate(filtered(data.careers, (item) => `${item.name} ${item.code}`)).map((career) => <details className="admin-academic-row" key={`${career.id}-${career.name}-${career.code}-${career.active}`}>
            <summary><strong>{career.name}</strong><span>{career.code}</span><span className={`admin-account-status${career.active ? " is-active" : ""}`}>{career.active ? "Activa" : "Inactiva"}</span></summary>
            <form className="material-form" onSubmit={(event) => submit(event, "Se actualizaron los datos de la carrera.")}>
              <input type="hidden" name="type" value="career"/><input type="hidden" name="id" value={career.id}/>
              <div className="form-grid">
                <label className="field"><span>Nombre</span><input name="name" required minLength={2} maxLength={120} defaultValue={career.name}/></label>
                <label className="field"><span>Clave</span><input name="code" required minLength={2} maxLength={30} defaultValue={career.code}/></label>
                <label className="field fullcol"><span>Descripción</span><textarea name="description" rows={2} maxLength={1000} defaultValue={career.description ?? ""}/></label>
                {activeField(career.active)}
              </div><button className="button" disabled={pending}>Guardar cambios</button>
            </form>
          </details>)}</div>{filtered(data.careers, (item) => `${item.name} ${item.code}`).length === 0 && <Empty>No hay carreras que coincidan con la búsqueda.</Empty>}
          {footer(filtered(data.careers, (item) => `${item.name} ${item.code}`).length)}
        </section>
      </>}

      {section === "materias" && <>
        <section className="panel admin-directory">
          <div className="module-toolbar"><div><h2>Registrar materia</h2><p className="muted">Asocia la materia con una carrera existente. La clave debe ser única.</p></div></div>
          <form className="material-form" onSubmit={(event) => submit(event, "Se guardó la materia.")}>
            <input type="hidden" name="type" value="subject"/><input type="hidden" name="id" value=""/>
            <div className="form-grid">
              <label className="field"><span>Nombre</span><input name="name" required minLength={2} maxLength={160}/></label>
              <label className="field"><span>Clave</span><input name="code" required minLength={2} maxLength={40}/></label>
              <label className="field"><span>Carrera</span><select name="careerId" required defaultValue=""><option value="" disabled>Selecciona carrera</option>{data.careers.filter((career) => career.active).map((career) => <option key={career.id} value={career.id}>{career.code} · {career.name}</option>)}</select></label>
              <label className="field"><span>Semestre</span><select name="semester" defaultValue=""><option value="">Sin semestre definido</option>{Array.from({ length: 13 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}°</option>)}</select></label>
              <label className="field"><span>Créditos</span><input name="credits" type="number" min={0} max={32767} step={1} required defaultValue={0}/></label>
              {activeField()}
            </div><button className="button" disabled={pending || !data.careers.some((career) => career.active)}>Guardar materia</button>
          </form>
        </section>
        <section className="panel admin-directory"><div className="module-toolbar"><h2>Materias registradas</h2><span className="pill">{data.subjects.length} registros</span></div>
          <SearchBox value={filter} onChange={(value) => { setFilter(value); setPage(0); }} label={searchLabel}/>
          <div className="admin-academic-list">{paginate(filtered(data.subjects, (item) => `${item.name} ${item.code} ${careers.get(item.career_id ?? "")?.name ?? ""}`)).map((subject) => <details className="admin-academic-row" key={`${subject.id}-${subject.name}-${subject.code}-${subject.career_id}-${subject.semester}-${subject.credits}-${subject.active}`}>
            <summary><strong>{subject.name}</strong><span>{subject.code} · {careers.get(subject.career_id ?? "")?.name ?? "Sin carrera"}</span><span className={`admin-account-status${subject.active ? " is-active" : ""}`}>{subject.active ? "Activa" : "Inactiva"}</span></summary>
            <form className="material-form" onSubmit={(event) => submit(event, "Se actualizaron los datos de la materia.")}>
              <input type="hidden" name="type" value="subject"/><input type="hidden" name="id" value={subject.id}/>
              <div className="form-grid">
                <label className="field"><span>Nombre</span><input name="name" required minLength={2} maxLength={160} defaultValue={subject.name}/></label>
                <label className="field"><span>Clave</span><input name="code" required minLength={2} maxLength={40} defaultValue={subject.code}/></label>
                <label className="field"><span>Carrera</span><select name="careerId" required defaultValue={subject.career_id ?? ""}>{data.careers.map((career) => <option key={career.id} value={career.id}>{career.code} · {career.name}{career.active ? "" : " (inactiva)"}</option>)}</select></label>
                <label className="field"><span>Semestre</span><select name="semester" defaultValue={subject.semester ?? ""}><option value="">Sin semestre definido</option>{Array.from({ length: 13 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}°</option>)}</select></label>
                <label className="field"><span>Créditos</span><input name="credits" type="number" min={0} max={32767} step={1} required defaultValue={subject.credits}/></label>
                {activeField(subject.active)}
              </div><button className="button" disabled={pending}>Guardar cambios</button>
            </form>
          </details>)}</div>{filtered(data.subjects, (item) => `${item.name} ${item.code}`).length === 0 && <Empty>No hay materias que coincidan con la búsqueda.</Empty>}
          {footer(filtered(data.subjects, (item) => `${item.name} ${item.code}`).length)}
        </section>
      </>}

      {section === "periodos" && <>
        <section className="panel admin-directory">
          <div className="module-toolbar"><div><h2>Crear ciclo escolar</h2><p className="muted">Solo puede haber un ciclo vigente. Los ciclos con grupos asociados conservan sus fechas e historial.</p></div></div>
          <form className="material-form" onSubmit={(event) => submit(event, "Se guardó el ciclo escolar.")}>
            <input type="hidden" name="type" value="period"/><input type="hidden" name="id" value=""/>
            <div className="form-grid">
              <label className="field"><span>Nombre del ciclo escolar</span><input name="name" required minLength={2} maxLength={100} placeholder="Ej. Agosto – Diciembre 2027"/><small className="muted">Usa la denominación oficial del calendario institucional.</small></label>
              <label className="field"><span>Fecha de inicio</span><input name="startsOn" type="date" required/></label>
              <label className="field"><span>Fecha de fin</span><input name="endsOn" type="date" required/></label>
              <label className="field"><span>Estado</span><select name="isCurrent" defaultValue="false"><option value="false">Cerrado</option><option value="true">Vigente</option></select></label>
            </div><button className="button" disabled={pending}>Guardar periodo</button>
          </form>
        </section>
        <section className="panel admin-directory"><div className="module-toolbar"><h2>Ciclos escolares registrados</h2><span className="pill">{data.periods.length} registros</span></div>
          <SearchBox value={filter} onChange={(value) => { setFilter(value); setPage(0); }} label={searchLabel}/>
          <div className="admin-academic-list">{paginate(filtered(data.periods, (item) => item.name)).map((period) => <details className="admin-academic-row" key={`${period.id}-${period.name}-${period.starts_on}-${period.ends_on}-${period.is_current}`}>
            <summary><strong>{period.name}</strong><span>{period.starts_on} — {period.ends_on}</span><span className={`admin-account-status${period.is_current ? " is-active" : ""}`}>{period.is_current ? "Vigente" : "Cerrado"}</span></summary>
            <form className="material-form" onSubmit={(event) => submit(event, "Se actualizaron los datos del ciclo escolar.")}>
              <input type="hidden" name="type" value="period"/><input type="hidden" name="id" value={period.id}/>
              <div className="form-grid">
                <label className="field"><span>Nombre del ciclo escolar</span><input name="name" required minLength={2} maxLength={100} defaultValue={period.name}/></label>
                <label className="field"><span>Fecha de inicio</span><input name="startsOn" type="date" required defaultValue={period.starts_on}/></label>
                <label className="field"><span>Fecha de fin</span><input name="endsOn" type="date" required defaultValue={period.ends_on}/></label>
                <label className="field"><span>Estado</span><select name="isCurrent" defaultValue={String(period.is_current)}><option value="false">Cerrado</option><option value="true">Vigente</option></select></label>
              </div><button className="button" disabled={pending}>Guardar cambios</button>
            </form>
          </details>)}</div>{filtered(data.periods, (item) => item.name).length === 0 && <Empty>No hay periodos que coincidan con la búsqueda.</Empty>}
          {footer(filtered(data.periods, (item) => item.name).length)}
        </section>
      </>}

      {section === "grupos" && <>
        <section className="panel admin-directory">
          <div className="module-toolbar"><div><h2>Crear grupo</h2><p className="muted">El grupo queda relacionado con una materia y un periodo existentes.</p></div></div>
          <form className="material-form" onSubmit={(event) => submit(event, "Se guardó el grupo.")}>
            <input type="hidden" name="type" value="group"/><input type="hidden" name="id" value=""/>
            <div className="form-grid">
              <label className="field"><span>Clave del grupo</span><input name="code" required maxLength={40}/></label>
              <label className="field"><span>Materia</span><select name="subjectId" required defaultValue=""><option value="" disabled>Selecciona materia</option>{data.subjects.filter((subject) => subject.active).map((subject) => <option key={subject.id} value={subject.id}>{subject.code} · {subject.name}</option>)}</select></label>
              <label className="field"><span>Ciclo escolar</span><select name="periodId" required defaultValue=""><option value="" disabled>Selecciona ciclo escolar</option>{data.periods.map((period) => <option key={period.id} value={period.id}>{period.name}{period.is_current ? " · Vigente" : ""}</option>)}</select></label>
              {activeField()}
            </div><button className="button" disabled={pending || !data.subjects.some((subject) => subject.active) || !data.periods.length}>Guardar grupo</button>
          </form>
        </section>
        <section className="panel admin-directory"><div className="module-toolbar"><h2>Grupos registrados</h2><span className="pill">{data.groups.length} registros</span></div>
          <SearchBox value={filter} onChange={(value) => { setFilter(value); setPage(0); }} label={searchLabel}/>
          <div className="admin-academic-list">{paginate(filtered(data.groups, (item) => `${item.code} ${subjects.get(item.subject_id)?.name ?? ""} ${periods.get(item.period_id)?.name ?? ""}`)).map((group) => {
            const subject = subjects.get(group.subject_id);
            const period = periods.get(group.period_id);
            const assignments = data.teacherAssignments.filter((assignment) => assignment.group_id === group.id);
            const enrollments = data.enrollments.filter((enrollment) => enrollment.group_id === group.id);
            return <details className="admin-academic-row" key={`${group.id}-${group.code}-${group.subject_id}-${group.period_id}-${group.active}`}>
              <summary><strong>{group.code}</strong><span>{subject?.code} · {subject?.name ?? "Materia sin datos"} · {period?.name ?? "Periodo sin datos"}</span><span className={`admin-account-status${group.active ? " is-active" : ""}`}>{group.active ? "Activo" : "Inactivo"}</span></summary>
              <div className="admin-academic-row-content">
                <form className="material-form" onSubmit={(event) => submit(event, "Se actualizaron los datos del grupo.")}>
                  <input type="hidden" name="type" value="group"/><input type="hidden" name="id" value={group.id}/>
                  <div className="form-grid">
                    <label className="field"><span>Clave</span><input name="code" required maxLength={40} defaultValue={group.code}/></label>
                    <label className="field"><span>Materia</span><select name="subjectId" required defaultValue={group.subject_id}>{data.subjects.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
                    <label className="field"><span>Periodo</span><select name="periodId" required defaultValue={group.period_id}>{data.periods.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                    {activeField(group.active)}
                  </div><button className="button" disabled={pending}>Guardar cambios</button>
                </form>
                <form className="material-form admin-academic-assignment" onSubmit={(event) => submit(event, "Se asignó el docente al grupo.")}>
                  <input type="hidden" name="type" value="teacher-assignment"/><input type="hidden" name="groupId" value={group.id}/>
                  <label className="field"><span>Asignar docente</span><select name="teacherId" required defaultValue=""><option value="" disabled>Selecciona docente</option>{data.teachers.filter((teacher) => teacher.is_active).map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.employee_number} · {[teacher.first_name, teacher.last_name].filter(Boolean).join(" ")}</option>)}</select></label>
                  <button className="button button-secondary" disabled={pending || !data.teachers.some((teacher) => teacher.is_active)}>Asignar</button>
                </form>
                <div className="admin-academic-teacher-list">{assignments.length ? assignments.map((assignment) => {
                  const teacher = data.teachers.find((item) => item.id === assignment.teacher_id);
                  return <div className="admin-academic-teacher" key={assignment.teacher_id}>
                    <span>{teacher ? `${teacher.employee_number ?? "Docente"} · ${teacher.first_name} ${teacher.last_name}` : "Docente asignado"}</span>
                    <button className="button button-secondary" type="button" disabled={pending} onClick={() => removeTeacher(assignment)}>Retirar</button>
                  </div>;
                }) : <p className="admin-academic-assigned">Sin docente asignado</p>}</div>
                <p className="admin-academic-assigned">{enrollments.filter((enrollment) => enrollment.status === "active").length} inscripciones activas · {enrollments.length} registros históricos</p>
              </div>
            </details>;
          })}</div>{filtered(data.groups, (item) => item.code).length === 0 && <Empty>No hay grupos que coincidan con la búsqueda.</Empty>}
          {footer(filtered(data.groups, (item) => item.code).length)}
        </section>
      </>}

      {section === "alumnos" && <>
        <section className="panel admin-directory"><div className="module-toolbar"><div><h2>Expedientes académicos</h2><p className="muted">Actualiza carrera y semestre, consulta grupos inscritos y asigna o retira alumnos sin borrar su historial.</p></div><span className="pill">{data.students.length} alumnos</span></div>
          <SearchBox value={filter} onChange={(value) => { setFilter(value); setPage(0); }} label={searchLabel}/>
          <div className="admin-academic-list">{paginate(filtered(data.students, (item) => `${item.first_name} ${item.last_name} ${item.email} ${item.control_number ?? ""} ${careers.get(item.career_id ?? "")?.name ?? ""}`)).map((student) => {
            const studentEnrollments = data.enrollments.filter((item) => item.student_id === student.id);
            const eligibleGroups = data.groups.filter((group) => {
              const subject = subjects.get(group.subject_id);
              return group.active && student.career_id === subject?.career_id && (subject?.semester == null || subject.semester === student.semester);
            });
            return <details className="admin-academic-row" key={`${student.id}-${student.career_id}-${student.semester}-${student.is_active}`}>
              <summary><strong>{[student.first_name, student.last_name].filter(Boolean).join(" ") || "Alumno sin nombre"}</strong><span>{student.control_number ?? "Sin número de control"} · {careers.get(student.career_id ?? "")?.name ?? "Sin carrera"} · {student.semester ? `${student.semester}° semestre` : "Sin semestre"}</span><span className={`admin-account-status${student.is_active ? " is-active" : ""}`}>{student.is_active ? "Activa" : "Desactivada"}</span></summary>
              <div className="admin-academic-row-content">
                <form className="material-form" onSubmit={(event) => submit(event, "Se actualizó el expediente académico.")}>
                  <input type="hidden" name="type" value="student"/><input type="hidden" name="id" value={student.id}/>
                  <div className="form-grid">
                    <label className="field"><span>Carrera</span><select name="careerId" required defaultValue={student.career_id ?? ""}>{data.careers.map((career) => <option key={career.id} value={career.id}>{career.name}{career.active ? "" : " (inactiva)"}</option>)}</select></label>
                    <label className="field"><span>Semestre</span><select name="semester" required defaultValue={student.semester ?? ""}>{Array.from({ length: 13 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}°</option>)}</select></label>
                  </div><button className="button" disabled={pending || !data.careers.length}>Guardar expediente</button>
                </form>
                <form className="material-form admin-academic-assignment" onSubmit={(event) => submit(event, "Se inscribió al alumno en el grupo.")}>
                  <input type="hidden" name="type" value="enrollment"/><input type="hidden" name="studentId" value={student.id}/>
                  <label className="field"><span>Inscribir en grupo compatible</span><select name="groupId" required defaultValue=""><option value="" disabled>Selecciona grupo</option>{eligibleGroups.map((group) => <option key={group.id} value={group.id}>{group.code} · {subjects.get(group.subject_id)?.name} · {periods.get(group.period_id)?.name}</option>)}</select></label>
                  <button className="button button-secondary" disabled={pending || !eligibleGroups.length}>Inscribir</button>
                </form>
                <div className="admin-academic-enrollments"><h3>Grupos e historial</h3>
                  {studentEnrollments.length ? studentEnrollments.map((enrollment) => <div className="admin-academic-enrollment" key={enrollment.id}>
                    <span><strong>{groups.get(enrollment.group_id)?.code ?? "Grupo"}</strong> · {subjects.get(groups.get(enrollment.group_id)?.subject_id ?? "")?.name ?? "Materia"} · {periods.get(groups.get(enrollment.group_id)?.period_id ?? "")?.name ?? "Periodo"}</span>
                    <span className="admin-account-status">{enrollment.status === "active" ? "Activa" : enrollment.status === "withdrawn" ? "Retirada" : "Concluida"}</span>
                    {enrollment.status === "active" && <button className="button button-secondary admin-academic-withdraw" type="button" disabled={pending} onClick={() => withdraw(enrollment)}>Retirar</button>}
                  </div>) : <Empty>Este alumno todavía no tiene inscripciones a grupos.</Empty>}
                </div>
              </div>
            </details>;
          })}</div>{filtered(data.students, (item) => `${item.first_name} ${item.last_name} ${item.email} ${item.control_number ?? ""} ${careers.get(item.career_id ?? "")?.name ?? ""}`).length === 0 && <Empty>No hay alumnos que coincidan con la búsqueda.</Empty>}
          {footer(filtered(data.students, (item) => `${item.first_name} ${item.last_name} ${item.email} ${item.control_number ?? ""} ${careers.get(item.career_id ?? "")?.name ?? ""}`).length)}
        </section>
      </>}
    </>}
  </div>;
}
