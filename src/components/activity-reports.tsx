"use client";

import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Download,
  Filter,
  Printer,
  RotateCw,
  Search,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition, type FormEvent, type ReactNode } from "react";
import styles from "./activity-reports.module.css";

type Role = "alumno" | "docente" | "administrador";
type DateRange = "all" | "day" | "week" | "month" | "year" | "custom";
type Filters = {
  range: DateRange;
  from: string;
  to: string;
  careerId: string;
  semester: string;
  groupId: string;
  teacherId: string;
  subjectId: string;
  authorId: string;
  userRole: "all" | Role;
  userStatus: "all" | "active" | "inactive";
  periodId: string;
  year: string;
  materialType: string;
  fileType: string;
  materialStatus: string;
  activityType: "all" | "publications" | "views" | "downloads";
};
type DateBounds = { from: string | null; to: string | null };
type Comparison = { current: number; previous: number } | null;
type ReportRow = {
  id: string;
  title: string;
  subject: string;
  author: string;
  career: string;
  semester: number | null;
  group: string;
  fileType: string;
  category: string;
  period: string;
  year: number;
  publishedAt: string;
  views: number;
  downloads: number;
  status: string;
  description: string;
};
type SortKey = keyof Pick<
  ReportRow,
  "title" | "subject" | "author" | "career" | "semester" | "category" | "publishedAt" | "views" | "downloads"
>;

export type ActivityReportData = {
  profiles: Array<{ id: string; name: string; role: Role; active: boolean | null; createdAt: string }>;
  students: Array<{ id: string; careerId: string | null; semester: number | null; specialty: string | null }>;
  teachers: Array<{ id: string; department: string | null }>;
  subjects: Array<{ id: string; career_id: string | null; code: string; name: string; semester: number | null; active: boolean }>;
  careers: Array<{ id: string; name: string; active: boolean }>;
  periods: Array<{ id: string; name: string; starts_on: string; ends_on: string; is_current: boolean }>;
  groups: Array<{ id: string; code: string; subject_id: string; period_id: string }>;
  teacherGroups: Array<{ teacher_id: string; group_id: string }>;
  materials: Array<{
    id: string;
    title: string;
    description: string;
    status: string;
    careerId: string | null;
    subjectId: string | null;
    groupId: string | null;
    semester: number | null;
    materialType: string;
    storagePath: string | null;
    authorId: string;
    createdAt: string;
    downloadCount: number;
  }>;
  downloads: Array<{ materialId: string; userId: string; occurredAt: string }>;
  views: Array<{ materialId: string; userId: string; occurredAt: string }>;
  posts: Array<{
    id: string;
    title: string;
    createdAt: string;
    authorId: string;
    groupId: string | null;
    subjectId: string | null;
  }>;
};

const emptyFilters: Filters = {
  range: "all",
  from: "",
  to: "",
  careerId: "",
  semester: "",
  groupId: "",
  teacherId: "",
  subjectId: "",
  authorId: "",
  userRole: "all",
  userStatus: "all",
  periodId: "",
  year: "",
  materialType: "",
  fileType: "",
  materialStatus: "",
  activityType: "all",
};

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

function withinDate(value: string, bounds: DateBounds) {
  const date = value.slice(0, 10);
  return (!bounds.from || date >= bounds.from) && (!bounds.to || date <= bounds.to);
}

function inRangeEvent(date: string, bounds: DateBounds, year: string) {
  return withinDate(date, bounds) && (!year || date.slice(0, 4) === year);
}

function previousBounds(bounds: DateBounds): DateBounds | null {
  if (!bounds.from || !bounds.to) return null;
  const from = new Date(`${bounds.from}T00:00:00Z`);
  const to = new Date(`${bounds.to}T00:00:00Z`);
  const duration = Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
  const previousTo = new Date(from);
  previousTo.setUTCDate(previousTo.getUTCDate() - 1);
  const previousFrom = new Date(previousTo);
  previousFrom.setUTCDate(previousFrom.getUTCDate() - duration + 1);
  return {
    from: previousFrom.toISOString().slice(0, 10),
    to: previousTo.toISOString().slice(0, 10),
  };
}

function formatNumber(value: number, digits = 0) {
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: digits }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function extension(path: string | null) {
  if (!path) return "Sin archivo";
  const name = path.split("/").at(-1) ?? "";
  const suffix = name.split(".").at(-1)?.toLocaleLowerCase("es-MX");
  return suffix && suffix !== name.toLocaleLowerCase("es-MX") ? suffix.toUpperCase() : "Archivo";
}

function periodForDate(date: string, periods: ActivityReportData["periods"]) {
  const day = date.slice(0, 10);
  return periods.find((period) => period.starts_on <= day && day <= period.ends_on)?.id ?? "";
}

function weekStart(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

function timeKey(value: string, granularity: "day" | "week" | "month") {
  const date = value.slice(0, 10);
  return granularity === "day" ? date : granularity === "week" ? weekStart(date) : date.slice(0, 7);
}

function timeLabel(key: string, granularity: "day" | "week" | "month") {
  if (granularity === "month") return key.slice(2);
  if (granularity === "week") return key.slice(5);
  return key.slice(5);
}

function csvCell(value: string | number | null) {
  const raw = String(value ?? "");
  const safe = /^[\t\r\n ]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function ActivityReports({
  scope,
  data,
}: {
  scope: "administrador" | "docente";
  data: ActivityReportData;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Filters>(emptyFilters);
  const [applied, setApplied] = useState<Filters>(emptyFilters);
  const [filterError, setFilterError] = useState("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("publishedAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const [printTimestamp, setPrintTimestamp] = useState<string | null>(null);
  const [printRequested, setPrintRequested] = useState(false);
  const bounds = dateBounds(applied);
  const previous = useMemo(
    () => previousBounds(bounds) ?? (
      applied.range === "all" && applied.year
        ? { from: `${Number(applied.year) - 1}-01-01`, to: `${Number(applied.year) - 1}-12-31` }
        : null
    ),
    [bounds, applied.range, applied.year],
  );

  useEffect(() => {
    if (!printRequested) return;
    window.print();
    setPrintRequested(false);
  }, [printRequested]);

  const lookups = useMemo(() => {
    const subjectById = new Map(data.subjects.map((item) => [item.id, item]));
    const careerById = new Map(data.careers.map((item) => [item.id, item]));
    const groupById = new Map(data.groups.map((item) => [item.id, item]));
    const periodById = new Map(data.periods.map((item) => [item.id, item]));
    const profileById = new Map(data.profiles.map((item) => [item.id, item]));
    const studentById = new Map(data.students.map((item) => [item.id, item]));
    const teacherById = new Map(data.teachers.map((item) => [item.id, item]));
    const teachersByGroup = new Map<string, string[]>();
    for (const assignment of data.teacherGroups) {
      const current = teachersByGroup.get(assignment.group_id) ?? [];
      current.push(assignment.teacher_id);
      teachersByGroup.set(assignment.group_id, current);
    }
    return { subjectById, careerById, groupById, periodById, profileById, studentById, teacherById, teachersByGroup };
  }, [data]);

  const matchingMaterials = useMemo(() => {
    return data.materials.filter((material) => {
      const subject = material.subjectId ? lookups.subjectById.get(material.subjectId) : undefined;
      const group = material.groupId ? lookups.groupById.get(material.groupId) : undefined;
      const careerId = material.careerId ?? subject?.career_id ?? null;
      const semester = material.semester ?? subject?.semester ?? null;
      const cycleId = group?.period_id || periodForDate(material.createdAt, data.periods);
      const teachesGroup = applied.teacherId && material.groupId
        ? lookups.teachersByGroup.get(material.groupId)?.includes(applied.teacherId) ?? false
        : false;
      return (
        (!applied.careerId || careerId === applied.careerId) &&
        (!applied.semester || String(semester ?? "") === applied.semester) &&
        (!applied.groupId || material.groupId === applied.groupId) &&
        (!applied.teacherId || material.authorId === applied.teacherId || teachesGroup) &&
        (!applied.subjectId || material.subjectId === applied.subjectId) &&
        (!applied.authorId || material.authorId === applied.authorId) &&
        (!applied.periodId || cycleId === applied.periodId) &&
        (!applied.materialType || material.materialType === applied.materialType) &&
        (!applied.fileType || extension(material.storagePath) === applied.fileType) &&
        (!applied.materialStatus || material.status === applied.materialStatus)
      );
    });
  }, [data, lookups, applied]);

  const materialScope = useMemo(
    () => applied.activityType === "all" || applied.activityType === "publications"
      ? matchingMaterials.filter((material) => {
          const author = lookups.profileById.get(material.authorId);
          return withinDate(material.createdAt, bounds) &&
            (!applied.year || material.createdAt.slice(0, 4) === applied.year) &&
            (applied.userRole === "all" || author?.role === applied.userRole) &&
            (applied.userStatus === "all" ||
              (applied.userStatus === "active" && author?.active === true) ||
              (applied.userStatus === "inactive" && author?.active === false));
        })
      : [],
    [matchingMaterials, bounds, applied.year, applied.activityType, applied.userRole, applied.userStatus, lookups],
  );

  const postScope = useMemo(() => {
    return data.posts.filter((post) => {
      const subjectId = post.subjectId ?? (post.groupId ? lookups.groupById.get(post.groupId)?.subject_id : null);
      const subject = subjectId ? lookups.subjectById.get(subjectId) : undefined;
      const author = lookups.profileById.get(post.authorId);
      const group = post.groupId ? lookups.groupById.get(post.groupId) : undefined;
      const careerId = subject?.career_id ?? null;
      const semester = subject?.semester ?? null;
      const cycleId = group?.period_id || periodForDate(post.createdAt, data.periods);
      const teachesGroup = applied.teacherId && post.groupId
        ? lookups.teachersByGroup.get(post.groupId)?.includes(applied.teacherId) ?? false
        : false;
      return (
        withinDate(post.createdAt, bounds) &&
        (!applied.year || post.createdAt.slice(0, 4) === applied.year) &&
        (!applied.careerId || careerId === applied.careerId) &&
        (!applied.semester || String(semester ?? "") === applied.semester) &&
        (!applied.groupId || post.groupId === applied.groupId) &&
        (!applied.teacherId || post.authorId === applied.teacherId || teachesGroup) &&
        (!applied.subjectId || subjectId === applied.subjectId) &&
        (!applied.authorId || post.authorId === applied.authorId) &&
        (applied.userRole === "all" || author?.role === applied.userRole) &&
        (applied.userStatus === "all" ||
          (applied.userStatus === "active" && author?.active === true) ||
          (applied.userStatus === "inactive" && author?.active === false)) &&
        (!applied.periodId || cycleId === applied.periodId) &&
        (!applied.materialType && !applied.fileType && !applied.materialStatus) &&
        (applied.activityType === "all" || applied.activityType === "publications")
      );
    });
  }, [data, lookups, bounds, applied]);

  const materialIds = useMemo(() => new Set(matchingMaterials.map((item) => item.id)), [matchingMaterials]);
  const views = useMemo(
    () => applied.activityType === "all" || applied.activityType === "views"
      ? data.views.filter((item) => {
          const actor = lookups.profileById.get(item.userId);
          return materialIds.has(item.materialId) &&
            inRangeEvent(item.occurredAt, bounds, applied.year) &&
            (applied.userRole === "all" || actor?.role === applied.userRole) &&
            (applied.userStatus === "all" ||
              (applied.userStatus === "active" && actor?.active === true) ||
              (applied.userStatus === "inactive" && actor?.active === false));
        })
      : [],
    [data.views, materialIds, bounds, applied.year, applied.activityType, applied.userRole, applied.userStatus, lookups],
  );
  const downloads = useMemo(
    () => applied.activityType === "all" || applied.activityType === "downloads"
      ? data.downloads.filter((item) => {
          const actor = lookups.profileById.get(item.userId);
          return materialIds.has(item.materialId) &&
            inRangeEvent(item.occurredAt, bounds, applied.year) &&
            (applied.userRole === "all" || actor?.role === applied.userRole) &&
            (applied.userStatus === "all" ||
              (applied.userStatus === "active" && actor?.active === true) ||
              (applied.userStatus === "inactive" && actor?.active === false));
        })
      : [],
    [data.downloads, materialIds, bounds, applied.year, applied.activityType, applied.userRole, applied.userStatus, lookups],
  );
  const allUsers = useMemo(() => {
    return data.profiles.filter((profile) => {
      const student = lookups.studentById.get(profile.id);
      const profileCareerId = student?.careerId ?? null;
      return (
        withinDate(profile.createdAt, bounds) &&
        (!applied.year || profile.createdAt.slice(0, 4) === applied.year) &&
        (!applied.careerId || profileCareerId === applied.careerId) &&
        (!applied.semester || String(student?.semester ?? "") === applied.semester) &&
        (!applied.authorId || profile.id === applied.authorId) &&
        (applied.userRole === "all" || profile.role === applied.userRole) &&
        (applied.userStatus === "all" ||
          (applied.userStatus === "active" && profile.active === true) ||
          (applied.userStatus === "inactive" && profile.active === false)) &&
        (!applied.teacherId || profile.id === applied.teacherId)
      );
    });
  }, [data.profiles, lookups, bounds, applied]);

  const previousUsers = useMemo(() => {
    if (!previous) return [];
    const previousYear = applied.year ? String(Number(applied.year) - 1) : "";
    return data.profiles.filter((profile) => {
      const student = lookups.studentById.get(profile.id);
      return (
        withinDate(profile.createdAt, previous) &&
        (!previousYear || profile.createdAt.slice(0, 4) === previousYear) &&
        (!applied.careerId || student?.careerId === applied.careerId) &&
        (!applied.semester || String(student?.semester ?? "") === applied.semester) &&
        (!applied.authorId || profile.id === applied.authorId) &&
        (applied.userRole === "all" || profile.role === applied.userRole) &&
        (applied.userStatus === "all" ||
          (applied.userStatus === "active" && profile.active === true) ||
          (applied.userStatus === "inactive" && profile.active === false)) &&
        (!applied.teacherId || profile.id === applied.teacherId)
      );
    });
  }, [data.profiles, lookups, previous, applied]);

  const subjectActivity = useMemo(() => {
    const materialById = new Map(matchingMaterials.map((material) => [material.id, material]));
    const buckets = new Map<string, { label: string; publications: number; views: number; downloads: number }>();
    const add = (subjectId: string | null, kind: "publications" | "views" | "downloads") => {
      if (!subjectId) return;
      const subject = lookups.subjectById.get(subjectId);
      const bucket = buckets.get(subjectId) ?? {
        label: subject?.name ?? "Materia sin nombre",
        publications: 0,
        views: 0,
        downloads: 0,
      };
      bucket[kind] += 1;
      buckets.set(subjectId, bucket);
    };
    for (const material of materialScope) add(material.subjectId, "publications");
    for (const post of postScope) {
      const subjectId = post.subjectId ?? (post.groupId ? lookups.groupById.get(post.groupId)?.subject_id : null);
      add(subjectId ?? null, "publications");
    }
    for (const item of views) add(materialById.get(item.materialId)?.subjectId ?? null, "views");
    for (const item of downloads) add(materialById.get(item.materialId)?.subjectId ?? null, "downloads");
    return [...buckets.values()]
      .map((item) => ({ ...item, total: item.publications + item.views + item.downloads }))
      .sort((a, b) => b.total - a.total);
  }, [matchingMaterials, materialScope, postScope, views, downloads, lookups]);

  const careerActivity = useMemo(() => {
    const materialById = new Map(matchingMaterials.map((material) => [material.id, material]));
    const buckets = new Map<string, { label: string; publications: number; views: number; downloads: number }>();
    const careerForMaterial = (material: ActivityReportData["materials"][number]) =>
      material.careerId ??
      (material.subjectId ? lookups.subjectById.get(material.subjectId)?.career_id : null) ??
      null;
    const add = (careerId: string | null, kind: "publications" | "views" | "downloads") => {
      if (!careerId) return;
      const career = lookups.careerById.get(careerId);
      const bucket = buckets.get(careerId) ?? { label: career?.name ?? "Carrera sin nombre", publications: 0, views: 0, downloads: 0 };
      bucket[kind] += 1;
      buckets.set(careerId, bucket);
    };
    for (const material of materialScope) add(careerForMaterial(material), "publications");
    for (const item of views) {
      const material = materialById.get(item.materialId);
      add(material ? careerForMaterial(material) : null, "views");
    }
    for (const item of downloads) {
      const material = materialById.get(item.materialId);
      add(material ? careerForMaterial(material) : null, "downloads");
    }
    for (const post of postScope) {
      const subjectId = post.subjectId ?? (post.groupId ? lookups.groupById.get(post.groupId)?.subject_id : null);
      add(subjectId ? lookups.subjectById.get(subjectId)?.career_id ?? null : null, "publications");
    }
    return [...buckets.values()]
      .map((item) => ({ ...item, total: item.publications + item.views + item.downloads }))
      .sort((a, b) => b.total - a.total);
  }, [matchingMaterials, materialScope, postScope, views, downloads, lookups]);

  const subjectCount = useMemo(() => {
    const activeSubjectIds = new Set([
      ...materialScope.flatMap((item) => item.subjectId ? [item.subjectId] : []),
      ...matchingMaterials
        .filter((material) => views.some((item) => item.materialId === material.id) || downloads.some((item) => item.materialId === material.id))
        .flatMap((item) => item.subjectId ? [item.subjectId] : []),
      ...postScope.flatMap((item) => {
        const subjectId = item.subjectId ?? (item.groupId ? lookups.groupById.get(item.groupId)?.subject_id : null);
        return subjectId ? [subjectId] : [];
      }),
    ]);
    const contentScoped = scope === "docente" || Boolean(
      bounds.from || bounds.to || applied.year || applied.activityType !== "all" ||
      applied.groupId || applied.teacherId || applied.authorId || applied.materialType ||
      applied.fileType || applied.materialStatus || applied.periodId ||
      applied.userRole !== "all" || applied.userStatus !== "all",
    );
    return data.subjects.filter((subject) =>
      (!applied.careerId || subject.career_id === applied.careerId) &&
      (!applied.semester || String(subject.semester ?? "") === applied.semester) &&
      (!applied.subjectId || subject.id === applied.subjectId) &&
      (!contentScoped || activeSubjectIds.has(subject.id)),
    ).length;
  }, [data.subjects, materialScope, matchingMaterials, postScope, views, downloads, lookups, scope, applied, bounds]);

  const metrics = useMemo(() => {
    const activeIds = new Set([
      ...materialScope.map((item) => item.authorId),
      ...postScope.map((item) => item.authorId),
      ...views.map((item) => item.userId),
      ...downloads.map((item) => item.userId),
    ]);
    const activityPopulation = data.profiles.filter((item) => {
      const student = lookups.studentById.get(item.id);
      return (
        (!applied.careerId || student?.careerId === applied.careerId) &&
        (!applied.semester || String(student?.semester ?? "") === applied.semester) &&
        (!applied.authorId || item.id === applied.authorId) &&
        (!applied.teacherId || item.id === applied.teacherId) &&
        (applied.userRole === "all" || item.role === applied.userRole) &&
        (applied.userStatus === "all" ||
          (applied.userStatus === "active" && item.active === true) ||
          (applied.userStatus === "inactive" && item.active === false))
      );
    });
    const activeProfiles = activityPopulation.filter((item) => activeIds.has(item.id));
    const authors = new Set([...materialScope.map((item) => item.authorId), ...postScope.map((item) => item.authorId)]);
    const numberOfPublications = materialScope.length + postScope.length;
    const activeMaterialIds = new Set([
      ...(applied.activityType === "all" || applied.activityType === "publications" ? materialScope.map((item) => item.id) : []),
      ...views.map((item) => item.materialId),
      ...downloads.map((item) => item.materialId),
    ]);
    return {
      activeIds,
      students: allUsers.filter((item) => item.role === "alumno").length,
      teachers: allUsers.filter((item) => item.role === "docente").length,
      administrators: allUsers.filter((item) => item.role === "administrador").length,
      users: allUsers.length,
      inactiveUsers: allUsers.filter((item) => item.active === false).length,
      subjects: subjectCount,
      materials: activeMaterialIds.size,
      posts: postScope.length,
      publications: numberOfPublications,
      activeUsers: activeProfiles.length,
      averagePostsPerUser: authors.size ? numberOfPublications / authors.size : 0,
      studentParticipation: activeProfiles.length
        ? (activeProfiles.filter((item) => item.role === "alumno").length / activeProfiles.length) * 100
        : null,
      teacherParticipation: activeProfiles.length
        ? (activeProfiles.filter((item) => item.role === "docente").length / activeProfiles.length) * 100
        : null,
      activeRate: activityPopulation.length
        ? (activeProfiles.length / activityPopulation.length) * 100
        : null,
    };
  }, [data.profiles, allUsers, materialScope, postScope, views, downloads, applied, lookups, subjectCount]);

  const rows = useMemo<ReportRow[]>(() => {
    const viewsByMaterial = new Map<string, number>();
    const downloadsByMaterial = new Map<string, number>();
    for (const item of views) viewsByMaterial.set(item.materialId, (viewsByMaterial.get(item.materialId) ?? 0) + 1);
    for (const item of downloads) downloadsByMaterial.set(item.materialId, (downloadsByMaterial.get(item.materialId) ?? 0) + 1);
    const relevantMaterialIds = new Set([
      ...(applied.activityType === "all" || applied.activityType === "publications" ? materialScope.map((item) => item.id) : []),
      ...views.map((item) => item.materialId),
      ...downloads.map((item) => item.materialId),
    ]);
    return matchingMaterials.filter((material) => relevantMaterialIds.has(material.id)).map((material) => {
      const subject = material.subjectId ? lookups.subjectById.get(material.subjectId) : undefined;
      const careerId = material.careerId ?? subject?.career_id ?? null;
      const group = material.groupId ? lookups.groupById.get(material.groupId) : undefined;
      const periodId = group?.period_id || periodForDate(material.createdAt, data.periods);
      const assignedTeacher = material.groupId
        ? (lookups.teachersByGroup.get(material.groupId) ?? [])
            .map((id) => lookups.profileById.get(id)?.name)
            .filter(Boolean)
            .join(", ")
        : "";
      return {
        id: material.id,
        title: material.title,
        subject: subject?.name ?? "Sin materia",
        author: assignedTeacher || lookups.profileById.get(material.authorId)?.name || "Usuario sin nombre",
        career: careerId ? lookups.careerById.get(careerId)?.name ?? "Sin carrera" : "Sin carrera",
        semester: material.semester ?? subject?.semester ?? null,
        group: group?.code ?? "Sin grupo",
        fileType: extension(material.storagePath),
        category: material.materialType,
        period: periodId ? lookups.periodById.get(periodId)?.name ?? "Ciclo sin nombre" : "Sin ciclo asignado",
        year: new Date(material.createdAt).getFullYear(),
        publishedAt: material.createdAt,
        views: viewsByMaterial.get(material.id) ?? 0,
        downloads: downloadsByMaterial.get(material.id) ?? 0,
        status: material.status,
        description: material.description,
      };
    });
  }, [matchingMaterials, materialScope, views, downloads, lookups, data.periods, applied.activityType]);

  const visibleRows = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("es-MX");
    const filtered = !normalized
      ? rows
      : rows.filter((row) =>
          [row.title, row.subject, row.author, row.career, row.group, row.category, row.period]
            .join(" ")
            .toLocaleLowerCase("es-MX")
            .includes(normalized),
        );
    return [...filtered].sort((a, b) => {
      const first = a[sortKey];
      const second = b[sortKey];
      const result =
        typeof first === "number" && typeof second === "number"
          ? first - second
          : String(first ?? "").localeCompare(String(second ?? ""), "es-MX", { numeric: true, sensitivity: "base" });
      return sortDirection === "asc" ? result : -result;
    });
  }, [rows, search, sortKey, sortDirection]);
  const pageCount = Math.max(1, Math.ceil(visibleRows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageRows = visibleRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const series = useMemo(() => {
    const dateSpan = bounds.from && bounds.to
      ? Math.ceil((new Date(`${bounds.to}T00:00:00Z`).getTime() - new Date(`${bounds.from}T00:00:00Z`).getTime()) / 86_400_000)
      : 366;
    const granularity = applied.range === "day" || applied.range === "week" || (applied.range === "custom" && dateSpan <= 45)
      ? "day"
      : applied.range === "month" || (applied.range === "custom" && dateSpan <= 180)
        ? "week"
        : "month";
    const buckets = new Map<string, { publications: number; views: number; downloads: number }>();
    const add = (date: string, key: "publications" | "views" | "downloads") => {
      const bucketKey = timeKey(date, granularity);
      const bucket = buckets.get(bucketKey) ?? { publications: 0, views: 0, downloads: 0 };
      bucket[key] += 1;
      buckets.set(bucketKey, bucket);
    };
    for (const material of materialScope) add(material.createdAt, "publications");
    for (const post of postScope) add(post.createdAt, "publications");
    for (const item of views) add(item.occurredAt, "views");
    for (const item of downloads) add(item.occurredAt, "downloads");
    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([key, values]) => ({ key, label: timeLabel(key, granularity), ...values }));
  }, [bounds, applied.range, materialScope, postScope, views, downloads]);

  const semesterActivity = useMemo(() => {
    const counts = Array.from({ length: 13 }, (_, index) => ({ semester: index + 1, count: 0 }));
    const materialById = new Map(matchingMaterials.map((material) => [material.id, material]));
    const add = (materialId: string) => {
      const material = materialById.get(materialId);
      if (!material) return;
      const semester = material.semester ?? lookups.subjectById.get(material.subjectId ?? "")?.semester;
      if (semester && semester >= 1 && semester <= 13) counts[semester - 1].count += 1;
    };
    for (const material of materialScope) {
      add(material.id);
    }
    for (const post of postScope) {
      const subjectId = post.subjectId ?? (post.groupId ? lookups.groupById.get(post.groupId)?.subject_id : null);
      const semester = subjectId ? lookups.subjectById.get(subjectId)?.semester : null;
      if (semester && semester >= 1 && semester <= 13) counts[semester - 1].count += 1;
    }
    for (const item of views) add(item.materialId);
    for (const item of downloads) add(item.materialId);
    return counts;
  }, [matchingMaterials, materialScope, postScope, views, downloads, lookups]);

  const typeActivity = useMemo(() => {
    const counts = new Map<string, number>();
    const activeMaterialIds = new Set([
      ...(applied.activityType === "all" || applied.activityType === "publications" ? materialScope.map((item) => item.id) : []),
      ...views.map((item) => item.materialId),
      ...downloads.map((item) => item.materialId),
    ]);
    for (const material of matchingMaterials.filter((item) => activeMaterialIds.has(item.id))) {
      const label = `${material.materialType} · ${extension(material.storagePath)}`;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  }, [matchingMaterials, materialScope, views, downloads, applied.activityType]);

  const heatmap = useMemo(() => {
    const activityByMaterial = new Map<string, number>();
    for (const material of materialScope) activityByMaterial.set(material.id, 1);
    for (const item of views) activityByMaterial.set(item.materialId, (activityByMaterial.get(item.materialId) ?? 0) + 1);
    for (const item of downloads) activityByMaterial.set(item.materialId, (activityByMaterial.get(item.materialId) ?? 0) + 1);
    return data.subjects
      .filter((subject) => matchingMaterials.some((material) =>
        material.subjectId === subject.id && (activityByMaterial.get(material.id) ?? 0) > 0,
      ))
      .slice(0, 10)
      .map((subject) => {
        const bySemester = Array.from({ length: 13 }, (_, index) => {
          const semester = index + 1;
          return matchingMaterials.reduce((total, material) => {
            const resolvedSemester = material.semester ?? lookups.subjectById.get(material.subjectId ?? "")?.semester;
            return total + (material.subjectId === subject.id && resolvedSemester === semester ? activityByMaterial.get(material.id) ?? 1 : 0);
          }, 0);
        });
        return { id: subject.id, name: subject.name, bySemester };
      });
  }, [data.subjects, matchingMaterials, materialScope, views, downloads, lookups]);

  const publicationChange = useMemo(() => {
    if (!previous || (applied.activityType !== "all" && applied.activityType !== "publications")) return null;
    const comparisonYear = applied.year ? String(Number(applied.year) - 1) : "";
    const previousMaterials = data.materials.filter((item) => {
      const subject = item.subjectId ? lookups.subjectById.get(item.subjectId) : undefined;
      const group = item.groupId ? lookups.groupById.get(item.groupId) : undefined;
      const author = lookups.profileById.get(item.authorId);
      const careerId = item.careerId ?? subject?.career_id ?? null;
      const semester = item.semester ?? subject?.semester ?? null;
      const cycleId = group?.period_id || periodForDate(item.createdAt, data.periods);
      const teacherMatch = applied.teacherId && item.groupId
        ? lookups.teachersByGroup.get(item.groupId)?.includes(applied.teacherId) ?? false
        : false;
      return withinDate(item.createdAt, previous) &&
        (!comparisonYear || item.createdAt.slice(0, 4) === comparisonYear) &&
        (!applied.careerId || careerId === applied.careerId) &&
        (!applied.semester || String(semester ?? "") === applied.semester) &&
        (!applied.groupId || item.groupId === applied.groupId) &&
        (!applied.teacherId || item.authorId === applied.teacherId || teacherMatch) &&
        (!applied.subjectId || item.subjectId === applied.subjectId) &&
        (!applied.authorId || item.authorId === applied.authorId) &&
        (applied.userRole === "all" || author?.role === applied.userRole) &&
        (applied.userStatus === "all" ||
          (applied.userStatus === "active" && author?.active === true) ||
          (applied.userStatus === "inactive" && author?.active === false)) &&
        (!applied.periodId || cycleId === applied.periodId) &&
        (!applied.materialType || item.materialType === applied.materialType) &&
        (!applied.fileType || extension(item.storagePath) === applied.fileType) &&
        (!applied.materialStatus || item.status === applied.materialStatus);
    });
    const previousPosts = data.posts.filter((item) => {
      const subjectId = item.subjectId ?? (item.groupId ? lookups.groupById.get(item.groupId)?.subject_id : null);
      const subject = subjectId ? lookups.subjectById.get(subjectId) : undefined;
      const group = item.groupId ? lookups.groupById.get(item.groupId) : undefined;
      const author = lookups.profileById.get(item.authorId);
      const cycleId = group?.period_id || periodForDate(item.createdAt, data.periods);
      const teacherMatch = applied.teacherId && item.groupId
        ? lookups.teachersByGroup.get(item.groupId)?.includes(applied.teacherId) ?? false
        : false;
      return withinDate(item.createdAt, previous) &&
        (!comparisonYear || item.createdAt.slice(0, 4) === comparisonYear) &&
        (!applied.careerId || subject?.career_id === applied.careerId) &&
        (!applied.semester || String(subject?.semester ?? "") === applied.semester) &&
        (!applied.groupId || item.groupId === applied.groupId) &&
        (!applied.teacherId || item.authorId === applied.teacherId || teacherMatch) &&
        (!applied.subjectId || subjectId === applied.subjectId) &&
        (!applied.authorId || item.authorId === applied.authorId) &&
        (applied.userRole === "all" || author?.role === applied.userRole) &&
        (applied.userStatus === "all" ||
          (applied.userStatus === "active" && author?.active === true) ||
          (applied.userStatus === "inactive" && author?.active === false)) &&
        (!applied.periodId || cycleId === applied.periodId) &&
        (!applied.materialType && !applied.fileType && !applied.materialStatus);
    });
    return {
      materials: previousMaterials.length,
      count: previousMaterials.length + previousPosts.length,
      materialIds: previousMaterials.map((item) => item.id),
    };
  }, [data, lookups, previous, applied]);

  const previousViews = useMemo(() => {
    if (!previous || (applied.activityType !== "all" && applied.activityType !== "views")) return null;
    const previousYear = applied.year ? String(Number(applied.year) - 1) : "";
    return data.views.filter((item) => {
      const actor = lookups.profileById.get(item.userId);
      return materialIds.has(item.materialId) &&
        inRangeEvent(item.occurredAt, previous, previousYear) &&
        (applied.userRole === "all" || actor?.role === applied.userRole) &&
        (applied.userStatus === "all" ||
          (applied.userStatus === "active" && actor?.active === true) ||
          (applied.userStatus === "inactive" && actor?.active === false));
    });
  }, [data.views, materialIds, previous, applied.year, applied.activityType, applied.userRole, applied.userStatus, lookups]);

  const previousDownloads = useMemo(() => {
    if (!previous || (applied.activityType !== "all" && applied.activityType !== "downloads")) return null;
    const previousYear = applied.year ? String(Number(applied.year) - 1) : "";
    return data.downloads.filter((item) => {
      const actor = lookups.profileById.get(item.userId);
      return materialIds.has(item.materialId) &&
        inRangeEvent(item.occurredAt, previous, previousYear) &&
        (applied.userRole === "all" || actor?.role === applied.userRole) &&
        (applied.userStatus === "all" ||
          (applied.userStatus === "active" && actor?.active === true) ||
          (applied.userStatus === "inactive" && actor?.active === false));
    });
  }, [data.downloads, materialIds, previous, applied.year, applied.activityType, applied.userRole, applied.userStatus, lookups]);

  const previousResourceCount = useMemo(() => {
    if (!previous) return null;
    const ids = new Set<string>();
    if (applied.activityType === "all" || applied.activityType === "publications") {
      for (const id of publicationChange?.materialIds ?? []) ids.add(id);
    }
    if (applied.activityType === "all" || applied.activityType === "views") {
      for (const item of previousViews ?? []) ids.add(item.materialId);
    }
    if (applied.activityType === "all" || applied.activityType === "downloads") {
      for (const item of previousDownloads ?? []) ids.add(item.materialId);
    }
    return ids.size;
  }, [previous, applied.activityType, publicationChange, previousViews, previousDownloads]);

  const scopedPeople = scope === "administrador" ? allUsers : [];
  const roleCounts = (["alumno", "docente", "administrador"] as Role[]).map((role) => ({
    role,
    label: role === "alumno" ? "Estudiantes" : role === "docente" ? "Docentes" : "Administradores",
    count: scopedPeople.filter((profile) => profile.role === role).length,
  }));
  const activeUsersOutsidePopulation = scope === "administrador"
    ? metrics.activeUsers
    : metrics.activeIds.size;
  const activeRate = scope === "administrador" ? metrics.activeRate : null;
  const studentParticipation = metrics.studentParticipation;
  const teacherParticipation = metrics.teacherParticipation;
  const resourcesBySubject = subjectActivity[0]?.label ?? "Sin actividad";
  const resourcesByCareer = careerActivity[0]?.label ?? "Sin actividad";
  const dataNotice = data.views.length
    ? ""
    : "El sistema no cuenta con historial previo de consultas. Las consultas se registran a partir de la aplicación de la migración 0017.";

  const metricsPrimary = [
    { label: "Usuarios registrados", value: scope === "administrador" ? metrics.users : "—", detail: scope === "administrador" ? "Cuentas según filtros" : "Solo disponible para administración", comparison: scope === "administrador" && previous ? { current: metrics.users, previous: previousUsers.length } : null },
    { label: "Estudiantes", value: scope === "administrador" ? metrics.students : "—", detail: "Cuentas del alumnado", comparison: scope === "administrador" && previous ? { current: metrics.students, previous: previousUsers.filter((item) => item.role === "alumno").length } : null },
    { label: "Docentes", value: scope === "administrador" ? metrics.teachers : "—", detail: "Cuentas docentes", comparison: scope === "administrador" && previous ? { current: metrics.teachers, previous: previousUsers.filter((item) => item.role === "docente").length } : null },
    { label: "Materias", value: metrics.subjects, detail: "Materias en el alcance", comparison: null },
    { label: "Recursos compartidos", value: metrics.materials, detail: "Materiales en el filtro", comparison: previousResourceCount === null ? null : { current: metrics.materials, previous: previousResourceCount } },
    { label: "Publicaciones", value: metrics.publications, detail: "Materiales y avisos", comparison: publicationChange === null ? null : { current: metrics.publications, previous: publicationChange.count } },
    { label: "Consultas", value: views.length, detail: "Historial registrado", comparison: previousViews === null ? null : { current: views.length, previous: previousViews.length } },
    { label: "Descargas", value: downloads.length, detail: "Descargas registradas", comparison: previousDownloads === null ? null : { current: downloads.length, previous: previousDownloads.length } },
  ];
  const metricsSecondary = [
    ["Administradores", scope === "administrador" ? formatNumber(metrics.administrators) : "Solo administración"],
    ["Usuarios activos", formatNumber(activeUsersOutsidePopulation)],
    ["Usuarios inactivos", scope === "administrador" ? formatNumber(metrics.inactiveUsers) : "Solo administración"],
    ["Publicaciones por usuario", formatNumber(metrics.averagePostsPerUser, 2)],
    ["Materia con mayor actividad", resourcesBySubject],
    ["Carrera con mayor participación", resourcesByCareer],
    ["Participación de estudiantes", studentParticipation === null ? "Sin datos" : `${formatNumber(studentParticipation, 1)}%`],
    ["Participación de docentes", teacherParticipation === null ? "Sin datos" : `${formatNumber(teacherParticipation, 1)}%`],
    ["Crecimiento de publicaciones", publicationChange === null || publicationChange.count === 0 ? "Sin comparación" : `${metrics.publications >= publicationChange.count ? "+" : ""}${formatNumber((metrics.publications - publicationChange.count) / publicationChange.count * 100, 1)}%`],
    ["Usuarios activos / registrados", activeRate === null ? "Solo administración" : `${formatNumber(activeRate, 1)}%`],
  ];

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.range === "custom" && draft.from && draft.to && draft.from > draft.to) {
      setFilterError("La fecha inicial debe ser anterior o igual a la fecha final.");
      return;
    }
    setFilterError("");
    setPage(1);
    setApplied(draft);
  }

  function clearFilters() {
    setDraft(emptyFilters);
    setApplied(emptyFilters);
    setFilterError("");
    setSearch("");
    setPage(1);
  }

  function refresh() {
    startRefresh(() => router.refresh());
  }

  function printReport() {
    setPrintTimestamp(new Date().toISOString());
    setPrintRequested(true);
  }

  function exportCsv() {
    const columns: Array<[string, keyof ReportRow]> = [
      ["Recurso", "title"], ["Materia", "subject"], ["Docente o autor", "author"],
      ["Carrera", "career"], ["Semestre", "semester"], ["Grupo", "group"],
      ["Tipo de archivo", "fileType"], ["Categoría", "category"], ["Ciclo escolar", "period"],
      ["Año", "year"], ["Fecha de publicación", "publishedAt"], ["Consultas", "views"],
      ["Descargas", "downloads"], ["Estado", "status"],
    ];
    const content = [
      columns.map(([label]) => csvCell(label)).join(","),
      ...visibleRows.map((row) =>
        columns.map(([, key]) => csvCell(key === "publishedAt" ? formatDate(String(row[key])) : row[key] as string | number | null)).join(","),
      ),
    ].join("\r\n");
    const blob = new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reporte-actividad-${localDate(new Date())}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function sortBy(key: SortKey) {
    if (sortKey === key) setSortDirection((value) => value === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDirection("asc");
    }
    setPage(1);
  }

  function metricComparison(comparison: Comparison) {
    if (comparison === null) return null;
    if (comparison.previous === 0) {
      return <span className={`${styles.comparison} ${comparison.current > 0 ? styles.positive : ""}`}>
        {comparison.current > 0 ? "Nuevo en el periodo" : "Sin actividad anterior"}
      </span>;
    }
    const change = ((comparison.current - comparison.previous) / comparison.previous) * 100;
    const Icon = change >= 0 ? ArrowUp : ArrowDown;
    return <span className={`${styles.comparison} ${change >= 0 ? styles.positive : styles.negative}`}><Icon size={12}/>{change >= 0 ? "+" : ""}{formatNumber(change, 1)}% vs. anterior</span>;
  }

  const years = [...new Set([
    ...data.materials.map((item) => new Date(item.createdAt).getFullYear()),
    ...data.posts.map((item) => new Date(item.createdAt).getFullYear()),
    ...data.views.map((item) => new Date(item.occurredAt).getFullYear()),
    ...data.downloads.map((item) => new Date(item.occurredAt).getFullYear()),
    ...data.periods.map((period) => new Date(`${period.starts_on}T00:00:00`).getFullYear()),
  ])].sort((a, b) => b - a);
  const appliedFilterSummary = [
    applied.range === "all" ? "Todo el historial" : applied.range === "custom" ? `${applied.from || "Inicio"} a ${applied.to || "hoy"}` : applied.range,
    applied.periodId ? data.periods.find((period) => period.id === applied.periodId)?.name : "",
    applied.year,
    applied.careerId ? lookups.careerById.get(applied.careerId)?.name : "",
    applied.semester ? `${applied.semester}° semestre` : "",
    applied.subjectId ? lookups.subjectById.get(applied.subjectId)?.name : "",
    applied.groupId ? lookups.groupById.get(applied.groupId)?.code : "",
    applied.authorId ? lookups.profileById.get(applied.authorId)?.name : "",
    applied.materialType,
    applied.fileType,
    applied.activityType === "all" ? "" : applied.activityType,
  ].filter(Boolean).join(" · ");

  return (
    <div className={styles.reportPage}>
      <header className={styles.reportHeader}>
        <div>
          <h2>Actividad de la plataforma</h2>
          <p>Publicaciones, recursos y participación a partir de registros reales de Banco Académico.</p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.secondaryButton} onClick={refresh} disabled={refreshing}>
            <RotateCw size={15} className={refreshing ? styles.spinning : ""}/>{refreshing ? "Actualizando…" : "Actualizar"}
          </button>
          <button type="button" className={styles.secondaryButton} onClick={exportCsv} disabled={!visibleRows.length}>
            <Download size={15}/>Exportar CSV
          </button>
          <button type="button" className={styles.primaryButton} onClick={printReport}>
            <Printer size={15}/>Descargar PDF
          </button>
        </div>
      </header>

      <div className={styles.printSummary}>
        <strong>Instituto Tecnológico de San Luis Potosí</strong>
        <span>Reporte Estadístico de Banco Académico</span>
        <span>Generado: {printTimestamp ? new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeStyle: "short" }).format(new Date(printTimestamp)) : "al solicitar la descarga"}</span>
        <span>Filtros: {appliedFilterSummary}</span>
      </div>
      <form className={styles.filters} onSubmit={applyFilters}>
        <div className={styles.filterHeading}>
          <div><h3>Filtros del reporte</h3><p>Combina criterios; los cambios se aplican al enviar.</p></div>
          <Filter size={17} aria-hidden="true"/>
        </div>
        <div className={styles.filterGrid}>
          <label>Periodo de actividad
            <select value={draft.range} onChange={(event) => {
              const range = event.target.value as DateRange;
              setDraft((current) => ({ ...current, range, ...(range === "custom" ? {} : presetDates(range)) }));
            }}>
              <option value="all">Todo el historial</option><option value="day">Hoy</option><option value="week">Esta semana</option>
              <option value="month">Este mes</option><option value="year">Este año</option><option value="custom">Rango personalizado</option>
            </select>
          </label>
          <label>Fecha inicial
            <input type="date" value={draft.from} disabled={draft.range !== "custom"} onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))}/>
          </label>
          <label>Fecha final
            <input type="date" value={draft.to} disabled={draft.range !== "custom"} onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))}/>
          </label>
          <label>Ciclo escolar
            <select value={draft.periodId} onChange={(event) => setDraft((current) => ({ ...current, periodId: event.target.value }))}>
              <option value="">Todos los ciclos</option>{data.periods.map((period) => <option key={period.id} value={period.id}>{period.name}{period.is_current ? " · Vigente" : ""}</option>)}
            </select>
          </label>
          <label>Año
            <select value={draft.year} onChange={(event) => setDraft((current) => ({ ...current, year: event.target.value }))}>
              <option value="">Todos los años</option>{years.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </label>
          <label>Carrera
            <select value={draft.careerId} onChange={(event) => setDraft((current) => ({ ...current, careerId: event.target.value, subjectId: "", groupId: "" }))}>
              <option value="">Todas las carreras</option>{data.careers.map((career) => <option key={career.id} value={career.id}>{career.name}</option>)}
            </select>
          </label>
          <label>Semestre
            <select value={draft.semester} onChange={(event) => setDraft((current) => ({ ...current, semester: event.target.value }))}>
              <option value="">Todos</option>{Array.from({ length: 13 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}°</option>)}
            </select>
          </label>
          <label>Materia
            <select value={draft.subjectId} onChange={(event) => setDraft((current) => ({ ...current, subjectId: event.target.value, groupId: "" }))}>
              <option value="">Todas las materias</option>{data.subjects.filter((item) => !draft.careerId || item.career_id === draft.careerId).map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
            </select>
          </label>
          <label>Grupo
            <select value={draft.groupId} onChange={(event) => setDraft((current) => ({ ...current, groupId: event.target.value }))}>
              <option value="">Todos los grupos</option>{data.groups.filter((group) => !draft.subjectId || group.subject_id === draft.subjectId).map((group) => <option key={group.id} value={group.id}>{group.code}</option>)}
            </select>
          </label>
          <label>Docente asignado
            <select value={draft.teacherId} onChange={(event) => setDraft((current) => ({ ...current, teacherId: event.target.value }))}>
              <option value="">Todos</option>{data.profiles.filter((profile) => profile.role === "docente").map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
            </select>
          </label>
          <label>Autor de publicación
            <select value={draft.authorId} onChange={(event) => setDraft((current) => ({ ...current, authorId: event.target.value }))}>
              <option value="">Todos</option>{data.profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name} · {profile.role}</option>)}
            </select>
          </label>
          <label>Tipo de usuario
            <select value={draft.userRole} onChange={(event) => setDraft((current) => ({ ...current, userRole: event.target.value as Filters["userRole"] }))}>
              <option value="all">Todos</option><option value="alumno">Estudiante</option><option value="docente">Docente</option><option value="administrador">Administrador</option>
            </select>
          </label>
          <label>Estado de cuenta
            <select value={draft.userStatus} onChange={(event) => setDraft((current) => ({ ...current, userStatus: event.target.value as Filters["userStatus"] }))}>
              <option value="all">Todos</option><option value="active">Activos</option><option value="inactive">Inactivos</option>
            </select>
          </label>
          <label>Categoría del recurso
            <select value={draft.materialType} onChange={(event) => setDraft((current) => ({ ...current, materialType: event.target.value }))}>
              <option value="">Todas las categorías</option>{[...new Set(data.materials.map((item) => item.materialType))].sort().map((type) => <option key={type}>{type}</option>)}
            </select>
          </label>
          <label>Tipo de archivo
            <select value={draft.fileType} onChange={(event) => setDraft((current) => ({ ...current, fileType: event.target.value }))}>
              <option value="">Todos</option>{[...new Set(data.materials.map((item) => extension(item.storagePath)))].sort().map((type) => <option key={type}>{type}</option>)}
            </select>
          </label>
          <label>Estado del recurso
            <select value={draft.materialStatus} onChange={(event) => setDraft((current) => ({ ...current, materialStatus: event.target.value }))}>
              <option value="">Todos</option>{[...new Set(data.materials.map((item) => item.status))].sort().map((status) => <option key={status}>{status}</option>)}
            </select>
          </label>
          <label>Tipo de actividad
            <select value={draft.activityType} onChange={(event) => setDraft((current) => ({ ...current, activityType: event.target.value as Filters["activityType"] }))}>
              <option value="all">Toda la actividad</option><option value="publications">Publicaciones</option><option value="views">Consultas</option><option value="downloads">Descargas</option>
            </select>
          </label>
        </div>
        {filterError && <p className={styles.filterError} role="alert">{filterError}</p>}
        <div className={styles.filterActions}>
          <button type="submit" className={styles.primaryButton}><Filter size={15}/>Aplicar filtros</button>
          <button type="button" className={styles.secondaryButton} onClick={clearFilters}>Limpiar filtros</button>
          <span className={styles.filterSummary}><CalendarDays size={14}/>{materialScope.length} recursos · {postScope.length} publicaciones</span>
        </div>
      </form>

      <section aria-labelledby="activity-kpis">
        <div className={styles.sectionHeading}><div><h3 id="activity-kpis">Indicadores principales</h3><p>Los totales respetan los filtros aplicables a cada fuente.</p></div></div>
        <div className={styles.kpiGrid}>
          {metricsPrimary.map((metric) => (
            <article className={styles.kpi} key={metric.label}>
              <span className={styles.kpiLabel}>{metric.label}</span>
              <strong className={styles.kpiValue}>{typeof metric.value === "number" ? formatNumber(metric.value) : metric.value}</strong>
              <small>{metric.detail}</small>
              {metricComparison(metric.comparison)}
            </article>
          ))}
        </div>
        <dl className={styles.secondaryMetrics}>
          {metricsSecondary.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
        {scope === "docente" && <p className={styles.scopeNote}><Users size={15}/>Tu alcance se limita a tus materiales, grupos asignados y eventos visibles según permisos.</p>}
        {dataNotice && <p className={styles.dataNotice}>{dataNotice}</p>}
      </section>

      <section className={styles.chartSection} aria-labelledby="activity-charts">
        <div className={styles.sectionHeading}><div><h3 id="activity-charts">Actividad y participación</h3><p>Consultas históricas disponibles desde la fecha de activación del seguimiento.</p></div></div>
        <div className={styles.chartsGrid}>
          <ChartPanel title="Actividad general" subtitle="Publicaciones, consultas y descargas por periodo." className={styles.chartWide}>
            <LineChart data={series}/>
          </ChartPanel>
          <ChartPanel title="Actividad por materia" subtitle="Publicaciones y recursos consultados o descargados.">
            <ActivityBars data={subjectActivity.slice(0, 10)} label="materias"/>
          </ChartPanel>
          <ChartPanel title="Distribución de usuarios" subtitle={scope === "administrador" ? "Cuentas registradas según su rol." : "El total institucional no se comparte con docentes."}>
            {scope === "administrador" ? <RoleDonut data={roleCounts}/> : <ChartEmpty message="La distribución global de cuentas está reservada a administración."/>}
          </ChartPanel>
          <ChartPanel title="Participación por carrera" subtitle="Actividad de recursos asociados a cada carrera.">
            <ActivityBars data={careerActivity.slice(0, 10)} label="carreras"/>
          </ChartPanel>
          <ChartPanel title="Actividad por semestre" subtitle="Recursos compartidos, semestres 1 al 13.">
            <SemesterBars data={semesterActivity}/>
          </ChartPanel>
          <ChartPanel title="Distribución de recursos" subtitle="Categorías de materiales registrados.">
            <ActivityBars data={typeActivity.map((item) => ({ ...item, total: item.count, publications: item.count, views: 0, downloads: 0 }))} label="categorías"/>
          </ChartPanel>
          <ChartPanel title="Mapa de calor académico" subtitle="Recursos compartidos por materia y semestre.">
            <Heatmap data={heatmap}/>
          </ChartPanel>
        </div>
      </section>

      <section className={styles.analysis} aria-labelledby="activity-insights">
        <div className={styles.sectionHeading}><div><h3 id="activity-insights">Lecturas del periodo</h3><p>Observaciones calculadas únicamente con los registros filtrados.</p></div></div>
        {metrics.publications || views.length || downloads.length
          ? <ul>
              <li><strong>{resourcesBySubject}</strong> concentra la mayor actividad por materia.</li>
              <li><strong>{resourcesByCareer}</strong> registra más actividad entre las carreras con recursos relacionados.</li>
              <li>Se registraron <strong>{formatNumber(views.length)}</strong> consultas y <strong>{formatNumber(downloads.length)}</strong> descargas en el periodo seleccionado.</li>
              {publicationChange !== null && publicationChange.count > 0 && <li>Las publicaciones cambiaron <strong>{metrics.publications >= publicationChange.count ? "+" : ""}{formatNumber((metrics.publications - publicationChange.count) / publicationChange.count * 100, 1)}%</strong> frente al periodo anterior equivalente.</li>}
            </ul>
          : <p>No hay actividad suficiente para generar conclusiones en esta selección.</p>}
      </section>

      <section className={styles.tableSection} aria-labelledby="activity-details">
        <div className={styles.tableHeading}>
          <div><h3 id="activity-details">Detalle de recursos</h3><p>{visibleRows.length} registros filtrados · Los avisos se contabilizan como publicaciones, no como recursos descargables.</p></div>
          <label className={styles.searchBox}><Search size={15}/><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar recurso, materia o autor" aria-label="Buscar recursos"/></label>
        </div>
        <div className={styles.tableScroll}>
          <table>
            <thead><tr>
              <SortHeader label="Recurso" sortKey="title" active={sortKey} direction={sortDirection} onSort={sortBy}/>
              <SortHeader label="Materia" sortKey="subject" active={sortKey} direction={sortDirection} onSort={sortBy}/>
              <SortHeader label="Docente / autor" sortKey="author" active={sortKey} direction={sortDirection} onSort={sortBy}/>
              <SortHeader label="Carrera" sortKey="career" active={sortKey} direction={sortDirection} onSort={sortBy}/>
              <SortHeader label="Semestre" sortKey="semester" active={sortKey} direction={sortDirection} onSort={sortBy}/>
              <th>Tipo / categoría</th><th>Ciclo escolar</th><th>Año</th>
              <SortHeader label="Fecha" sortKey="publishedAt" active={sortKey} direction={sortDirection} onSort={sortBy}/>
              <SortHeader label="Consultas" sortKey="views" active={sortKey} direction={sortDirection} onSort={sortBy}/>
              <SortHeader label="Descargas" sortKey="downloads" active={sortKey} direction={sortDirection} onSort={sortBy}/>
              <th>Detalle</th>
            </tr></thead>
            <tbody>
              {pageRows.map((row) => <FragmentRow key={row.id} row={row} expanded={expanded === row.id} onToggle={() => setExpanded((value) => value === row.id ? null : row.id)}/>)}
              {!pageRows.length && <tr><td className={styles.emptyCell} colSpan={11}>{rows.length ? "No hay recursos que coincidan con la búsqueda." : "No hay recursos para los filtros seleccionados."}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className={styles.tableFooter}>
          <label>Filas
            <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>
              <option value={10}>10</option><option value={25}>25</option><option value={50}>50</option>
            </select>
          </label>
          <span>{visibleRows.length ? `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, visibleRows.length)} de ${visibleRows.length}` : "0 registros"}</span>
          <div>
            <button type="button" className={styles.secondaryButton} disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</button>
            <button type="button" className={styles.secondaryButton} disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Siguiente</button>
          </div>
        </div>
        <div className={styles.printOnlyTable}>
          <table>
            <thead><tr><th>Recurso</th><th>Materia</th><th>Docente / autor</th><th>Carrera</th><th>Semestre</th><th>Tipo / categoría</th><th>Ciclo escolar</th><th>Año</th><th>Fecha</th><th>Consultas</th><th>Descargas</th></tr></thead>
            <tbody>{visibleRows.map((row) => <tr key={row.id}>
              <th>{row.title}</th><td>{row.subject}</td><td>{row.author}</td><td>{row.career}</td><td>{row.semester ?? "—"}</td>
              <td>{row.fileType} · {row.category}</td><td>{row.period}</td><td>{row.year}</td><td>{formatDate(row.publishedAt)}</td>
              <td>{row.views}</td><td>{row.downloads}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>
      <footer className={styles.reportFooter}>
        <span>Instituto Tecnológico de San Luis Potosí · Reporte Estadístico de Banco Académico</span>
        <span>Filtros aplicados: {appliedFilterSummary}</span>
      </footer>
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  active,
  direction,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  direction: "asc" | "desc";
  onSort: (key: SortKey) => void;
}) {
  return <th aria-sort={active === sortKey ? direction === "asc" ? "ascending" : "descending" : "none"}>
    <button type="button" onClick={() => onSort(sortKey)}>{label}{active === sortKey ? direction === "asc" ? " ↑" : " ↓" : ""}</button>
  </th>;
}

function FragmentRow({ row, expanded, onToggle }: { row: ReportRow; expanded: boolean; onToggle: () => void }) {
  return <>
    <tr>
      <th scope="row">{row.title}</th><td>{row.subject}</td><td>{row.author}</td><td>{row.career}</td>
      <td>{row.semester ? `${row.semester}°` : "—"}</td><td>{row.fileType} · {row.category}</td>
      <td>{row.period}</td><td>{row.year}</td><td>{formatDate(row.publishedAt)}</td>
      <td>{formatNumber(row.views)}</td><td>{formatNumber(row.downloads)}</td>
      <td><button type="button" className={styles.detailButton} aria-expanded={expanded} onClick={onToggle}>{expanded ? "Cerrar" : "Ver"}</button></td>
    </tr>
    {expanded && <tr className={styles.expandedRow}><td colSpan={12}>
      <strong>{row.title}</strong><span>Estado: {row.status}</span><p>{row.description || "Sin descripción."}</p>
      <span>Grupo: {row.group} · Publicado: {formatDate(row.publishedAt)}</span>
    </td></tr>}
  </>;
}

function ChartPanel({ title, subtitle, className, children }: { title: string; subtitle: string; className?: string; children: ReactNode }) {
  return <article className={`${styles.chartPanel} ${className ?? ""}`}><div className={styles.chartTitle}><h4>{title}</h4><p>{subtitle}</p></div>{children}</article>;
}

function ChartEmpty({ message }: { message: string }) {
  return <div className={styles.chartEmpty}>{message}</div>;
}

function LineChart({ data }: { data: Array<{ key: string; label: string; publications: number; views: number; downloads: number }> }) {
  if (!data.length) return <ChartEmpty message="No hay registros para graficar en el periodo seleccionado." />;
  const width = 720;
  const height = 220;
  const pad = { left: 36, right: 12, top: 16, bottom: 34 };
  const max = Math.max(1, ...data.flatMap((item) => [item.publications, item.views, item.downloads]));
  const x = (index: number) => pad.left + index * (width - pad.left - pad.right) / Math.max(data.length - 1, 1);
  const y = (value: number) => pad.top + (1 - value / max) * (height - pad.top - pad.bottom);
  const lines = [
    { key: "publications", label: "Publicaciones", className: styles.linePublications },
    { key: "views", label: "Consultas", className: styles.lineViews },
    { key: "downloads", label: "Descargas", className: styles.lineDownloads },
  ] as const;
  return <div className={styles.lineChart}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Actividad por periodo: ${data.map((item) => `${item.label}: ${item.publications} publicaciones, ${item.views} consultas, ${item.downloads} descargas`).join("; ")}`}>
      {[0, 1, 2, 3].map((step) => {
        const value = Math.round(max * (1 - step / 3));
        const yValue = y(value);
        return <g key={step}><line className={styles.gridLine} x1={pad.left} y1={yValue} x2={width - pad.right} y2={yValue}/><text className={styles.axisText} x={pad.left - 8} y={yValue + 4} textAnchor="end">{value}</text></g>;
      })}
      {lines.map((line) => <polyline key={line.key} className={`${styles.line} ${line.className}`} points={data.map((item, index) => `${x(index)},${y(item[line.key])}`).join(" ")}/>)}
      {data.map((item, index) => <text key={item.key} className={styles.axisText} x={x(index)} y={height - 10} textAnchor="middle">{item.label}</text>)}
    </svg>
    <div className={styles.legend}>{lines.map((line) => <span key={line.key}><i className={line.className}/>{line.label}</span>)}</div>
  </div>;
}

function ActivityBars({ data, label }: { data: Array<{ label: string; total: number; publications: number; views: number; downloads: number }>; label: string }) {
  if (!data.length || !data.some((item) => item.total)) return <ChartEmpty message={`No hay actividad registrada para las ${label} seleccionadas.`} />;
  const shown = data.slice(0, 9);
  const max = Math.max(1, ...shown.map((item) => item.total));
  return <div className={styles.activityBars}>
    {shown.map((item) => <div className={styles.barRow} key={item.label} title={`${item.label}: ${item.publications} publicaciones, ${item.views} consultas, ${item.downloads} descargas`}>
      <span>{item.label}</span><div className={styles.barTrack}><i style={{ width: `${Math.max(3, item.total / max * 100)}%` }}/></div><strong>{formatNumber(item.total)}</strong>
    </div>)}
  </div>;
}

function RoleDonut({ data }: { data: Array<{ role: Role; label: string; count: number }> }) {
  const total = data.reduce((sum, item) => sum + item.count, 0);
  if (!total) return <ChartEmpty message="No hay cuentas en esta selección." />;
  let offset = 0;
  const segments = data.map((item) => {
    const start = offset;
    offset += item.count / total * 100;
    return `${item.role === "alumno" ? "#183b70" : item.role === "docente" ? "#8d3b55" : "#6f8caf"} ${start}% ${offset}%`;
  });
  return <div className={styles.donutWrap}>
    <div className={styles.donut} style={{ background: `conic-gradient(${segments.join(",")})` }} role="img" aria-label={`Distribución de ${formatNumber(total)} cuentas`}>
      <div><strong>{formatNumber(total)}</strong><span>cuentas</span></div>
    </div>
    <div className={styles.donutLegend}>{data.map((item) => <span key={item.role}><i className={`${styles.legendDot} ${styles[`role-${item.role}`]}`}/>{item.label}<strong>{formatNumber(item.count)}</strong></span>)}</div>
  </div>;
}

function SemesterBars({ data }: { data: Array<{ semester: number; count: number }> }) {
  const max = Math.max(1, ...data.map((item) => item.count));
  return <div className={styles.semesterBars} role="img" aria-label={`Recursos por semestre: ${data.map((item) => `${item.semester}: ${item.count}`).join("; ")}`}>
    {data.map((item) => <div className={styles.semesterColumn} key={item.semester} title={`${item.semester}°: ${item.count} recursos`}>
      <strong>{item.count || ""}</strong><i style={{ height: `${Math.max(item.count ? 4 : 0, item.count / max * 100)}%` }}/><span>{item.semester}</span>
    </div>)}
  </div>;
}

function Heatmap({ data }: { data: Array<{ id: string; name: string; bySemester: number[] }> }) {
  if (!data.length) return <ChartEmpty message="No hay datos suficientes para relacionar materias y semestres." />;
  const max = Math.max(1, ...data.flatMap((item) => item.bySemester));
  return <div className={styles.heatmapScroll}><table className={styles.heatmap}>
    <thead><tr><th>Materia</th>{Array.from({ length: 13 }, (_, index) => <th key={index}>{index + 1}</th>)}</tr></thead>
    <tbody>{data.map((subject) => <tr key={subject.id}><th title={subject.name}>{subject.name}</th>{subject.bySemester.map((count, index) => <td key={index}><span style={{ opacity: count ? .22 + count / max * .78 : .08 }} title={`${count} recursos`}>{count || "·"}</span></td>)}</tr>)}</tbody>
  </table></div>;
}
