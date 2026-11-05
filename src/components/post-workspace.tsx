"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { publishPost } from "@/app/academic/actions";
import type { AppRole } from "@/lib/roles";

type Post = { id: string; title: string; body: string; post_type: string; created_at: string; group_id: string | null };
type Group = { id: string; code: string };

export function PostWorkspace({ role, posts, groups }: { role: AppRole; posts: Post[]; groups: Group[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, startTransition] = useTransition();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    startTransition(async () => {
      const result = await publishPost(data);
      setFailed(!result.ok);
      setMessage(result.ok ? "Publicación enviada y notificaciones generadas." : result.error);
      if (result.ok) { form.reset(); router.refresh(); }
    });
  }
  return <div className="module-stack">
    {(role === "administrador" || role === "docente") && <section className="panel"><div className="module-toolbar"><div><h2>Crear tarea o anuncio</h2><p className="muted">Quienes estén en el grupo recibirán una notificación automáticamente.</p></div></div>
      <form className="material-form" onSubmit={submit}><div className="form-grid">
        <label className="field"><span>Tipo</span><select name="postType" defaultValue="anuncio"><option value="anuncio">Anuncio</option><option value="tarea">Tarea</option></select></label>
        <label className="field"><span>Destinatarios</span><select name="groupId" required={role === "docente"} defaultValue=""><>{role === "administrador" && <option value="">Todos los alumnos</option>}{groups.map(group => <option key={group.id} value={group.id}>Grupo {group.code}</option>)}</></select></label>
        <label className="field fullcol"><span>Título</span><input name="title" required minLength={3} maxLength={180}/></label>
        <label className="field fullcol"><span>Mensaje</span><textarea name="body" required minLength={3} maxLength={4000} rows={4}/></label>
      </div>{message && <p className={failed ? "form-error" : "form-success"} role={failed ? "alert" : "status"}>{message}</p>}<button className="button" type="submit" disabled={busy}>{busy ? "Publicando…" : "Publicar"}</button></form>
    </section>}
    <section className="panel"><div className="table-head"><div><span className="eyebrow">Comunidad</span><h2>{role === "alumno" ? "Tareas y anuncios" : "Publicaciones recientes"}</h2></div></div>
      {!posts.length ? <div className="empty">No hay publicaciones disponibles.</div> : posts.map(post => <article className="notice" key={post.id}><span className="eyebrow">{post.post_type === "tarea" ? "Tarea" : "Anuncio"} · {new Date(post.created_at).toLocaleDateString("es-MX", { dateStyle: "medium" })}</span><h3>{post.title}</h3><p>{post.body}</p></article>)}
    </section>
  </div>;
}
