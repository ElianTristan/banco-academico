/**
 * Control de concurrencia en servidor para operaciones de respaldo y recuperación.
 * Impide operaciones simultáneas o conflictivas sobre la base de datos.
 */

interface ActiveOperation {
  id: string;
  type: "backup" | "restore";
  adminId: string;
  adminEmail: string;
  startedAt: string;
  expiresAt: number; // timestamp ms
  stage: string;
}

// Bloqueo en memoria global del proceso Node.js
let currentOperation: ActiveOperation | null = null;
const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos máximo de bloqueo de seguridad

export function isOperationLocked(): boolean {
  if (!currentOperation) return false;
  if (Date.now() > currentOperation.expiresAt) {
    // Expiración por tiempo de seguridad
    currentOperation = null;
    return false;
  }
  return true;
}

export function getCurrentOperation(): ActiveOperation | null {
  if (isOperationLocked()) {
    return currentOperation;
  }
  return null;
}

export function acquireOperationLock(
  type: "backup" | "restore",
  admin: { id: string; email: string },
  initialStage: string = "INICIANDO"
): { ok: true; lockId: string } | { ok: false; error: string } {
  if (isOperationLocked()) {
    const op = currentOperation!;
    const opLabel = op.type === "backup" ? "generación de respaldo" : "recuperación de información";
    return {
      ok: false,
      error: `Ya existe una operación de ${opLabel} en curso iniciada por ${op.adminEmail}. Espera a que finalice para evitar inconsistencias.`,
    };
  }

  const id = `op_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  currentOperation = {
    id,
    type,
    adminId: admin.id,
    adminEmail: admin.email,
    startedAt: new Date().toISOString(),
    expiresAt: Date.now() + LOCK_TIMEOUT_MS,
    stage: initialStage,
  };

  return { ok: true, lockId: id };
}

export function updateOperationStage(lockId: string, stage: string): void {
  if (currentOperation && currentOperation.id === lockId) {
    currentOperation.stage = stage;
    currentOperation.expiresAt = Date.now() + LOCK_TIMEOUT_MS; // Extiende tiempo
  }
}

export function releaseOperationLock(lockId: string): void {
  if (currentOperation && currentOperation.id === lockId) {
    currentOperation = null;
  }
}

/**
 * Función auxiliar para forzar liberación en caso de rescate administrativo.
 */
export function forceReleaseLock(adminId: string): void {
  if (currentOperation) {
    console.warn(`[CONCURRENCY] Bloqueo liberado forzosamente por admin ${adminId}`);
    currentOperation = null;
  }
}
