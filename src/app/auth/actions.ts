"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import {
  createClient,
  createServiceRoleClient,
  hasSupabaseServiceRoleConfig,
} from "@/lib/supabase/server";

const emailSchema = z.string().trim().email("Escribe un correo válido.");
const appRoleSchema = z.enum(["alumno", "docente", "administrador"]);
const passwordSchema = z.string()
  .min(8, "Usa al menos 8 caracteres.")
  .regex(/[A-Z]/, "Incluye una mayúscula.")
  .regex(/[a-z]/, "Incluye una minúscula.")
  .regex(/[0-9]/, "Incluye un número.")
  .regex(/[^\p{L}\p{N}]/u, "Incluye un carácter especial.");

type LoginAttemptResult = {
  allowed?: boolean;
  reservation_id?: string;
  failed_attempts?: number;
  locked_until?: string | null;
  audit_logged?: boolean;
  audit_error?: string | null;
};

function getLoginAttemptResult(value: unknown): LoginAttemptResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as LoginAttemptResult;
}

async function reserveLoginAttempt(identifier: string) {
  if (!hasSupabaseServiceRoleConfig()) {
    console.error("Login attempt protection is unavailable: service-role configuration is missing.");
    return null;
  }

  const { data, error } = await createServiceRoleClient().rpc("reserve_account_login_attempt", {
    target_identifier: identifier.trim().toLowerCase(),
  });
  if (error) {
    console.error("Could not reserve a login attempt.", error);
    return null;
  }

  const result = getLoginAttemptResult(data);
  if (!result) console.error("Login attempt reservation returned an invalid response.");
  return result;
}

async function completeLoginAttempt(reservationId: string, outcome: "failure" | "success" | "release", userId: string | null = null) {
  const { data, error } = await createServiceRoleClient().rpc("complete_login_attempt", {
    target_reservation: reservationId,
    target_outcome: outcome,
    target_user_id: userId,
  });
  if (error) {
    console.error(`Could not complete a login attempt (${outcome}).`, error);
    return null;
  }

  const result = getLoginAttemptResult(data);
  if (!result) {
    console.error(`Login attempt completion returned an invalid response (${outcome}).`);
    return null;
  }
  if (result.audit_logged === false) {
    console.error("Authentication was processed, but its audit event could not be recorded.", result.audit_error);
  }
  return result;
}

async function recordAuthEvent(userId: string, event: "LOGOUT" | "PASSWORD_RESET") {
  const { data, error } = await createServiceRoleClient().rpc("record_auth_event", {
    target_user_id: userId,
    target_event: event,
  });
  if (error) {
    console.error(`Could not record the ${event} audit event.`, error);
    return;
  }
  const result = getLoginAttemptResult(data);
  if (result?.audit_logged === false) console.error(`Could not record the ${event} audit event.`, result.audit_error);
}

async function resetLoginAttempts(userId: string) {
  if (!hasSupabaseServiceRoleConfig()) {
    console.error("Could not clear login-attempt lockout after password reset: service-role configuration is missing.");
    return false;
  }

  const { data, error } = await createServiceRoleClient().rpc("reset_account_login_attempts", {
    target_user_id: userId,
  });
  if (error) {
    console.error("Could not clear login-attempt lockout after password reset.", error);
    return false;
  }
  if (data !== true) {
    console.error("Login-attempt lockout reset returned an invalid response.");
    return false;
  }
  return true;
}

function configuredSiteUrl() {
  const value = process.env.NEXT_PUBLIC_SITE_URL;
  if (!value) return null;

  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    if (url.protocol !== "https:" && process.env.NODE_ENV === "production") return null;
    if (process.env.NODE_ENV === "production" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

async function resolveEmailForRole(role: z.infer<typeof appRoleSchema>, identifier: string) {
  const value = identifier.trim();
  if (!value) return { ok: true as const, email: null };
  if (value.includes("@")) return { ok: true as const, email: value.toLowerCase() };
  if (role === "administrador") return { ok: true as const, email: null };
  if (!hasSupabaseServiceRoleConfig()) {
    console.error("Login by institutional identifier is unavailable: service-role configuration is missing.");
    return { ok: false as const };
  }

  const { data, error } = await createServiceRoleClient().rpc("resolve_login_email", {
    target_role: role,
    target_identifier: value,
  });
  if (error) {
    console.error("Login identifier lookup failed.", error);
    return { ok: false as const };
  }
  return { ok: true as const, email: data };
}

export async function signIn(formData: FormData) {
  const parsed = z.object({
    role: z.string().transform((value) => value.trim().toLowerCase()).pipe(appRoleSchema).optional(),
    email: emailSchema.optional(),
    identifier: z.string().trim().min(2, "Escribe un identificador válido.").max(254).optional(),
    password: z.string().min(1)
  }).strict().safeParse(Object.fromEntries(formData));

  if (!parsed.success) redirect("/login?error=datos");

  const supabase = await createClient();
  const role = parsed.data.role ?? "alumno";
  const rawIdentifier = parsed.data.identifier ?? parsed.data.email ?? "";
  const resolved = await resolveEmailForRole(role, rawIdentifier);
  if (!resolved.ok) redirect("/login?error=lookup");

  const reservation = await reserveLoginAttempt(resolved.email ?? rawIdentifier);
  if (!reservation) redirect("/login?error=auth");
  if (reservation.allowed !== true || !reservation.reservation_id) {
    redirect(reservation.locked_until ? "/recuperar?blocked=1" : "/login?error=ocupado");
  }

  if (!resolved.email) {
    const failure = await completeLoginAttempt(reservation.reservation_id, "failure");
    if (!failure) redirect("/login?error=auth");
    const attempts = failure.failed_attempts ?? 1;
    if (attempts >= 3) redirect(`/recuperar?blocked=1&attempt=${attempts}`);
    redirect(`/login?error=credenciales&attempt=${attempts}`);
  }

  const { error } = await supabase.auth.signInWithPassword({ email: resolved.email, password: parsed.data.password });
  if (error) {
    const failedCredentials = error.status === 400
      && (error.code === "invalid_credentials" || /invalid login credentials/i.test(error.message));
    if (!failedCredentials) {
      await completeLoginAttempt(reservation.reservation_id, "release");
      console.error("Supabase Auth could not complete the login request.", { status: error.status, code: error.code });
      redirect("/login?error=auth");
    }

    let userId: string | null = null;
    const { data: profile, error: profileError } = await createServiceRoleClient()
      .from("profiles").select("id").eq("email", resolved.email).maybeSingle();
    if (profileError) console.error("Could not identify the profile for a failed login audit event.", profileError);
    else userId = profile?.id ?? null;

    const failure = await completeLoginAttempt(reservation.reservation_id, "failure", userId);
    if (!failure) redirect("/login?error=auth");
    const attempts = failure.failed_attempts ?? 1;
    if (attempts >= 3) redirect(`/recuperar?blocked=1&attempt=${attempts}`);
    redirect(`/login?error=credenciales&attempt=${attempts}`);
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    await completeLoginAttempt(reservation.reservation_id, "release");
    if (userError) console.error("Supabase Auth could not verify the newly created session.", { status: userError.status, code: userError.code });
    redirect("/login?error=auth");
  }

  const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profileError || !profile) {
    await completeLoginAttempt(reservation.reservation_id, "release");
    if (profileError) console.error("Login profile role verification failed.", profileError);
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      console.error("Could not clear a session after a profile verification failure.", signOutError);
      throw new Error("Could not clear session after profile verification.");
    }
    redirect("/login?error=auth");
  }

  const completion = await completeLoginAttempt(reservation.reservation_id, "success", user.id);
  if (!completion) console.error("Successful authentication could not reset its login-attempt counter.");
  if (profile.role !== role) {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      console.error("Could not clear a session after a role mismatch.", signOutError);
      throw new Error("Could not clear session after role verification.");
    }
    redirect("/login?error=rol");
  }

  if (profile.role === "alumno") redirect("/alumno?auth=success");
  if (profile.role === "docente") redirect("/docente?auth=success");
  if (profile.role === "administrador") redirect("/admin?auth=success");
  redirect("/acceso-pendiente");
}

export async function signUp(formData: FormData) {
  const parsed = z.object({ firstName: z.string().trim().min(2), lastName: z.string().trim().min(2), email: emailSchema, controlNumber: z.string().trim().max(30).optional(), password: passwordSchema, confirmPassword: z.string() }).strict().safeParse(Object.fromEntries(formData));
  if (!parsed.success || parsed.data.password !== parsed.data.confirmPassword) redirect("/registro?tipo=alumno&error=datos");
  const { firstName, lastName, email, controlNumber, password } = parsed.data;
  const siteUrl = configuredSiteUrl();
  if (!siteUrl) {
    console.error("Account confirmation URL is unavailable: NEXT_PUBLIC_SITE_URL is missing or invalid for this environment.");
    redirect("/registro?tipo=alumno&error=configuracion");
  }

  const supabase = await createClient();
  const emailRedirectTo = new URL("/auth/callback", siteUrl);
  emailRedirectTo.searchParams.set("next", "/alumno?auth=success");
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { first_name: firstName, last_name: lastName, control_number: controlNumber || null },
      emailRedirectTo: emailRedirectTo.toString(),
    },
  });
  if (error) {
    const isDuplicate = /already registered|user already exists|already been registered/i.test(error.message);
    redirect(isDuplicate ? "/registro?tipo=alumno&error=existente" : "/registro?tipo=alumno&error=registro");
  }
  if (data.session) redirect("/alumno?auth=success");
  redirect("/login?registered=1");
}

export async function requestPasswordReset(formData: FormData) {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) redirect("/recuperar?error=correo");
  const siteUrl = configuredSiteUrl();
  if (!siteUrl) {
    console.error("Password recovery URL is unavailable: NEXT_PUBLIC_SITE_URL is missing or invalid for this environment.");
    redirect("/recuperar?error=configuracion");
  }

  const supabase = await createClient();
  const redirectTo = new URL("/auth/callback", siteUrl);
  redirectTo.searchParams.set("next", "/recuperar/nueva");
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, { redirectTo: redirectTo.toString() });
  if (error) {
    console.error("Supabase Auth could not start password recovery.", { status: error.status, code: error.code });
    redirect("/recuperar?error=recuperacion");
  }
  redirect("/recuperar?sent=1");
}

export async function updatePassword(formData: FormData) {
  const parsed = z.object({ password: passwordSchema, confirmPassword: z.string() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success || parsed.data.password !== parsed.data.confirmPassword) redirect("/recuperar/nueva?error=datos");
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/recuperar?error=enlace");
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    console.error("Supabase Auth could not update the account password.", { status: error.status, code: error.code });
    redirect("/recuperar/nueva?error=actualizar");
  }
  const attemptsReset = await resetLoginAttempts(user.id);
  if (hasSupabaseServiceRoleConfig()) await recordAuthEvent(user.id, "PASSWORD_RESET");
  const { error: signOutError } = await supabase.auth.signOut();
  if (signOutError) console.error("Password was updated, but the recovery session could not be closed.", signOutError);
  redirect(attemptsReset ? "/recuperar/actualizada" : "/recuperar/actualizada?unlock=error");
}

export async function signOut() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user && hasSupabaseServiceRoleConfig()) await recordAuthEvent(user.id, "LOGOUT");
  await supabase.auth.signOut();
  redirect("/login");
}
