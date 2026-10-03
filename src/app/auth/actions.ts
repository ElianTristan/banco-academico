"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const emailSchema = z.string().trim().email("Escribe un correo válido.");
const passwordSchema = z.string().min(10, "Usa al menos 10 caracteres.").regex(/[A-Z]/,"Incluye una mayúscula.").regex(/[a-z]/,"Incluye una minúscula.").regex(/[0-9]/,"Incluye un número.");
export async function signIn(formData: FormData) {
  const parsed = z.object({ email: emailSchema, password: z.string().min(1) }).strict().safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/login?error=datos");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) redirect("/login?error=credenciales");
  const { data: { user } } = await supabase.auth.getUser();
  if (user) await supabase.from("access_logs").insert({ user_id: user.id, event_type: "LOGIN", succeeded: true, session_info: { source: "web" } });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).maybeSingle();
  if (profile?.role === "alumno") redirect("/alumno");
  if (profile?.role === "docente") redirect("/docente");
  if (profile?.role === "administrador") redirect("/admin");
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
