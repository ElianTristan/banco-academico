import { Portal } from "@/components/portal";

export default async function StudentHome({
  searchParams,
}: {
  searchParams?: Promise<{ auth?: string }>;
}) {
  const params = await searchParams;
  return <Portal role="alumno" authSuccess={params?.auth === "success"} />;
}
