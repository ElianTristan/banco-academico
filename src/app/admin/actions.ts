"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, createServiceRoleClient, hasSupabaseServiceRoleConfig } from "@/lib/supabase/server";
import { TEMPORARY_PASSWORD } from "@/lib/constants";

type AdminActionResult = { ok: true } | { ok: false; error: string };

const accountSchema = z.object({
  role: z.enum(["alumno", "docente"]),
  firstName: z.string().trim().min(1, "Escribe el nombre.").max(80, "El nombre es demasiado largo."),
  lastName: z.string().trim().min(1, "Escribe los apellidos.").max(100, "Los apellidos son demasiado largos."),
  email: z.string().trim().email("Escribe un correo válido.").max(254).transform((value) => value.toLowerCase()),
  controlNumber: z.string().trim().max(40).optional().default(""),
  employeeNumber: z.string().trim().max(40).optional().default(""),
  department: z.string().trim().max(120).optional().default(""),
}).strict().superRefine((value, context) => {
  if (value.role === "alumno" && value.controlNumber.length < 2) {
    context.addIssue({ code: "custom", path: ["controlNumber"], message: "Escribe un número de control válido." });
  }
  if (value.role === "docente" && value.employeeNumber.length < 2) {
    context.addIssue({ code: "custom", path: ["employeeNumber"], message: "Escribe un número de trabajador válido." });
  }
  if (value.role === "docente" && value.department.length < 2) {
    context.addIssue({ code: "custom", path: ["department"], message: "Escribe el departamento del docente." });
  }
});

async function getActiveAdministrator(): Promise<{ actorId: string } | AdminActionResult> {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    if (userError) console.error("Could not authenticate an administrator user-management request.", userError);
    return { ok: false, error: "Inicia sesión con una cuenta administradora activa." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role,is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) {
    console.error("Could not verify administrator permissions for user management.", profileError);
    return { ok: false, error: "No se pudieron verificar tus permisos. Intenta de nuevo." };
  }
  if (profile?.role !== "administrador" || profile.is_active !== true) {
    return { ok: false, error: "Esta acción requiere una cuenta administradora activa." };
  }
  if (user.app_metadata?.must_change_password === true || user.user_metadata?.must_change_password === true) {
    return { ok: false, error: "Debes cambiar tu contraseña temporal antes de gestionar cuentas." };
  }
  return { actorId: user.id };
}

export async function createManagedUser(formData: FormData): Promise<AdminActionResult> {
  const parsed = accountSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa los datos del formulario." };

  const administrator = await getActiveAdministrator();
  if ("ok" in administrator) return administrator;
  if (!hasSupabaseServiceRoleConfig()) {
    console.error("Cannot invite a managed user: service-role configuration is missing.");
    return { ok: false, error: "El alta requiere configuración administrativa del servidor. Contacta al responsable técnico." };
  }

  const service = createServiceRoleClient();
  if (parsed.data.role === "alumno") {
    const { data: existingStudent, error: studentLookupError } = await service
      .from("students")
      .select("id")
      .eq("control_number", parsed.data.controlNumber)
      .maybeSingle();
    if (studentLookupError) {
      console.error("Could not verify a student's institutional number before invitation.", studentLookupError);
      return { ok: false, error: "No se pudo validar el número de control. Intenta de nuevo." };
    }
    if (existingStudent) return { ok: false, error: "Ya existe una cuenta con ese número de control." };
  } else {
    const { data: existingTeacher, error: teacherLookupError } = await service
      .from("teachers")
      .select("id")
      .eq("employee_number", parsed.data.employeeNumber)
      .maybeSingle();
    if (teacherLookupError) {
      console.error("Could not verify a teacher's institutional number before invitation.", teacherLookupError);
      return { ok: false, error: "No se pudo validar el número de trabajador. Intenta de nuevo." };
    }
    if (existingTeacher) return { ok: false, error: "Ya existe una cuenta con ese número de trabajador." };
  }

  const { data: created, error: createError } = await service.auth.admin.createUser({
    email: parsed.data.email,
    password: TEMPORARY_PASSWORD,
    email_confirm: true,
    user_metadata: {
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      must_change_password: true,
    },
    app_metadata: {
      must_change_password: true,
    },
  });
  const createdUser = created?.user;
  if (createError || !createdUser) {
    if (createError) console.error("Could not create a managed academic account.", createError);
    return {
      ok: false,
      error: createError?.code === "email_exists" || createError?.code === "user_already_exists"
        ? "Ya existe una cuenta con ese correo."
        : "No se pudo registrar la cuenta institucional. Revisa los datos y la configuración de Supabase Auth.",
    };
  }

  const { error: finalizeError } = await service.rpc("finalize_admin_created_user", {
    target_user_id: createdUser.id,
    target_admin_id: administrator.actorId,
    target_role: parsed.data.role,
    target_control_number: parsed.data.role === "alumno" ? parsed.data.controlNumber : null,
    target_employee_number: parsed.data.role === "docente" ? parsed.data.employeeNumber : null,
    target_department: parsed.data.role === "docente" ? parsed.data.department : null,
  });
  if (finalizeError) {
    console.error("Could not finish provisioning a managed academic account.", finalizeError);
    const { error: cleanupError } = await service.auth.admin.deleteUser(createdUser.id);
    if (cleanupError) console.error("Could not remove the incomplete account after provisioning failed.", cleanupError);
    return {
      ok: false,
      error: "No se pudo completar el alta. Verifica que el número institucional no esté registrado y que la migración 0009 esté aplicada.",
    };
  }

  revalidatePath("/admin/usuarios");
  revalidatePath("/admin/alumnos");
  revalidatePath("/admin/docentes");
  return { ok: true };
}

export async function updateManagedUser(formData: FormData): Promise<AdminActionResult> {
  const parsed = z.object({
    userId: z.string().uuid(), role: z.enum(["alumno", "docente"]),
    firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().min(1).max(100),
    email: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
    controlNumber: z.string().trim().max(40).optional().default(""),
    employeeNumber: z.string().trim().max(40).optional().default(""),
    department: z.string().trim().max(120).optional().default(""),
  }).superRefine((value, context) => {
    if (value.role === "alumno" && value.controlNumber.length < 2) context.addIssue({ code: "custom", path: ["controlNumber"], message: "Escribe un número de control válido." });
    if (value.role === "docente" && value.employeeNumber.length < 2) context.addIssue({ code: "custom", path: ["employeeNumber"], message: "Escribe un número de trabajador válido." });
    if (value.role === "docente" && value.department.length < 2) context.addIssue({ code: "custom", path: ["department"], message: "Escribe el departamento del docente." });
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa los datos del formulario." };
  const administrator = await getActiveAdministrator();
  if ("ok" in administrator) return administrator;
  if (parsed.data.userId === administrator.actorId) return { ok: false, error: "No edites tu propia cuenta desde este directorio." };
  const session = await createClient();
  const { data: targetProfile, error: targetError } = await session.from("profiles").select("role").eq("id", parsed.data.userId).maybeSingle();
  if (targetError || !targetProfile) return { ok: false, error: "No se encontró la cuenta seleccionada." };
  if (!["alumno", "docente"].includes(targetProfile.role)) return { ok: false, error: "Las cuentas administradoras no se pueden editar desde este formulario." };
  if (!hasSupabaseServiceRoleConfig()) return { ok: false, error: "La edición requiere configuración administrativa del servidor." };

  const service = createServiceRoleClient();
  const { data: existing, error: lookupError } = await service.auth.admin.getUserById(parsed.data.userId);
  if (lookupError || !existing.user) return { ok: false, error: "No se encontró la cuenta seleccionada." };
  const oldUser = existing.user;
  const { error: authError } = await service.auth.admin.updateUserById(parsed.data.userId, {
    email: parsed.data.email,
    email_confirm: true,
    user_metadata: { ...oldUser.user_metadata, first_name: parsed.data.firstName, last_name: parsed.data.lastName },
  });
  if (authError) return { ok: false, error: authError.code === "email_exists" ? "Ya existe una cuenta con ese correo." : "No se pudo actualizar el correo en Supabase Auth." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_managed_profile", {
    target_user_id: parsed.data.userId,
    target_first_name: parsed.data.firstName,
    target_last_name: parsed.data.lastName,
    target_email: parsed.data.email,
    target_role: parsed.data.role,
    target_control_number: parsed.data.role === "alumno" ? parsed.data.controlNumber : null,
    target_employee_number: parsed.data.role === "docente" ? parsed.data.employeeNumber : null,
    target_department: parsed.data.role === "docente" ? parsed.data.department : null,
  });
  if (error) {
    const { error: rollbackError } = await service.auth.admin.updateUserById(parsed.data.userId, { email: oldUser.email, email_confirm: true, user_metadata: oldUser.user_metadata });
    if (rollbackError) console.error("Could not restore authentication details after a profile edit failed.", rollbackError);
    const duplicate = error.code === "23505" || error.message.includes("duplicate key");
    if (!duplicate) console.error("Could not update a managed profile.", error);
    return { ok: false, error: duplicate ? "El correo o matrícula ya está asignado a otra cuenta." : "No se pudo guardar la edición. Verifica que esté aplicada la migración 0013." };
  }

  for (const path of ["/admin/usuarios", "/admin/alumnos", "/admin/docentes"]) revalidatePath(path);
  return { ok: true };
}

export async function deactivateManagedUser(userId: string): Promise<AdminActionResult> {
  if (!z.string().uuid().safeParse(userId).success) {
    return { ok: false, error: "La cuenta seleccionada no es válida." };
  }

  const administrator = await getActiveAdministrator();
  if ("ok" in administrator) return administrator;
  const supabase = await createClient();
  const { error } = await supabase.rpc("deactivate_managed_user", { target_user_id: userId });
  if (error) {
    const allowedMessages = [
      "No puedes desactivar tu propia cuenta",
      "Debe permanecer al menos una cuenta administradora activa",
      "La cuenta ya está desactivada",
      "No se encontró la cuenta seleccionada",
    ];
    const expectedMessage = allowedMessages.find((message) => error.message.includes(message));
    if (!expectedMessage) console.error("Could not deactivate a managed academic account.", error);
    return {
      ok: false,
      error: expectedMessage ?? "No se pudo desactivar la cuenta. Intenta de nuevo.",
    };
  }

  if (!hasSupabaseServiceRoleConfig()) {
    console.error("A managed account was disabled in the app, but the service-role key is unavailable to revoke existing Supabase sessions.");
    revalidatePath("/admin/usuarios");
    revalidatePath("/admin/alumnos");
    revalidatePath("/admin/docentes");
    return { ok: false, error: "El acceso al portal se desactivó y el historial se conservó, pero falta configuración del servidor para revocar sus sesiones de Supabase." };
  }
  const { error: banError } = await createServiceRoleClient().auth.admin.updateUserById(userId, {
    ban_duration: "876000h",
  });
  if (banError) {
    console.error("The portal account was disabled, but Supabase could not revoke its active sessions.", banError);
    revalidatePath("/admin/usuarios");
    revalidatePath("/admin/alumnos");
    revalidatePath("/admin/docentes");
    return { ok: false, error: "El acceso al portal se desactivó, pero Supabase no pudo revocar las sesiones activas. Contacta al responsable técnico." };
  }

  revalidatePath("/admin/usuarios");
  revalidatePath("/admin/alumnos");
  revalidatePath("/admin/docentes");
  return { ok: true };
}

export async function reactivateManagedUser(userId: string): Promise<AdminActionResult> {
  if (!z.string().uuid().safeParse(userId).success) {
    return { ok: false, error: "La cuenta seleccionada no es válida." };
  }

  const administrator = await getActiveAdministrator();
  if ("ok" in administrator) return administrator;
  if (!hasSupabaseServiceRoleConfig()) {
    console.error("Cannot reactivate a managed user: service-role configuration is missing.");
    return { ok: false, error: "La reactivación requiere configuración administrativa del servidor. Contacta al responsable técnico." };
  }

  const service = createServiceRoleClient();
  const { error: unbanError } = await service.auth.admin.updateUserById(userId, { ban_duration: "none" });
  if (unbanError) {
    console.error("Could not restore Supabase Auth access for a managed account.", unbanError);
    return { ok: false, error: "No se pudo restablecer el acceso de autenticación. Intenta de nuevo." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("reactivate_managed_user", { target_user_id: userId });
  if (error) {
    console.error("Could not reactivate a managed account in the academic portal.", error);
    return { ok: false, error: "La cuenta sigue desactivada en el portal. Intenta de nuevo o contacta al responsable técnico." };
  }

  revalidatePath("/admin/usuarios");
  revalidatePath("/admin/alumnos");
  revalidatePath("/admin/docentes");
  return { ok: true };
}

const activeValue = z.enum(["true", "false"]).transform((value) => value === "true");
const optionalSemester = z.preprocess(
  (value) => value === "" || value === undefined ? null : value,
  z.coerce.number().int().min(1).max(13).nullable(),
);

function academicWriteError(error: { code?: string; message: string }, duplicateMessage: string) {
  if (error.code === "23505") return duplicateMessage;
  if (error.code === "23503") return "La relación seleccionada ya no existe. Actualiza la página e inténtalo de nuevo.";
  console.error("Could not save an administrative academic record.", error);
  return "No se pudo guardar la información académica. Intenta de nuevo.";
}

export async function saveAcademicRecord(formData: FormData): Promise<AdminActionResult> {
  const type = z.enum(["career", "subject", "period", "group", "student", "enrollment", "teacher-assignment"])
    .safeParse(formData.get("type"));
  if (!type.success) return { ok: false, error: "El tipo de registro seleccionado no es válido." };

  const administrator = await getActiveAdministrator();
  if ("ok" in administrator) return administrator;
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "").trim();
  const recordId = id ? z.string().uuid().safeParse(id) : null;
  if (recordId && !recordId.success) return { ok: false, error: "El registro seleccionado no es válido." };

  if (type.data === "career") {
    const parsed = z.object({
      name: z.string().trim().min(2).max(120),
      code: z.string().trim().min(2).max(30).transform((value) => value.toUpperCase()),
      description: z.string().trim().max(1000).default(""),
      active: activeValue,
    }).strict().safeParse({
      name: formData.get("name"),
      code: formData.get("code"),
      description: formData.get("description") ?? "",
      active: formData.get("active"),
    });
    if (!parsed.success) return { ok: false, error: "Escribe un nombre y una clave válidos para la carrera." };
    const result = recordId
      ? await supabase.from("careers").update(parsed.data).eq("id", id).select("id").maybeSingle()
      : await supabase.from("careers").insert(parsed.data).select("id").maybeSingle();
    if (result.error) return { ok: false, error: academicWriteError(result.error, "Ya existe una carrera con ese nombre o clave.") };
    if (!result.data) return { ok: false, error: "No se encontró la carrera que intentas editar." };
    revalidatePath("/admin/carreras");
  }

  if (type.data === "subject") {
    const parsed = z.object({
      careerId: z.string().uuid(),
      name: z.string().trim().min(2).max(160),
      code: z.string().trim().min(2).max(40).transform((value) => value.toUpperCase()),
      credits: z.coerce.number().int().min(0).max(32767),
      semester: optionalSemester,
      active: activeValue,
    }).strict().safeParse({
      careerId: formData.get("careerId"),
      name: formData.get("name"),
      code: formData.get("code"),
      credits: formData.get("credits"),
      semester: formData.get("semester"),
      active: formData.get("active"),
    });
    if (!parsed.success) return { ok: false, error: "Revisa nombre, clave, carrera, créditos y semestre de la materia." };
    const { data: career, error: careerError } = await supabase.from("careers").select("id").eq("id", parsed.data.careerId).eq("active", true).maybeSingle();
    if (careerError || !career) {
      if (careerError) console.error("Could not validate a subject's career.", careerError);
      return { ok: false, error: "Selecciona una carrera activa." };
    }

    if (recordId) {
      const { data: existing, error: existingError } = await supabase.from("subjects")
        .select("career_id,semester")
        .eq("id", id)
        .maybeSingle();
      if (existingError || !existing) {
        if (existingError) console.error("Could not inspect a subject before editing.", existingError);
        return { ok: false, error: "No se encontró la materia que intentas editar." };
      }
      if (existing.career_id !== parsed.data.careerId || existing.semester !== parsed.data.semester) {
        const { data: groupsForSubject, error: groupError } = await supabase.from("groups").select("id").eq("subject_id", id).limit(1);
        if (groupError) {
          console.error("Could not verify subject history before changing its academic assignment.", groupError);
          return { ok: false, error: "No se pudo validar el historial de la materia." };
        }
        if (groupsForSubject.length) return { ok: false, error: "No se puede cambiar carrera o semestre de una materia que ya tiene grupos. Conserva su historial y crea una materia nueva si necesitas otra asignación." };
      }
    }

    const values = {
      career_id: parsed.data.careerId,
      name: parsed.data.name,
      code: parsed.data.code,
      credits: parsed.data.credits,
      semester: parsed.data.semester,
      active: parsed.data.active,
    };
    const result = recordId
      ? await supabase.from("subjects").update(values).eq("id", id).select("id").maybeSingle()
      : await supabase.from("subjects").insert(values).select("id").maybeSingle();
    if (result.error) return { ok: false, error: academicWriteError(result.error, "Ya existe una materia con esa clave o nombre en la carrera.") };
    if (!result.data) return { ok: false, error: "No se encontró la materia que intentas editar." };
    revalidatePath("/admin/materias");
  }

  if (type.data === "period") {
    const parsed = z.object({
      name: z.string().trim().min(2).max(100),
      startsOn: z.string().date(),
      endsOn: z.string().date(),
      isCurrent: activeValue,
    }).strict().safeParse({
      name: formData.get("name"),
      startsOn: formData.get("startsOn"),
      endsOn: formData.get("endsOn"),
      isCurrent: formData.get("isCurrent"),
    });
    if (!parsed.success || parsed.data.endsOn <= parsed.data.startsOn) {
      return { ok: false, error: "El periodo requiere nombre y fechas válidas; la fecha final debe ser posterior a la inicial." };
    }
    if (recordId) {
      const { data: existing, error: existingError } = await supabase.from("academic_periods")
        .select("name,starts_on,ends_on")
        .eq("id", id)
        .maybeSingle();
      if (existingError || !existing) {
        if (existingError) console.error("Could not inspect an academic period before editing.", existingError);
        return { ok: false, error: "No se encontró el periodo que intentas editar." };
      }
      const metadataChanged = existing.name !== parsed.data.name
        || existing.starts_on !== parsed.data.startsOn
        || existing.ends_on !== parsed.data.endsOn;
      if (metadataChanged) {
        const { data: linkedGroups, error: linkedGroupsError } = await supabase.from("groups").select("id").eq("period_id", id).limit(1);
        if (linkedGroupsError) {
          console.error("Could not verify period history before changing its dates.", linkedGroupsError);
          return { ok: false, error: "No se pudo validar el historial del periodo." };
        }
        if (linkedGroups.length) return { ok: false, error: "No se puede cambiar nombre o fechas de un periodo con grupos asociados. Ciérralo para conservar su historial." };
      }
    }

    const values = {
      name: parsed.data.name,
      starts_on: parsed.data.startsOn,
      ends_on: parsed.data.endsOn,
      is_current: parsed.data.isCurrent,
    };
    const result = recordId
      ? await supabase.from("academic_periods").update(values).eq("id", id).select("id").maybeSingle()
      : await supabase.from("academic_periods").insert(values).select("id").maybeSingle();
    if (result.error) {
      const duplicateMessage = result.error.code === "23505"
        ? parsed.data.isCurrent
          ? "Ya existe un periodo vigente. Ciérralo antes de activar otro."
          : "Ya existe un periodo con ese nombre."
        : academicWriteError(result.error, "Ya existe un periodo con ese nombre.");
      return { ok: false, error: duplicateMessage };
    }
    if (!result.data) return { ok: false, error: "No se encontró el periodo que intentas editar." };
    revalidatePath("/admin/periodos");
  }

  if (type.data === "group") {
    const parsed = z.object({
      code: z.string().trim().min(1).max(40).transform((value) => value.toUpperCase()),
      subjectId: z.string().uuid(),
      periodId: z.string().uuid(),
      active: activeValue,
    }).strict().safeParse({
      code: formData.get("code"),
      subjectId: formData.get("subjectId"),
      periodId: formData.get("periodId"),
      active: formData.get("active"),
    });
    if (!parsed.success) return { ok: false, error: "Selecciona materia y periodo, e ingresa una clave válida para el grupo." };
    if (recordId) {
      const { data: existing, error: existingError } = await supabase.from("groups")
        .select("subject_id,period_id")
        .eq("id", id)
        .maybeSingle();
      if (existingError || !existing) {
        if (existingError) console.error("Could not inspect a group before editing.", existingError);
        return { ok: false, error: "No se encontró el grupo que intentas editar." };
      }
      if (existing.subject_id !== parsed.data.subjectId || existing.period_id !== parsed.data.periodId) {
        const { data: enrollments, error: enrollmentError } = await supabase.from("enrollments").select("id").eq("group_id", id).limit(1);
        if (enrollmentError) {
          console.error("Could not verify group history before changing its subject or period.", enrollmentError);
          return { ok: false, error: "No se pudo validar el historial del grupo." };
        }
        if (enrollments.length) return { ok: false, error: "No se puede cambiar materia o periodo de un grupo con inscripciones. Conserva su historial y crea un grupo nuevo." };
      }
    }
    const { data: subject, error: subjectError } = await supabase.from("subjects").select("id").eq("id", parsed.data.subjectId).eq("active", true).maybeSingle();
    const { data: period, error: periodError } = await supabase.from("academic_periods").select("id").eq("id", parsed.data.periodId).maybeSingle();
    if (subjectError || periodError || !subject || !period) {
      if (subjectError || periodError) console.error("Could not validate a group's subject or period.", { subjectError, periodError });
      return { ok: false, error: "Selecciona una materia activa y un periodo existente." };
    }
    const values = {
      code: parsed.data.code,
      subject_id: parsed.data.subjectId,
      period_id: parsed.data.periodId,
      active: parsed.data.active,
    };
    const result = recordId
      ? await supabase.from("groups").update(values).eq("id", id).select("id").maybeSingle()
      : await supabase.from("groups").insert(values).select("id").maybeSingle();
    if (result.error) return { ok: false, error: academicWriteError(result.error, "Ya existe ese grupo para la materia y periodo seleccionados.") };
    if (!result.data) return { ok: false, error: "No se encontró el grupo que intentas editar." };
    revalidatePath("/admin/grupos");
    revalidatePath("/admin/alumnos");
  }

  if (type.data === "student") {
    if (!recordId) return { ok: false, error: "Selecciona un alumno para actualizar su expediente." };
    const parsed = z.object({
      careerId: z.string().uuid(),
      semester: z.coerce.number().int().min(1).max(13),
    }).strict().safeParse({
      careerId: formData.get("careerId"),
      semester: formData.get("semester"),
    });
    if (!parsed.success) return { ok: false, error: "Selecciona carrera y semestre del 1 al 13." };
    const { data: career, error: careerError } = await supabase.from("careers").select("id").eq("id", parsed.data.careerId).eq("active", true).maybeSingle();
    if (careerError || !career) {
      if (careerError) console.error("Could not validate a student's career.", careerError);
      return { ok: false, error: "Selecciona una carrera activa." };
    }
    const { data: existing, error: studentError } = await supabase.from("students").select("career_id,semester").eq("id", id).maybeSingle();
    if (studentError || !existing) {
      if (studentError) console.error("Could not load a student before editing academic fields.", studentError);
      return { ok: false, error: "No se encontró el expediente del alumno." };
    }
    if (existing.career_id !== parsed.data.careerId || existing.semester !== parsed.data.semester) {
      const { data: enrollmentRows, error: enrollmentError } = await supabase.from("enrollments").select("id").eq("student_id", id).limit(1);
      if (enrollmentError) {
        console.error("Could not verify student enrollment history before changing academic fields.", enrollmentError);
        return { ok: false, error: "No se pudo validar el historial del alumno." };
      }
      if (enrollmentRows.length) return { ok: false, error: "No se puede cambiar carrera o semestre de un alumno con inscripciones académicas. Conserva su historial y consulta al área escolar." };
    }
    const { error } = await supabase.from("students").update({
      career_id: parsed.data.careerId,
      semester: parsed.data.semester,
    }).eq("id", id);
    if (error) return { ok: false, error: academicWriteError(error, "No se pudo actualizar el expediente del alumno.") };
    revalidatePath("/admin/alumnos");
    revalidatePath("/admin/reportes");
  }

  if (type.data === "teacher-assignment") {
    const parsed = z.object({ groupId: z.string().uuid(), teacherId: z.string().uuid() }).strict().safeParse({
      groupId: formData.get("groupId"),
      teacherId: formData.get("teacherId"),
    });
    if (!parsed.success) return { ok: false, error: "Selecciona un grupo y un docente válidos." };
    const [{ data: teacher, error: teacherError }, { data: teacherProfile, error: teacherProfileError }] = await Promise.all([
      supabase.from("teachers").select("id").eq("id", parsed.data.teacherId).maybeSingle(),
      supabase.from("profiles").select("id").eq("id", parsed.data.teacherId).eq("role", "docente").eq("is_active", true).maybeSingle(),
    ]);
    if (teacherError || teacherProfileError || !teacher || !teacherProfile) {
      if (teacherError || teacherProfileError) console.error("Could not verify that a group teacher is active.", { teacherError, teacherProfileError });
      return { ok: false, error: "El docente seleccionado no está activo o no existe." };
    }
    const { error } = await supabase.from("teacher_groups").upsert(
      { teacher_id: parsed.data.teacherId, group_id: parsed.data.groupId },
      { onConflict: "teacher_id,group_id", ignoreDuplicates: true },
    );
    if (error) return { ok: false, error: academicWriteError(error, "El docente ya está asignado al grupo.") };
    revalidatePath("/admin/grupos");
    revalidatePath("/docente/grupos");
  }

  if (type.data === "enrollment") {
    const parsed = z.object({ studentId: z.string().uuid(), groupId: z.string().uuid() }).strict().safeParse({
      studentId: formData.get("studentId"),
      groupId: formData.get("groupId"),
    });
    if (!parsed.success) return { ok: false, error: "Selecciona alumno y grupo válidos." };
    const [{ data: student, error: studentError }, { data: studentProfile, error: studentProfileError }, { data: group, error: groupError }] = await Promise.all([
      supabase.from("students").select("id,career_id,semester").eq("id", parsed.data.studentId).maybeSingle(),
      supabase.from("profiles").select("id").eq("id", parsed.data.studentId).eq("role", "alumno").eq("is_active", true).maybeSingle(),
      supabase.from("groups").select("id,active,subject_id,subjects(career_id,semester)").eq("id", parsed.data.groupId).maybeSingle(),
    ]);
    if (studentError || studentProfileError || groupError || !student || !studentProfile || !group) {
      if (studentError || studentProfileError || groupError) console.error("Could not validate a student group enrollment.", { studentError, studentProfileError, groupError });
      return { ok: false, error: "El alumno debe tener una cuenta activa y el grupo seleccionado debe existir." };
    }
    const subject = Array.isArray(group.subjects) ? group.subjects[0] : group.subjects;
    if (!group.active) return { ok: false, error: "No se puede inscribir al alumno en un grupo inactivo." };
    if (student.career_id !== subject?.career_id) return { ok: false, error: "La carrera del alumno no corresponde a la materia del grupo." };
    if (subject?.semester != null && student.semester !== subject.semester) {
      return { ok: false, error: "El semestre del alumno no corresponde al semestre de la materia." };
    }
    const { data: existing, error: existingError } = await supabase.from("enrollments")
      .select("id,status")
      .eq("student_id", parsed.data.studentId)
      .eq("group_id", parsed.data.groupId)
      .maybeSingle();
    if (existingError) {
      console.error("Could not check for a duplicate group enrollment.", existingError);
      return { ok: false, error: "No se pudo validar si el alumno ya pertenece al grupo." };
    }
    if (existing?.status === "active") return { ok: false, error: "El alumno ya está inscrito en este grupo." };
    if (existing && existing.status !== "withdrawn") return { ok: false, error: "La inscripción ya fue concluida; no se puede reabrir el historial académico." };
    const result = existing
      ? await supabase.from("enrollments").update({ status: "active" }).eq("id", existing.id).select("id").maybeSingle()
      : await supabase.from("enrollments").insert({ student_id: parsed.data.studentId, group_id: parsed.data.groupId, status: "active" }).select("id").maybeSingle();
    if (result.error) return { ok: false, error: academicWriteError(result.error, "El alumno ya está inscrito en este grupo.") };
    if (!result.data) return { ok: false, error: "No se pudo guardar la inscripción del alumno." };
    revalidatePath("/admin/grupos");
    revalidatePath("/admin/alumnos");
    revalidatePath("/docente/grupos");
  }

  return { ok: true };
}

export async function removeTeacherFromGroup(teacherId: string, groupId: string): Promise<AdminActionResult> {
  if (!z.string().uuid().safeParse(teacherId).success || !z.string().uuid().safeParse(groupId).success) {
    return { ok: false, error: "La asignación seleccionada no es válida." };
  }
  const administrator = await getActiveAdministrator();
  if ("ok" in administrator) return administrator;
  const supabase = await createClient();
  const { data, error } = await supabase.from("teacher_groups")
    .delete()
    .eq("teacher_id", teacherId)
    .eq("group_id", groupId)
    .select("teacher_id")
    .maybeSingle();
  if (error) return { ok: false, error: academicWriteError(error, "No se pudo retirar al docente del grupo.") };
  if (!data) return { ok: false, error: "El docente ya no estaba asignado a este grupo." };
  revalidatePath("/admin/grupos");
  revalidatePath("/docente/grupos");
  return { ok: true };
}

export async function withdrawStudentFromGroup(enrollmentId: string): Promise<AdminActionResult> {
  if (!z.string().uuid().safeParse(enrollmentId).success) return { ok: false, error: "La inscripción seleccionada no es válida." };
  const administrator = await getActiveAdministrator();
  if ("ok" in administrator) return administrator;
  const supabase = await createClient();
  const { data, error } = await supabase.from("enrollments")
    .update({ status: "withdrawn" })
    .eq("id", enrollmentId)
    .eq("status", "active")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: academicWriteError(error, "No se pudo retirar al alumno del grupo.") };
  if (!data) return { ok: false, error: "La inscripción ya fue retirada o no existe." };
  revalidatePath("/admin/grupos");
  revalidatePath("/admin/alumnos");
  revalidatePath("/docente/grupos");
  return { ok: true };
}
