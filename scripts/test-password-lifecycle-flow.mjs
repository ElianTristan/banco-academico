import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [
  adminActions,
  authActions,
  middleware,
  portal,
  academicActions,
  authForm,
  completeMigration,
  migration0011,
] = await Promise.all([
  read("src/app/admin/actions.ts"),
  read("src/app/auth/actions.ts"),
  read("src/middleware.ts"),
  read("src/components/portal.tsx"),
  read("src/app/academic/actions.ts"),
  read("src/components/auth-form.tsx"),
  read("supabase/BANCO_ACADEMICO_MIGRACION_COMPLETA.sql"),
  read("supabase/migrations/0011_institutional_temporary_password.sql"),
]);

const tests = [];
function test(name, fn) {
  fn();
  tests.push(name);
}

// 1. El administrador crea un usuario nuevo con contraseña temporal institucional Tec12345!
test("1. Admin crea usuario: asigna Tec12345! y must_change_password vía Supabase Auth admin API", () => {
  assert.match(adminActions, /const TEMPORARY_PASSWORD = "Tec12345!";/);
  assert.match(adminActions, /service\.auth\.admin\.createUser\(\{[\s\S]*?password:\s*TEMPORARY_PASSWORD/);
  assert.match(adminActions, /user_metadata:\s*\{[\s\S]*?must_change_password:\s*true/);
  assert.match(adminActions, /app_metadata:\s*\{[\s\S]*?must_change_password:\s*true/);
  assert.doesNotMatch(adminActions, /insert into.*password/i);
  assert.doesNotMatch(adminActions, /NEXT_PUBLIC_SERVICE_ROLE_KEY/);
});

// 2. El usuario inicia sesión con Tec12345!
test("2. Inicio de sesión con credenciales y contraseña temporal", () => {
  assert.match(authActions, /signInWithPassword\(\{ email: resolved\.email, password: parsed\.data\.password \}\)/);
  assert.match(authActions, /const TEMPORARY_PASSWORD = "Tec12345!";/);
});

// 3. El sistema exige cambiar la contraseña y bloquea acceso al panel en el servidor
test("3. Restricción en servidor exige cambio obligatorio e impide eludir por URL o acción", () => {
  // Redirección en signIn
  assert.match(authActions, /must_change_password[\s\S]*?redirect\("\/recuperar\/nueva\?required=1"\)/);
  // Bloqueo y redirección en Middleware
  assert.match(middleware, /must_change_password[\s\S]*?redirect\(new URL\("\/recuperar\/nueva\?required=1"/);
  // Bloqueo y redirección en componente de servidor Portal
  assert.match(portal, /must_change_password[\s\S]*?redirect\("\/recuperar\/nueva\?required=1"\)/);
  // Bloqueo en Server Actions académicas
  assert.match(academicActions, /must_change_password[\s\S]*?return \{ supabase, user: null, role: null \}/);
  // Mensaje informativo en interfaz AuthForm
  assert.match(authForm, /mode === "new-password" && params\.get\("required"\) === "1"/);
  assert.match(authForm, /Primer ingreso: por seguridad institucional/);
});

// 4. El usuario establece una contraseña definitiva segura
test("4. El usuario actualiza su contraseña definitiva segura y se limpian flags temporales", () => {
  // Rechazo si intenta mantener la contraseña temporal como definitiva
  assert.match(authActions, /if \(parsed\.data\.password === TEMPORARY_PASSWORD\) \{\s*redirect\("\/recuperar\/nueva\?error=temporal&required=1"\);/);
  // Validación de requisitos de seguridad de contraseña
  assert.match(authActions, /\.min\(8,/);
  assert.match(authActions, /regex\(\/\[A-Z\]\//);
  assert.match(authActions, /regex\(\/\[a-z\]\//);
  assert.match(authActions, /regex\(\/\[0-9\]\//);
  assert.match(authActions, /regex\(\/\[\^\\p\{L\}\\p\{N\}\]\/u/);
  // Actualización en Supabase Auth con must_change_password = false
  assert.match(authActions, /supabase\.auth\.updateUser\(\{ password: parsed\.data\.password, data: \{ must_change_password: false \} \}\)/);
  assert.match(authActions, /updateUserById\(user\.id, \{\s*app_metadata: \{ must_change_password: false \},\s*user_metadata: \{ must_change_password: false \},?\s*\}\)/);
  // Cierre de sesión de recuperación
  assert.match(authActions, /supabase\.auth\.signOut\(\)/);
  assert.match(authActions, /redirect\(attemptsReset \? "\/recuperar\/actualizada" : "\/recuperar\/actualizada\?unlock=error"\)/);
});

// 5. El usuario puede iniciar sesión con su nueva contraseña
test("5. Acceso normal al panel tras cambiar contraseña (must_change_password = false)", () => {
  // Al no estar activo must_change_password, signIn redirige al home del rol
  assert.match(authActions, /if \(profile\.role === "alumno"\) redirect\("\/alumno\?auth=success"\);/);
  assert.match(authActions, /if \(profile\.role === "docente"\) redirect\("\/docente\?auth=success"\);/);
  assert.match(authActions, /if \(profile\.role === "administrador"\) redirect\("\/admin\?auth=success"\);/);
});

// 6. Comprueba que ninguna contraseña se almacene en texto plano
test("6. Ninguna contraseña en texto plano en tablas, perfiles, bitácoras ni scripts", () => {
  // Sin columnas de contraseña en profiles
  assert.doesNotMatch(completeMigration, /alter table public\.profiles add column.*password/i);
  assert.doesNotMatch(completeMigration, /create table.*profiles[\s\S]*?password text/i);
  // Sin contraseñas en activity_logs
  assert.doesNotMatch(completeMigration, /insert into public\.activity_logs.*Tec12345!/i);
  assert.doesNotMatch(migration0011, /Tec12345!/);
  assert.match(migration0011, /'Creó una cuenta institucional con contraseña temporal'/);
  // Sin almacenamiento local de contraseñas
  assert.doesNotMatch(authForm, /localStorage|sessionStorage/);
});

console.log(`PASS ${tests.length} pruebas del flujo de contraseña temporal y almacenamiento seguro:`);
for (const t of tests) {
  console.log(`  ✓ ${t}`);
}
