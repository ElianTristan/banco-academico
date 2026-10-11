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
const passwordSchema = z.string().min(10, "Usa al menos 10 caracteres.").regex(/[A-Z]/, "Incluye una mayúscula.").regex(/[a-z]/, "Incluye una minúscula.").regex(/[0-9]/, "Incluye un número.");

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
    identifier: z.string().trim().min(2, "Escribe un identificador válido.").max(80).optional(),
    password: z.string().min(1)
  }).strict().safeParse(Object.fromEntries(formData));

  if (!parsed.success) redirect("/login?error=datos");

  const supabase = await createClient();
  const role = parsed.data.role ?? "alumno";
  const rawIdentifier = parsed.data.identifier ?? parsed.data.email ?? "";
  const resolved = await resolveEmailForRole(role, rawIdentifier);

  if (!resolved.ok) redirect("/login?error=lookup");
  if (!resolved.email) redirect("/login?error=credenciales");

  const { error } = await supabase.auth.signInWithPassword({ email: resolved.email, password: parsed.data.password });
  if (error) redirect("/login?error=credenciales");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?error=credenciales");

  const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profileError || !profile || profile.role !== role) {
    if (profileError) console.error("Login profile role verification failed.", profileError);
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      console.error("Could not clear a session after a role mismatch.", signOutError);
      throw new Error("Could not clear session after role verification.");
    }
    redirect(profileError ? "/login?error=lookup" : "/login?error=credenciales");
  }

  await supabase.from("access_logs").insert({ user_id: user.id, event_type: "LOGIN", succeeded: true, session_info: { source: "web" } });

  if (profile.role === "alumno") redirect("/alumno");
  if (profile.role === "docente") redirect("/docente");
  if (profile.role === "administrador") redirect("/admin");
  redirect("/acceso-pendiente");
}

export async function signUp(formData: FormData) {
  const parsed = z.object({ firstName: z.string().trim().min(2), lastName: z.string().trim().min(2), email: emailSchema, controlNumber: z.string().trim().max(30).optional(), password: passwordSchema, confirmPassword: z.string() }).strict().safeParse(Object.fromEntries(formData));
  if (!parsed.success || parsed.data.password !== parsed.data.confirmPassword) redirect("/registro?error=datos");
  const { firstName, lastName, email, controlNumber, password } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({ email, password, options: { data: { first_name: firstName, last_name: lastName, control_number: controlNumber || null } } });
  if (error) {
    const isDuplicate = /already registered|user already exists|already been registered/i.test(error.message);
    redirect(isDuplicate ? "/registro?error=existente" : "/registro?error=registro");
  }
  redirect("/registro?success=1");
}

export async function requestPasswordReset(formData: FormData) {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) redirect("/recuperar?error=datos");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) await supabase.from("access_logs").insert({ user_id: user.id, event_type: "PASSWORD_RESET", succeeded: true, session_info: { source: "web" } });
  await supabase.auth.resetPasswordForEmail(parsed.data, { redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/callback?next=/recuperar/nueva` });
  redirect("/recuperar?sent=1");
}

export async function updatePassword(formData: FormData) {
  const parsed = z.object({ password: passwordSchema, confirmPassword: z.string() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success || parsed.data.password !== parsed.data.confirmPassword) redirect("/recuperar/nueva?error=datos");
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) redirect("/recuperar/nueva?error=actualizar");
  redirect("/login?passwordUpdated=1");
}

export async function signOut() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) await supabase.from("access_logs").insert({ user_id: user.id, event_type: "LOGOUT", succeeded: true, session_info: { source: "web" } });
  await supabase.auth.signOut();
  redirect("/login");
}
