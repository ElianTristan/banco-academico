import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [
  auth, middleware, portal, actions, base, hardening, loginLookup, authAttempts, accountAuthAttempts, passwordRecoveryUnlock,
  supabaseServer, completeMigration, callback, authForm, registration, newPassword, passwordUpdated, adminActions, managedUserMigration,
  temporaryPasswordMigration,
] = await Promise.all([
  read("src/app/auth/actions.ts"), read("src/middleware.ts"), read("src/components/portal.tsx"),
  read("src/app/academic/actions.ts"), read("supabase/migrations/0001_initial_schema.sql"),
  read("supabase/migrations/0004_secure_role_requests.sql"),
  read("supabase/migrations/0005_server_login_identifier_lookup.sql"),
  read("supabase/migrations/0006_server_auth_attempts.sql"),
  read("supabase/migrations/0007_account_auth_attempt_limits.sql"),
  read("supabase/migrations/0008_reset_login_attempts_after_password_recovery.sql"),
  read("src/lib/supabase/server.ts"), read("supabase/BANCO_ACADEMICO_MIGRACION_COMPLETA.sql"),
  read("src/app/auth/callback/route.ts"), read("src/components/auth-form.tsx"),
  read("src/app/(auth)/registro/page.tsx"), read("src/app/(auth)/recuperar/nueva/page.tsx"),
  read("src/app/(auth)/recuperar/actualizada/page.tsx"),
  read("src/app/admin/actions.ts"), read("supabase/migrations/0010_admin_user_lifecycle.sql"),
  read("supabase/migrations/0011_institutional_temporary_password.sql"),
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
  assert.match(middleware, /from\("profiles"\)\.select\("role,is_active"\)/);
  assert.match(middleware, /profile\?\.is_active === false/);
  assert.match(auth, /if \(profile\.is_active !== true\)/);
  assert.match(middleware, /requiredRole && requiredRole !== home/);
});
check("La página vuelve a comprobar el rol en el servidor", () => {
  assert.match(portal, /if\(profile\.role!==role\)redirect\(roleHomes\[profile\.role\]\)/);
});
check("Acciones sensibles validan el rol del actor", () => {
  for (const role of ["administrador", "docente", "alumno"]) assert.ok(actions.includes(`role !== "${role}"`));
});
check("Gestión de cuentas requiere administrador y usa Auth service-role solo en servidor", () => {
  assert.match(adminActions, /"use server"/);
  assert.match(adminActions, /profile\?\.role !== "administrador" \|\| profile\.is_active !== true/);
  assert.match(adminActions, /createUser/);
  assert.match(adminActions, /rpc\("finalize_admin_created_user"/);
  assert.match(adminActions, /createServiceRoleClient\(\)/);
  assert.doesNotMatch(adminActions, /NEXT_PUBLIC_SERVICE_ROLE_KEY/);
});
check("Desactivar cuentas conserva datos, protege la última cuenta admin y permite reactivar", () => {
  assert.match(managedUserMigration, /add column if not exists is_active boolean not null default true/);
  assert.match(managedUserMigration, /perform pg_advisory_xact_lock/);
  assert.match(managedUserMigration, /Debe permanecer al menos una cuenta administradora activa/);
  assert.match(managedUserMigration, /No puedes desactivar tu propia cuenta/);
  assert.match(managedUserMigration, /function public\.reactivate_managed_user/);
  assert.doesNotMatch(managedUserMigration, /delete from auth\.users|delete from public\.profiles/i);
  assert.match(completeMigration, /0010_admin_user_lifecycle\.sql/);
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
  assert.match(auth, /rpc\("reserve_account_login_attempt"/);
  assert.match(accountAuthAttempts, /create or replace function public\.reserve_account_login_attempt\(\s*target_identifier text\s*\)/);
  assert.match(accountAuthAttempts, /extensions\.digest\(lower\(btrim\(target_identifier\)\), 'sha256'\)/);
  assert.doesNotMatch(accountAuthAttempts, /target_client_key/);
  assert.match(accountAuthAttempts, /revoke all on function public\.reserve_account_login_attempt\(text\) from public, anon, authenticated/);
  assert.match(accountAuthAttempts, /grant execute on function public\.reserve_account_login_attempt\(text\) to service_role/);
  assert.match(auth, /resolveEmailForRole\(role, rawIdentifier\)[\s\S]*?reserveLoginAttempt\(resolved\.email \?\? rawIdentifier\)/);
  assert.doesNotMatch(auth, /x-real-ip|ba-auth-source|clientAttemptKey/);
  assert.match(auth, /failedCredentials/);
  assert.match(auth, /rpc\("complete_login_attempt"/);
  assert.match(completeMigration, /create or replace function public\.reserve_login_attempt/);
  assert.match(completeMigration, /extensions\.digest\(lower\(btrim\(target_identifier\)\)/);
  assert.match(completeMigration, /0007_account_auth_attempt_limits\.sql/);
  assert.match(completeMigration, /grant execute on function public\.reserve_account_login_attempt\(text\) to service_role/);
});
check("La recuperación exitosa libera el bloqueo de intentos de esa cuenta", () => {
  assert.match(auth, /reset_account_login_attempts/);
  assert.match(auth, /const attemptsReset = await resetLoginAttempts\(user\.id\)/);
  assert.match(auth, /attemptsReset \? "\/recuperar\/actualizada" : "\/recuperar\/actualizada\?unlock=error"/);
  assert.match(passwordRecoveryUnlock, /set failed_attempts = 0,[\s\S]*locked_until = null/);
  assert.match(passwordRecoveryUnlock, /delete from public\.login_attempt_reservations/);
  assert.match(passwordRecoveryUnlock, /revoke all on function public\.reset_account_login_attempts\(uuid\) from public, anon, authenticated/);
  assert.match(passwordRecoveryUnlock, /grant execute on function public\.reset_account_login_attempts\(uuid\) to service_role/);
  assert.match(passwordRecoveryUnlock, /for update/);
  assert.match(passwordUpdated, /bloqueo de acceso fue liberado/);
  assert.match(passwordUpdated, /no pudimos liberar el bloqueo automáticamente/);
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
check("Contraseña temporal institucional Tec12345! configurada solo en backend seguro y asignada en createUser", () => {
  assert.match(adminActions, /TEMPORARY_PASSWORD\s*=\s*"Tec12345!"/);
  assert.match(adminActions, /createUser\(\s*\{[\s\S]*?password:\s*TEMPORARY_PASSWORD/);
  assert.match(adminActions, /must_change_password:\s*true/);
  assert.doesNotMatch(adminActions, /insert into.*password/i);
  assert.doesNotMatch(temporaryPasswordMigration, /Tec12345!/);
});
check("Restricción en servidor exige cambio obligatorio de contraseña temporal antes de acceder al panel", () => {
  assert.match(middleware, /must_change_password/);
  assert.match(middleware, /recuperar\/nueva\?required=1/);
  assert.match(portal, /must_change_password/);
  assert.match(portal, /recuperar\/nueva\?required=1/);
  assert.match(auth, /must_change_password/);
  assert.match(auth, /recuperar\/nueva\?required=1/);
  assert.match(actions, /must_change_password/);
});
check("Almacenamiento seguro: contraseñas gestionadas por Supabase Auth, sin texto plano en perfiles ni bitácoras", () => {
  assert.match(auth, /supabase\.auth\.updateUser\(\s*\{[\s\S]*?password:[\s\S]*?must_change_password:\s*false/);
  assert.doesNotMatch(completeMigration, /alter table public\.profiles add column.*password/i);
  assert.doesNotMatch(completeMigration, /insert into public\.activity_logs.*Tec12345!/i);
  assert.match(temporaryPasswordMigration, /Creó una cuenta institucional con contraseña temporal/);
  assert.match(completeMigration, /0011_institutional_temporary_password\.sql/);
});

console.log(`PASS ${checks.length} comprobaciones estáticas de seguridad:`);
for (const label of checks) console.log(`- ${label}`);
console.log("NOT RUN: las pruebas de integración contra Supabase requieren cuentas separadas por rol.");
