import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAppRole, roleHomes } from "@/lib/roles";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (isAppRole(data?.role)) redirect(roleHomes[data.role]);
  redirect("/acceso-pendiente");
}
