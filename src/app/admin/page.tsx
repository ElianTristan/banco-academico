import { Portal } from "@/components/portal";

export default async function AdminHome({
  searchParams,
}: {
  searchParams?: Promise<{ auth?: string }>;
}) {
  const params = await searchParams;
  return <Portal role="administrador" authSuccess={params?.auth === "success"} />;
}
