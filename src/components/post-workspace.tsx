"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FileDown, FileText, Upload } from "lucide-react";
import { downloadPostAttachment, publishPost } from "@/app/academic/actions";
import { createClient } from "@/lib/supabase/client";
import type { AppRole } from "@/lib/roles";

type Post = { id: string; title: string; body: string; post_type: string; created_at: string; group_id: string | null; attachment_path: string | null };
type Group = { id: string; code: string };
const MAX_PDF_SIZE = 15 * 1024 * 1024;

export function PostWorkspace({ role, posts, groups, userId, attachmentsReady }: { role: AppRole; posts: Post[]; groups: Group[]; userId: string; attachmentsReady: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, startTransition] = useTransition();
  const [downloading, setDownloading] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("attachment");
    startTransition(async () => {
      let path = "";
      if (file instanceof File && file.size > 0) {
        if (file.type !== "application/pdf" || file.size > MAX_PDF_SIZE || !file.name.toLowerCase().endsWith(".pdf")) {
          setFailed(true);
          setMessage("Adjunta un archivo PDF válido de máximo 15 MB.");
          return;
        }
        const safeName = file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "-").slice(-100);
        path = `${userId}/${crypto.randomUUID()}/${safeName}`;
        const { error } = await createClient().storage.from("academic-posts").upload(path, file, { contentType: "application/pdf", upsert: false });
        if (error) {
          setFailed(true);
          setMessage("No se pudo subir el PDF. Verifica que esté aplicada la migración 0014.");
          return;
        }
        data.set("attachmentPath", path);
      }
      const result = await publishPost(data);
      setFailed(!result.ok);
      setMessage(result.ok ? "Publicación enviada con sus notificaciones." : result.error);
      if (result.ok) { form.reset(); router.refresh(); }
      else if (path) await createClient().storage.from("academic-posts").remove([path]);
    });
  }

  async function download(postId: string) {
    setDownloading(postId);
    const result = await downloadPostAttachment(postId);
    setDownloading(null);
    if (result.ok) {
      if (result.data?.url) window.location.assign(result.data.url);
      else { setFailed(true); setMessage("No se encontró el archivo para descargar."); }
    } else { setFailed(true); setMessage(result.error); }
  }

  return <div className="module-stack">
    <section className="panel"><div className="module-toolbar"><div><h2>Crear tarea o anuncio</h2><p className="muted">Comparte información con un grupo. Puedes adjuntar un PDF de hasta 15 MB.</p></div></div>
      {role === "alumno" && !attachmentsReady ? <p className="form-error" role="status">Aplica la migración 0014 de Supabase para habilitar publicaciones de alumnos y adjuntos PDF.</p> : <form className="material-form" onSubmit={submit}><div className="form-grid">
        <label className="field"><span>Tipo</span><select name="postType" defaultValue="anuncio"><option value="anuncio">Anuncio</option><option value="tarea">Tarea</option></select></label>
        <label className="field"><span>Destinatarios</span><select name="groupId" required={role !== "administrador"} defaultValue=""><option value="">{role === "administrador" ? "Todos los alumnos" : "Selecciona un grupo"}</option>{groups.map(group => <option key={group.id} value={group.id}>Grupo {group.code}</option>)}</select></label>
        <label className="field fullcol"><span>Título</span><input name="title" required minLength={3} maxLength={180}/></label>
        <label className="field fullcol"><span>Mensaje</span><textarea name="body" required minLength={3} maxLength={4000} rows={4}/></label>
        <label className="field fullcol post-pdf-field"><span><FileText size={16}/> PDF adjunto (opcional)</span><input name="attachment" type="file" accept="application/pdf,.pdf" disabled={!attachmentsReady}/><small>{attachmentsReady ? "Solo PDF; máximo 15 MB." : "Aplica la migración 0014 de Supabase para habilitar adjuntos."}</small></label>
      </div>{message && <p className={failed ? "form-error" : "form-success"} role={failed ? "alert" : "status"}>{message}</p>}<button className="button" type="submit" disabled={busy}>{busy ? "Publicando…" : <><Upload size={16}/> Publicar</>}</button></form>}
    </section>
    <section className="panel"><div className="table-head"><div><span className="eyebrow">Comunidad</span><h2>{role === "alumno" ? "Tareas y anuncios" : "Publicaciones recientes"}</h2></div></div>
      {!posts.length ? <div className="empty">No hay publicaciones disponibles.</div> : posts.map(post => <article className="notice post-notice" key={post.id}><span className="eyebrow">{post.post_type === "tarea" ? "Tarea" : "Anuncio"} · {new Date(post.created_at).toLocaleDateString("es-MX", { dateStyle: "medium" })}</span><h3>{post.title}</h3><p>{post.body}</p>{post.attachment_path && <button className="button button-secondary post-download" type="button" disabled={downloading === post.id} onClick={() => void download(post.id)}><FileDown size={16}/>{downloading === post.id ? "Preparando PDF…" : "Descargar PDF adjunto"}</button>}</article>)}
    </section>
  </div>;
}
