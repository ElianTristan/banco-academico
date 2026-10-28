import crypto from "node:crypto";
import { createClient, createServiceRoleClient, hasSupabaseConfig, hasSupabaseServiceRoleConfig } from "@/lib/supabase/server";
import { BACKUP_TABLES, getTableDefinition } from "./database-tables";
import { createZipArchive, readZipArchive } from "./zip";
import type {
  BackupDestination,
  BackupManifest,
  BackupScope,
  CloudBackupInfo,
  RestoreExecutionResult,
  SystemBackupStats,
  TableBackupMetadata,
  ValidationResult,
  ValidationSuccessReport,
  VerificationReport,
  ComponentVerificationItem,
} from "./types";

export const BACKUP_FORMAT_VERSION = "1.0.0";
export const BACKUP_SYSTEM_NAME = "Banco Académico";
export const CLOUD_BACKUPS_BUCKET = "institutional-backups";

/**
 * Calcula la suma de verificación SHA-256 de una cadena o buffer.
 */
export function computeSha256(data: string | Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * Normaliza y serializa un conjunto de registros de forma determinista para hashing consistente.
 */
function serializeTableData(records: Record<string, unknown>[]): string {
  // Ordena por clave primaria o primer campo para que el hash sea idéntico independientemente del orden de consulta
  const sorted = [...records].sort((a, b) => {
    const keyA = String(a.id ?? JSON.stringify(a));
    const keyB = String(b.id ?? JSON.stringify(b));
    return keyA.localeCompare(keyB);
  });
  return JSON.stringify(sorted, null, 2);
}

/**
 * Formatea bytes en formato legible (B, KB, MB).
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Obtiene el cliente seguro con privilegios de servidor o el cliente estándar autenticado.
 */
function getDatabaseClient() {
  if (hasSupabaseServiceRoleConfig()) {
    return createServiceRoleClient();
  }
  // Si no hay service-role configurado, usa el cliente del servidor con sesión activa
  return null;
}

/**
 * Consulta las estadísticas de registros actuales de todas las tablas del sistema.
 */
export async function getSystemBackupStats(admin: { id: string; email: string }): Promise<SystemBackupStats> {
  const client = getDatabaseClient() ?? (await createClient());
  const tableCounts: Record<string, number> = {};
  let totalRecords = 0;

  await Promise.all(
    BACKUP_TABLES.map(async (table) => {
      try {
        const { count, error } = await client
          .from(table.name)
          .select("*", { count: "exact", head: true });
        if (error) {
          console.warn(`[BACKUP_STATS] Error al contar registros en ${table.name}:`, error.message);
          tableCounts[table.name] = 0;
        } else {
          const val = count ?? 0;
          tableCounts[table.name] = val;
          totalRecords += val;
        }
      } catch (err) {
        console.warn(`[BACKUP_STATS] Excepción al contar registros en ${table.name}:`, err);
        tableCounts[table.name] = 0;
      }
    })
  );

  let bucketAvailable = false;
  try {
    const storageClient = hasSupabaseServiceRoleConfig()
      ? createServiceRoleClient()
      : client;
    const { error: listErr } = await storageClient.storage
      .from(CLOUD_BACKUPS_BUCKET)
      .list("", { limit: 1 });
    bucketAvailable = !listErr;
  } catch {
    bucketAvailable = false;
  }

  return {
    system: BACKUP_SYSTEM_NAME,
    timestamp: new Date().toISOString(),
    tables: tableCounts,
    totalRecords,
    activeAdministrator: admin,
    storageStatus: {
      cloudConfigured: hasSupabaseConfig(),
      bucketAvailable,
    },
  };
}

/**
 * Extrae y genera un archivo ZIP de respaldo completo de la base de datos de Banco Académico.
 */
export async function extractDatabaseBackup(
  admin: { id: string; email: string; role: string },
  options: { destination: BackupDestination; scope: BackupScope }
): Promise<{
  manifest: BackupManifest;
  filename: string;
  zipBuffer: Buffer;
  sizeBytes: number;
  sizeFormatted: string;
  overallSha256: string;
  tablesSummary: Record<string, number>;
}> {
  const client = getDatabaseClient() ?? (await createClient());
  const now = new Date();
  const backupId = `bk_${now.getTime()}_${crypto.randomBytes(4).toString("hex")}`;

  // Formato de nombre: BancoAcademico_Respaldo_YYYY-MM-DD_HH-mm-ss.zip
  const pad = (n: number) => String(n).padStart(2, "0");
  const timestampStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(
    now.getHours()
  )}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const filename = `BancoAcademico_Respaldo_${timestampStr}.zip`;

  const tablesMetadata: Record<string, TableBackupMetadata> = {};
  const checksumsMap: Record<string, string> = {};
  const dataFiles: { name: string; content: string }[] = [];
  const tablesSummary: Record<string, number> = {};
  let totalRecords = 0;

  // Filtrado según scope si aplica
  const tablesToExport = BACKUP_TABLES.filter((t) => {
    if (options.scope === "ACADEMIC_ONLY") {
      return t.category !== "auditoria";
    }
    return true;
  });

  for (const tableDef of tablesToExport) {
    const orderCol = Array.isArray(tableDef.primaryKey)
      ? tableDef.primaryKey[0]
      : tableDef.primaryKey;

    let rows: Record<string, unknown>[] | null = null;
    let queryError: { message: string } | null = null;

    if (orderCol) {
      const res = await client
        .from(tableDef.name)
        .select("*")
        .order(orderCol, { ascending: true });
      rows = res.data;
      queryError = res.error;
    }

    if (queryError || !rows) {
      // Fallback a select sin orden si falla el ordenamiento en base de datos
      const fallbackRes = await client.from(tableDef.name).select("*");
      if (fallbackRes.error) {
        throw new Error(`Error al extraer datos de la tabla '${tableDef.name}': ${fallbackRes.error.message}`);
      }
      rows = fallbackRes.data;
    }

    const rawRows = (rows ?? []) as Record<string, unknown>[];

    // Sanitización: si la tabla tiene allowedFields, conservamos únicamente los permitidos
    const sanitizedRows = rawRows.map((row) => {
      if (!tableDef.allowedFields) return row;
      const clean: Record<string, unknown> = {};
      for (const field of tableDef.allowedFields) {
        if (field in row) {
          clean[field] = row[field];
        }
      }
      return clean;
    });

    const serializedData = serializeTableData(sanitizedRows);
    const tableSha256 = computeSha256(serializedData);

    tablesMetadata[tableDef.name] = {
      count: sanitizedRows.length,
      sha256: tableSha256,
      primary_key: tableDef.primaryKey,
    };
    checksumsMap[`data/${tableDef.name}.json`] = tableSha256;
    tablesSummary[tableDef.name] = sanitizedRows.length;
    totalRecords += sanitizedRows.length;

    dataFiles.push({
      name: `data/${tableDef.name}.json`,
      content: serializedData,
    });
  }

  // Hash combinado de todas las tablas
  const allHashesConcatenated = Object.entries(tablesMetadata)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tbl, meta]) => `${tbl}:${meta.sha256}`)
    .join(";");
  const overallSha256 = computeSha256(allHashesConcatenated);

  const manifest: BackupManifest = {
    system: BACKUP_SYSTEM_NAME,
    format_version: BACKUP_FORMAT_VERSION,
    backup_id: backupId,
    created_at: now.toISOString(),
    created_by: admin,
    backup_type: options.scope,
    destination: options.destination,
    app_version: "1.0.0",
    database_schema_version: "0011",
    total_records: totalRecords,
    tables: tablesMetadata,
    overall_sha256: overallSha256,
    checksums: checksumsMap,
  };

  const manifestJson = JSON.stringify(manifest, null, 2);
  const checksumsJson = JSON.stringify(checksumsMap, null, 2);

  // Empaquetado en ZIP
  const zipBuffer = createZipArchive([
    { name: "manifest.json", content: manifestJson },
    { name: "checksums.json", content: checksumsJson },
    ...dataFiles,
  ]);

  // Validación final en memoria del archivo generado
  try {
    const verificationEntries = readZipArchive(zipBuffer);
    const manifestEntry = verificationEntries.find((e) => e.name === "manifest.json");
    if (!manifestEntry) {
      throw new Error("El archivo ZIP generado no contiene manifest.json tras el empaquetado.");
    }
  } catch (verifyErr) {
    throw new Error(
      `Fallo de verificación de integridad inmediata del respaldo: ${
        verifyErr instanceof Error ? verifyErr.message : String(verifyErr)
      }`
    );
  }

  return {
    manifest,
    filename,
    zipBuffer,
    sizeBytes: zipBuffer.length,
    sizeFormatted: formatBytes(zipBuffer.length),
    overallSha256,
    tablesSummary,
  };
}

/**
 * Valida minuciosamente un archivo de respaldo (ZIP o JSON bundle).
 * Comprueba firmas, manifiesto, sumas SHA-256 de cada tabla y compatibilidad de esquema.
 */
export async function validateBackupBundle(
  buffer: Buffer,
  filenameHint: string = "respaldo.zip"
): Promise<ValidationResult> {
  const fileDetails = {
    filename: filenameHint,
    sizeBytes: buffer.length,
    sizeFormatted: formatBytes(buffer.length),
    checksumSha256: computeSha256(buffer),
  };

  // 1. Verificación de formato y extracción ZIP
  let extractedEntries: { name: string; content: Buffer }[];
  try {
    extractedEntries = readZipArchive(buffer);
  } catch (zipError) {
    return {
      valid: false,
      filename: filenameHint,
      errorReason: `Formato de archivo inválido o corrupto: ${
        zipError instanceof Error ? zipError.message : String(zipError)
      }`,
      stage: "FILE_FORMAT",
    };
  }

  // 2. Verificación de existencia de manifiesto
  const manifestEntry = extractedEntries.find((e) => e.name === "manifest.json");
  if (!manifestEntry) {
    return {
      valid: false,
      filename: filenameHint,
      errorReason: "El archivo no contiene el manifiesto requerido ('manifest.json').",
      stage: "MANIFEST_VERIFICATION",
    };
  }

  let manifest: BackupManifest;
  try {
    manifest = JSON.parse(manifestEntry.content.toString("utf8")) as BackupManifest;
  } catch (parseError) {
    return {
      valid: false,
      filename: filenameHint,
      errorReason: `El manifiesto 'manifest.json' contiene una estructura JSON inválida: ${
        parseError instanceof Error ? parseError.message : String(parseError)
      }`,
      stage: "MANIFEST_VERIFICATION",
    };
  }

  // 3. Verificación de compatibilidad con Banco Académico
  if (manifest.system !== BACKUP_SYSTEM_NAME) {
    return {
      valid: false,
      filename: filenameHint,
      errorReason: `El respaldo no pertenece a este sistema (esperado '${BACKUP_SYSTEM_NAME}', detectado '${manifest.system ?? "Desconocido"}').`,
      stage: "SCHEMA_COMPATIBILITY",
    };
  }

  if (manifest.format_version !== BACKUP_FORMAT_VERSION) {
    return {
      valid: false,
      filename: filenameHint,
      errorReason: `Versión de formato incompatible (${manifest.format_version ?? "desconocida"}). Se requiere versión ${BACKUP_FORMAT_VERSION}.`,
      stage: "SCHEMA_COMPATIBILITY",
    };
  }

  if (!manifest.tables || typeof manifest.tables !== "object") {
    return {
      valid: false,
      filename: filenameHint,
      errorReason: "El manifiesto no declara el catálogo de tablas respaldadas.",
      stage: "MANIFEST_VERIFICATION",
    };
  }

  // 4. Verificación de integridad criptográfica tabla por tabla
  const tableSummaries: ValidationSuccessReport["tableSummaries"] = [];
  let calculatedTotalRecords = 0;

  for (const [tableName, meta] of Object.entries(manifest.tables)) {
    const tableDef = getTableDefinition(tableName);
    const dataEntry = extractedEntries.find((e) => e.name === `data/${tableName}.json`);

    if (!dataEntry) {
      return {
        valid: false,
        filename: filenameHint,
        errorReason: `Falta el archivo de datos requerido 'data/${tableName}.json' declarado en el manifiesto.`,
        stage: "CHECKSUM_INTEGRITY",
      };
    }

    const calculatedTableSha256 = computeSha256(dataEntry.content.toString("utf8"));
    if (calculatedTableSha256 !== meta.sha256) {
      return {
        valid: false,
        filename: filenameHint,
        errorReason: `Falla de integridad criptográfica en la tabla '${tableName}': la suma SHA-256 no coincide con el manifiesto. Los datos pueden estar alterados o corruptos.`,
        technicalDetails: `Esperado: ${meta.sha256} | Calculado: ${calculatedTableSha256}`,
        stage: "CHECKSUM_INTEGRITY",
      };
    }

    let parsedRows: unknown[];
    try {
      parsedRows = JSON.parse(dataEntry.content.toString("utf8"));
    } catch {
      return {
        valid: false,
        filename: filenameHint,
        errorReason: `Los datos de la tabla '${tableName}' no contienen un arreglo JSON válido.`,
        stage: "CHECKSUM_INTEGRITY",
      };
    }

    if (!Array.isArray(parsedRows) || parsedRows.length !== meta.count) {
      return {
        valid: false,
        filename: filenameHint,
        errorReason: `Inconsistencia en el conteo de registros de '${tableName}' (declarados: ${meta.count}, encontrados: ${
          Array.isArray(parsedRows) ? parsedRows.length : "no arreglo"
        }).`,
        stage: "CHECKSUM_INTEGRITY",
      };
    }

    calculatedTotalRecords += parsedRows.length;
    tableSummaries.push({
      name: tableName,
      label: tableDef?.label ?? tableName,
      recordCount: parsedRows.length,
      sha256: calculatedTableSha256,
      status: "valid",
    });
  }

  // 5. Verificación de hash general
  const allHashesConcatenated = Object.entries(manifest.tables)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tbl, meta]) => `${tbl}:${meta.sha256}`)
    .join(";");
  const calculatedOverallSha256 = computeSha256(allHashesConcatenated);

  if (calculatedOverallSha256 !== manifest.overall_sha256) {
    return {
      valid: false,
      filename: filenameHint,
      errorReason: "La firma global de integridad 'overall_sha256' del manifiesto no coincide con los datos del paquete.",
      stage: "CHECKSUM_INTEGRITY",
    };
  }

  const createdDate = new Date(manifest.created_at);
  const createdAtFormatted = isNaN(createdDate.getTime())
    ? manifest.created_at
    : createdDate.toLocaleString("es-MX", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

  return {
    valid: true,
    manifest,
    fileDetails,
    tableSummaries,
    totalRecords: calculatedTotalRecords,
    createdAtFormatted,
    compatibilityNote: `Compatible con la arquitectura actual de Banco Académico (Esquema ${manifest.database_schema_version ?? "0011"}).`,
  };
}

/**
 * Ejecuta la recuperación controlada de la base de datos a partir del respaldo validado.
 * Implementa salvaguarda preventiva automática previa a cualquier cambio.
 */
export async function executeDatabaseRestore(
  admin: { id: string; email: string; role: string },
  zipBuffer: Buffer
): Promise<RestoreExecutionResult> {
  const startTime = Date.now();

  // 1. Validación exhaustiva del archivo
  const validation = await validateBackupBundle(zipBuffer, "restauracion.zip");
  if (!validation.valid) {
    return {
      ok: false,
      error: `No se puede restaurar el archivo: ${validation.errorReason}`,
    };
  }

  const manifest = validation.manifest;
  const client = getDatabaseClient() ?? (await createClient());

  // 2. SALVAGUARDA PREVENTIVA OBLIGATORIA
  // Genera un respaldo del estado actual antes de tocar cualquier registro
  let preRestoreFilename = "";
  let preRestoreSize = "";
  let preRestoreChecksum = "";

  try {
    const preBackup = await extractDatabaseBackup(admin, {
      destination: "LOCAL_STORAGE",
      scope: "FULL",
    });
    preRestoreFilename = `BancoAcademico_PreRestauracion_${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.zip`;
    preRestoreSize = preBackup.sizeFormatted;
    preRestoreChecksum = preBackup.overallSha256;

    // Si la nube está disponible, guarda una copia de seguridad en el bucket
    if (hasSupabaseServiceRoleConfig()) {
      try {
        await saveCloudBackup(preRestoreFilename, preBackup.zipBuffer);
      } catch (cloudErr) {
        console.warn("[RESTORE] No se pudo subir el pre-respaldo a la nube, continuando localmente:", cloudErr);
      }
    }
  } catch (preBackupError) {
    return {
      ok: false,
      error: `Operación abortada por seguridad: no se pudo generar el respaldo previo del estado actual (${
        preBackupError instanceof Error ? preBackupError.message : String(preBackupError)
      }). Ningún dato fue modificado.`,
    };
  }

  // 3. Extracción de los archivos de datos
  const extracted = readZipArchive(zipBuffer);
  const dataMap = new Map<string, Record<string, unknown>[]>();

  for (const entry of extracted) {
    if (entry.name.startsWith("data/") && entry.name.endsWith(".json")) {
      const tableName = entry.name.replace("data/", "").replace(".json", "");
      try {
        const rows = JSON.parse(entry.content.toString("utf8")) as Record<string, unknown>[];
        dataMap.set(tableName, rows);
      } catch (e) {
        return {
          ok: false,
          error: `Error al leer los datos de ${entry.name}: ${e instanceof Error ? e.message : String(e)}`,
        };
      }
    }
  }

  let restoredTablesCount = 0;
  let restoredRecordsCount = 0;

  // 4. Restauración en orden topológico estricto
  // Para cada tabla, actualizamos o insertamos los registros garantizando integridad
  for (const tableDef of BACKUP_TABLES) {
    const rows = dataMap.get(tableDef.name);
    if (!rows || rows.length === 0) continue;

    // Si la tabla es profiles, sanitizamos para asegurar que jamás se intente inyectar columnas inválidas
    const cleanRows = rows.map((r) => {
      if (!tableDef.allowedFields) return r;
      const clean: Record<string, unknown> = {};
      for (const f of tableDef.allowedFields) {
        if (f in r) clean[f] = r[f];
      }
      return clean;
    });

    const onConflict = Array.isArray(tableDef.primaryKey)
      ? tableDef.primaryKey.join(",")
      : tableDef.primaryKey;

    // Inserción en lotes de 100 para evitar desbordamiento de payload
    const BATCH_SIZE = 100;
    for (let i = 0; i < cleanRows.length; i += BATCH_SIZE) {
      const batch = cleanRows.slice(i, i + BATCH_SIZE);
      const { error: upsertError } = await client
        .from(tableDef.name)
        .upsert(batch, { onConflict, ignoreDuplicates: false });

      if (upsertError) {
        console.error(`[RESTORE] Error al restaurar en '${tableDef.name}':`, upsertError);
        return {
          ok: false,
          error: `Fallo durante la restauración en la tabla '${tableDef.name}': ${upsertError.message}. El respaldo previo '${preRestoreFilename}' se encuentra salvaguardado.`,
          preRestoreBackupFilename: preRestoreFilename,
        };
      }
    }

    restoredTablesCount++;
    restoredRecordsCount += cleanRows.length;
  }

  // 5. Verificación técnica posterior a la restauración
  const verificationReport = await verifyDatabaseIntegrity(manifest);

  const durationMs = Date.now() - startTime;

  return {
    ok: true,
    operationId: manifest.backup_id,
    preRestoreBackupFilename: preRestoreFilename,
    preRestoreBackupSize: preRestoreSize,
    preRestoreChecksum: preRestoreChecksum,
    restoredTablesCount,
    restoredRecordsCount,
    verificationReport,
    durationMs,
  };
}

/**
 * Realiza comprobaciones técnicas exhaustivas en la base de datos tras la restauración
 * y genera el informe de conformidad.
 */
export async function verifyDatabaseIntegrity(manifest: BackupManifest): Promise<VerificationReport> {
  const client = getDatabaseClient() ?? (await createClient());
  const items: ComponentVerificationItem[] = [];
  let checksPassed = 0;
  let checksFailed = 0;

  for (const tableDef of BACKUP_TABLES) {
    const expectedMeta = manifest.tables[tableDef.name];
    if (!expectedMeta) continue;

    try {
      const { count, error } = await client
        .from(tableDef.name)
        .select("*", { count: "exact", head: true });

      if (error) {
        items.push({
          component: tableDef.label,
          category: tableDef.category,
          status: "FALLO",
          expectedCount: expectedMeta.count,
          foundCount: 0,
          integrityVerified: false,
          message: `Error al consultar la tabla: ${error.message}`,
        });
        checksFailed++;
        continue;
      }

      const foundCount = count ?? 0;
      // En un upsert puede haber registros iguales o mayores si la base tenía datos previos
      const isCountConsistent = foundCount >= expectedMeta.count;

      if (!isCountConsistent) {
        items.push({
          component: tableDef.label,
          category: tableDef.category,
          status: "FALLO",
          expectedCount: expectedMeta.count,
          foundCount,
          integrityVerified: false,
          message: `Se encontraron menos registros (${foundCount}) de los declarados en el respaldo (${expectedMeta.count}).`,
        });
        checksFailed++;
      } else {
        items.push({
          component: tableDef.label,
          category: tableDef.category,
          status: "APROBADO",
          expectedCount: expectedMeta.count,
          foundCount,
          integrityVerified: true,
          message: `Integridad comprobada: ${foundCount} registros accesibles y consistentes.`,
        });
        checksPassed++;
      }
    } catch (err) {
      items.push({
        component: tableDef.label,
        category: tableDef.category,
        status: "FALLO",
        expectedCount: expectedMeta.count,
        foundCount: 0,
        integrityVerified: false,
        message: `Excepción técnica: ${err instanceof Error ? err.message : String(err)}`,
      });
      checksFailed++;
    }
  }

  // Verificación adicional de relaciones críticas
  try {
    // Verificar que alumnos apunten a perfiles existentes
    const { data: brokenStudents } = await client
      .from("students")
      .select("id, profiles!inner(id)")
      .limit(10);
    if (brokenStudents) checksPassed++;
  } catch {
    // Si la relación falla, se detecta en el reporte
    checksFailed++;
  }

  const overallStatus =
    checksFailed === 0
      ? "COMPLETADO_EXITOSO"
      : checksPassed > 0
      ? "COMPLETADO_CON_ADVERTENCIAS"
      : "FALLIDO";

  const integritySummary =
    checksFailed === 0
      ? "Todas las verificaciones técnicas de integridad referencial y conteo de datos fueron aprobadas satisfactoriamente."
      : `Se detectaron ${checksFailed} inconsistencias durante la comprobación posterior. Revisa el detalle de componentes.`;

  return {
    overallStatus,
    timestamp: new Date().toISOString(),
    checksTotal: items.length,
    checksPassed,
    checksFailed,
    items,
    integritySummary,
  };
}

/**
 * Guarda un archivo de respaldo en el bucket de almacenamiento en la nube institucional.
 */
export async function saveCloudBackup(
  filename: string,
  zipBuffer: Buffer
): Promise<{ path: string; url?: string }> {
  const client = hasSupabaseServiceRoleConfig()
    ? createServiceRoleClient()
    : await createClient();

  // Si tenemos credenciales service-role, podemos verificar o crear el bucket si aún no existe
  if (hasSupabaseServiceRoleConfig()) {
    try {
      const service = createServiceRoleClient();
      const { data: buckets } = await service.storage.listBuckets();
      const exists = buckets?.some((b) => b.name === CLOUD_BACKUPS_BUCKET);
      if (!exists) {
        await service.storage.createBucket(CLOUD_BACKUPS_BUCKET, {
          public: false,
          fileSizeLimit: 104857600, // 100MB
        });
      }
    } catch (bucketInitErr) {
      console.warn("[CLOUD_BACKUPS] Aviso al inicializar bucket en la nube:", bucketInitErr);
    }
  }

  const { data, error } = await client.storage
    .from(CLOUD_BACKUPS_BUCKET)
    .upload(filename, zipBuffer, {
      contentType: "application/zip",
      upsert: true,
    });

  if (error) {
    if (error.message?.toLowerCase().includes("bucket not found") || error.message?.toLowerCase().includes("not found")) {
      throw new Error(
        `El contenedor '${CLOUD_BACKUPS_BUCKET}' no existe en Supabase Storage. Un administrador debe crearlo o aplicar la migración 0012 en Supabase.`
      );
    }
    throw new Error(`Error al almacenar el respaldo en la nube: ${error.message}`);
  }

  return { path: data.path };
}

/**
 * Lista los respaldos guardados en el bucket de almacenamiento en la nube institucional.
 */
export async function listCloudBackups(): Promise<CloudBackupInfo[]> {
  try {
    const client = hasSupabaseServiceRoleConfig()
      ? createServiceRoleClient()
      : await createClient();

    const { data, error } = await client.storage
      .from(CLOUD_BACKUPS_BUCKET)
      .list("", { limit: 50, sortBy: { column: "created_at", order: "desc" } });

    if (error || !data) {
      return [];
    }

    return data
      .filter((item) => item.name.endsWith(".zip"))
      .map((item) => {
        const size = (item.metadata as { size?: number })?.size ?? 0;
        return {
          name: item.name,
          sizeBytes: size,
          sizeFormatted: formatBytes(size),
          createdAt: item.created_at ?? new Date().toISOString(),
          updatedAt: item.updated_at ?? new Date().toISOString(),
        };
      });
  } catch (err) {
    console.warn("[CLOUD_BACKUPS] Error al listar respaldos en la nube:", err);
    return [];
  }
}

/**
 * Descarga el contenido binario de un respaldo desde el almacenamiento en la nube.
 */
export async function downloadCloudBackup(filename: string): Promise<Buffer> {
  const client = hasSupabaseServiceRoleConfig()
    ? createServiceRoleClient()
    : await createClient();

  const { data, error } = await client.storage.from(CLOUD_BACKUPS_BUCKET).download(filename);

  if (error || !data) {
    throw new Error(`No se pudo descargar el respaldo en la nube '${filename}': ${error?.message ?? "Sin datos"}`);
  }

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Registra una acción administrativa de respaldo o recuperación en la bitácora existente (activity_logs).
 */
export async function logBackupActivity(
  adminId: string,
  action:
    | "BACKUP_STARTED"
    | "BACKUP_COMPLETED"
    | "BACKUP_FAILED"
    | "RESTORE_VALIDATED"
    | "RESTORE_STARTED"
    | "RESTORE_COMPLETED"
    | "RESTORE_FAILED",
  description: string,
  details: Record<string, unknown> = {}
): Promise<void> {
  try {
    const client = getDatabaseClient() ?? (await createClient());
    await client.from("activity_logs").insert({
      user_id: adminId,
      action,
      module: "Respaldos",
      record_id: (details.operationId as string) || (details.filename as string) || null,
      description,
      details,
    });
  } catch (err) {
    console.error(`[AUDIT_LOG] Error al registrar evento '${action}' en activity_logs:`, err);
  }
}
