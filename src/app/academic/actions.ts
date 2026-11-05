"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

type ActionResult = { ok: true; data?: { url?: string; conversationId?: string } } | { ok: false; error: string };
const materialType = z.enum(["Apuntes", "Guía", "Ejercicios", "Presentación", "Práctica", "Lectura", "Resumen", "Otro"]);
const idValue = z.string().uuid();

async function actor() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, role: null };
  if (user.app_metadata?.must_change_password === true || user.user_metadata?.must_change_password === true) {
    return { supabase, user: null, role: null };
  }
  const { data } = await supabase.from("profiles").select("role,is_active").eq("id", user.id).maybeSingle();
  return { supabase, user: data?.is_active === true ? user : null, role: data?.role as string | null };
}

export async function searchAdminDirectory(query: string) {
  const term = query.replace(/[^\p{L}\p{N}@.-]/gu, " ").trim().slice(0, 80);
  if (term.length < 2) return { ok: true as const, items: [] as { title: string; detail: string; href: string; kind: string }[] };
  const { supabase, user, role } = await actor();
  if (!user || role !== "administrador") return { ok: false as const, items: [] as { title: string; detail: string; href: string; kind: string }[] };
  const pattern = `%${term}%`;
  const [profiles, students, teachers, subjects, groups, careers, specialties] = await Promise.all([
    supabase.from("profiles").select("id,first_name,last_name,email,role").eq("is_active", true).or(`first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern}`).limit(6),
    supabase.from("students").select("id,control_number").ilike("control_number", pattern).limit(4),
    supabase.from("teachers").select("id,employee_number").ilike("employee_number", pattern).limit(4),
    supabase.from("subjects").select("id,name,code").or(`name.ilike.${pattern},code.ilike.${pattern}`).limit(5),
    supabase.from("groups").select("id,code,subject_id").ilike("code", pattern).limit(5),
    supabase.from("careers").select("id,name").ilike("name", pattern).limit(5),
    supabase.from("academic_specialties").select("code,name").ilike("name", pattern).limit(5),
  ]);
  const items = [
    ...(profiles.data ?? []).map(item => ({ title: [item.first_name,item.last_name].filter(Boolean).join(" ") || item.email, detail: `${item.email} · ${item.role}`, href: `/admin/usuarios?userId=${encodeURIComponent(item.id)}`, kind: "Usuario" })),
    ...(students.data ?? []).map(item => ({ title: item.control_number || "Alumno", detail: "Número de control", href: `/admin/alumnos?userId=${encodeURIComponent(item.id)}`, kind: "Alumno" })),
    ...(teachers.data ?? []).map(item => ({ title: item.employee_number || "Docente", detail: "Número de trabajador", href: `/admin/docentes?userId=${encodeURIComponent(item.id)}`, kind: "Docente" })),
    ...(subjects.data ?? []).map(item => ({ title: item.name, detail: item.code, href: `/admin/materias?q=${encodeURIComponent(term)}`, kind: "Materia" })),
    ...(groups.data ?? []).map(item => ({ title: item.code, detail: "Grupo académico", href: `/admin/grupos?q=${encodeURIComponent(term)}`, kind: "Grupo" })),
    ...(careers.data ?? []).map(item => ({ title: item.name, detail: "Programa académico", href: `/admin/carreras?q=${encodeURIComponent(term)}`, kind: "Carrera" })),
    ...(specialties.data ?? []).map(item => ({ title: item.name, detail: item.code, href: `/admin/alumnos?q=${encodeURIComponent(term)}`, kind: "Especialidad" })),
  ];
  return { ok: true as const, items };
}

export async function saveProfile(formData: FormData): Promise<ActionResult> {
  const parsed = z.object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(100),
    theme: z.enum(["light", "dark"]),
    avatarPath: z.string().max(500).optional().default(""),
    semester: z.coerce.number().int().min(1).max(13).optional(),
    specialty: z.enum(["Ciberseguridad", "Gestión de Servicios de TI"]).or(z.literal("")).optional().default(""),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Revisa tu nombre, semestre y especialidad. El semestre debe estar entre 1 y 13." };
  const { supabase, user, role } = await actor();
  if (!user) return { ok: false, error: "Inicia sesión para editar tu perfil." };
  const { avatarPath, semester, specialty, ...profileFields } = parsed.data;
  if (avatarPath && !avatarPath.startsWith(`${user.id}/`)) return { ok: false, error: "La fotografía no pertenece a tu cuenta." };
  if (role === "alumno") {
    if (semester === undefined) return { ok: false, error: "Selecciona un semestre entre 1 y 13." };
    const { error } = await supabase.rpc("save_student_academic_profile", {
      target_first_name: profileFields.firstName,
      target_last_name: profileFields.lastName,
      target_preferred_theme: profileFields.theme,
      target_avatar_path: avatarPath,
      target_semester: semester,
      target_specialty: specialty || null,
    });
    if (error) return { ok: false, error: "No se guardaron los cambios académicos. Verifica que esté aplicada la migración 0009 y vuelve a intentar." };
    revalidatePath("/alumno");
    return { ok: true };
  }
  const { error: profileError } = await supabase.from("profiles").update({
    first_name: profileFields.firstName, last_name: profileFields.lastName,
    preferred_theme: profileFields.theme,
    ...(avatarPath ? { avatar_path: avatarPath } : {}),
  }).eq("id", user.id);
  if (profileError) return { ok: false, error: "No se pudieron guardar tus datos personales." };
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

export async function publishPost(formData: FormData): Promise<ActionResult> {
  const parsed = z.object({
    title: z.string().trim().min(3).max(180),
    body: z.string().trim().min(3).max(4000),
    postType: z.enum(["tarea", "anuncio"]),
    groupId: z.union([z.string().uuid(), z.literal("")]).default(""),
    attachmentPath: z.string().max(500).default(""),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Completa el título, el mensaje y el grupo destinatario." };
  const { supabase, user, role } = await actor();
  if (!user || !["alumno", "docente", "administrador"].includes(role ?? "")) return { ok: false, error: "Inicia sesión con una cuenta activa para publicar." };
  if (role !== "administrador" && !parsed.data.groupId) return { ok: false, error: "Selecciona un grupo al que pertenezcas para publicar." };
  if (parsed.data.attachmentPath && !parsed.data.attachmentPath.startsWith(`${user.id}/`)) return { ok: false, error: "El PDF no pertenece a tu cuenta." };
  const { data, error } = await supabase.from("posts").insert({
    title: parsed.data.title,
    body: parsed.data.body,
    post_type: parsed.data.postType,
    group_id: parsed.data.groupId || null,
    attachment_path: parsed.data.attachmentPath || null,
    created_by: user.id,
  }).select("id").single();
  if (error || !data) return { ok: false, error: "No se pudo publicar. Verifica que esté aplicada la migración 0013 y que tengas acceso al grupo." };
  await supabase.from("activity_logs").insert({ user_id: user.id, action: parsed.data.postType === "tarea" ? "Publicó una tarea" : "Publicó un anuncio", module: "Avisos", record_id: data.id, description: parsed.data.title });
  revalidatePath("/admin/avisos"); revalidatePath("/docente/avisos"); revalidatePath("/alumno/avisos");
  return { ok: true };
}

export async function downloadPostAttachment(postId: string): Promise<ActionResult> {
  if (!idValue.safeParse(postId).success) return { ok: false, error: "La publicación seleccionada no es válida." };
  const { supabase, user } = await actor();
  if (!user) return { ok: false, error: "Inicia sesión para descargar este archivo." };
  const { data: post, error } = await supabase.from("posts").select("attachment_path").eq("id", postId).maybeSingle();
  if (error || !post?.attachment_path) return { ok: false, error: "No tienes acceso a este PDF o ya no está disponible." };
  const { data, error: urlError } = await supabase.storage.from("academic-posts").createSignedUrl(post.attachment_path, 60, { download: true });
  if (urlError || !data?.signedUrl) return { ok: false, error: "No se pudo preparar la descarga del PDF." };
  return { ok: true, data: { url: data.signedUrl } };
}

export async function startDirectChat(contactId: string): Promise<ActionResult> {
  if (!idValue.safeParse(contactId).success) return { ok: false, error: "Selecciona una cuenta válida." };
  const { supabase, user } = await actor();
  if (!user) return { ok: false, error: "Inicia sesión para abrir el chat." };
  const { data, error } = await supabase.rpc("start_direct_chat", { target_user: contactId });
  if (error || typeof data !== "string") return { ok: false, error: "No se pudo abrir la conversación. Verifica que esté aplicada la migración 0014." };
  revalidatePath("/admin/mensajes"); revalidatePath("/docente/mensajes"); revalidatePath("/alumno/mensajes");
  return { ok: true, data: { conversationId: data } };
}

export async function createGroupChat(title: string, contactIds: string[]): Promise<ActionResult> {
  const parsedTitle = z.string().trim().min(2).max(100).safeParse(title);
  const parsedIds = z.array(idValue).min(2).max(49).safeParse(contactIds);
  if (!parsedTitle.success || !parsedIds.success || new Set(contactIds).size !== contactIds.length) {
    return { ok: false, error: "Escribe un nombre y selecciona entre 2 y 49 personas distintas." };
  }
  const { supabase, user } = await actor();
  if (!user) return { ok: false, error: "Inicia sesión para crear un grupo." };
  const { data, error } = await supabase.rpc("create_group_chat", { target_users: parsedIds.data, target_title: parsedTitle.data });
  if (error || typeof data !== "string") return { ok: false, error: "No se pudo crear el grupo. Verifica que esté aplicada la migración 0015." };
  revalidatePath("/admin/mensajes"); revalidatePath("/docente/mensajes"); revalidatePath("/alumno/mensajes");
  return { ok: true, data: { conversationId: data } };
}

type ChatAttachmentInput = { path: string; name: string; mime: string; size: number };
const chatAttachmentMimes = new Set([
  "application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif", "image/avif",
  "audio/mpeg", "audio/mp4", "audio/ogg", "audio/wav", "audio/webm",
  "video/mp4", "video/webm", "video/quicktime",
]);

export async function sendChatMessage(conversationId: string, body: string, attachment?: ChatAttachmentInput): Promise<ActionResult> {
  if (!idValue.safeParse(conversationId).success) return { ok: false, error: "La conversación seleccionada no es válida." };
  const message = z.string().trim().max(4000).safeParse(body);
  if (!message.success || (!message.data && !attachment)) return { ok: false, error: "Escribe un mensaje o adjunta un archivo; el texto admite hasta 4,000 caracteres." };
  if (attachment && (!chatAttachmentMimes.has(attachment.mime) || attachment.size < 1 || attachment.size > 25 * 1024 * 1024 || !attachment.path || !attachment.name)) {
    return { ok: false, error: "El archivo debe ser un formato permitido y pesar máximo 25 MB." };
  }
  const { supabase, user } = await actor();
  if (!user) return { ok: false, error: "Inicia sesión para enviar mensajes." };
  if (attachment && !attachment.path.startsWith(`${user.id}/${conversationId}/`)) return { ok: false, error: "El archivo no pertenece a esta conversación." };
  const { error } = await supabase.from("chat_messages").insert({
    conversation_id: conversationId, sender_id: user.id, body: message.data,
    attachment_path: attachment?.path ?? null, attachment_name: attachment?.name ?? null,
    attachment_mime: attachment?.mime ?? null, attachment_size: attachment?.size ?? null,
  });
  if (error) return { ok: false, error: "No se pudo enviar el mensaje. Verifica que seas parte del chat y esté aplicada la migración 0015." };
  revalidatePath("/admin/mensajes"); revalidatePath("/docente/mensajes"); revalidatePath("/alumno/mensajes");
  return { ok: true };
}

export async function loadChatMessages(conversationId: string) {
  if (!idValue.safeParse(conversationId).success) return { ok: false as const, error: "La conversación seleccionada no es válida.", items: [] };
  const { supabase, user } = await actor();
  if (!user) return { ok: false as const, error: "Inicia sesión para ver tus mensajes.", items: [] };
  const { data, error } = await supabase.rpc("list_chat_messages", { target_conversation: conversationId });
  if (error) return { ok: false as const, error: "No se pudieron cargar los mensajes. Verifica que estén aplicadas las migraciones 0014 y 0015.", items: [] };
  const rows = (data ?? []) as { attachment_path: string | null }[];
  const paths = rows.flatMap(item => item.attachment_path ? [item.attachment_path] : []);
  const signedResult = paths.length ? await supabase.storage.from("chat-attachments").createSignedUrls(paths, 3600) : null;
  const signedByPath = new Map((signedResult?.data ?? []).map(item => [item.path, item.signedUrl]));
  await supabase.rpc("mark_chat_read", { target_conversation: conversationId });
  return {
    ok: true as const,
    items: rows.map(item => ({ ...item, attachment_url: item.attachment_path ? signedByPath.get(item.attachment_path) ?? null : null })),
  };
}

export async function getUnreadChatCount(): Promise<number> {
  const { supabase, user } = await actor();
  if (!user) return 0;
  const { data, error } = await supabase.rpc("count_unread_chat_messages");
  return error ? 0 : Number(data ?? 0);
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
