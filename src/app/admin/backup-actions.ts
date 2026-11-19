"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  acquireOperationLock,
  releaseOperationLock,
  getCurrentOperation,
  isOperationLocked,
} from "@/lib/backup-recovery/concurrency";
import {
  extractDatabaseBackup,
  validateBackupBundle,
  executeDatabaseRestore,
  getSystemBackupStats,
  listCloudBackups,
  saveCloudBackup,
  downloadCloudBackup,
  logBackupActivity,
} from "@/lib/backup-recovery/engine";
import type {
  BackupDestination,
  BackupOverviewData,
  BackupScope,
  CloudBackupInfo,
  RestoreExecutionResult,
  ValidationResult,
} from "@/lib/backup-recovery/types";

interface AdminAuthSuccess {
  actorId: string;
  email: string;
  role: string;
}

interface AdminAuthError {
  ok: false;
  error: string;
}

/**
 * Valida que la petición provenga de un administrador activo y autenticado en el servidor.
 */
async function getActiveAdministrator(): Promise<AdminAuthSuccess | AdminAuthError> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, error: "Inicia sesión con una cuenta administradora activa." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role,is_active,email")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return { ok: false, error: "No se pudieron verificar tus permisos de administración." };
  }

  if (profile.role !== "administrador" || profile.is_active !== true) {
    return { ok: false, error: "Esta acción requiere una cuenta administradora activa." };
  }

  if (user.app_metadata?.must_change_password === true || user.user_metadata?.must_change_password === true) {
    return { ok: false, error: "Debes cambiar tu contraseña temporal antes de acceder a herramientas de respaldo." };
  }

  return {
    actorId: user.id,
    email: profile.email || user.email || "admin@institucion.edu",
    role: profile.role,
  };
}

/**
 * Obtiene el resumen del estado del sistema, estadísticas de tablas, respaldos en la nube y bitácora reciente.
 */
export async function getBackupOverviewAction(): Promise<
  { ok: true; data: BackupOverviewData } | { ok: false; error: string }
> {
  const admin = await getActiveAdministrator();
  if ("ok" in admin) return admin;

  try {
    const stats = await getSystemBackupStats({ id: admin.actorId, email: admin.email });
    const cloudBackups = await listCloudBackups();

    // Consulta los últimos 15 eventos de respaldo en la bitácora existente
    const supabase = await createClient();
    const { data: logRows } = await supabase
      .from("activity_logs")
      .select("id,action,description,occurred_at,details,profiles(email)")
      .eq("module", "Respaldos")
      .order("occurred_at", { ascending: false })
      .limit(15);

    const recentLogs = (logRows ?? []).map((row) => ({
      id: row.id,
      action: row.action,
      description: row.description,
      occurred_at: row.occurred_at,
      details: (row.details as Record<string, unknown>) ?? {},
      admin_email: (row.profiles as { email?: string })?.email,
    }));

    const activeOp = getCurrentOperation();

    return {
      ok: true,
      data: {
        stats,
        cloudBackups,
        recentLogs,
        isLocked: isOperationLocked(),
        activeLockDetails: activeOp
          ? {
              operation: activeOp.type === "backup" ? "Respaldo" : "Recuperación",
              startedAt: activeOp.startedAt,
            }
          : undefined,
      },
    };
  } catch (err) {
    console.error("[BACKUP_ACTION] Error al obtener información general:", err);
    return { ok: false, error: "No se pudo consultar el estado actual del sistema de respaldos." };
  }
}

const backupRequestSchema = z.object({
  destination: z.enum(["USB", "EXTERNAL_HDD", "CLOUD", "LOCAL_STORAGE"]),
  scope: z.enum(["FULL", "ACADEMIC_ONLY", "WITH_AUDIT_LOGS"]),
});

/**
 * Server Action: Genera un respaldo real en el backend, calcula sumas SHA-256,
 * empaqueta en ZIP con manifiesto e integra con la bitácora.
 */
export async function createBackupAction(params: {
  destination: BackupDestination;
  scope: BackupScope;
}): Promise<
  | {
      ok: true;
      filename: string;
      sizeBytes: number;
      sizeFormatted: string;
      checksum: string;
      base64Zip?: string;
      cloudSaved?: boolean;
      cloudPath?: string;
      stats: Record<string, number>;
    }
  | { ok: false; error: string }
> {
  const parsed = backupRequestSchema.safeParse(params);
  if (!parsed.success) {
    return { ok: false, error: "Parámetros de destino o alcance de respaldo inválidos." };
  }

  const admin = await getActiveAdministrator();
  if ("ok" in admin) return admin;

  const lock = acquireOperationLock("backup", { id: admin.actorId, email: admin.email }, "EXTRAYENDO_DATOS");
  if (!lock.ok) return lock;

  await logBackupActivity(admin.actorId, "BACKUP_STARTED", "Inicio de generación de copia de seguridad", {
    destination: parsed.data.destination,
    scope: parsed.data.scope,
    operationId: lock.lockId,
  });

  try {
    const backupResult = await extractDatabaseBackup(
      { id: admin.actorId, email: admin.email, role: admin.role },
      { destination: parsed.data.destination, scope: parsed.data.scope }
    );

    let cloudSaved = false;
    let cloudPath: string | undefined;

    if (parsed.data.destination === "CLOUD") {
      const saved = await saveCloudBackup(backupResult.filename, backupResult.zipBuffer);
      cloudSaved = true;
      cloudPath = saved.path;
    }

    await logBackupActivity(
      admin.actorId,
      "BACKUP_COMPLETED",
      `Respaldo generado exitosamente (${backupResult.sizeFormatted})`,
      {
        filename: backupResult.filename,
        destination: parsed.data.destination,
        sizeBytes: backupResult.sizeBytes,
        overallSha256: backupResult.overallSha256,
        tablesCount: Object.keys(backupResult.tablesSummary).length,
        totalRecords: backupResult.manifest.total_records,
        cloudPath,
        operationId: lock.lockId,
      }
    );

    releaseOperationLock(lock.lockId);
    revalidatePath("/admin/respaldos");
    revalidatePath("/admin/bitacora");

    return {
      ok: true,
      filename: backupResult.filename,
      sizeBytes: backupResult.sizeBytes,
      sizeFormatted: backupResult.sizeFormatted,
      checksum: backupResult.overallSha256,
      base64Zip: backupResult.zipBuffer.toString("base64"),
      cloudSaved,
      cloudPath,
      stats: backupResult.tablesSummary,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[BACKUP_ACTION] Fallo durante la generación del respaldo:", err);

    await logBackupActivity(admin.actorId, "BACKUP_FAILED", `Fallo en generación de respaldo: ${errorMessage}`, {
      destination: parsed.data.destination,
      error: errorMessage,
      operationId: lock.lockId,
    });

    releaseOperationLock(lock.lockId);
    return { ok: false, error: `No se pudo completar el respaldo: ${errorMessage}` };
  }
}

/**
 * Server Action: Valida un archivo de respaldo subido por el administrador.
 */
export async function validateBackupFileAction(
  formData: FormData
): Promise<{ ok: true; report: ValidationResult } | { ok: false; error: string }> {
  const admin = await getActiveAdministrator();
  if ("ok" in admin) return admin;

  const file = formData.get("backupFile");
  if (!file || typeof file === "string" || !(file instanceof File)) {
    return { ok: false, error: "Selecciona un archivo de respaldo válido (.zip)." };
  }

  if (file.size === 0) {
    return { ok: false, error: "El archivo seleccionado está vacío (0 bytes)." };
  }

  if (file.size > 104857600) {
    return { ok: false, error: "El archivo supera el límite máximo permitido de 100 MB." };
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const report = await validateBackupBundle(buffer, file.name);

    if (report.valid) {
      await logBackupActivity(admin.actorId, "RESTORE_VALIDATED", `Archivo de respaldo validado: ${file.name}`, {
        filename: file.name,
        sizeBytes: file.size,
        backupDate: report.manifest.created_at,
        totalRecords: report.totalRecords,
        overallSha256: report.manifest.overall_sha256,
      });
    } else {
      await logBackupActivity(admin.actorId, "RESTORE_VALIDATED", `Validación de archivo rechazada: ${report.errorReason}`, {
        filename: file.name,
        rejectedStage: report.stage,
        error: report.errorReason,
      });
    }

    return { ok: true, report };
  } catch (err) {
    console.error("[VALIDATE_ACTION] Error al procesar archivo de validación:", err);
    return { ok: false, error: "Ocurrió un error al procesar el archivo. Asegúrate de que sea un ZIP válido." };
  }
}

/**
 * Server Action: Valida un respaldo ya almacenado en el bucket de la nube.
 */
export async function validateCloudBackupAction(
  filename: string
): Promise<{ ok: true; report: ValidationResult } | { ok: false; error: string }> {
  const admin = await getActiveAdministrator();
  if ("ok" in admin) return admin;

  if (!filename || !filename.endsWith(".zip")) {
    return { ok: false, error: "Nombre de archivo de respaldo en la nube no válido." };
  }

  try {
    const buffer = await downloadCloudBackup(filename);
    const report = await validateBackupBundle(buffer, filename);

    if (report.valid) {
      await logBackupActivity(admin.actorId, "RESTORE_VALIDATED", `Respaldo en nube validado: ${filename}`, {
        filename,
        sizeBytes: buffer.length,
        backupDate: report.manifest.created_at,
        totalRecords: report.totalRecords,
      });
    }

    return { ok: true, report };
  } catch (err) {
    console.error("[VALIDATE_CLOUD_ACTION] Error al validar respaldo en nube:", err);
    return { ok: false, error: "No se pudo descargar y validar el archivo seleccionado de la nube." };
  }
}

const restoreExecutionSchema = z.object({
  base64Zip: z.string().optional(),
  cloudFilename: z.string().optional(),
  confirmationText: z.string().trim(),
});

/**
 * Server Action: Ejecuta la recuperación con salvaguarda preventiva automática previa
 * y verificación de integridad posterior.
 */
export async function executeRestoreAction(
  params: {
    base64Zip?: string;
    cloudFilename?: string;
    confirmationText: string;
  }
): Promise<RestoreExecutionResult> {
  const parsed = restoreExecutionSchema.safeParse(params);
  if (!parsed.success) {
    return { ok: false, error: "Datos de solicitud de recuperación inválidos." };
  }

  if (parsed.data.confirmationText !== "RESTAURAR") {
    return {
      ok: false,
      error: "Para confirmar la recuperación debes escribir exactamente la palabra 'RESTAURAR' en mayúsculas.",
    };
  }

  const admin = await getActiveAdministrator();
  if ("ok" in admin) return admin;

  let zipBuffer: Buffer;
  let sourceIdentifier = "";

  try {
    if (parsed.data.cloudFilename) {
      sourceIdentifier = `Nube: ${parsed.data.cloudFilename}`;
      zipBuffer = await downloadCloudBackup(parsed.data.cloudFilename);
    } else if (parsed.data.base64Zip) {
      sourceIdentifier = "Archivo local extraíble";
      zipBuffer = Buffer.from(parsed.data.base64Zip, "base64");
    } else {
      return { ok: false, error: "Debes proporcionar un archivo de respaldo local o seleccionar uno de la nube." };
    }
  } catch (err) {
    return { ok: false, error: `Error al obtener el contenido del archivo de respaldo: ${err instanceof Error ? err.message : String(err)}` };
  }

  const lock = acquireOperationLock("restore", { id: admin.actorId, email: admin.email }, "SALVAGUARDANDO_ESTADO_PREVIO");
  if (!lock.ok) return lock;

  await logBackupActivity(admin.actorId, "RESTORE_STARTED", `Inicio de recuperación desde ${sourceIdentifier}`, {
    source: sourceIdentifier,
    operationId: lock.lockId,
  });

  try {
    const result = await executeDatabaseRestore(
      { id: admin.actorId, email: admin.email, role: admin.role },
      zipBuffer
    );

    if (result.ok) {
      await logBackupActivity(
        admin.actorId,
        "RESTORE_COMPLETED",
        `Recuperación finalizada exitosamente (${result.restoredRecordsCount} registros en ${result.restoredTablesCount} tablas)`,
        {
          operationId: lock.lockId,
          source: sourceIdentifier,
          preRestoreBackup: result.preRestoreBackupFilename,
          restoredTablesCount: result.restoredTablesCount,
          restoredRecordsCount: result.restoredRecordsCount,
          verificationOverall: result.verificationReport?.overallStatus,
          durationMs: result.durationMs,
        }
      );
    } else {
      await logBackupActivity(
        admin.actorId,
        "RESTORE_FAILED",
        `Fallo durante la recuperación: ${result.error}`,
        {
          operationId: lock.lockId,
          source: sourceIdentifier,
          preRestoreBackup: result.preRestoreBackupFilename,
          error: result.error,
        }
      );
    }

    releaseOperationLock(lock.lockId);
    revalidatePath("/admin/respaldos");
    revalidatePath("/admin/bitacora");
    revalidatePath("/admin");

    return result;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[RESTORE_ACTION] Excepción crítica durante la restauración:", err);

    await logBackupActivity(
      admin.actorId,
      "RESTORE_FAILED",
      `Excepción durante la recuperación: ${errorMessage}`,
      {
        operationId: lock.lockId,
        source: sourceIdentifier,
        error: errorMessage,
      }
    );

    releaseOperationLock(lock.lockId);
    return { ok: false, error: `Error crítico durante la recuperación: ${errorMessage}` };
  }
}

/**
 * Server Action: Descarga un respaldo existente de la nube para guardarlo en un medio local.
 */
export async function downloadCloudBackupAction(
  filename: string
): Promise<{ ok: true; base64Zip: string; filename: string } | { ok: false; error: string }> {
  const admin = await getActiveAdministrator();
  if ("ok" in admin) return admin;

  try {
    const buffer = await downloadCloudBackup(filename);
    return {
      ok: true,
      base64Zip: buffer.toString("base64"),
      filename,
    };
  } catch (err) {
    console.error("[DOWNLOAD_ACTION] Error al descargar de la nube:", err);
    return { ok: false, error: "No se pudo descargar el archivo seleccionado." };
  }
}

/**
 * Server Action: Lista actualizada de respaldos en la nube.
 */
export async function getCloudBackupsListAction(): Promise<
  { ok: true; items: CloudBackupInfo[] } | { ok: false; error: string }
> {
  const admin = await getActiveAdministrator();
  if ("ok" in admin) return admin;

  try {
    const items = await listCloudBackups();
    return { ok: true, items };
  } catch (err) {
    console.error("[LIST_CLOUD_ACTION] Error:", err);
    return { ok: false, error: "No se pudo obtener la lista de respaldos en la nube." };
  }
}
