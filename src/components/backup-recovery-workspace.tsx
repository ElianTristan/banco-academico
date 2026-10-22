"use client";

import { useState, useEffect, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Database,
  HardDriveDownload,
  RotateCcw,
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  Copy,
  Check,
  RefreshCw,
  Cloud,
  HardDrive,
  Usb,
  Download,
  Lock,
  XCircle,
  FileCheck,
  Loader2,
} from "lucide-react";
import {
  createBackupAction,
  validateBackupFileAction,
  validateCloudBackupAction,
  executeRestoreAction,
  getBackupOverviewAction,
  downloadCloudBackupAction,
} from "@/app/admin/backup-actions";
import type {
  BackupDestination,
  BackupOverviewData,
  BackupScope,
  CloudBackupInfo,
  RestoreExecutionResult,
  ValidationResult,
} from "@/lib/backup-recovery/types";

type WorkspaceTab = "respaldo" | "recuperacion" | "historial";

const destinationLabels: Record<BackupDestination, { label: string; desc: string; icon: typeof Usb }> = {
  USB: {
    label: "Unidad USB",
    desc: "Almacenamiento en memoria flash USB extraíble conectada al equipo.",
    icon: Usb,
  },
  EXTERNAL_HDD: {
    label: "Disco duro externo",
    desc: "Unidad de disco externa conectada y aislada físicamente del servidor.",
    icon: HardDrive,
  },
  CLOUD: {
    label: "Almacenamiento en la nube",
    desc: "Bucket institucional seguro y cifrado en la infraestructura de Supabase.",
    icon: Cloud,
  },
  LOCAL_STORAGE: {
    label: "Descarga directa",
    desc: "Descarga del archivo comprimido (.zip) para resguardo manual inmediato.",
    icon: Download,
  },
};

const scopeLabels: Record<BackupScope, { label: string; desc: string }> = {
  FULL: {
    label: "Base de datos completa (Recomendado)",
    desc: "Catálogos, carreras, materias, perfiles, docentes, alumnos, grupos, calificaciones y bitácora.",
  },
  ACADEMIC_ONLY: {
    label: "Solo registros académicos",
    desc: "Materias, carreras, periodos, alumnos, docentes, grupos, horarios y calificaciones.",
  },
  WITH_AUDIT_LOGS: {
    label: "Completo con bitácora forense",
    desc: "Incluye registros históricos de auditoría y accesos además de todos los datos institucionales.",
  },
};

export function BackupRecoveryWorkspace() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("respaldo");
  const [overview, setOverview] = useState<BackupOverviewData | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  // Estados de Respaldo
  const [destination, setDestination] = useState<BackupDestination>("USB");
  const [scope, setScope] = useState<BackupScope>("FULL");
  const [backupStage, setBackupStage] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupSuccessResult, setBackupSuccessResult] = useState<{
    filename: string;
    sizeFormatted: string;
    checksum: string;
    destination: BackupDestination;
    cloudSaved?: boolean;
    cloudPath?: string;
    stats: Record<string, number>;
    base64Zip?: string;
  } | null>(null);
  const [copiedHash, setCopiedHash] = useState(false);
  const [isBackupRunning, startBackupTransition] = useTransition();

  // Estados de Recuperación
  const [restoreSource, setRestoreSource] = useState<"local" | "cloud">("local");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedCloudFile, setSelectedCloudFile] = useState<string>("");
  const [validationReport, setValidationReport] = useState<ValidationResult | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isValidating, startValidationTransition] = useTransition();

  const [confirmationText, setConfirmationText] = useState("");
  const [restoreStage, setRestoreStage] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreResult, setRestoreResult] = useState<RestoreExecutionResult | null>(null);
  const [isRestoring, startRestoreTransition] = useTransition();

  async function loadOverview() {
    setLoadingOverview(true);
    setOverviewError(null);
    try {
      const res = await getBackupOverviewAction();
      if (res.ok) {
        setOverview(res.data);
      } else {
        setOverviewError(res.error);
      }
    } catch {
      setOverviewError("No se pudo cargar el resumen general del sistema de respaldos.");
    } finally {
      setLoadingOverview(false);
    }
  }

  useEffect(() => {
    loadOverview();
  }, []);

  function handleCopyHash(hash: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(hash);
      setCopiedHash(true);
      setTimeout(() => setCopiedHash(false), 2500);
    }
  }

  function downloadBase64Zip(base64: string, filename: string) {
    try {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Error al disparar la descarga:", e);
    }
  }

  async function handleStartBackup() {
    setBackupError(null);
    setBackupSuccessResult(null);
    setBackupStage("Inicializando y adquiriendo bloqueo de exclusión mutua...");

    startBackupTransition(async () => {
      try {
        setBackupStage("Extrayendo registros de la base de datos y saneando contraseñas...");
        const result = await createBackupAction({ destination, scope });

        if (!result.ok) {
          setBackupError(result.error);
          setBackupStage(null);
          return;
        }

        setBackupStage("Finalizando empaquetado y calculando SHA-256...");
        setBackupSuccessResult({
          filename: result.filename,
          sizeFormatted: result.sizeFormatted,
          checksum: result.checksum,
          destination,
          cloudSaved: result.cloudSaved,
          cloudPath: result.cloudPath,
          stats: result.stats,
          base64Zip: result.base64Zip,
        });

        // Si es USB o HDD Externo y el navegador soporta File System Access API
        if (result.base64Zip && (destination === "USB" || destination === "EXTERNAL_HDD")) {
          if ("showSaveFilePicker" in window) {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const handle = await (window as any).showSaveFilePicker({
                suggestedName: result.filename,
                types: [
                  {
                    description: "Archivo de respaldo comprimido ZIP",
                    accept: { "application/zip": [".zip"] },
                  },
                ],
              });
              const writable = await handle.createWritable();
              const binary = atob(result.base64Zip);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
              }
              await writable.write(bytes);
              await writable.close();
            } catch (pickerErr) {
              // Si el usuario cancela o no permite el acceso, descarga estándar
              if ((pickerErr as Error).name !== "AbortError") {
                downloadBase64Zip(result.base64Zip, result.filename);
              }
            }
          } else {
            downloadBase64Zip(result.base64Zip, result.filename);
          }
        } else if (result.base64Zip && destination === "LOCAL_STORAGE") {
          downloadBase64Zip(result.base64Zip, result.filename);
        }

        await loadOverview();
        router.refresh();
      } catch (err) {
        setBackupError(`Ocurrió un error inesperado: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setBackupStage(null);
      }
    });
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    setValidationReport(null);
    setValidationError(null);
    setRestoreResult(null);
    setRestoreError(null);
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.name.toLowerCase().endsWith(".zip")) {
        setValidationError("El archivo debe tener formato comprimido .zip");
        setSelectedFile(null);
        return;
      }
      setSelectedFile(file);
    }
  }

  function handleValidateBackup() {
    setValidationReport(null);
    setValidationError(null);
    setRestoreResult(null);
    setRestoreError(null);

    startValidationTransition(async () => {
      try {
        if (restoreSource === "local") {
          if (!selectedFile) {
            setValidationError("Selecciona un archivo .zip para validar.");
            return;
          }
          const formData = new FormData();
          formData.append("backupFile", selectedFile);
          const res = await validateBackupFileAction(formData);
          if (res.ok) {
            setValidationReport(res.report);
          } else {
            setValidationError(res.error);
          }
        } else {
          if (!selectedCloudFile) {
            setValidationError("Selecciona un respaldo de la nube para validar.");
            return;
          }
          const res = await validateCloudBackupAction(selectedCloudFile);
          if (res.ok) {
            setValidationReport(res.report);
          } else {
            setValidationError(res.error);
          }
        }
      } catch (err) {
        setValidationError(`Error durante la validación: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  }

  function handleStartRestore() {
    if (!validationReport || !validationReport.valid) {
      setRestoreError("Debes validar satisfactoriamente el respaldo antes de continuar.");
      return;
    }
    if (confirmationText.trim() !== "RESTAURAR") {
      setRestoreError("Escribe la palabra exacta 'RESTAURAR' para confirmar la operación.");
      return;
    }

    setRestoreError(null);
    setRestoreResult(null);
    setRestoreStage("Adquiriendo bloqueo de exclusión mutua para la restauración...");

    startRestoreTransition(async () => {
      try {
        let base64Zip: string | undefined;

        if (restoreSource === "local" && selectedFile) {
          setRestoreStage("Leyendo archivo local...");
          const arrayBuffer = await selectedFile.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          let binary = "";
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          base64Zip = btoa(binary);
        }

        setRestoreStage("Generando respaldo de salvaguarda automático previo...");
        const res = await executeRestoreAction({
          base64Zip,
          cloudFilename: restoreSource === "cloud" ? selectedCloudFile : undefined,
          confirmationText: confirmationText.trim(),
        });

        setRestoreResult(res);
        if (!res.ok) {
          setRestoreError(res.error || "Ocurrió un error al ejecutar la restauración.");
        } else {
          setConfirmationText("");
          await loadOverview();
          router.refresh();
        }
      } catch (err) {
        setRestoreError(`Fallo crítico durante la recuperación: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setRestoreStage(null);
      }
    });
  }

  async function handleDownloadCloudItem(filename: string) {
    try {
      const res = await downloadCloudBackupAction(filename);
      if (res.ok && res.base64Zip) {
        downloadBase64Zip(res.base64Zip, res.filename);
      } else if (!res.ok) {
        alert(res.error);
      }
    } catch {
      alert("No se pudo descargar el archivo de la nube.");
    }
  }

  const isLocked = overview?.isLocked === true;

  return (
    <div className="backup-workspace">
      {/* Banner de bloqueo de concurrencia en el servidor */}
      {isLocked && (
        <div className="backup-alert backup-alert-warning" role="alert">
          <Lock size={18} />
          <div>
            <strong>Operación de datos en ejecución</strong>
            <p style={{ margin: "4px 0 0" }}>
              Actualmente hay un proceso de respaldo o restauración activo en el servidor (iniciado:{" "}
              {overview?.activeLockDetails?.startedAt
                ? new Date(overview.activeLockDetails.startedAt).toLocaleTimeString("es-MX")
                : "hace unos momentos"}
              ). Por motivos de seguridad y consistencia, no se permiten operaciones concurrentes.
            </p>
            <button
              type="button"
              onClick={loadOverview}
              style={{
                marginTop: 8,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                borderRadius: 8,
                fontSize: 12,
                cursor: "pointer",
                background: "#fef3c7",
                border: "1px solid #f59e0b",
                color: "#92400e",
                fontWeight: 600,
              }}
            >
              <RefreshCw size={13} /> Comprobar disponibilidad
            </button>
          </div>
        </div>
      )}

      {overviewError && (
        <div className="backup-alert backup-alert-danger" role="alert">
          <XCircle size={18} />
          <div>
            <strong>Error de conexión</strong>
            <p style={{ margin: "4px 0 0" }}>{overviewError}</p>
          </div>
        </div>
      )}

      {/* Pestañas de navegación de primer nivel */}
      <nav className="backup-tabs" aria-label="Navegación del módulo de respaldo">
        <button
          type="button"
          className={`backup-tab-button ${activeTab === "respaldo" ? "is-active" : ""}`}
          onClick={() => setActiveTab("respaldo")}
        >
          <HardDriveDownload size={16} />
          <span>1. Respaldo de información</span>
        </button>
        <button
          type="button"
          className={`backup-tab-button ${activeTab === "recuperacion" ? "is-active" : ""}`}
          onClick={() => setActiveTab("recuperacion")}
        >
          <RotateCcw size={16} />
          <span>2. Recuperación de información</span>
        </button>
        <button
          type="button"
          className={`backup-tab-button ${activeTab === "historial" ? "is-active" : ""}`}
          onClick={() => setActiveTab("historial")}
        >
          <ShieldCheck size={16} />
          <span>3. Bitácora e historial</span>
        </button>
      </nav>

      {/* PESTAÑA 1: RESPALDO DE INFORMACIÓN */}
      {activeTab === "respaldo" && (
        <section className="panel" aria-labelledby="heading-respaldo">
          <div className="table-head">
            <div>
              <span className="eyebrow">Continuidad institucional</span>
              <h2 id="heading-respaldo">Respaldo de información</h2>
            </div>
            <Database size={20} style={{ color: "#183b70" }} />
          </div>

          {/* Mensaje institucional obligatorio */}
          <div className="backup-alert backup-alert-info" style={{ marginTop: 12 }}>
            <Database size={18} />
            <div>
              <strong>Propósito del respaldo institucional</strong>
              <p style={{ margin: "4px 0 0" }}>
                El respaldo permite generar una copia de seguridad de la información de Banco Académico para proteger
                los datos ante errores, pérdidas de información o incidentes técnicos. Se recomienda realizar los
                respaldos en horarios de baja actividad o fuera del horario de uso del sistema.
              </p>
            </div>
          </div>

          {/* Alerta de aislamiento de disco obligatoria */}
          <div className="backup-alert backup-alert-warning" style={{ marginTop: 14 }}>
            <AlertTriangle size={18} />
            <div>
              <strong>Aislamiento físico y seguridad del medio de almacenamiento</strong>
              <p style={{ margin: "4px 0 0" }}>
                <strong>Importante:</strong> Para garantizar la continuidad ante una avería total del hardware o
                corrupción de disco, no conserve el único respaldo en el mismo disco físico que aloja el servidor o la
                aplicación. Utilice siempre una <strong>Unidad USB</strong>, un <strong>Disco duro externo</strong> o el{" "}
                <strong>Almacenamiento en la nube</strong> institucional.
              </p>
            </div>
          </div>

          {/* Formulario de selección de destino y alcance */}
          <div style={{ marginTop: 20 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
              Selecciona el destino del respaldo:
            </label>
            <div className="destination-grid">
              {(["USB", "EXTERNAL_HDD", "CLOUD", "LOCAL_STORAGE"] as BackupDestination[]).map((destKey) => {
                const item = destinationLabels[destKey];
                const Icon = item.icon;
                const isSelected = destination === destKey;
                return (
                  <button
                    key={destKey}
                    type="button"
                    className={`destination-card ${isSelected ? "is-selected" : ""}`}
                    onClick={() => setDestination(destKey)}
                  >
                    <div className="destination-header">
                      <Icon size={18} style={{ color: isSelected ? "#183b70" : "#5c6c81" }} />
                      {isSelected && <CheckCircle2 size={16} style={{ color: "#183b70" }} />}
                    </div>
                    <strong>{item.label}</strong>
                    <p>{item.desc}</p>
                  </button>
                );
              })}
            </div>

            <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginTop: 18, marginBottom: 8 }}>
              Alcance del respaldo:
            </label>
            <div style={{ display: "grid", gap: 8 }}>
              {(["FULL", "ACADEMIC_ONLY", "WITH_AUDIT_LOGS"] as BackupScope[]).map((scopeKey) => {
                const item = scopeLabels[scopeKey];
                const isSelected = scope === scopeKey;
                return (
                  <label
                    key={scopeKey}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid",
                      borderColor: isSelected ? "#183b70" : "#dce4ef",
                      background: isSelected ? "#f4f8fe" : "transparent",
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    <input
                      type="radio"
                      name="scope"
                      value={scopeKey}
                      checked={isSelected}
                      onChange={() => setScope(scopeKey)}
                      style={{ marginTop: 2 }}
                    />
                    <div>
                      <strong style={{ display: "block", color: "#142742" }}>{item.label}</strong>
                      <span style={{ color: "#5c6c81" }}>{item.desc}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Resumen previo antes de iniciar */}
          <div
            style={{
              marginTop: 20,
              padding: 16,
              borderRadius: 14,
              border: "1px solid #dce4ef",
              background: "#fafbfc",
            }}
          >
            <span className="eyebrow">Verificación previa</span>
            <h3 style={{ margin: "4px 0 10px", fontSize: 14, color: "#142742" }}>
              Resumen de la copia de seguridad programada
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 12,
                fontSize: 12,
              }}
            >
              <div>
                <span style={{ color: "#6b7a90", display: "block" }}>Sistema y entorno:</span>
                <strong>Banco Académico (ITSLP)</strong>
              </div>
              <div>
                <span style={{ color: "#6b7a90", display: "block" }}>Destino identificado:</span>
                <strong>{destinationLabels[destination].label}</strong>
              </div>
              <div>
                <span style={{ color: "#6b7a90", display: "block" }}>Tablas en el catálogo:</span>
                <strong>{overview?.stats ? Object.keys(overview.stats.tables).length : "22"} tablas</strong>
              </div>
              <div>
                <span style={{ color: "#6b7a90", display: "block" }}>Registros estimados:</span>
                <strong>{overview?.stats ? overview.stats.totalRecords.toLocaleString("es-MX") : "—"}</strong>
              </div>
            </div>
          </div>

          {/* Errores de respaldo */}
          {backupError && (
            <div className="backup-alert backup-alert-danger" style={{ marginTop: 16 }} role="alert">
              <XCircle size={18} />
              <div>
                <strong>Error al generar el respaldo</strong>
                <p style={{ margin: "4px 0 0" }}>{backupError}</p>
              </div>
            </div>
          )}

          {/* Estado en tiempo real del proceso */}
          {isBackupRunning && backupStage && (
            <div className="backup-live-step" role="status">
              <Loader2 size={16} className="submit-spinner" />
              <span>{backupStage}</span>
            </div>
          )}

          {/* Resultado exitoso */}
          {backupSuccessResult && (
            <div className="backup-alert backup-alert-success" style={{ marginTop: 18 }}>
              <CheckCircle2 size={20} />
              <div style={{ width: "100%" }}>
                <strong style={{ fontSize: 14 }}>¡Respaldo institucional generado exitosamente!</strong>
                <p style={{ margin: "4px 0 10px" }}>
                  Se ha extraído, saneado y verificado la base de datos completa. El paquete comprimido ZIP contiene el
                  manifiesto oficial con firmas SHA-256 independientes por tabla.
                </p>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 10,
                    fontSize: 12,
                    marginBottom: 10,
                  }}
                >
                  <div>
                    <span style={{ color: "#295b45" }}>Archivo:</span>
                    <br />
                    <code>{backupSuccessResult.filename}</code>
                  </div>
                  <div>
                    <span style={{ color: "#295b45" }}>Tamaño:</span>
                    <br />
                    <strong>{backupSuccessResult.sizeFormatted}</strong>
                  </div>
                  <div>
                    <span style={{ color: "#295b45" }}>Destino confirmado:</span>
                    <br />
                    <strong>{destinationLabels[backupSuccessResult.destination].label}</strong>
                  </div>
                </div>

                <div style={{ marginTop: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#295b45" }}>
                    Firma criptográfica SHA-256 general:
                  </span>
                  <div className="backup-hash-display" style={{ marginTop: 4 }}>
                    <span>{backupSuccessResult.checksum}</span>
                    <button
                      type="button"
                      onClick={() => handleCopyHash(backupSuccessResult.checksum)}
                      style={{
                        background: "none",
                        border: 0,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        color: "#183b70",
                        fontWeight: 600,
                        fontSize: 11,
                      }}
                      title="Copiar hash SHA-256"
                    >
                      {copiedHash ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                      {copiedHash ? "Copiado" : "Copiar"}
                    </button>
                  </div>
                </div>

                {backupSuccessResult.base64Zip && (
                  <div style={{ marginTop: 14 }}>
                    <button
                      type="button"
                      className="button"
                      onClick={() =>
                        downloadBase64Zip(backupSuccessResult.base64Zip!, backupSuccessResult.filename)
                      }
                      style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 14px" }}
                    >
                      <Download size={15} /> Descargar archivo ZIP nuevamente
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Botón de acción */}
          <div style={{ marginTop: 20 }}>
            <button
              type="button"
              className="button"
              onClick={handleStartBackup}
              disabled={isBackupRunning || isLocked}
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              {isBackupRunning ? <Loader2 size={16} className="submit-spinner" /> : <HardDriveDownload size={16} />}
              <span>{isBackupRunning ? "Generando respaldo..." : "Iniciar respaldo institucional"}</span>
            </button>
          </div>
        </section>
      )}

      {/* PESTAÑA 2: RECUPERACIÓN DE INFORMACIÓN */}
      {activeTab === "recuperacion" && (
        <section className="panel" aria-labelledby="heading-recuperacion">
          <div className="table-head">
            <div>
              <span className="eyebrow">Recuperación ante desastres</span>
              <h2 id="heading-recuperacion">Recuperación de información</h2>
            </div>
            <RotateCcw size={20} style={{ color: "#b91c1c" }} />
          </div>

          {/* Advertencia crítica obligatoria */}
          <div className="backup-alert backup-alert-danger" style={{ marginTop: 14 }} role="alert">
            <AlertOctagon size={24} />
            <div>
              <strong style={{ fontSize: 14 }}>ADVERTENCIA CRÍTICA DEL SISTEMA</strong>
              <p style={{ margin: "4px 0 0" }}>
                ADVERTENCIA: La recuperación puede sustituir información actual por los datos contenidos en el respaldo
                seleccionado. Esta operación podría provocar la pérdida de cambios posteriores a la fecha del respaldo.
                Se recomienda realizarla exclusivamente en un horario en el que ningún usuario esté utilizando el
                sistema. Antes de continuar, genera y verifica un respaldo de seguridad del estado actual.
              </p>
            </div>
          </div>

          {/* Selección de origen del respaldo */}
          <div style={{ marginTop: 20 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
              Selecciona el origen del archivo de respaldo:
            </label>
            <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
              <button
                type="button"
                className={`backup-tab-button ${restoreSource === "local" ? "is-active" : ""}`}
                onClick={() => {
                  setRestoreSource("local");
                  setValidationReport(null);
                  setValidationError(null);
                }}
              >
                <Usb size={15} /> Archivo local (.zip desde USB o disco)
              </button>
              <button
                type="button"
                className={`backup-tab-button ${restoreSource === "cloud" ? "is-active" : ""}`}
                onClick={() => {
                  setRestoreSource("cloud");
                  setValidationReport(null);
                  setValidationError(null);
                }}
              >
                <Cloud size={15} /> Almacenamiento institucional en la nube
              </button>
            </div>

            {restoreSource === "local" ? (
              <div
                style={{
                  padding: 16,
                  borderRadius: 12,
                  border: "1px dashed #b5c7dd",
                  background: "#f8fafc",
                }}
              >
                <label style={{ display: "block", fontSize: 12, fontWeight: 650, color: "#142742", marginBottom: 6 }}>
                  Cargar archivo comprimido (.zip):
                </label>
                <input
                  type="file"
                  accept=".zip,application/zip,application/x-zip-compressed"
                  onChange={handleFileChange}
                  style={{ fontSize: 13 }}
                />
                {selectedFile && (
                  <p style={{ margin: "8px 0 0", fontSize: 12, color: "#183b70" }}>
                    Archivo seleccionado: <strong>{selectedFile.name}</strong> (
                    {(selectedFile.size / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>
            ) : (
              <div
                style={{
                  padding: 16,
                  borderRadius: 12,
                  border: "1px solid #dce4ef",
                  background: "#fafbfc",
                }}
              >
                <label style={{ display: "block", fontSize: 12, fontWeight: 650, color: "#142742", marginBottom: 8 }}>
                  Respaldos disponibles en el bucket institucional:
                </label>
                {loadingOverview ? (
                  <p style={{ fontSize: 12, color: "#5c6c81" }}>Consultando bucket institucional en la nube...</p>
                ) : overview?.cloudBackups && overview.cloudBackups.length > 0 ? (
                  <div style={{ display: "grid", gap: 6 }}>
                    {overview.cloudBackups.map((item: CloudBackupInfo) => {
                      const isSelected = selectedCloudFile === item.name;
                      return (
                        <div
                          key={item.name}
                          onClick={() => {
                            setSelectedCloudFile(item.name);
                            setValidationReport(null);
                            setValidationError(null);
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "8px 12px",
                            borderRadius: 8,
                            border: "1px solid",
                            borderColor: isSelected ? "#183b70" : "#e2e8f0",
                            background: isSelected ? "#f0f6ff" : "#fff",
                            cursor: "pointer",
                            fontSize: 12,
                          }}
                        >
                          <div>
                            <strong style={{ color: "#142742" }}>{item.name}</strong>
                            <div style={{ color: "#64748b", fontSize: 11 }}>
                              Tamaño: {item.sizeFormatted} · Creado:{" "}
                              {new Date(item.createdAt).toLocaleString("es-MX")}
                            </div>
                          </div>
                          <span
                            style={{
                              padding: "4px 8px",
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 650,
                              background: isSelected ? "#183b70" : "#f1f5f9",
                              color: isSelected ? "#fff" : "#475569",
                            }}
                          >
                            {isSelected ? "Seleccionado" : "Elegir"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="empty" style={{ padding: "16px 0", fontSize: 12 }}>
                    No se encontraron archivos en el bucket de la nube. Puede generar uno en la pestaña de Respaldo.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* PASO 1: Validación obligatoria */}
          <div style={{ marginTop: 20 }}>
            <span className="eyebrow">Paso 1 · Verificación técnica previa</span>
            <p style={{ fontSize: 12, color: "#5c6c81", margin: "4px 0 10px" }}>
              Antes de cualquier modificación, el archivo de respaldo debe validarse exhaustivamente contra sus hashes
              SHA-256 por tabla y compatibilidad de esquema.
            </p>

            <button
              type="button"
              className="button button-secondary"
              onClick={handleValidateBackup}
              disabled={
                isValidating ||
                (restoreSource === "local" ? !selectedFile : !selectedCloudFile) ||
                isLocked
              }
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              {isValidating ? <Loader2 size={15} className="submit-spinner" /> : <FileCheck size={15} />}
              <span>{isValidating ? "Validando integridad criptográfica..." : "Validar integridad del respaldo"}</span>
            </button>

            {validationError && (
              <div className="backup-alert backup-alert-danger" style={{ marginTop: 12 }} role="alert">
                <XCircle size={18} />
                <div>
                  <strong>Error durante la validación del archivo</strong>
                  <p style={{ margin: "4px 0 0" }}>{validationError}</p>
                </div>
              </div>
            )}

            {validationReport && (
              <div style={{ marginTop: 14 }}>
                {validationReport.valid ? (
                  <div className="backup-alert backup-alert-success">
                    <CheckCircle2 size={20} />
                    <div style={{ width: "100%" }}>
                      <strong style={{ fontSize: 14 }}>Respaldo verificado e íntegro</strong>
                      <p style={{ margin: "4px 0 8px" }}>
                        El archivo cumple con el estándar de Banco Académico. Todas las firmas criptográficas SHA-256
                        fueron cotejadas con éxito.
                      </p>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                          gap: 8,
                          fontSize: 12,
                          marginTop: 8,
                        }}
                      >
                        <div>
                          <span style={{ color: "#28664f" }}>Fecha original:</span>
                          <br />
                          <strong>{validationReport.createdAtFormatted}</strong>
                        </div>
                        <div>
                          <span style={{ color: "#28664f" }}>Tablas verificadas:</span>
                          <br />
                          <strong>{validationReport.tableSummaries.length} tablas</strong>
                        </div>
                        <div>
                          <span style={{ color: "#28664f" }}>Registros totales:</span>
                          <br />
                          <strong>{validationReport.totalRecords.toLocaleString("es-MX")} registros</strong>
                        </div>
                      </div>

                      <div className="verification-table-wrap">
                        <table className="verification-table">
                          <thead>
                            <tr>
                              <th>Tabla</th>
                              <th>Nombre institucional</th>
                              <th>Registros</th>
                              <th>Firma SHA-256</th>
                              <th>Estado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {validationReport.tableSummaries.map((tbl) => (
                              <tr key={tbl.name}>
                                <td>
                                  <code>{tbl.name}</code>
                                </td>
                                <td>{tbl.label}</td>
                                <td>{tbl.recordCount.toLocaleString("es-MX")}</td>
                                <td style={{ fontFamily: "monospace", fontSize: 10 }}>
                                  {tbl.sha256.slice(0, 16)}…
                                </td>
                                <td>
                                  <span
                                    style={{
                                      padding: "2px 6px",
                                      borderRadius: 4,
                                      fontSize: 10,
                                      fontWeight: 700,
                                      background: "#edf7f1",
                                      color: "#28664f",
                                    }}
                                  >
                                    VÁLIDO
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="backup-alert backup-alert-danger">
                    <XCircle size={20} />
                    <div>
                      <strong>Archivo de respaldo inválido o corrupto</strong>
                      <p style={{ margin: "4px 0 0" }}>
                        Fallo en la fase: <code>{validationReport.stage}</code>.
                        <br />
                        {validationReport.errorReason}
                      </p>
                      {validationReport.technicalDetails && (
                        <p style={{ marginTop: 6, fontSize: 11, fontFamily: "monospace" }}>
                          Detalles técnicos: {validationReport.technicalDetails}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* PASO 2: Salvaguarda preventiva obligatoria y Confirmación */}
          {validationReport && validationReport.valid && (
            <div
              style={{
                marginTop: 24,
                padding: 18,
                borderRadius: 14,
                border: "1.5px solid #fecaca",
                background: "#fff5f5",
              }}
            >
              <span className="eyebrow" style={{ color: "#b91c1c" }}>
                Paso 2 · Medida preventiva y confirmación obligatoria
              </span>
              <h3 style={{ margin: "4px 0 8px", fontSize: 14, color: "#7f1d1d" }}>
                Garantía de salvaguarda y sustitución de datos
              </h3>

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  fontSize: 12,
                  color: "#7f1d1d",
                  lineHeight: 1.5,
                  marginBottom: 14,
                }}
              >
                <ShieldCheck size={20} style={{ flexShrink: 0, marginTop: 2, color: "#16a34a" }} />
                <div>
                  <strong>Salvaguarda previa automática:</strong> Antes de aplicar cualquier cambio a la base de datos,
                  el sistema generará automáticamente una copia íntegra del estado actual (
                  <code>BancoAcademico_PreRestauracion_...zip</code>). Si el proceso experimentara algún inconveniente,
                  podrá restaurar dicho punto de recuperación.
                </div>
              </div>

              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#991b1b", marginBottom: 6 }}>
                Escribe textualmente la palabra &quot;RESTAURAR&quot; para autorizar la sustitución de datos:
              </label>
              <div style={{ display: "flex", gap: 10, alignItems: "center", maxWidth: 360 }}>
                <input
                  type="text"
                  placeholder="RESTAURAR"
                  value={confirmationText}
                  onChange={(e) => setConfirmationText(e.target.value)}
                  style={{
                    flex: 1,
                    height: 42,
                    padding: "0 12px",
                    borderRadius: 10,
                    border: "1.5px solid",
                    borderColor: confirmationText === "RESTAURAR" ? "#16a34a" : "#f87171",
                    background: "#fff",
                    fontWeight: 700,
                    fontSize: 14,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                />
              </div>

              {restoreError && (
                <div className="backup-alert backup-alert-danger" style={{ marginTop: 12 }} role="alert">
                  <XCircle size={18} />
                  <div>
                    <strong>Fallo en la restauración</strong>
                    <p style={{ margin: "4px 0 0" }}>{restoreError}</p>
                  </div>
                </div>
              )}

              {isRestoring && restoreStage && (
                <div className="backup-live-step" style={{ marginTop: 12 }} role="status">
                  <Loader2 size={16} className="submit-spinner" />
                  <span>{restoreStage}</span>
                </div>
              )}

              <div style={{ marginTop: 16 }}>
                <button
                  type="button"
                  className="button"
                  onClick={handleStartRestore}
                  disabled={confirmationText !== "RESTAURAR" || isRestoring || isLocked}
                  style={{
                    background: confirmationText === "RESTAURAR" ? "#b91c1c" : "#94a3b8",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {isRestoring ? <Loader2 size={16} className="submit-spinner" /> : <RotateCcw size={16} />}
                  <span>{isRestoring ? "Restaurando base de datos..." : "Ejecutar recuperación del sistema"}</span>
                </button>
              </div>
            </div>
          )}

          {/* PASO 3: Reporte de verificación post-restauración */}
          {restoreResult && restoreResult.ok && restoreResult.verificationReport && (
            <div style={{ marginTop: 24 }}>
              <div className="backup-alert backup-alert-success">
                <CheckCircle2 size={24} />
                <div style={{ width: "100%" }}>
                  <strong style={{ fontSize: 15 }}>
                    ¡Base de datos restaurada y verificada exitosamente!
                  </strong>
                  <p style={{ margin: "4px 0 10px" }}>
                    Los registros fueron restaurados siguiendo el orden de dependencias topológicas de llaves foráneas.
                    Se ha generado el respaldo preventivo:{" "}
                    <code>{restoreResult.preRestoreBackupFilename}</code>.
                  </p>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                      gap: 8,
                      fontSize: 12,
                      marginTop: 6,
                    }}
                  >
                    <div>
                      <span style={{ color: "#28664f" }}>Tablas restauradas:</span>
                      <br />
                      <strong>{restoreResult.restoredTablesCount}</strong>
                    </div>
                    <div>
                      <span style={{ color: "#28664f" }}>Registros restaurados:</span>
                      <br />
                      <strong>{restoreResult.restoredRecordsCount?.toLocaleString("es-MX")}</strong>
                    </div>
                    <div>
                      <span style={{ color: "#28664f" }}>Tiempo total:</span>
                      <br />
                      <strong>{((restoreResult.durationMs ?? 0) / 1000).toFixed(2)} s</strong>
                    </div>
                    <div>
                      <span style={{ color: "#28664f" }}>Estado de verificación:</span>
                      <br />
                      <strong>{restoreResult.verificationReport.overallStatus}</strong>
                    </div>
                  </div>

                  {/* Tabla detallada de verificación componente por componente */}
                  <div className="verification-table-wrap" style={{ marginTop: 14 }}>
                    <table className="verification-table">
                      <thead>
                        <tr>
                          <th>Componente / Tabla</th>
                          <th>Categoría</th>
                          <th>Registros (Encontrados / Esperados)</th>
                          <th>Estado</th>
                          <th>Detalle de integridad</th>
                        </tr>
                      </thead>
                      <tbody>
                        {restoreResult.verificationReport.items.map((item) => {
                          const isApproved = item.status === "APROBADO";
                          const isWarning = item.status === "ADVERTENCIA";
                          return (
                            <tr key={item.component}>
                              <td>
                                <code>{item.component}</code>
                              </td>
                              <td style={{ textTransform: "capitalize" }}>{item.category}</td>
                              <td>
                                {item.foundCount} / {item.expectedCount}
                              </td>
                              <td>
                                <span
                                  style={{
                                    padding: "2px 7px",
                                    borderRadius: 4,
                                    fontSize: 10,
                                    fontWeight: 700,
                                    background: isApproved ? "#edf7f1" : isWarning ? "#fffbeb" : "#fee2e2",
                                    color: isApproved ? "#28664f" : isWarning ? "#92400e" : "#991b1b",
                                  }}
                                >
                                  {item.status}
                                </span>
                              </td>
                              <td style={{ fontSize: 11, color: "#475569" }}>{item.message}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* PESTAÑA 3: HISTORIAL Y BITÁCORA */}
      {activeTab === "historial" && (
        <section className="panel" aria-labelledby="heading-historial">
          <div className="table-head">
            <div>
              <span className="eyebrow">Auditoría y trazabilidad</span>
              <h2 id="heading-historial">Bitácora de respaldos y recuperaciones</h2>
            </div>
            <button
              type="button"
              onClick={loadOverview}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 10px",
                borderRadius: 8,
                fontSize: 12,
                cursor: "pointer",
                background: "#f1f5f9",
                border: "1px solid #cbd5e1",
              }}
            >
              <RefreshCw size={12} /> Actualizar bitácora
            </button>
          </div>

          {loadingOverview ? (
            <div className="empty">Cargando bitácora institucional...</div>
          ) : overview?.recentLogs && overview.recentLogs.length > 0 ? (
            <div className="verification-table-wrap">
              <table className="verification-table">
                <thead>
                  <tr>
                    <th>Fecha y hora</th>
                    <th>Acción</th>
                    <th>Descripción</th>
                    <th>Administrador</th>
                    <th>Detalles técnicos</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.recentLogs.map((log) => {
                    const isSuccess = log.action.endsWith("_COMPLETED");
                    const isFail = log.action.endsWith("_FAILED");
                    return (
                      <tr key={log.id}>
                        <td style={{ whiteSpace: "nowrap" }}>
                          {new Date(log.occurred_at).toLocaleString("es-MX")}
                        </td>
                        <td>
                          <span
                            style={{
                              padding: "2px 6px",
                              borderRadius: 4,
                              fontSize: 10,
                              fontWeight: 700,
                              background: isSuccess ? "#edf7f1" : isFail ? "#fee2e2" : "#f1f5f9",
                              color: isSuccess ? "#28664f" : isFail ? "#991b1b" : "#475569",
                            }}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td>{log.description}</td>
                        <td style={{ fontSize: 11, color: "#64748b" }}>{log.admin_email || "Administrador"}</td>
                        <td style={{ fontSize: 10, fontFamily: "monospace", maxWidth: 220, wordBreak: "break-all" }}>
                          {JSON.stringify(log.details)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">No hay eventos de respaldo registrados recientemente en la bitácora.</div>
          )}

          {/* Listado de respaldos en la nube institucionales */}
          <div style={{ marginTop: 24 }}>
            <span className="eyebrow">Almacenamiento institucional</span>
            <h3 style={{ margin: "4px 0 10px", fontSize: 14 }}>
              Copias disponibles en Supabase Storage (institutional-backups)
            </h3>
            {overview?.cloudBackups && overview.cloudBackups.length > 0 ? (
              <div style={{ display: "grid", gap: 8 }}>
                {overview.cloudBackups.map((cloudItem) => (
                  <div
                    key={cloudItem.name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid #dce4ef",
                      background: "#fff",
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: 13, color: "#142742" }}>{cloudItem.name}</strong>
                      <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                        {cloudItem.sizeFormatted} · Creado el{" "}
                        {new Date(cloudItem.createdAt).toLocaleString("es-MX")}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => handleDownloadCloudItem(cloudItem.name)}
                      style={{ padding: "6px 12px", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 6 }}
                    >
                      <Download size={13} /> Descargar a USB / Disco local
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 12, color: "#64748b" }}>
                No hay respaldos almacenados en la nube actualmente.
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
