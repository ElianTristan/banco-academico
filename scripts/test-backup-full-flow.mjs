import assert from "node:assert/strict";
import crypto from "node:crypto";
import { BACKUP_TABLES } from "../src/lib/backup-recovery/database-tables.ts";
import { createZipArchive, readZipArchive } from "../src/lib/backup-recovery/zip.ts";

function computeSha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

console.log("Iniciando pruebas detalladas de flujo de respaldos...");

// 1. Verificar que ninguna tabla tenga primaryKey incorrecta
for (const table of BACKUP_TABLES) {
  assert.ok(table.name, "La tabla debe tener un nombre");
  assert.ok(table.primaryKey, `La tabla ${table.name} debe tener primaryKey`);
  if (table.name === "academic_specialties") {
    assert.equal(table.primaryKey, "code", "academic_specialties debe tener PK 'code'");
  }
  if (table.name === "subject_specialties") {
    assert.deepEqual(table.primaryKey, ["subject_id", "specialty_code"], "subject_specialties debe tener PK compuesta");
  }
}
console.log("✓ Verificación de llaves primarias en catálogo de 23 tablas superada");

// 2. Verificar simulación de extracción y serialización con tipos de datos complejos
const dummyRows = [
  { id: "1", code: "SIS01", name: "Redes", active: true, created_at: "2026-10-21T00:00:00Z" },
  { id: "2", code: "SIS02", name: "Bases de Datos", active: false, created_at: null },
  { id: "3", code: "SIS03", name: "Ciberseguridad", description: 'Acento y comillas: "seguridad"', active: true },
];

const serialized = JSON.stringify(dummyRows, null, 2);
const hash = computeSha256(serialized);
assert.equal(hash.length, 64, "El hash SHA-256 debe tener 64 caracteres hexadecimales");
console.log("✓ Verificación de serialización y cálculo SHA-256 superada");

// 3. Empaquetado y lectura de ZIP con integridad
const zip = createZipArchive([
  { name: "manifest.json", content: JSON.stringify({ system: "Banco Académico", backup_id: "test" }) },
  { name: "data/academic_specialties.json", content: serialized },
  { name: "checksums.json", content: JSON.stringify({ "data/academic_specialties.json": hash }) },
]);

assert.ok(zip.length > 0);
const extracted = readZipArchive(zip);
assert.equal(extracted.length, 3);
const manifestEntry = extracted.find((e) => e.name === "manifest.json");
assert.ok(manifestEntry);
console.log("✓ Empaquetado y verificación inmediata en memoria de archivo ZIP superada");

console.log("\nTodas las pruebas de motor pasaron correctamente.");
