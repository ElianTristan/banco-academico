import { redirect } from "next/navigation";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/server";
import { isAppRole, roleHomes } from "@/lib/roles";

export default async function Home() {
  if (!hasSupabaseConfig()) redirect("/login");

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (isAppRole(data?.role)) redirect(roleHomes[data.role]);
    redirect("/acceso-pendiente");
  } catch {
    redirect("/login");
  }
}
