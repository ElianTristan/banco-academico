import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [
  auth, middleware, portal, actions, base, hardening, loginLookup, authAttempts,
  supabaseServer, completeMigration, callback, authForm, registration, newPassword,
] = await Promise.all([
  read("src/app/auth/actions.ts"), read("src/middleware.ts"), read("src/components/portal.tsx"),
  read("src/app/academic/actions.ts"), read("supabase/migrations/0001_initial_schema.sql"),
  read("supabase/migrations/0004_secure_role_requests.sql"),
  read("supabase/migrations/0005_server_login_identifier_lookup.sql"),
  read("supabase/migrations/0006_server_auth_attempts.sql"),
  read("src/lib/supabase/server.ts"), read("supabase/BANCO_ACADEMICO_MIGRACION_COMPLETA.sql"),
  read("src/app/auth/callback/route.ts"), read("src/components/auth-form.tsx"),
  read("src/app/(auth)/registro/page.tsx"), read("src/app/(auth)/recuperar/nueva/page.tsx"),
]);
const checks = [];
function check(label, assertion) { assertion(); checks.push(label); }

check("Registro estricto: campos de rol adicionales no pasan Zod", () => {
  assert.match(auth, /const parsed = z\.object\(\{ firstName:.*?\}\)\.strict\(\)\.safeParse/s);
});
check("Alta Auth asigna alumno en PostgreSQL e ignora roles de metadata", () => {
  const trigger = base.match(/create function public\.handle_new_user\(\).*?\n\$\$;/s)?.[0] ?? "";
  assert.match(trigger, /'alumno'/);
  assert.doesNotMatch(trigger, /raw_user_meta_data->>'role'/);
});
check("Middleware valida sesión y rol desde profiles", () => {
  assert.match(middleware, /supabase\.auth\.getUser\(\)/);
  assert.match(middleware, /from\("profiles"\)\.select\("role"\)/);
  assert.match(middleware, /requiredRole && requiredRole !== home/);
});
check("La página vuelve a comprobar el rol en el servidor", () => {
  assert.match(portal, /if\(profile\.role!==role\)redirect\(roleHomes\[profile\.role\]\)/);
});
check("Acciones sensibles validan el rol del actor", () => {
  for (const role of ["administrador", "docente", "alumno"]) assert.ok(actions.includes(`role !== "${role}"`));
});
check("El trigger bloquea cambios de rol por PostgREST", () => {
  assert.match(hardening, /current_user not in \('postgres', 'service_role'\) or not public\.is_admin\(\)/);
  assert.match(hardening, /Privileged roles require a trusted administrative workflow/);
});
check("Solicitudes docentes solo se escriben mediante RPCs autorizados", () => {
  assert.match(hardening, /Only an authenticated student may request teacher access/);
  assert.match(hardening, /Only an administrator may review teacher applications/);
  assert.match(hardening, /revoke all on function public\.review_teacher_application/);
  assert.match(hardening, /grant execute on function public\.review_teacher_application.* to authenticated/);
  assert.doesNotMatch(hardening, /create policy[^;]+teacher_applications for (insert|update|delete)/i);
});
check("RLS de grupos y calificaciones verifica propiedad docente/grupo", () => {
  assert.match(hardening, /public\.current_role\(\) = 'docente'.*public\.teacher_groups/s);
  assert.match(base, /teachers manage their grades.*public\.is_teacher_of\(e\.group_id\)/s);
});
check("La solicitud de asesoría no permite cambiar titular o sesión", () => {
  assert.match(hardening, /new\.student_id is distinct from old\.student_id/);
  assert.match(hardening, /new\.session_id is distinct from old\.session_id/);
});
check("Resolver de identificador solo está disponible para service_role en servidor", () => {
  const resolver = loginLookup.match(/create or replace function public\.resolve_login_email[\s\S]*?\n\$\$;/)?.[0] ?? "";
  assert.match(resolver, /security definer/);
  assert.match(resolver, /set search_path = ''/);
  assert.match(resolver, /profile\.role::text = target_role/);
  assert.match(loginLookup, /revoke all on function public\.resolve_login_email\(text, text\) from public, anon, authenticated/);
  assert.match(loginLookup, /grant execute on function public\.resolve_login_email\(text, text\) to service_role/);
  assert.match(auth, /createServiceRoleClient\(\)\.rpc\("resolve_login_email"/);
  assert.match(supabaseServer, /import "server-only"/);
  assert.doesNotMatch(supabaseServer, /NEXT_PUBLIC_SERVICE_ROLE_KEY/);
  assert.match(completeMigration, /grant execute on function public\.resolve_login_email\(text, text\) to service_role/);
});
check("Los intentos se limitan en PostgreSQL y soportan concurrencia", () => {
  assert.match(authAttempts, /create table if not exists public\.login_attempt_limits/);
  assert.match(authAttempts, /create table if not exists public\.login_attempt_reservations/);
  assert.match(authAttempts, /for update/);
  assert.match(authAttempts, /failed_attempts between 0 and 3/);
  assert.match(authAttempts, /now\(\) \+ interval '15 minutes'/);
  assert.match(authAttempts, /extensions\.digest\(lower\(btrim\(target_identifier\)\)/);
  assert.doesNotMatch(authAttempts, /public\.digest\(/);
  assert.match(authAttempts, /target_outcome not in \('failure', 'success', 'release'\)/);
  for (const fn of ["reserve_login_attempt", "complete_login_attempt", "record_auth_event"]) {
    assert.ok(authAttempts.includes(`grant execute on function public.${fn}(`));
  }
  assert.match(auth, /rpc\("reserve_login_attempt"/);
  assert.match(auth, /failedCredentials/);
  assert.match(auth, /rpc\("complete_login_attempt"/);
  assert.match(completeMigration, /create or replace function public\.reserve_login_attempt/);
  assert.match(completeMigration, /extensions\.digest\(lower\(btrim\(target_identifier\)\)/);
});
check("La UI solo presenta el contador después de un fallo confirmado", () => {
  assert.doesNotMatch(authForm, /sessionStorage|localStorage|Intentos fallidos:.*0/);
  assert.match(authForm, /failedAttempt/);
  assert.match(authForm, /Intento \{attempt\} de 3/);
  assert.match(auth, /attempts >= 3.*recuperar\?blocked=1/s);
  assert.doesNotMatch(authForm, /from\(["']access_logs/);
});
check("Los eventos de acceso quedan internos y visibles solo para administración", () => {
  assert.match(authAttempts, /values \(\s*target_user_id,\s*event_type,\s*target_outcome = 'success'/);
  assert.match(authAttempts, /create policy "admins read access logs" on public\.access_logs\s+for select to authenticated using \(public\.is_admin\(\)\)/);
  assert.match(authAttempts, /revoke insert, update, delete on public\.access_logs from public, anon, authenticated/);
  assert.match(auth, /if \(!completion\) console\.error/);
});
check("La recuperación maneja PKCE, enlaces OTP y rutas internas permitidas", () => {
  assert.match(auth, /resetPasswordForEmail\(parsed\.data, \{ redirectTo:/);
  assert.match(auth, /NEXT_PUBLIC_SITE_URL/);
  assert.doesNotMatch(auth, /NEXT_PUBLIC_SITE_URL \?\? "http:\/\/localhost:3000"/);
  assert.match(callback, /exchangeCodeForSession\(code\)/);
  assert.match(callback, /verifyOtp\(/);
  assert.match(callback, /new Set\(\["\/", "\/recuperar\/nueva", "\/alumno\?auth=success"\]\)/);
  assert.match(newPassword, /supabase\.auth\.getUser\(\)/);
  assert.match(auth, /supabase\.auth\.updateUser\(\{ password:/);
});
check("El registro presenta solo rutas compatibles con la autorización real", () => {
  assert.match(registration, /role: "alumno"/);
  assert.match(registration, /role: "docente"/);
  assert.match(registration, /role: "administrador"/);
  assert.match(registration, /registration-role-restricted/);
  assert.match(registration, /submitTeacherApplication|solicitud docente/i);
  assert.doesNotMatch(auth, /role:.*parsed\.data/);
});
check("Las claves nuevas cumplen ocho caracteres, clases y carácter especial", () => {
  assert.match(auth, /\.min\(8,/);
  assert.match(auth, /regex\(\/\[\^\\p\{L\}\\p\{N\}\]\/u/);
  assert.match(authForm, /Carácter especial/);
  assert.match(authForm, /checks=\{mode === "register" \|\| mode === "new-password"/);
});

console.log(`PASS ${checks.length} comprobaciones estáticas de seguridad:`);
for (const label of checks) console.log(`- ${label}`);
console.log("NOT RUN: las pruebas de integración contra Supabase requieren cuentas separadas por rol.");
