import { Portal } from "@/components/portal";

export default async function TeacherHome({
  searchParams,
}: {
  searchParams?: Promise<{ auth?: string }>;
}) {
  const params = await searchParams;
  return <Portal role="docente" authSuccess={params?.auth === "success"} />;
}
