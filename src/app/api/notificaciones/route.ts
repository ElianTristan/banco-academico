import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function getActiveUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { response: NextResponse.json({ error: "No autorizado." }, { status: 401 }) };
  const { data: profile } = await supabase.from("profiles").select("role,is_active").eq("id", user.id).maybeSingle();
  if (!profile || profile.is_active !== true) return { response: NextResponse.json({ error: "Cuenta inactiva." }, { status: 403 }) };
  return { supabase, user };
}

export async function GET(request: Request) {
  const session = await getActiveUser();
  if ("response" in session) return session.response;
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(30, Number(url.searchParams.get("limit") || 10)));
  const [list, count] = await Promise.all([
    session.supabase.from("notificaciones").select("id,tipo,titulo,mensaje,remitente_id,remitente_nombre,remitente_rol,leida,fecha_creacion").eq("usuario_destino_id", session.user.id).order("fecha_creacion", { ascending: false }).limit(limit),
    session.supabase.from("notificaciones").select("id", { count: "exact", head: true }).eq("usuario_destino_id", session.user.id).eq("leida", false),
  ]);
  if (list.error || count.error) return NextResponse.json({ error: "No se pudieron cargar las notificaciones." }, { status: 500 });
  return NextResponse.json({ items: list.data ?? [], unreadCount: count.count ?? 0 }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const session = await getActiveUser();
  if ("response" in session) return session.response;
  let body: { id?: unknown; all?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 }); }
  let update = session.supabase.from("notificaciones").update({ leida: true }).eq("usuario_destino_id", session.user.id).eq("leida", false);
  if (body.all === true) {
    // Marca únicamente los registros propios gracias al filtro de destino y RLS.
  } else if (typeof body.id === "string" && /^[0-9a-f-]{36}$/i.test(body.id)) {
    update = session.supabase.from("notificaciones").update({ leida: true }).eq("usuario_destino_id", session.user.id).eq("id", body.id);
  } else return NextResponse.json({ error: "Indica una notificación válida." }, { status: 400 });
  const { error } = await update;
  if (error) return NextResponse.json({ error: "No se pudo actualizar la notificación." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
