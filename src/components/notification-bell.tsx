"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, ClipboardList, Megaphone } from "lucide-react";

type Notice = { id: string; tipo: "tarea" | "anuncio"; titulo: string; mensaje: string; remitente_nombre: string; remitente_rol: string; leida: boolean; fecha_creacion: string };
type Payload = { items: Notice[]; unreadCount: number };

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

export function NotificationBell({ href }: { href: string }) {
  const [payload, setPayload] = useState<Payload>({ items: [], unreadCount: 0 });
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/notificaciones?limit=10", { cache: "no-store" });
      if (!response.ok) throw new Error();
      setPayload(await response.json() as Payload);
      setError("");
    } catch { setError("No se pudieron actualizar las notificaciones."); }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    function outside(event: MouseEvent) { if (!root.current?.contains(event.target as Node)) setOpen(false); }
    function escape(event: KeyboardEvent) { if (event.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", escape); };
  }, []);

  async function mark(id?: string) {
    await fetch("/api/notificaciones", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(id ? { id } : { all: true }) });
    await refresh();
  }

  const count = payload.unreadCount;
  return <div className="notification-root" ref={root}>
    <button className="notification-trigger" type="button" aria-label={count ? `Notificaciones, ${count} sin leer` : "Notificaciones"} aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <Bell size={19} aria-hidden="true" />{count > 0 && <span className="notification-badge">{count > 9 ? "9+" : count}</span>}
    </button>
    {open && <section className="notification-popover" aria-label="Notificaciones recientes">
      <div className="notification-heading"><div><strong>Notificaciones</strong><span>{count} sin leer</span></div><button type="button" onClick={() => void mark()} disabled={!count} aria-label="Marcar todas como leídas"><CheckCheck size={17}/></button></div>
      {error ? <p className="notification-empty" role="alert">{error}</p> : payload.items.length === 0 ? <p className="notification-empty">No tienes notificaciones.</p> : <ul>{payload.items.map(item => {
        const Icon = item.tipo === "tarea" ? ClipboardList : Megaphone;
        const roleName = item.remitente_rol === "administrador" ? "Administrador" : "Profesor";
        return <li key={item.id} className={item.leida ? "is-read" : "is-unread"}><button type="button" onClick={() => { if (!item.leida) void mark(item.id); setOpen(false); }}><span className={`notification-kind kind-${item.tipo}`}><Icon size={16}/></span><span className="notification-copy"><strong>{item.titulo}</strong><span>{item.mensaje}</span><small>{item.remitente_nombre || roleName} · {roleName} · {relativeTime(item.fecha_creacion)}</small></span>{!item.leida && <i aria-label="Sin leer"/>}</button></li>;
      })}</ul>}
      <Link className="notification-all-link" href={href} onClick={() => setOpen(false)}>Ver todas</Link>
    </section>}
  </div>;
}
