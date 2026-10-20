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
