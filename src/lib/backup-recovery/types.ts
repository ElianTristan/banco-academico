/**
 * Tipos y contratos de datos para el Módulo de Respaldo y Recuperación
 * de Banco Académico.
 */

export type BackupDestination = "USB" | "EXTERNAL_HDD" | "CLOUD" | "LOCAL_STORAGE";

export type BackupScope = "FULL" | "ACADEMIC_ONLY" | "WITH_AUDIT_LOGS";

export interface TableBackupMetadata {
  count: number;
  sha256: string;
  primary_key: string | string[];
}

export interface BackupManifest {
  system: "Banco Académico";
  format_version: "1.0.0";
  backup_id: string;
  created_at: string;
  created_by: {
    id: string;
    email: string;
    role: string;
  };
  backup_type: BackupScope;
  destination: BackupDestination;
  app_version: string;
  database_schema_version: string;
  total_records: number;
  tables: Record<string, TableBackupMetadata>;
  overall_sha256: string;
  checksums: Record<string, string>;
}

export interface BackupBundlePayload {
  manifest: BackupManifest;
  data: Record<string, Record<string, unknown>[]>;
}

export interface TableDefinition {
  name: string;
  primaryKey: string | string[];
  allowedFields?: string[];
  dependencies?: string[];
  label: string;
  category: "catalogo" | "usuario" | "academico" | "comunidad" | "auditoria";
}

export interface SystemBackupStats {
  system: string;
  timestamp: string;
  tables: Record<string, number>;
  totalRecords: number;
  activeAdministrator: {
    id: string;
    email: string;
  };
  storageStatus: {
    cloudConfigured: boolean;
    bucketAvailable: boolean;
  };
}

export interface ValidationSuccessReport {
  valid: true;
  manifest: BackupManifest;
  fileDetails: {
    filename: string;
    sizeBytes: number;
    sizeFormatted: string;
    checksumSha256: string;
  };
  tableSummaries: {
    name: string;
    label: string;
    recordCount: number;
    sha256: string;
    status: "valid" | "warning";
  }[];
  totalRecords: number;
  createdAtFormatted: string;
  compatibilityNote: string;
}

export interface ValidationFailureReport {
  valid: false;
  filename: string;
  errorReason: string;
  technicalDetails?: string;
  stage: "FILE_FORMAT" | "MANIFEST_VERIFICATION" | "CHECKSUM_INTEGRITY" | "SCHEMA_COMPATIBILITY";
}

export type ValidationResult = ValidationSuccessReport | ValidationFailureReport;

export interface ComponentVerificationItem {
  component: string;
  category: string;
  status: "APROBADO" | "ADVERTENCIA" | "FALLO";
  expectedCount: number;
  foundCount: number;
  integrityVerified: boolean;
  message: string;
}

export interface VerificationReport {
  overallStatus: "COMPLETADO_EXITOSO" | "COMPLETADO_CON_ADVERTENCIAS" | "FALLIDO";
  timestamp: string;
  checksTotal: number;
  checksPassed: number;
  checksFailed: number;
  items: ComponentVerificationItem[];
  integritySummary: string;
}

export interface RestoreExecutionResult {
  ok: boolean;
  error?: string;
  operationId?: string;
  preRestoreBackupFilename?: string;
  preRestoreBackupSize?: string;
  preRestoreChecksum?: string;
  restoredTablesCount?: number;
  restoredRecordsCount?: number;
  verificationReport?: VerificationReport;
  durationMs?: number;
}

export interface CloudBackupInfo {
  name: string;
  sizeBytes: number;
  sizeFormatted: string;
  createdAt: string;
  updatedAt: string;
  checksumSha256?: string;
}

export interface BackupOperationLogItem {
  id: number;
  action: string;
  description: string;
  occurred_at: string;
  details: Record<string, unknown>;
  admin_email?: string;
}

export interface BackupOverviewData {
  stats: SystemBackupStats;
  cloudBackups: CloudBackupInfo[];
  recentLogs: BackupOperationLogItem[];
  isLocked: boolean;
  activeLockDetails?: {
    operation: string;
    startedAt: string;
  };
}
