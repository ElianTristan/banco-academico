"use client";

import { useState, useTransition } from "react";
import { loadGradebook, saveGrades } from "@/app/academic/actions";

export type GradebookGroup = { id: string; code: string; subject: string; period: string };
export type StudentGradeRow = {
  id: string;
  assessment: string;
  score: number | null;
  recordedAt: string;
  subject: string;
  group: string;
  period: string;
};
type RosterItem = {
  enrollmentId: string;
  controlNumber: string | null;
  grades: Array<{ id: string; assessment: string; score: number | null; recordedAt: string }>;
};

export function GradebookWorkspace({ role, groups }: { role: "docente" | "administrador"; groups: GradebookGroup[] }) {
  const [groupId, setGroupId] = useState("");
  const [roster, setRoster] = useState<RosterItem[] | null>(null);
  const [assessment, setAssessment] = useState("");
  const [draftScores, setDraftScores] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, startTransition] = useTransition();

  function loadSelectedGroup() {
    if (!groupId) {
      setError("Selecciona un grupo para cargar su lista.");
      return;
    }
    setError("");
    setMessage("");
    setRoster(null);
    startTransition(async () => {
      const result = await loadGradebook(groupId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRoster(result.items);
    });
  }

  function submitGrades() {
    if (!groupId || !assessment.trim() || !roster) {
      setError("Selecciona un grupo y escribe el nombre de la evaluación.");
      return;
    }
    const grades = roster.flatMap((student) => {
      const value = draftScores[student.enrollmentId];
      if (value === undefined || value.trim() === "") return [];
      const score = Number(value);
      if (!Number.isFinite(score) || score < 0 || score > 100) return [{ enrollmentId: student.enrollmentId, score: Number.NaN }];
      return [{ enrollmentId: student.enrollmentId, score }];
    });
    if (!grades.length) {
      setError("Captura al menos una calificación antes de guardar.");
      return;
    }
    if (grades.some((grade) => !Number.isFinite(grade.score))) {
      setError("Cada calificación debe ser un número entre 0 y 100.");
      return;
    }

    setError("");
    setMessage("");
    startTransition(async () => {
      const result = await saveGrades(groupId, assessment, grades);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDraftScores({});
      setMessage("Las calificaciones se guardaron correctamente.");
      const refreshed = await loadGradebook(groupId);
      if (refreshed.ok) setRoster(refreshed.items);
      else setError(`Se guardaron los datos, pero no se pudo actualizar la lista: ${refreshed.error}`);
    });
  }

  if (!groups.length) {
    return <section className="panel gradebook-panel">
      <h2>Captura de calificaciones</h2>
      <p className="empty">{role === "docente" ? "No tienes grupos asignados en el periodo vigente." : "No hay grupos activos disponibles para captura."}</p>
    </section>;
  }

  return <section className="panel gradebook-panel">
    <div className="table-head"><div><h2>Captura de calificaciones</h2><p className="muted">{role === "docente" ? "Solo puedes editar los grupos que tienes asignados en el periodo vigente." : "Selecciona un grupo activo para registrar o corregir evaluaciones."}</p></div></div>
    <div className="gradebook-controls">
      <label className="field"><span>Grupo académico</span><select disabled={busy} value={groupId} onChange={(event) => { setGroupId(event.target.value); setRoster(null); setDraftScores({}); setError(""); }}>
        <option value="">Selecciona un grupo</option>
        {groups.map((group) => <option key={group.id} value={group.id}>{group.subject} · {group.code} · {group.period}</option>)}
      </select></label>
      <button className="button secondary" type="button" disabled={busy || !groupId} onClick={loadSelectedGroup}>{busy ? "Cargando…" : "Cargar alumnos"}</button>
    </div>
    {roster && <>
      {!roster.length ? <p className="empty">Este grupo no tiene alumnos inscritos activos.</p> : <>
        <div className="gradebook-controls gradebook-assessment">
          <label className="field"><span>Evaluación</span><input value={assessment} maxLength={80} onChange={(event) => { setAssessment(event.target.value); setDraftScores({}); }} placeholder="Ej. Parcial 1"/></label>
          <p className="field-help">Usa el mismo nombre para actualizar una evaluación existente. Las calificaciones se validan de 0 a 100.</p>
        </div>
        <div className="gradebook-table-wrap">
          <table className="gradebook-table">
            <thead><tr><th>Número de control</th><th>Evaluación seleccionada</th><th>Calificación</th><th>Evaluación registrada</th></tr></thead>
            <tbody>{roster.map((student) => {
              const existing = student.grades.find((grade) => grade.assessment === assessment.trim());
              const currentValue = draftScores[student.enrollmentId] ?? existing?.score?.toString() ?? "";
              return <tr key={student.enrollmentId}>
                <td>{student.controlNumber ?? "Sin número de control"}</td>
                <td>{assessment.trim() || "Escribe el nombre de la evaluación"}</td>
                <td><input aria-label={`Calificación de ${student.controlNumber ?? "alumno"} para ${assessment || "la evaluación"}`} type="number" min="0" max="100" step="0.01" value={currentValue} onChange={(event) => setDraftScores((current) => ({ ...current, [student.enrollmentId]: event.target.value }))}/></td>
                <td>{existing?.score === null || existing?.score === undefined ? "Sin registro" : existing.score.toFixed(2)}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        <button className="button" type="button" disabled={busy || !assessment.trim()} onClick={submitGrades}>{busy ? "Guardando…" : "Guardar calificaciones"}</button>
      </>}
    </>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {message && <p className="form-success" role="status">{message}</p>}
  </section>;
}
