"use client";

import {
  Activity,
  ArrowDownUp,
  ArrowDown,
  ArrowUp,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Filter,
  GraduationCap,
  Info,
  Printer,
  RotateCw,
  Search,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import styles from "./academic-reports.module.css";

export type AcademicReportData = {
  records: Array<{
    id: string;
    enrollmentId: string;
    studentId: string;
    studentActive: boolean | null;
    careerId: string | null;
    careerName: string | null;
    specialty: string | null;
    studentSemester: number | null;
    groupId: string;
    groupCode: string;
    groupActive: boolean;
    subjectId: string;
    subjectCode: string;
    subjectName: string;
    subjectSemester: number | null;
    subjectActive: boolean;
    periodId: string | null;
    periodName: string | null;
    periodStartsOn: string | null;
    periodEndsOn: string | null;
    teacherIds: string[];
    teacherNames: string[];
    teacherDepartments: string[];
    recordedBy: string | null;
    recordedByName: string | null;
    score: number | null;
    assessment: string;
    recordedAt: string;
    enrollmentStatus: "active" | "withdrawn" | "completed";
  }>;
  students: Array<{
    id: string;
    careerId: string | null;
    specialty: string | null;
    semester: number | null;
    createdAt: string;
    active: boolean | null;
  }>;
  teachers: Array<{
    id: string;
    department: string | null;
    name: string;
    createdAt: string;
    active: boolean | null;
  }>;
  subjects: Array<{
    id: string;
    career_id: string | null;
    code: string;
    name: string;
    semester: number | null;
    active: boolean;
    created_at: string;
  }>;
  careers: Array<{ id: string; name: string; active: boolean }>;
  periods: Array<{
    id: string;
    name: string;
    starts_on: string;
    ends_on: string;
    is_current: boolean;
  }>;
};

type Scope = "administrador" | "docente";
type DateRange = "all" | "day" | "week" | "month" | "year" | "custom";
type UserStatus = "all" | "active" | "inactive";
type GradeStatus = "all" | "approved" | "failed";
type PerformanceBand = "all" | "high" | "regular" | "low";
type UserRoleFilter = "all" | "alumno" | "docente" | "administrador";
type EnrollmentFilter = "all" | "active" | "withdrawn" | "completed";
type Filters = {
  range: DateRange;
  from: string;
  to: string;
  careerId: string;
  specialty: string;
  semester: string;
  groupId: string;
  teacherId: string;
  department: string;
  subjectId: string;
  periodId: string;
  userRole: UserRoleFilter;
  enrollmentStatus: EnrollmentFilter;
  userStatus: UserStatus;
  gradeStatus: GradeStatus;
  performance: PerformanceBand;
};
type DateBounds = { from: string | null; to: string | null };
type DetailRow = {
  key: string;
  subject: string;
  teacher: string;
  career: string;
  semester: number | null;
  group: string;
  students: number;
  evaluations: number;
  average: number | null;
  passed: number;
  failed: number;
  approvalRate: number | null;
  failureRate: number | null;
};
type SortKey = keyof DetailRow;
type Comparison = { change: number; suffix: string; digits?: number; invert?: boolean };

const PASSING_SCORE = 70;
const HIGH_SCORE = 90;
const emptyFilters: Filters = {
  range: "all",
  from: "",
  to: "",
  careerId: "",
  specialty: "",
  semester: "",
  groupId: "",
  teacherId: "",
  department: "",
  subjectId: "",
  periodId: "",
  userRole: "all",
  enrollmentStatus: "all",
  userStatus: "all",
  gradeStatus: "all",
  performance: "all",
};
const defaultPageSize = 10;

function localDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function presetDates(range: DateRange): Pick<Filters, "from" | "to"> {
  const today = new Date();
  const start = new Date(today);
  const end = new Date(today);

  if (range === "all" || range === "custom") return { from: "", to: "" };
  if (range === "week") {
    start.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    end.setDate(start.getDate() + 6);
  } else if (range === "month") {
    start.setDate(1);
    end.setMonth(today.getMonth() + 1, 0);
  } else if (range === "year") {
    start.setMonth(0, 1);
    end.setMonth(11, 31);
  }
  return { from: localDate(start), to: localDate(end) };
}

function dateBounds(filters: Filters): DateBounds {
  if (filters.range === "all") return { from: null, to: null };
  const dates = filters.range === "custom" ? filters : presetDates(filters.range);
  return { from: dates.from || null, to: dates.to || null };
}

function isWithinDate(value: string, bounds: DateBounds) {
  const date = value.slice(0, 10);
  return (!bounds.from || date >= bounds.from) && (!bounds.to || date <= bounds.to);
}

function getPreviousBounds(bounds: DateBounds): DateBounds | null {
  if (!bounds.from || !bounds.to) return null;
  const from = new Date(`${bounds.from}T00:00:00Z`);
  const to = new Date(`${bounds.to}T00:00:00Z`);
  const duration = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  const previousTo = new Date(from);
  previousTo.setUTCDate(previousTo.getUTCDate() - 1);
  const previousFrom = new Date(previousTo);
  previousFrom.setUTCDate(previousFrom.getUTCDate() - duration + 1);
  return {
    from: previousFrom.toISOString().slice(0, 10),
    to: previousTo.toISOString().slice(0, 10),
  };
}

function formatNumber(value: number, digits = 1) {
  return new Intl.NumberFormat("es-MX", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function studentAverages(records: AcademicReportData["records"]) {
  const scores = new Map<string, { total: number; count: number }>();
  for (const record of records) {
    if (record.score === null || !Number.isFinite(record.score)) continue;
    const bucket = scores.get(record.studentId) ?? { total: 0, count: 0 };
    bucket.total += record.score;
    bucket.count += 1;
    scores.set(record.studentId, bucket);
  }
  return new Map(
    [...scores.entries()].map(([studentId, bucket]) => [studentId, bucket.total / bucket.count]),
  );
}

function matchesNonDateFilters(
  record: AcademicReportData["records"][number],
  filters: Filters,
) {
  return (
    (!filters.careerId || record.careerId === filters.careerId) &&
    (!filters.specialty || record.specialty === filters.specialty) &&
    (!filters.semester ||
      String(record.studentSemester ?? record.subjectSemester ?? "") === filters.semester) &&
    (!filters.groupId || record.groupId === filters.groupId) &&
    (!filters.teacherId || record.teacherIds.includes(filters.teacherId)) &&
    (!filters.department || record.teacherDepartments.includes(filters.department)) &&
    (!filters.subjectId || record.subjectId === filters.subjectId) &&
    (!filters.periodId || record.periodId === filters.periodId) &&
    (filters.userRole === "all" ||
      filters.userRole === "alumno" ||
      (filters.userRole === "docente" && record.recordedBy !== null)) &&
    (filters.enrollmentStatus === "all" || record.enrollmentStatus === filters.enrollmentStatus) &&
    (filters.userStatus === "all" ||
      (filters.userStatus === "active" && record.studentActive === true) ||
      (filters.userStatus === "inactive" && record.studentActive === false))
  );
}

function filterRecords(
  records: AcademicReportData["records"],
  filters: Filters,
  includeDate = true,
) {
  const bounds = dateBounds(filters);
  const base = records.filter(
    (record) =>
      matchesNonDateFilters(record, filters) &&
      (!includeDate || isWithinDate(record.recordedAt, bounds)),
  );
  const averagesByStudent = studentAverages(base);

  return base.filter((record) => {
    if (filters.gradeStatus === "approved" && !(record.score !== null && record.score >= PASSING_SCORE)) return false;
    if (filters.gradeStatus === "failed" && !(record.score !== null && record.score < PASSING_SCORE)) return false;
    if (filters.performance !== "all") {
      const score = averagesByStudent.get(record.studentId);
      if (score === undefined) return false;
      if (filters.performance === "high" && score < HIGH_SCORE) return false;
      if (filters.performance === "regular" && (score < PASSING_SCORE || score >= HIGH_SCORE)) return false;
      if (filters.performance === "low" && score >= PASSING_SCORE) return false;
    }
    return true;
  });
}

function buildDetails(records: AcademicReportData["records"]): DetailRow[] {
  const groups = new Map<string, AcademicReportData["records"]>();
  for (const record of records) {
    const semester = record.studentSemester ?? record.subjectSemester;
    const key = [
      record.subjectId,
      record.recordedBy ?? record.teacherIds.join(","),
      record.careerId ?? "",
      semester ?? "",
      record.groupId,
    ].join("|");
    const bucket = groups.get(key);
    if (bucket) bucket.push(record);
    else groups.set(key, [record]);
  }

  return [...groups.entries()].map(([key, rows]) => {
    const first = rows[0];
    const teacher = first.recordedByName || first.teacherNames.join(", ") || "Sin docente asignado";
    const scores = rows.flatMap((row) =>
      row.score !== null && Number.isFinite(row.score) ? [row.score] : [],
    );
    return {
      key,
      subject: first.subjectName,
      teacher,
      career: first.careerName ?? "Sin carrera registrada",
      semester: first.studentSemester ?? first.subjectSemester,
      group: first.groupCode,
      students: new Set(rows.filter((row) => row.score !== null).map((row) => row.studentId)).size,
      evaluations: rows.length,
      average: average(scores),
      passed: scores.filter((score) => score >= PASSING_SCORE).length,
      failed: scores.filter((score) => score < PASSING_SCORE).length,
      approvalRate: scores.length
        ? (scores.filter((score) => score >= PASSING_SCORE).length / scores.length) * 100
        : null,
      failureRate: scores.length
        ? (scores.filter((score) => score < PASSING_SCORE).length / scores.length) * 100
        : null,
    };
  });
}

function sortRows(rows: DetailRow[], key: SortKey, direction: "asc" | "desc") {
  return [...rows].sort((a, b) => {
    const first = a[key];
    const second = b[key];
    const result =
      typeof first === "number" && typeof second === "number"
        ? first - second
        : String(first ?? "").localeCompare(String(second ?? ""), "es-MX", {
            numeric: true,
            sensitivity: "base",
          });
    return direction === "asc" ? result : -result;
  });
}

type TrendGranularity = "day" | "week" | "month";

function getTrendGranularity(range: DateRange, bounds: DateBounds): TrendGranularity {
  if (range === "day" || range === "week") return "day";
  if (range === "month") return "week";
  if (range !== "custom" || !bounds.from || !bounds.to) return "month";
  const start = new Date(`${bounds.from}T00:00:00Z`);
  const end = new Date(`${bounds.to}T00:00:00Z`);
  const days = Math.ceil((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return days <= 45 ? "day" : days <= 180 ? "week" : "month";
}

function trendLabel(date: string, granularity: TrendGranularity) {
  const day = date.slice(0, 10);
  const parsed = new Date(`${day}T00:00:00Z`);
  if (granularity === "month") return day.slice(0, 7);
  if (granularity === "week") return `${String(parsed.getUTCDate()).padStart(2, "0")}/${day.slice(5, 7)}`;
  return day.slice(5);
}

function trendKey(date: string, granularity: TrendGranularity) {
  const day = date.slice(0, 10);
  if (granularity === "day") return day;
  if (granularity === "week") {
    const parsed = new Date(`${day}T00:00:00Z`);
    const monday = new Date(parsed);
    monday.setUTCDate(parsed.getUTCDate() - ((parsed.getUTCDay() + 6) % 7));
    return monday.toISOString().slice(0, 10);
  }
  return day.slice(0, 7);
}

function downloadCsv(rows: DetailRow[], generatedAt: Date) {
  const columns = [
    ["Materia", "subject"],
    ["Docente", "teacher"],
    ["Carrera", "career"],
    ["Semestre", "semester"],
    ["Grupo", "group"],
    ["Estudiantes evaluados", "students"],
    ["Evaluaciones", "evaluations"],
    ["Promedio", "average"],
    ["Aprobatorias", "passed"],
    ["Reprobatorias", "failed"],
    ["Porcentaje de aprobación", "approvalRate"],
    ["Porcentaje de reprobación", "failureRate"],
  ] as const;
  const quote = (value: string | number | null) => {
    const raw = String(value ?? "");
    const safe = /^[\t\r\n ]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const content = [
    columns.map(([label]) => quote(label)).join(","),
    ...rows.map((row) =>
      columns
        .map(([, key]) => {
          const value = row[key];
          return quote(
            typeof value === "number"
              ? key === "approvalRate" || key === "failureRate"
                ? `${value.toFixed(2)}%`
                : key === "average"
                  ? value.toFixed(2)
                  : value
              : value,
          );
        })
        .join(","),
    ),
  ].join("\r\n");
  const blob = new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `reporte-estadistico-${localDate(generatedAt)}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function AcademicReports({
  scope,
  records,
  students,
  teachers,
  subjects,
  careers,
  periods,
}: {
  scope: Scope;
  records: AcademicReportData["records"];
  students: AcademicReportData["students"];
  teachers: AcademicReportData["teachers"];
  subjects: AcademicReportData["subjects"];
  careers: AcademicReportData["careers"];
  periods: AcademicReportData["periods"];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Filters>(emptyFilters);
  const [applied, setApplied] = useState<Filters>(emptyFilters);
  const [filterError, setFilterError] = useState("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("subject");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const filteredRecords = useMemo(() => filterRecords(records, applied), [records, applied]);
  const details = useMemo(() => buildDetails(filteredRecords), [filteredRecords]);
  const searchable = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("es-MX");
    if (!normalized) return details;
    return details.filter((row) =>
      [row.subject, row.teacher, row.career, row.group, String(row.semester ?? "")]
        .join(" ")
        .toLocaleLowerCase("es-MX")
        .includes(normalized),
    );
  }, [details, search]);
  const sortedDetails = useMemo(
    () => sortRows(searchable, sortKey, sortDirection),
    [searchable, sortKey, sortDirection],
  );
  const pageCount = Math.max(1, Math.ceil(sortedDetails.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageRows = sortedDetails.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const scored = filteredRecords.filter(
    (record) => record.score !== null && Number.isFinite(record.score),
  );
  const scores = scored.map((record) => record.score as number);
  const generalAverage = average(scores);
  const passed = scores.filter((score) => score >= PASSING_SCORE).length;
  const failed = scores.length - passed;
  const passRate = scores.length ? (passed / scores.length) * 100 : null;
  const perStudent = studentAverages(filteredRecords);
  const highPerformers = [...perStudent.values()].filter((score) => score >= HIGH_SCORE).length;
  const lowPerformers = [...perStudent.values()].filter((score) => score < PASSING_SCORE).length;
  const bounds = dateBounds(applied);
  const previousBounds = getPreviousBounds(bounds);
  const previousRecords = previousBounds
    ? filterRecords(records, {
        ...applied,
        range: "custom",
        from: previousBounds.from ?? "",
        to: previousBounds.to ?? "",
      })
    : [];
  const previousScores = previousRecords.flatMap((record) =>
    record.score !== null && Number.isFinite(record.score) ? [record.score] : [],
  );
  const previousAverage = average(previousScores);
  const averageComparison: Comparison | undefined =
    generalAverage !== null && previousAverage !== null
      ? previousAverage === 0
        ? { change: generalAverage - previousAverage, suffix: " pts vs. anterior" }
        : {
            change: ((generalAverage - previousAverage) / previousAverage) * 100,
            suffix: "% vs. anterior",
          }
      : undefined;
  const previousPassRate = previousScores.length
    ? (previousScores.filter((score) => score >= PASSING_SCORE).length / previousScores.length) * 100
    : null;
  const passRateComparison: Comparison | undefined =
    passRate !== null && previousPassRate !== null
      ? { change: passRate - previousPassRate, suffix: " pp vs. anterior" }
      : undefined;
  const previousStudentsByAverage = studentAverages(previousRecords);
  const previousHighPerformers = [...previousStudentsByAverage.values()]
    .filter((score) => score >= HIGH_SCORE).length;
  const previousLowPerformers = [...previousStudentsByAverage.values()]
    .filter((score) => score < PASSING_SCORE).length;
  const registrationFilters = applied;
  const matchingStudents = students.filter(
    (student) =>
      (!registrationFilters.careerId || student.careerId === registrationFilters.careerId) &&
      (!registrationFilters.specialty || student.specialty === registrationFilters.specialty) &&
      (!registrationFilters.semester ||
        String(student.semester ?? "") === registrationFilters.semester) &&
      isWithinDate(student.createdAt, bounds) &&
      (registrationFilters.userStatus === "all" ||
        (registrationFilters.userStatus === "active" && student.active === true) ||
        (registrationFilters.userStatus === "inactive" && student.active === false)),
  );
  const matchingTeachers = teachers.filter(
    (teacher) =>
      (!registrationFilters.teacherId || teacher.id === registrationFilters.teacherId) &&
      isWithinDate(teacher.createdAt, bounds) &&
      (!registrationFilters.userStatus ||
        registrationFilters.userStatus === "all" ||
        (registrationFilters.userStatus === "active" && teacher.active === true) ||
        (registrationFilters.userStatus === "inactive" && teacher.active === false)),
  );
  const previousStudents = previousBounds
    ? students.filter(
        (student) =>
          (!registrationFilters.careerId || student.careerId === registrationFilters.careerId) &&
          (!registrationFilters.specialty || student.specialty === registrationFilters.specialty) &&
          (!registrationFilters.semester ||
            String(student.semester ?? "") === registrationFilters.semester) &&
          isWithinDate(student.createdAt, previousBounds) &&
          (registrationFilters.userStatus === "all" ||
            (registrationFilters.userStatus === "active" && student.active === true) ||
            (registrationFilters.userStatus === "inactive" && student.active === false)),
      )
    : [];
  const previousTeachers = previousBounds
    ? teachers.filter(
        (teacher) =>
          (!registrationFilters.teacherId || teacher.id === registrationFilters.teacherId) &&
          isWithinDate(teacher.createdAt, previousBounds) &&
          (registrationFilters.userStatus === "all" ||
            (registrationFilters.userStatus === "active" && teacher.active === true) ||
            (registrationFilters.userStatus === "inactive" && teacher.active === false)),
      )
    : [];
  const scopedSubjectIds = new Set(records.map((record) => record.subjectId));
  const matchingSubjects = subjects.filter(
    (subject) =>
      (!registrationFilters.careerId || subject.career_id === registrationFilters.careerId) &&
      (!registrationFilters.semester ||
        String(subject.semester ?? "") === registrationFilters.semester) &&
      (!registrationFilters.subjectId || subject.id === registrationFilters.subjectId) &&
      isWithinDate(subject.created_at, bounds) &&
      (scope !== "docente" || scopedSubjectIds.has(subject.id)),
  );
  const previousSubjects = previousBounds
    ? subjects.filter(
        (subject) =>
          (!registrationFilters.careerId || subject.career_id === registrationFilters.careerId) &&
          (!registrationFilters.semester ||
            String(subject.semester ?? "") === registrationFilters.semester) &&
          (!registrationFilters.subjectId || subject.id === registrationFilters.subjectId) &&
          isWithinDate(subject.created_at, previousBounds) &&
          (scope !== "docente" || scopedSubjectIds.has(subject.id)),
      )
    : [];
  const countComparison = (current: number, previous: number): Comparison => ({
    change: current - previous,
    suffix: " vs. anterior",
    digits: 0,
  });
  const evaluationComparison: Comparison | undefined = previousBounds
    ? countComparison(filteredRecords.length, previousRecords.length)
    : undefined;
  const highComparison: Comparison | undefined = previousBounds && scores.length
    ? countComparison(highPerformers, previousHighPerformers)
    : undefined;
  const lowComparison: Comparison | undefined = previousBounds && scores.length
    ? { ...countComparison(lowPerformers, previousLowPerformers), invert: true }
    : undefined;
  const studentKpiCurrent = scope === "administrador" ? matchingStudents.length : perStudent.size;
  const previousStudentCount =
    scope === "administrador" ? previousStudents.length : previousStudentsByAverage.size;
  const studentComparison = previousBounds
    ? countComparison(studentKpiCurrent, previousStudentCount)
    : undefined;
  const teacherComparison = previousBounds
    ? countComparison(matchingTeachers.length, previousTeachers.length)
    : undefined;
  const subjectComparison = previousBounds
    ? countComparison(matchingSubjects.length, previousSubjects.length)
    : undefined;
  const averageBySubject = useMemo(() => {
    const buckets = new Map<string, { name: string; scores: number[] }>();
    for (const record of filteredRecords) {
      if (record.score === null) continue;
      const bucket = buckets.get(record.subjectId) ?? {
        name: record.subjectName,
        scores: [],
      };
      bucket.scores.push(record.score);
      buckets.set(record.subjectId, bucket);
    }
    return [...buckets.values()]
      .map((bucket) => ({
        label: bucket.name,
        average: average(bucket.scores) ?? 0,
        count: bucket.scores.length,
      }))
      .sort((a, b) => a.average - b.average);
  }, [filteredRecords]);
  const averageByTeacher = useMemo(() => {
    const buckets = new Map<string, { name: string; scores: number[] }>();
    for (const record of filteredRecords) {
      if (record.score === null || !record.recordedBy) continue;
      const name =
        record.recordedByName ??
        teachers.find((teacher) => teacher.id === record.recordedBy)?.name ??
        "Docente";
      const bucket = buckets.get(record.recordedBy) ?? { name, scores: [] };
      bucket.scores.push(record.score);
      buckets.set(record.recordedBy, bucket);
    }
    return [...buckets.values()]
      .map((bucket) => ({
        label: bucket.name,
        average: average(bucket.scores) ?? 0,
        count: bucket.scores.length,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }, [filteredRecords, teachers]);
  const trend = useMemo(() => {
    const granularity = getTrendGranularity(applied.range, bounds);
    const buckets = new Map<string, { label: string; scores: number[] }>();
    for (const record of filteredRecords) {
      if (record.score === null) continue;
      const key = trendKey(record.recordedAt, granularity);
      const bucket = buckets.get(key) ?? {
        label: trendLabel(record.recordedAt, granularity),
        scores: [],
      };
      bucket.scores.push(record.score);
      buckets.set(key, bucket);
    }
    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([, bucket]) => ({
        label: bucket.label,
        average: average(bucket.scores) ?? 0,
        count: bucket.scores.length,
      }));
  }, [filteredRecords, applied.range, bounds]);
  const semesterAverages = useMemo(() => {
    const buckets = new Map<number, number[]>();
    for (const record of filteredRecords) {
      const semester = record.studentSemester ?? record.subjectSemester;
      if (!semester || record.score === null) continue;
      const values = buckets.get(semester);
      if (values) values.push(record.score);
      else buckets.set(semester, [record.score]);
    }
    return [...buckets.entries()]
      .sort(([a], [b]) => a - b)
      .map(([semester, values]) => ({
        label: `${semester}°`,
        average: average(values) ?? 0,
        count: values.length,
      }));
  }, [filteredRecords]);
  const distribution = [
    { label: "0–59", min: 0, max: 60 },
    { label: "60–69", min: 60, max: 70 },
    { label: "70–79", min: 70, max: 80 },
    { label: "80–89", min: 80, max: 90 },
    { label: "90–100", min: 90, max: 101 },
  ].map((range) => ({
    ...range,
    count: scores.filter((score) => score >= range.min && score < range.max).length,
  }));
  const heatmap = useMemo(() => {
    const semesters = Array.from({ length: 13 }, (_, index) => index + 1);
    const subjectBuckets = new Map<
      string,
      { name: string; scoresBySemester: Map<number, number[]> }
    >();
    for (const record of filteredRecords) {
      const semester = record.studentSemester ?? record.subjectSemester;
      if (!semester || record.score === null) continue;
      const bucket = subjectBuckets.get(record.subjectId) ?? {
        name: record.subjectName,
        scoresBySemester: new Map<number, number[]>(),
      };
      const values = bucket.scoresBySemester.get(semester);
      if (values) values.push(record.score);
      else bucket.scoresBySemester.set(semester, [record.score]);
      subjectBuckets.set(record.subjectId, bucket);
    }
    const subjectsWithGrades = [...subjectBuckets.entries()]
      .map(([id, value]) => ({ id, ...value }))
      .sort((a, b) => a.name.localeCompare(b.name, "es-MX"))
      .slice(0, 12);
    return { semesters, subjects: subjectsWithGrades };
  }, [filteredRecords]);
  const conclusions = useMemo(() => {
    if (!scores.length) return ["No hay evaluaciones con calificación para generar conclusiones en esta selección."];
    const statements = [
      `El promedio de las ${scores.length} evaluaciones con calificación es ${formatNumber(generalAverage ?? 0)} / 100.`,
    ];
    if (passRate !== null) {
      statements.push(
        `${formatNumber(passRate, 1)}% de las evaluaciones son aprobatorias y ${formatNumber(100 - passRate, 1)}% reprobatorias, usando el umbral de ${PASSING_SCORE}.`,
      );
    }
    if (averageBySubject.length > 1) {
      const lowest = averageBySubject[0];
      const highest = averageBySubject[averageBySubject.length - 1];
      statements.push(
        `${lowest.label} presenta el promedio menor (${formatNumber(lowest.average)}); ${highest.label} presenta el mayor (${formatNumber(highest.average)}).`,
      );
    }
    return statements;
  }, [averageBySubject, generalAverage, passRate, scores.length]);
  const generatedAt = new Date();
  const activePeriod = applied.periodId
    ? periods.find((period) => period.id === applied.periodId)?.name
    : "Todos los periodos";
  const activeCareer = applied.careerId
    ? careers.find((career) => career.id === applied.careerId)?.name
    : "Todas las carreras";
  const activeSubject = applied.subjectId
    ? subjects.find((subject) => subject.id === applied.subjectId)?.name
    : "Todas las materias";
  const activeTeacher = applied.teacherId
    ? teachers.find((teacher) => teacher.id === applied.teacherId)?.name
    : "Todos los docentes";
  const activeGroup = applied.groupId
    ? records.find((record) => record.groupId === applied.groupId)?.groupCode
    : "Todos los grupos";
  const currentPeriodLabel =
    bounds.from && bounds.to
      ? `${bounds.from} al ${bounds.to}`
      : applied.range === "all"
        ? "Todo el historial disponible"
        : "Rango seleccionado";
  const filterSummary = [
    `Periodo: ${currentPeriodLabel}`,
    `Carrera: ${activeCareer}`,
    `Especialidad: ${applied.specialty || "Todas"}`,
    `Semestre: ${applied.semester || "Todos"}`,
    `Grupo: ${activeGroup}`,
    `Docente: ${activeTeacher}`,
    `Materia: ${activeSubject}`,
    `Área académica: ${applied.department || "Todas"}`,
    `Periodo escolar: ${activePeriod}`,
    `Tipo de usuario relacionado: ${applied.userRole === "all" ? "Todos" : applied.userRole}`,
    `Estado de actividad académica: ${applied.enrollmentStatus === "all" ? "Todos" : applied.enrollmentStatus}`,
    `Usuario: ${applied.userStatus === "all" ? "Todos" : applied.userStatus === "active" ? "Activos" : "Inactivos"}`,
    `Evaluación: ${applied.gradeStatus === "all" ? "Todas" : applied.gradeStatus === "approved" ? "Aprobatoria" : "Reprobatoria"}`,
    `Índice: ${applied.performance === "all" ? "Todos" : applied.performance === "high" ? "Destacado" : applied.performance === "regular" ? "Regular" : "Bajo"}`,
  ];

  useEffect(() => {
    setLoading(false);
  }, [records]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      draft.range === "custom" &&
      (!draft.from || !draft.to || draft.from > draft.to)
    ) {
      setFilterError("Selecciona un rango de fechas válido; la fecha inicial debe ser anterior a la final.");
      return;
    }
    setFilterError("");
    setPage(1);
    setExpandedKey(null);
    setApplied(draft);
  }

  function resetFilters() {
    setDraft(emptyFilters);
    setApplied(emptyFilters);
    setFilterError("");
    setSearch("");
    setPage(1);
    setExpandedKey(null);
  }

  function sortBy(key: SortKey) {
    if (sortKey === key) setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }

  async function refreshData() {
    setLoading(true);
    router.refresh();
  }

  function printReport() {
    const originalTitle = document.title;
    document.title = `Reporte estadístico académico - ${localDate(generatedAt)}`;
    window.addEventListener(
      "afterprint",
      () => {
        document.title = originalTitle;
      },
      { once: true },
    );
    window.print();
  }

  const hasData = records.length > 0;
  const subjectChart =
    averageBySubject.length > 12
      ? [...averageBySubject.slice(0, 6), ...averageBySubject.slice(-6)]
      : averageBySubject;
  const registerCaption =
    scope === "administrador"
      ? "Registros en el padrón según los filtros de organización."
      : "Integrantes visibles en tus grupos asignados.";

  return (
    <div className={styles.reportPage} data-report-scope={scope}>
      <div className={styles.printOnly} aria-hidden="true">
        <strong>Instituto Tecnológico de San Luis Potosí</strong>
        <span>Reporte Estadístico Académico</span>
        <span>{currentPeriodLabel} · {new Date().toLocaleString("es-MX")}</span>
        <span>{filterSummary.join(" · ")}</span>
      </div>
      <header className={styles.reportHeader}>
        <div>
          <h2>Reporte estadístico académico</h2>
          <p>
            {scope === "administrador"
              ? "Lectura consolidada de evaluaciones y actividad académica registrada."
              : "Indicadores de evaluaciones y grupos que tienes asignados."}
          </p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.secondaryButton} onClick={printReport}>
            <Printer size={16} aria-hidden="true" />
            Descargar PDF
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => downloadCsv(sortedDetails, generatedAt)}
            disabled={!sortedDetails.length}
          >
            <FileSpreadsheet size={16} aria-hidden="true" />
            Exportar CSV
          </button>
        </div>
      </header>

      <section className={styles.filters} aria-labelledby="report-filters-title">
        <div className={styles.filterHeading}>
          <div>
            <h3 id="report-filters-title">Filtros</h3>
            <p>Combina criterios; los resultados se actualizan al aplicar.</p>
          </div>
          <Filter size={18} aria-hidden="true" />
        </div>
        <form onSubmit={applyFilters}>
          <div className={styles.filterGrid}>
            <label>
              <span>Rango temporal</span>
              <select
                value={draft.range}
                onChange={(event) => {
                  const range = event.target.value as DateRange;
                  setDraft((current) => ({ ...current, range, ...presetDates(range) }));
                }}
              >
                <option value="all">Todo el historial</option>
                <option value="day">Diario · hoy</option>
                <option value="week">Semanal · semana actual</option>
                <option value="month">Mensual · mes actual</option>
                <option value="year">Anual · año actual</option>
                <option value="custom">Rango personalizado</option>
              </select>
            </label>
            <label>
              <span>Fecha inicial</span>
              <input
                type="date"
                value={draft.from}
                disabled={draft.range !== "custom"}
                onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))}
              />
            </label>
            <label>
              <span>Fecha final</span>
              <input
                type="date"
                value={draft.to}
                disabled={draft.range !== "custom"}
                onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))}
              />
            </label>
            <label>
              <span>Carrera</span>
              <select
                value={draft.careerId}
                onChange={(event) => setDraft((current) => ({ ...current, careerId: event.target.value }))}
              >
                <option value="">Todas las carreras</option>
                {careers.map((career) => (
                  <option key={career.id} value={career.id}>{career.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Especialidad</span>
              <select
                value={draft.specialty}
                onChange={(event) => setDraft((current) => ({ ...current, specialty: event.target.value }))}
              >
                <option value="">Todas las especialidades</option>
                {[...new Set(records.map((record) => record.specialty).filter((value): value is string => Boolean(value)))]
                  .sort((a, b) => a.localeCompare(b, "es-MX"))
                  .map((specialty) => <option key={specialty} value={specialty}>{specialty}</option>)}
              </select>
            </label>
            <label>
              <span>Semestre</span>
              <select
                value={draft.semester}
                onChange={(event) => setDraft((current) => ({ ...current, semester: event.target.value }))}
              >
                <option value="">Todos los semestres</option>
                {Array.from({ length: 13 }, (_, index) => index + 1).map((semester) => (
                  <option key={semester} value={semester}>{semester}° semestre</option>
                ))}
              </select>
            </label>
            <label>
              <span>Grupo</span>
              <select
                value={draft.groupId}
                onChange={(event) => setDraft((current) => ({ ...current, groupId: event.target.value }))}
              >
                <option value="">Todos los grupos</option>
                {[...new Map(records.map((record) => [record.groupId, record.groupCode])).entries()]
                  .sort(([, a], [, b]) => a.localeCompare(b, "es-MX", { numeric: true }))
                  .map(([id, code]) => <option key={id} value={id}>{code}</option>)}
              </select>
            </label>
            <label>
              <span>Docente</span>
              <select
                value={draft.teacherId}
                onChange={(event) => setDraft((current) => ({ ...current, teacherId: event.target.value }))}
              >
                <option value="">Todos los docentes</option>
                {teachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>{teacher.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Área académica</span>
              <select
                value={draft.department}
                onChange={(event) => setDraft((current) => ({ ...current, department: event.target.value }))}
              >
                <option value="">Todas las áreas</option>
                {[...new Set(records.flatMap((record) => record.teacherDepartments))]
                  .filter(Boolean)
                  .sort((a, b) => a.localeCompare(b, "es-MX"))
                  .map((department) => <option key={department} value={department}>{department}</option>)}
              </select>
            </label>
            <label>
              <span>Materia registrada</span>
              <select
                value={draft.subjectId}
                onChange={(event) => setDraft((current) => ({ ...current, subjectId: event.target.value }))}
              >
                <option value="">Todas las materias</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>{subject.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Periodo escolar</span>
              <select
                value={draft.periodId}
                onChange={(event) => setDraft((current) => ({ ...current, periodId: event.target.value }))}
              >
                <option value="">Todos los periodos</option>
                {periods.map((period) => (
                  <option key={period.id} value={period.id}>
                    {period.name}{period.is_current ? " · actual" : ""}
                  </option>
                ))}
              </select>
            </label>
            {scope === "administrador" && (
              <label>
                <span>Tipo de usuario relacionado</span>
                <select
                  value={draft.userRole}
                  onChange={(event) => setDraft((current) => ({ ...current, userRole: event.target.value as UserRoleFilter }))}
                >
                  <option value="all">Todos los roles relacionados</option>
                  <option value="alumno">Estudiante evaluado</option>
                  <option value="docente">Docente que capturó</option>
                  <option value="administrador" disabled>Administrador · sin vínculo en calificaciones</option>
                </select>
              </label>
            )}
            {scope === "administrador" && (
              <label>
                <span>Estado de usuario</span>
                <select
                  value={draft.userStatus}
                  onChange={(event) => setDraft((current) => ({ ...current, userStatus: event.target.value as UserStatus }))}
                >
                  <option value="all">Activos e inactivos</option>
                  <option value="active">Solo activos</option>
                  <option value="inactive">Solo inactivos</option>
                </select>
              </label>
            )}
            <label>
              <span>Estatus de evaluación</span>
              <select
                value={draft.gradeStatus}
                onChange={(event) => setDraft((current) => ({ ...current, gradeStatus: event.target.value as GradeStatus }))}
              >
                <option value="all">Todas las calificaciones</option>
                <option value="approved">Aprobatorias · ≥70</option>
                <option value="failed">Reprobatorias · &lt;70</option>
              </select>
            </label>
            <label>
              <span>Estado de actividad académica</span>
              <select
                value={draft.enrollmentStatus}
                onChange={(event) => setDraft((current) => ({ ...current, enrollmentStatus: event.target.value as EnrollmentFilter }))}
              >
                <option value="all">Todos los estados</option>
                <option value="active">Inscripción activa</option>
                <option value="withdrawn">Inscripción retirada</option>
                <option value="completed">Inscripción concluida</option>
              </select>
            </label>
            <label>
              <span>Índice de rendimiento</span>
              <select
                value={draft.performance}
                onChange={(event) => setDraft((current) => ({ ...current, performance: event.target.value as PerformanceBand }))}
              >
                <option value="all">Todos los índices</option>
                <option value="high">Destacado · promedio ≥90</option>
                <option value="regular">Regular · promedio 70–89.9</option>
                <option value="low">Bajo · promedio &lt;70</option>
              </select>
            </label>
          </div>
          {filterError && <p className={styles.filterError} role="alert">{filterError}</p>}
          <div className={styles.filterActions}>
            <button type="submit" className={styles.primaryButton}>
              <Check size={16} aria-hidden="true" />
              Aplicar filtros
            </button>
            <button type="button" className={styles.tertiaryButton} onClick={resetFilters}>
              Limpiar filtros
            </button>
            <button
              type="button"
              className={styles.tertiaryButton}
              onClick={refreshData}
              disabled={loading}
            >
              <RotateCw size={15} className={loading ? styles.spinning : ""} aria-hidden="true" />
              {loading ? "Actualizando…" : "Actualizar información"}
            </button>
          </div>
        </form>
      </section>

      {!hasData ? (
        <section className={styles.emptyState} aria-live="polite">
          <div className={styles.emptyIcon}><Activity size={22} aria-hidden="true" /></div>
          <h3>Aún no hay evaluaciones registradas</h3>
          <p>Los indicadores y las gráficas aparecerán cuando existan calificaciones vinculadas a inscripciones y grupos.</p>
        </section>
      ) : (
        <>
          <section aria-labelledby="report-indicators-title">
            <div className={styles.sectionHeading}>
              <div>
                <h3 id="report-indicators-title">Indicadores principales</h3>
                <p>{scope === "administrador" ? registerCaption : "Datos limitados por las asignaciones docentes y las políticas RLS."}</p>
              </div>
              <span className={styles.updated}><CalendarDays size={14} aria-hidden="true" /> Captura de calificación</span>
            </div>
            <div className={styles.kpiGrid}>
              <Kpi
                icon={<GraduationCap size={17} aria-hidden="true" />}
                label={scope === "administrador" ? "Estudiantes registrados" : "Estudiantes evaluados"}
                value={studentKpiCurrent}
                detail={scope === "administrador" ? "Según periodo, carrera, semestre y estatus" : "En los grupos con datos visibles"}
                comparison={studentComparison}
              />
              <Kpi
                icon={<Users size={17} aria-hidden="true" />}
                label={scope === "administrador" ? "Docentes registrados" : "Docentes asignados"}
                value={matchingTeachers.length}
                detail={scope === "administrador" ? "Padrón de docentes" : "Vínculos visibles en tus grupos"}
                comparison={teacherComparison}
              />
              <Kpi
                icon={<BookOpen size={17} aria-hidden="true" />}
                label="Materias registradas"
                value={matchingSubjects.length}
                detail="Catálogo según periodo, carrera y semestre"
                comparison={subjectComparison}
              />
              <Kpi
                icon={<Activity size={17} aria-hidden="true" />}
                label="Promedio académico"
                value={generalAverage === null ? "—" : formatNumber(generalAverage)}
                detail={scores.length ? `De ${scores.length} calificaciones con valor` : "Sin calificaciones numéricas"}
                comparison={averageComparison}
              />
              <Kpi
                icon={<Check size={17} aria-hidden="true" />}
                label="Índice de aprobación"
                value={passRate === null ? "—" : `${formatNumber(passRate)}%`}
                detail={scores.length ? `${passed} aprobatorias de ${scores.length}` : "Sin base de cálculo"}
                comparison={passRateComparison}
              />
              <Kpi
                icon={<Activity size={17} aria-hidden="true" />}
                label="Evaluaciones registradas"
                value={filteredRecords.length}
                detail={`${scored.length} con calificación numérica`}
                comparison={evaluationComparison}
              />
              <Kpi
                icon={<GraduationCap size={17} aria-hidden="true" />}
                label="Rendimiento destacado"
                value={scores.length ? highPerformers : "—"}
                detail={`Promedio individual ≥${HIGH_SCORE}`}
                comparison={highComparison}
              />
              <Kpi
                icon={<GraduationCap size={17} aria-hidden="true" />}
                label="Bajo rendimiento"
                value={scores.length ? lowPerformers : "—"}
                detail={`Promedio individual <${PASSING_SCORE}`}
                comparison={lowComparison}
              />
            </div>
            <div className={styles.metricNotes}>
              <span><Info size={15} aria-hidden="true" /> Índice de reprobación: {passRate === null ? "sin datos suficientes" : `${formatNumber(100 - passRate)}% (${failed} evaluaciones)`}.</span>
              <span><Info size={15} aria-hidden="true" /> Cumplimiento académico no calculable: no existe un registro de requisitos o créditos cursados contra el plan.</span>
              <span><Info size={15} aria-hidden="true" /> El semestre corresponde al dato actual del perfil; el esquema no conserva el semestre histórico de cada inscripción.</span>
              {scope === "administrador" && (
                <span><Info size={15} aria-hidden="true" /> Para comparar promedios se requiere un rango temporal y evaluaciones en ambos periodos.</span>
              )}
            </div>
          </section>

          <section className={styles.chartSection} aria-labelledby="report-charts-title">
            <div className={styles.sectionHeading}>
              <div>
                <h3 id="report-charts-title">Análisis académico</h3>
                <p>Las visualizaciones usan únicamente calificaciones disponibles en la selección.</p>
              </div>
            </div>
            <div className={styles.chartsGrid}>
              <ChartPanel title="Evolución del promedio" subtitle="Promedio por fecha de captura, hasta 12 periodos" className={styles.chartWide}>
                <LineChart data={trend} />
              </ChartPanel>
              <ChartPanel title="Aprobación y reprobación" subtitle="Porcentaje de evaluaciones con calificación">
                <DonutChart passed={passed} failed={failed} />
              </ChartPanel>
              <ChartPanel title="Rendimiento por materia" subtitle="Materias con mejores y menores promedios; se indica su volumen">
                <BarChart data={subjectChart} horizontal />
              </ChartPanel>
              <ChartPanel title="Rendimiento por docente" subtitle="Calificaciones capturadas por docente; se indica su volumen">
                {averageByTeacher.length ? (
                  <BarChart data={averageByTeacher} />
                ) : (
                  <ChartEmpty message="No hay evaluaciones atribuibles a un docente en el periodo." />
                )}
              </ChartPanel>
              <ChartPanel title="Rendimiento por semestre" subtitle="Promedio del alumnado según semestre registrado">
                <BarChart data={semesterAverages} />
              </ChartPanel>
              <ChartPanel title="Distribución de calificaciones" subtitle="Frecuencia de evaluaciones en cada intervalo">
                <DistributionChart data={distribution} />
              </ChartPanel>
              <ChartPanel title="Mapa de calor académico" subtitle="Promedio de materia por semestre del estudiante" className={styles.chartWide}>
                <Heatmap data={heatmap} />
              </ChartPanel>
            </div>
          </section>

          <section className={styles.analysis} aria-labelledby="report-conclusions-title">
            <div>
              <h3 id="report-conclusions-title">Lecturas del periodo</h3>
              <p>Observaciones calculadas automáticamente a partir de la selección actual.</p>
            </div>
            <ul>{conclusions.map((conclusion) => <li key={conclusion}>{conclusion}</li>)}</ul>
          </section>
        </>
      )}

      <section className={styles.tableSection} aria-labelledby="report-table-title">
        <div className={styles.tableHeading}>
          <div>
            <h3 id="report-table-title">Detalle por materia, docente y grupo</h3>
            <p>{sortedDetails.length} combinaciones encontradas con los filtros actuales.</p>
          </div>
          <label className={styles.searchBox}>
            <Search size={16} aria-hidden="true" />
            <span className={styles.srOnly}>Buscar registros</span>
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Buscar materia, docente, grupo…"
            />
          </label>
        </div>
        <div className={styles.tableScroll}>
          <table>
            <thead>
              <tr>
                <SortHeader label="Materia" sortKey="subject" current={sortKey} direction={sortDirection} onSort={sortBy} />
                <SortHeader label="Docente" sortKey="teacher" current={sortKey} direction={sortDirection} onSort={sortBy} />
                <SortHeader label="Carrera" sortKey="career" current={sortKey} direction={sortDirection} onSort={sortBy} />
                <SortHeader label="Semestre" sortKey="semester" current={sortKey} direction={sortDirection} onSort={sortBy} />
                <SortHeader label="Grupo" sortKey="group" current={sortKey} direction={sortDirection} onSort={sortBy} />
                <SortHeader label="Estudiantes" sortKey="students" current={sortKey} direction={sortDirection} onSort={sortBy} />
                <SortHeader label="Evaluaciones" sortKey="evaluations" current={sortKey} direction={sortDirection} onSort={sortBy} />
                <SortHeader label="Promedio" sortKey="average" current={sortKey} direction={sortDirection} onSort={sortBy} />
                <SortHeader label="Aprobatorias" sortKey="passed" current={sortKey} direction={sortDirection} onSort={sortBy} />
                <SortHeader label="Reprobatorias" sortKey="failed" current={sortKey} direction={sortDirection} onSort={sortBy} />
                <SortHeader label="% aprob." sortKey="approvalRate" current={sortKey} direction={sortDirection} onSort={sortBy} />
                <SortHeader label="% reprob." sortKey="failureRate" current={sortKey} direction={sortDirection} onSort={sortBy} />
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => (
                <FragmentRow
                  key={row.key}
                  row={row}
                  expanded={expandedKey === row.key}
                  onToggle={() => setExpandedKey(expandedKey === row.key ? null : row.key)}
                />
              ))}
              {!pageRows.length && (
                <tr><td className={styles.noRows} colSpan={12}>No hay resultados que coincidan con los filtros y la búsqueda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className={styles.tableFooter}>
          <span>
            {sortedDetails.length
              ? `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, sortedDetails.length)} de ${sortedDetails.length}`
              : "0 resultados"}
          </span>
          <label>
            Filas
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
            >
              {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
            por página
          </label>
          <div className={styles.pagination}>
            <button type="button" aria-label="Página anterior" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <span>{currentPage} / {pageCount}</span>
            <button type="button" aria-label="Página siguiente" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>

      <footer className={styles.reportFooter}>
        <span>Fuente: registros académicos de Supabase sujetos a RLS.</span>
        <span>Generado: {generatedAt.toLocaleString("es-MX")}</span>
      </footer>

    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  detail,
  comparison,
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
  detail: string;
  comparison?: Comparison;
}) {
  return (
    <article className={styles.kpi}>
      <div className={styles.kpiTop}>
        <span className={styles.kpiIcon}>{icon}</span>
        {comparison && (
          <span className={`${styles.comparison} ${(comparison.invert ? comparison.change <= 0 : comparison.change >= 0) ? styles.positive : styles.negative}`}>
            {comparison.change >= 0 ? <ArrowUp size={13} aria-hidden="true" /> : <ArrowDown size={13} aria-hidden="true" />}
            {comparison.change >= 0 ? "+" : "−"}
            {formatNumber(Math.abs(comparison.change), comparison.digits ?? 1)}{comparison.suffix}
          </span>
        )}
      </div>
      <span className={styles.kpiLabel}>{label}</span>
      <strong className={styles.kpiValue}>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function ChartPanel({
  title,
  subtitle,
  className,
  children,
}: {
  title: string;
  subtitle: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <article className={`${styles.chartPanel} ${className ?? ""}`}>
      <div className={styles.chartTitle}>
        <h4>{title}</h4>
        <p>{subtitle}</p>
      </div>
      {children}
    </article>
  );
}

function ChartEmpty({ message }: { message: string }) {
  return <div className={styles.chartEmpty}>{message}</div>;
}

function LineChart({ data }: { data: Array<{ label: string; average: number; count: number }> }) {
  if (!data.length) return <ChartEmpty message="No hay evaluaciones con calificación en los periodos seleccionados." />;
  const width = 620;
  const height = 220;
  const padding = { top: 16, right: 18, bottom: 34, left: 36 };
  const values = data.map((item) => item.average);
  const minimum = Math.max(0, Math.floor(Math.min(...values) / 10) * 10 - 10);
  const maximum = Math.min(100, Math.ceil(Math.max(...values) / 10) * 10 + 10);
  const spread = Math.max(10, maximum - minimum);
  const x = (index: number) =>
    padding.left + (index * (width - padding.left - padding.right)) / Math.max(data.length - 1, 1);
  const y = (value: number) =>
    padding.top + ((maximum - value) * (height - padding.top - padding.bottom)) / spread;
  const points = data.map((item, index) => `${x(index)},${y(item.average)}`).join(" ");
  return (
    <div className={styles.svgChart} role="img" aria-label={`Evolución del promedio: ${data.map((item) => `${item.label}, ${formatNumber(item.average)} de 100`).join("; ")}`}>
      <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        {[0, 1, 2, 3].map((line) => {
          const value = maximum - (spread * line) / 3;
          const lineY = y(value);
          return (
            <g key={line}>
              <line className={styles.gridLine} x1={padding.left} y1={lineY} x2={width - padding.right} y2={lineY} />
              <text className={styles.axisText} x={padding.left - 8} y={lineY + 4} textAnchor="end">{Math.round(value)}</text>
            </g>
          );
        })}
        <polyline className={styles.line} points={points} />
        {data.map((item, index) => (
          <g key={`${item.label}-${index}`}>
            <circle className={styles.linePoint} cx={x(index)} cy={y(item.average)} r="4" />
            <text className={styles.axisText} x={x(index)} y={height - 10} textAnchor="middle">{item.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function BarChart({
  data,
  horizontal = false,
}: {
  data: Array<{ label: string; average: number; count: number }>;
  horizontal?: boolean;
}) {
  if (!data.length) return <ChartEmpty message="No hay registros con calificación para comparar." />;
  const shown = horizontal ? data : data.slice(0, 8);
  if (horizontal) {
    return (
      <div className={styles.horizontalBars}>
        {shown.map((item) => (
          <div className={styles.horizontalRow} key={item.label}>
            <span title={item.label}>{item.label}</span>
            <div className={styles.barTrack}><i style={{ width: `${Math.min(100, Math.max(0, item.average))}%` }} /></div>
            <strong>{formatNumber(item.average)}</strong>
            <small>{item.count}</small>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className={styles.verticalBars} role="img" aria-label={`Promedios: ${shown.map((item) => `${item.label}, ${formatNumber(item.average)}`).join("; ")}`}>
      {shown.map((item) => (
        <div className={styles.verticalBar} key={item.label} title={`${item.label}: ${formatNumber(item.average)} / 100 (${item.count} evaluaciones)`}>
          <span className={styles.verticalValue}>{formatNumber(item.average)}</span>
          <i style={{ height: `${Math.max(3, item.average)}%` }} />
          <span className={styles.verticalLabel}>{item.label}</span>
          <small>{item.count}</small>
        </div>
      ))}
    </div>
  );
}

function DonutChart({ passed, failed }: { passed: number; failed: number }) {
  const total = passed + failed;
  if (!total) return <ChartEmpty message="Sin calificaciones numéricas para calcular aprobación o reprobación." />;
  const passedPercent = (passed / total) * 100;
  return (
    <div className={styles.donutWrap} role="img" aria-label={`${formatNumber(passedPercent)}% aprobatorias y ${formatNumber(100 - passedPercent)}% reprobatorias`}>
      <div className={styles.donut}>
        <svg viewBox="0 0 140 140" aria-hidden="true">
          <circle className={styles.donutBase} cx="70" cy="70" r="52" />
          <circle
            className={styles.donutPassed}
            cx="70"
            cy="70"
            r="52"
            strokeDasharray={`${(passedPercent / 100) * 326.7} 326.7`}
            transform="rotate(-90 70 70)"
          />
        </svg>
        <div><strong>{formatNumber(passedPercent)}%</strong><span>aprobación</span></div>
      </div>
      <div className={styles.donutLegend}>
        <span><i className={styles.legendPassed} /> Aprobatorias <strong>{passed}</strong></span>
        <span><i className={styles.legendFailed} /> Reprobatorias <strong>{failed}</strong></span>
        <small>Umbral: calificación ≥{PASSING_SCORE}</small>
      </div>
    </div>
  );
}

function DistributionChart({ data }: { data: Array<{ label: string; count: number }> }) {
  const maximum = Math.max(1, ...data.map((item) => item.count));
  if (!data.some((item) => item.count)) return <ChartEmpty message="No hay calificaciones para distribuir." />;
  return (
    <div className={styles.distribution} role="img" aria-label={`Distribución: ${data.map((item) => `${item.label}: ${item.count}`).join("; ")}`}>
      {data.map((item) => (
        <div className={styles.distributionColumn} key={item.label}>
          <strong>{item.count}</strong>
          <div><i style={{ height: `${Math.max(2, (item.count / maximum) * 100)}%` }} /></div>
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function Heatmap({
  data,
}: {
  data: {
    semesters: number[];
    subjects: Array<{ id: string; name: string; scoresBySemester: Map<number, number[]> }>;
  };
}) {
  if (!data.subjects.length) return <ChartEmpty message="No hay datos suficientes para relacionar materias y semestres." />;
  const colorFor = (score: number | null) => {
    if (score === null) return "";
    if (score < PASSING_SCORE) return styles.heatLow;
    if (score >= HIGH_SCORE) return styles.heatHigh;
    return styles.heatMiddle;
  };
  return (
    <div className={styles.heatmapScroll}>
      <table className={styles.heatmap}>
        <thead>
          <tr><th>Materia</th>{data.semesters.map((semester) => <th key={semester}>{semester}</th>)}</tr>
        </thead>
        <tbody>
          {data.subjects.map((subject) => (
            <tr key={subject.id}>
              <th title={subject.name}>{subject.name}</th>
              {data.semesters.map((semester) => {
                const score = average(subject.scoresBySemester.get(semester) ?? []);
                return (
                  <td key={semester}>
                    <span
                      className={`${styles.heatCell} ${colorFor(score)}`}
                      title={score === null ? "Sin registros" : `${formatNumber(score)} / 100`}
                      aria-label={score === null ? "Sin registros" : `${formatNumber(score)} de 100`}
                    >
                      {score === null ? "·" : formatNumber(score, 0)}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className={styles.heatLegend}>
        <span><i className={styles.heatLow} /> Bajo &lt;70</span>
        <span><i className={styles.heatMiddle} /> 70–89</span>
        <span><i className={styles.heatHigh} /> Destacado ≥90</span>
      </div>
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  current,
  direction,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  direction: "asc" | "desc";
  onSort: (key: SortKey) => void;
}) {
  const Icon = current !== sortKey ? ArrowDownUp : direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <th aria-sort={current === sortKey ? (direction === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onSort(sortKey)}>
        {label}<Icon size={12} aria-hidden="true" />
      </button>
    </th>
  );
}

function FragmentRow({
  row,
  expanded,
  onToggle,
}: {
  row: DetailRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className={expanded ? styles.expandedRow : ""}>
        <td><button type="button" className={styles.detailButton} onClick={onToggle} aria-expanded={expanded}>{row.subject}<ChevronDown size={13} aria-hidden="true" /></button></td>
        <td>{row.teacher}</td>
        <td>{row.career}</td>
        <td>{row.semester ? `${row.semester}°` : "—"}</td>
        <td>{row.group}</td>
        <td>{row.students}</td>
        <td>{row.evaluations}</td>
        <td><strong>{row.average === null ? "—" : formatNumber(row.average)}</strong></td>
        <td>{row.passed}</td>
        <td>{row.failed}</td>
        <td>{row.approvalRate === null ? "—" : `${formatNumber(row.approvalRate)}%`}</td>
        <td>{row.failureRate === null ? "—" : `${formatNumber(row.failureRate)}%`}</td>
      </tr>
      {expanded && (
        <tr className={styles.detailExpanded}>
          <td colSpan={12}>
            <div>
              <span><strong>Porcentaje de aprobación</strong>{row.passed + row.failed ? `${formatNumber((row.passed / (row.passed + row.failed)) * 100)}%` : "Sin datos"}</span>
              <span><strong>Porcentaje de reprobación</strong>{row.passed + row.failed ? `${formatNumber((row.failed / (row.passed + row.failed)) * 100)}%` : "Sin datos"}</span>
              <span><strong>Clave y grupo</strong>{row.subject} · {row.group}</span>
              <span><strong>Nota de cálculo</strong>Las evaluaciones sin calificación se excluyen del promedio y de los porcentajes.</span>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
