"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

type ActionResult = { ok: true; data?: { url?: string } } | { ok: false; error: string };
const materialType = z.enum(["Apuntes", "Guía", "Ejercicios", "Presentación", "Práctica", "Lectura", "Resumen", "Otro"]);
const idValue = z.string().uuid();

async function actor() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, role: null };
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return { supabase, user, role: data?.role as string | null };
}

export async function saveProfile(formData: FormData): Promise<ActionResult> {
  const parsed = z.object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(100),
    theme: z.enum(["light", "dark"]),
    avatarPath: z.string().max(500).optional().default(""),
    careerId: z.union([z.string().uuid(), z.literal("")]).default(""),
    semester: z.union([z.coerce.number().int().min(1).max(20), z.literal("")]).optional(),
    specialty: z.string().trim().max(120).optional().default(""),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Revisa tu nombre, carrera y semestre." };
  const { supabase, user, role } = await actor();
  if (!user) return { ok: false, error: "Inicia sesión para editar tu perfil." };
  const { avatarPath, careerId, semester, specialty, ...profileFields } = parsed.data;
  if (avatarPath && !avatarPath.startsWith(`${user.id}/`)) return { ok: false, error: "La fotografía no pertenece a tu cuenta." };
  const { error: profileError } = await supabase.from("profiles").update({
    first_name: profileFields.firstName, last_name: profileFields.lastName,
    preferred_theme: profileFields.theme, avatar_path: avatarPath || null,
  }).eq("id", user.id);
  if (profileError) return { ok: false, error: "No se pudieron guardar tus datos personales." };
  if (role === "alumno") {
    const { error } = await supabase.from("students").update({
      career_id: careerId || null, semester: semester === "" ? null : semester ?? null,
      specialty: specialty || null,
    }).eq("id", user.id);
    if (error) return { ok: false, error: "Se guardó tu nombre, pero no los datos académicos. Ejecuta la migración 0003." };
  }
  await supabase.from("activity_logs").insert({ user_id: user.id, action: "Actualizó su perfil", module: "Perfil", description: "Datos personales y preferencias" });
  revalidatePath("/alumno"); revalidatePath("/docente"); revalidatePath("/admin");
  return { ok: true };
}

export async function publishMaterial(formData: FormData): Promise<ActionResult> {
  const values = z.object({
    title: z.string().trim().min(3).max(180), description: z.string().trim().max(4000).default(""),
    subjectId: z.union([z.string().uuid(), z.literal("")]).default(""),
    groupId: z.union([z.string().uuid(), z.literal("")]).default(""),
    semester: z.coerce.number().int().min(1).max(20).optional(),
    unit: z.string().trim().max(80).default(""), materialType,
    storagePath: z.string().max(500).optional(),
  }).safeParse(Object.fromEntries(formData));
  if (!values.success) return { ok: false, error: "Revisa el título, tipo y campos del material." };
  const { supabase, user, role } = await actor();
  if (!user || !["alumno", "docente"].includes(role ?? "")) return { ok: false, error: "Inicia sesión con una cuenta académica para publicar." };
  if (values.data.storagePath && !values.data.storagePath.startsWith(`${user.id}/`)) return { ok: false, error: "El archivo no pertenece a tu cuenta." };
  const { data, error } = await supabase.from("materials").insert({
    title: values.data.title, description: values.data.description, subject_id: values.data.subjectId || null,
    group_id: values.data.groupId || null, semester: values.data.semester || null, unit: values.data.unit || null,
    material_type: values.data.materialType, storage_path: values.data.storagePath || null,
    status: "Pendiente", created_by: user.id,
  }).select("id").single();
  if (error || !data) return { ok: false, error: "No se pudo enviar el material. Revisa la materia y tus permisos." };
  await supabase.from("activity_logs").insert({ user_id: user.id, action: "Publicó material para revisión", module: "Biblioteca", record_id: data.id, description: values.data.title });
  return { ok: true };
}

export async function reviewMaterial(materialId: string, status: "Aprobado" | "Rechazado", note = ""): Promise<ActionResult> {
  if (!idValue.safeParse(materialId).success || !["Aprobado", "Rechazado"].includes(status)) return { ok: false, error: "La solicitud de revisión no es válida." };
  const { supabase, user, role } = await actor();
  if (!user || role !== "administrador") return { ok: false, error: "Solo administración puede revisar materiales." };
  const { error } = await supabase.from("materials").update({ status, reviewed_by: user.id, reviewed_at: new Date().toISOString(), review_note: note.slice(0, 1000) }).eq("id", materialId);
  if (error) return { ok: false, error: "No se pudo guardar la revisión." };
  await supabase.from("activity_logs").insert({ user_id: user.id, action: status === "Aprobado" ? "Aprobó material" : "Rechazó material", module: "Biblioteca", record_id: materialId, description: note.slice(0, 1000) || status });
  return { ok: true };
}

export async function toggleFavorite(materialId: string, isFavorite: boolean): Promise<ActionResult> {
  if (!idValue.safeParse(materialId).success) return { ok: false, error: "Material inválido." };
  const { supabase, user, role } = await actor();
  if (!user || role !== "alumno") return { ok: false, error: "Inicia sesión como alumno para guardar favoritos." };
  const result = isFavorite
    ? await supabase.from("material_favorites").delete().eq("student_id", user.id).eq("material_id", materialId)
    : await supabase.from("material_favorites").insert({ student_id: user.id, material_id: materialId });
  if (result.error) return { ok: false, error: "No se pudo actualizar tu lista de favoritos." };
  return { ok: true };
}

export async function downloadMaterial(materialId: string): Promise<ActionResult> {
  if (!idValue.safeParse(materialId).success) return { ok: false, error: "Material inválido." };
  const { supabase, user } = await actor();
  if (!user) return { ok: false, error: "Inicia sesión para descargar materiales." };
  const { data: material, error } = await supabase.from("materials").select("storage_path,title").eq("id", materialId).maybeSingle();
  if (error || !material?.storage_path) return { ok: false, error: "Este material no tiene un archivo disponible." };
  const { data: signed, error: signedError } = await supabase.storage.from("academic-materials").createSignedUrl(material.storage_path, 60);
  if (signedError || !signed?.signedUrl) return { ok: false, error: "No tienes permiso para descargar este archivo." };
  const { error: logError } = await supabase.from("material_downloads").insert({ material_id: materialId, user_id: user.id });
  if (logError) return { ok: false, error: "No se pudo registrar la descarga." };
  await supabase.from("activity_logs").insert({ user_id: user.id, action: "Descargó material", module: "Biblioteca", record_id: materialId, description: material.title });
  return { ok: true, data: { url: signed.signedUrl } };
}

export async function createAdvisory(formData: FormData): Promise<ActionResult> {
  const parsed = z.object({ title: z.string().trim().min(3).max(180), description: z.string().trim().max(2000).default(""), subjectId: z.union([z.string().uuid(), z.literal("")]).default(""), startsAt: z.string().datetime(), endsAt: z.string().datetime(), capacity: z.coerce.number().int().min(1).max(100) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success || new Date(parsed.data.endsAt) <= new Date(parsed.data.startsAt)) return { ok: false, error: "Revisa la fecha, hora y cupo de la asesoría." };
  const { supabase, user, role } = await actor();
  if (!user || role !== "docente") return { ok: false, error: "Solo docentes pueden crear asesorías." };
  const { error } = await supabase.from("advisory_sessions").insert({ title: parsed.data.title, description: parsed.data.description, subject_id: parsed.data.subjectId || null, starts_at: parsed.data.startsAt, ends_at: parsed.data.endsAt, capacity: parsed.data.capacity, teacher_id: user.id });
  if (error) return { ok: false, error: "No se pudo publicar la asesoría." };
  await supabase.from("activity_logs").insert({ user_id: user.id, action: "Creó asesoría", module: "Asesorías", description: parsed.data.title });
  return { ok: true };
}

export async function reserveAdvisory(sessionId: string): Promise<ActionResult> {
  if (!idValue.safeParse(sessionId).success) return { ok: false, error: "La asesoría seleccionada no es válida." };
  const { supabase, user, role } = await actor();
  if (!user || role !== "alumno") return { ok: false, error: "Solo alumnos pueden reservar asesorías." };
  const { error } = await supabase.rpc("reserve_advisory", { target_session: sessionId });
  if (error) return { ok: false, error: error.message.includes("full") ? "La asesoría ya no tiene lugares." : "No se pudo completar la reserva." };
  await supabase.from("activity_logs").insert({ user_id: user.id, action: "Reservó asesoría", module: "Asesorías", record_id: sessionId, description: "Reserva académica" });
  return { ok: true };
}

export async function submitTeacherApplication(formData: FormData): Promise<ActionResult> {
  const parsed = z.object({
    employeeNumber: z.string().trim().min(2).max(40),
    department: z.string().trim().min(2).max(120),
    justification: z.string().trim().min(20).max(2000),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Completa número de trabajador, departamento y motivo (mínimo 20 caracteres)." };
  const { supabase, user, role } = await actor();
  if (!user || role !== "alumno") return { ok: false, error: "Solo un alumno puede solicitar acceso docente." };
  const { error } = await supabase.rpc("submit_teacher_application", {
    target_employee_number: parsed.data.employeeNumber,
    target_department: parsed.data.department,
    target_justification: parsed.data.justification,
  });
  if (error) return { ok: false, error: error.message.includes("duplicate key") ? "Ya tienes una solicitud pendiente." : "No se pudo enviar la solicitud. Revisa que la migración completa esté aplicada." };
  revalidatePath("/alumno/perfil");
  revalidatePath("/admin/solicitudes");
  return { ok: true };
}

export async function reviewTeacherApplication(applicationId: string, decision: "Aprobada" | "Rechazada", reason = ""): Promise<ActionResult> {
  if (!idValue.safeParse(applicationId).success || !["Aprobada", "Rechazada"].includes(decision)) return { ok: false, error: "La solicitud seleccionada no es válida." };
  const { supabase, user, role } = await actor();
  if (!user || role !== "administrador") return { ok: false, error: "Solo un administrador puede revisar solicitudes docentes." };
  if (decision === "Rechazada" && reason.trim().length < 3) return { ok: false, error: "Escribe un motivo breve para el rechazo." };
  const { error } = await supabase.rpc("review_teacher_application", {
    target_application: applicationId, decision, target_rejection_reason: reason.trim(),
  });
  if (error) return { ok: false, error: error.message.includes("already been reviewed") ? "Esta solicitud ya fue revisada." : "No se pudo guardar la decisión. Verifica el permiso y el estado de la solicitud." };
  revalidatePath("/admin/solicitudes");
  revalidatePath("/admin/docentes");
  revalidatePath("/admin/usuarios");
  return { ok: true };
}
