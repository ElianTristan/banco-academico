import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [auth, middleware, portal, actions, base, hardening, loginLookup, supabaseServer, completeMigration] = await Promise.all([
  read("src/app/auth/actions.ts"), read("src/middleware.ts"), read("src/components/portal.tsx"),
  read("src/app/academic/actions.ts"), read("supabase/migrations/0001_initial_schema.sql"),
  read("supabase/migrations/0004_secure_role_requests.sql"),
  read("supabase/migrations/0005_server_login_identifier_lookup.sql"), read("src/lib/supabase/server.ts"),
  read("supabase/BANCO_ACADEMICO_MIGRACION_COMPLETA.sql"),
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

console.log(`PASS ${checks.length} comprobaciones estáticas de seguridad:`);
for (const label of checks) console.log(`- ${label}`);
console.log("NOT RUN: las pruebas de integración contra Supabase requieren cuentas separadas por rol.");
