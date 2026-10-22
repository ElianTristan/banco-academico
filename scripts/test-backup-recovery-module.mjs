import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createZipArchive, readZipArchive } from "../src/lib/backup-recovery/zip.ts";
import { BACKUP_TABLES, TABLE_NAMES } from "../src/lib/backup-recovery/database-tables.ts";
import {
  acquireOperationLock,
  releaseOperationLock,
  isOperationLocked,
} from "../src/lib/backup-recovery/concurrency.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [
  backupActions,
  engine,
  portal,
  workspace,
  migration0012,
  completeMigration,
] = await Promise.all([
  read("src/app/admin/backup-actions.ts"),
  read("src/lib/backup-recovery/engine.ts"),
  read("src/components/portal.tsx"),
  read("src/components/backup-recovery-workspace.tsx"),
  read("supabase/migrations/0012_backup_and_recovery_module.sql"),
  read("supabase/BANCO_ACADEMICO_MIGRACION_COMPLETA.sql"),
]);

const tests = [];
function test(name, fn) {
  fn();
  tests.push(name);
}

// 1. Motor ZIP autónomo en TypeScript sin dependencias npm externas
test("1. Creación y lectura de archivos ZIP con CRC-32 e integridad Deflate", () => {
  const sampleEntries = [
    { name: "manifest.json", content: Buffer.from(JSON.stringify({ test: true, system: "Banco Académico" })) },
    { name: "data/careers.json", content: Buffer.from(JSON.stringify([{ id: "1", name: "Ingeniería en Sistemas" }])) },
    { name: "checksums.json", content: Buffer.from(JSON.stringify({ "data/careers.json": "abc123sha" })) },
  ];

  const zipBuffer = createZipArchive(sampleEntries);
  assert.ok(zipBuffer.length > 0, "El buffer ZIP no debe estar vacío");
  // Firma PK\x03\x04
  assert.equal(zipBuffer[0], 0x50);
  assert.equal(zipBuffer[1], 0x4b);
  assert.equal(zipBuffer[2], 0x03);
  assert.equal(zipBuffer[3], 0x04);

  const extracted = readZipArchive(zipBuffer);
  assert.equal(extracted.length, 3, "Debe contener 3 entradas");
  const extractedMap = new Map(extracted.map((e) => [e.name, e.content]));
  assert.ok(extractedMap.has("manifest.json"));
  assert.ok(extractedMap.has("data/careers.json"));
  assert.ok(extractedMap.has("checksums.json"));

  const manifestJson = JSON.parse(extractedMap.get("manifest.json").toString("utf8"));
  assert.equal(manifestJson.system, "Banco Académico");
});

// 2. Catálogo de tablas y orden topológico de llaves foráneas
test("2. Catálogo de 22 tablas y orden topológico estricto", () => {
  assert.equal(BACKUP_TABLES.length, 22, "Deben existir exactamente 22 tablas catalogadas");
  assert.equal(TABLE_NAMES.length, 22, "El orden topológico debe cubrir las 22 tablas");

  // Perfiles antes que estudiantes y docentes
  const idxProfiles = TABLE_NAMES.indexOf("profiles");
  const idxStudents = TABLE_NAMES.indexOf("students");
  const idxTeachers = TABLE_NAMES.indexOf("teachers");
  const idxGroups = TABLE_NAMES.indexOf("groups");
  const idxEnrollments = TABLE_NAMES.indexOf("enrollments");
  const idxGrades = TABLE_NAMES.indexOf("grades");

  assert.ok(idxProfiles < idxStudents, "profiles debe preceder a students");
  assert.ok(idxProfiles < idxTeachers, "profiles debe preceder a teachers");
  assert.ok(idxStudents < idxEnrollments, "students debe preceder a enrollments");
  assert.ok(idxGroups < idxEnrollments, "groups debe preceder a enrollments");
  assert.ok(idxEnrollments < idxGrades, "enrollments debe preceder a grades");

  // Verificación de saneamiento de datos en profiles
  const profilesDef = BACKUP_TABLES.find((t) => t.name === "profiles");
  assert.ok(profilesDef, "profiles debe estar en BACKUP_TABLES");
  assert.ok(profilesDef.allowedFields, "profiles debe restringir campos permitidos");
  assert.ok(!profilesDef.allowedFields.includes("password"), "Nunca debe incluir contraseñas");
  assert.ok(!profilesDef.allowedFields.includes("encrypted_password"), "Nunca debe incluir campos de contraseña cifrada");
  assert.ok(!profilesDef.allowedFields.includes("token"), "Nunca debe incluir tokens de sesión");
});

// 3. Control de concurrencia y exclusión mutua
test("3. Bloqueo en memoria contra operaciones simultáneas", () => {
  const actor = { id: "test-admin", email: "admin@itslp.edu.mx" };
  const firstLock = acquireOperationLock("backup", actor, "INICIALIZANDO");
  assert.ok(firstLock.ok, "El primer bloqueo debe ser exitoso");
  assert.ok(isOperationLocked(), "El sistema debe reportarse como bloqueado");

  // Segundo intento mientras el primero está activo
  const secondLock = acquireOperationLock("restore", actor, "INICIALIZANDO");
  assert.equal(secondLock.ok, false, "El segundo bloqueo simultáneo debe rechazarse");
  assert.match(secondLock.error, /operación .* en curso/i);

  // Liberación del bloqueo
  releaseOperationLock(firstLock.lockId);
  assert.equal(isOperationLocked(), false, "El sistema debe quedar desbloqueado");
});

// 4. Server Actions: Cumplimiento de App Router y Seguridad
test("4. Server Actions solo exportan funciones async y verifican rol administrador", () => {
  assert.match(backupActions, /^"use server";/);
  // Verificación de que no exporta constantes (regla Next.js 15)
  assert.doesNotMatch(backupActions, /export const [A-Z0-9_]+ =/);

  // Verificación de autenticación y rol en el servidor
  assert.match(backupActions, /async function getActiveAdministrator/);
  assert.match(backupActions, /profile\.role !== "administrador" \|\| profile\.is_active !== true/);
  assert.match(backupActions, /user\.app_metadata\?\.must_change_password === true/);

  // Verificación de que la recuperación exige confirmación estricta "RESTAURAR"
  assert.match(backupActions, /confirmationText:\s*z\.string\(\)\.trim\(\)/);
  assert.match(backupActions, /if\s*\(parsed\.data\.confirmationText !== "RESTAURAR"\)/);
});

// 5. Interfaz de Usuario y Reglas del Prompt
test("5. Interfaz con mensaje explicativo institucional y advertencia de disco físico", () => {
  // Mensaje explicativo exacto requerido por el usuario
  const normalizedWorkspace = workspace.replace(/\s+/g, " ");
  const exactPromptMessage =
    "El respaldo permite generar una copia de seguridad de la información de Banco Académico para proteger los datos ante errores, pérdidas de información o incidentes técnicos. Se recomienda realizar los respaldos en horarios de baja actividad o fuera del horario de uso del sistema.";
  assert.ok(normalizedWorkspace.includes(exactPromptMessage), "El mensaje institucional de respaldo debe coincidir exactamente");

  // Advertencia de no guardar en el mismo disco físico
  assert.match(workspace, /no conserve el único respaldo en el mismo disco físico/i);
  assert.match(workspace, /Unidad USB/);
  assert.match(workspace, /Disco duro externo/);
  assert.match(workspace, /Almacenamiento en la nube/);

  // Advertencia crítica obligatoria de recuperación
  assert.match(workspace, /ADVERTENCIA: La recuperación puede sustituir información actual/);

  // Salvaguarda previa automática
  assert.match(workspace, /Salvaguarda previa automática/i);
  assert.match(workspace, /BancoAcademico_PreRestauracion_/);

  // Confirmación textual obligatoria "RESTAURAR"
  assert.match(workspace, /confirmationText === "RESTAURAR"/);
});

// 6. Integración en el Portal y Navegación
test("6. Integración de BackupRecoveryWorkspace en Portal y nav de Administrador", () => {
  assert.match(portal, /import\s*\{\s*BackupRecoveryWorkspace\s*\}\s*from\s*["']@\/components\/backup-recovery-workspace["']/);
  assert.match(portal, /active==="respaldos"&&admin\?<BackupRecoveryWorkspace\/>/);
  assert.match(portal, /respaldos:\{title:"Respaldo y Recuperación de Información"/);
  assert.match(portal, /\{label:"Respaldos",href:"\/admin\/respaldos",icon:Database\}/);
});

// 7. Migración de Base de Datos y Almacenamiento en Nube
test("7. Migración 0012 y bucket institucional con RLS exclusivo para administradores", () => {
  assert.match(migration0012, /insert into storage\.buckets/);
  assert.match(migration0012, /institutional-backups/);
  assert.match(migration0012, /104857600/); // 100 MB
  assert.match(migration0012, /role = 'administrador' and is_active = true/);

  assert.match(completeMigration, /-- ===== 0012_backup_and_recovery_module\.sql =====/);
  assert.match(completeMigration, /institutional-backups/);
});

// 8. Integración con Bitácora y Cero Fugas de Contraseñas
test("8. Auditoría en activity_logs y cero almacenamiento de contraseñas", () => {
  assert.match(engine, /module:\s*"Respaldos"/);
  assert.match(engine, /"BACKUP_STARTED"/);
  assert.match(engine, /"BACKUP_COMPLETED"/);
  assert.match(engine, /"BACKUP_FAILED"/);
  assert.match(engine, /"RESTORE_STARTED"/);
  assert.match(engine, /"RESTORE_COMPLETED"/);
  assert.match(engine, /"RESTORE_FAILED"/);

  // Ningún archivo de respaldo o motor guarda o expone contraseñas en texto plano
  assert.doesNotMatch(engine, /insert into.*password/i);
  assert.doesNotMatch(backupActions, /insert into.*password/i);
});

console.log(`\n======================================================`);
console.log(`VERIFICACIÓN DE MÓDULO DE RESPALDO Y RECUPERACIÓN`);
console.log(`======================================================`);
tests.forEach((t) => console.log(`✓ ${t}`));
console.log(`\nTotal: ${tests.length}/${tests.length} pruebas superadas exitosamente.\n`);
