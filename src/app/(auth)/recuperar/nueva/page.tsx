import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";

export const dynamic = "force-dynamic";

export default async function NewPassword() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/recuperar?error=enlace");
  return <Suspense><AuthForm mode="new-password"/></Suspense>;
}
