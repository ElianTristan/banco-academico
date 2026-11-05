"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Check, FileText, ImagePlus, MessageCircle, Plus, Send, UserRound, Users, X } from "lucide-react";
import { createGroupChat, loadChatMessages, sendChatMessage, startDirectChat } from "@/app/academic/actions";
import { createClient } from "@/lib/supabase/client";
import type { AppRole } from "@/lib/roles";

type Contact = { id: string; full_name: string; role: AppRole };
type Conversation = { conversation_id: string; contact_id: string | null; full_name: string; role: AppRole | null; is_group: boolean; member_count: number; unread_count: number; updated_at: string };
type ChatMessage = { id: string; conversation_id: string; sender_id: string; sender_name: string; body: string; created_at: string; attachment_name: string | null; attachment_mime: string | null; attachment_size: number | null; attachment_path: string | null; attachment_url: string | null };
const roleNames: Record<AppRole, string> = { alumno: "Alumno", docente: "Docente", administrador: "Administrador" };
const acceptedMimeTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "audio/mpeg", "audio/mp4", "audio/ogg", "audio/wav", "audio/webm", "video/mp4", "video/webm", "video/quicktime"];
const maxFileSize = 25 * 1024 * 1024;

export function ChatWorkspace({ userId, ready, contacts, conversations }: { userId: string; ready: boolean; contacts: Contact[]; conversations: Conversation[] }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(conversations[0]?.conversation_id ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const selected = conversations.find(item => item.conversation_id === selectedId);

  const refreshMessages = useCallback(async () => {
    if (!selectedId) { setMessages([]); return; }
    const result = await loadChatMessages(selectedId);
    if (result.ok) { setMessages(result.items as ChatMessage[]); setError(""); }
    else setError(result.error);
  }, [selectedId]);

  useEffect(() => {
    void refreshMessages();
    const timer = window.setInterval(() => void refreshMessages(), 7000);
    return () => window.clearInterval(timer);
  }, [refreshMessages]);

  async function openContact(contact: Contact) {
    setBusy(true); setError("");
    const result = await startDirectChat(contact.id);
    setBusy(false);
    if (!result.ok || !result.data?.conversationId) { setError(result.ok ? "No se pudo abrir el chat." : result.error); return; }
    setSelectedId(result.data.conversationId);
    setCreatingGroup(false);
    router.refresh();
  }

  async function createGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    const result = await createGroupChat(groupTitle, groupMembers);
    setBusy(false);
    if (!result.ok || !result.data?.conversationId) { setError(result.ok ? "No se pudo crear el grupo." : result.error); return; }
    setSelectedId(result.data.conversationId);
    setCreatingGroup(false); setGroupMembers([]); setGroupTitle("");
    router.refresh();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || (!draft.trim() && !file)) return;
    if (file && (!acceptedMimeTypes.includes(file.type) || file.size < 1 || file.size > maxFileSize)) {
      setError("Este formato no está permitido o supera el límite de 25 MB."); return;
    }
    setBusy(true); setError("");
    let path = "";
    let attachment: { path: string; name: string; mime: string; size: number } | undefined;
    if (file) {
      const safeName = file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120);
      path = `${userId}/${selectedId}/${crypto.randomUUID()}/${safeName}`;
      const { error: uploadError } = await createClient().storage.from("chat-attachments").upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) {
        setBusy(false); setError("No se pudo cargar el archivo. Verifica que esté aplicada la migración 0015."); return;
      }
      attachment = { path, name: safeName, mime: file.type, size: file.size };
    }
    const result = await sendChatMessage(selectedId, draft, attachment);
    setBusy(false);
    if (!result.ok) {
      if (path) await createClient().storage.from("chat-attachments").remove([path]);
      setError(result.error); return;
    }
    setDraft(""); setFile(null);
    if (fileInput.current) fileInput.current.value = "";
    await refreshMessages();
    router.refresh();
  }

  function toggleGroupMember(id: string) {
    setGroupMembers(current => current.includes(id) ? current.filter(member => member !== id) : [...current, id]);
  }

  const visibleContacts = contacts.filter(contact => `${contact.full_name} ${roleNames[contact.role]}`.toLocaleLowerCase().includes(filter.toLocaleLowerCase()));

  if (!ready) return <section className="panel"><div className="empty" role="status"><MessageCircle size={22}/><h2>Actualiza la mensajería</h2><p>Aplica <strong>supabase/migrations/0015_group_chat_media_and_unread.sql</strong> en el SQL Editor de Supabase para habilitar grupos, archivos e indicador de mensajes sin leer.</p></div></section>;

  return <section className="panel chat-workspace" aria-label="Mensajes directos y grupos">
    <aside className="chat-people">
      <div className="chat-section-title"><div><span className="eyebrow">Comunidad</span><h2>Conversaciones</h2></div><button className={`chat-new-group${creatingGroup ? " is-active" : ""}`} type="button" aria-label={creatingGroup ? "Cancelar grupo" : "Crear grupo"} title={creatingGroup ? "Cancelar grupo" : "Crear grupo"} onClick={() => { setCreatingGroup(value => !value); setGroupMembers([]); setError(""); }}><Users size={17}/><Plus size={13}/></button></div>
      <label className="chat-search"><span className="sr-only">Buscar personas</span><input value={filter} onChange={event => setFilter(event.target.value)} placeholder="Buscar persona…"/></label>
      {creatingGroup && <form className="chat-group-form" onSubmit={createGroup}><label><span>Nombre del grupo</span><input value={groupTitle} onChange={event => setGroupTitle(event.target.value)} maxLength={100} minLength={2} required placeholder="Ej. Equipo de proyecto"/></label><small>Selecciona al menos 2 personas. Puedes combinar alumnos, docentes y administración.</small><button className="button" type="submit" disabled={busy || groupMembers.length < 2}><Users size={15}/> Crear grupo ({groupMembers.length + 1})</button></form>}
      <div className="chat-list-label">Chats</div>
      <div className="chat-contact-list">
        {conversations.map(item => <button type="button" key={item.conversation_id} className={`chat-person${selectedId === item.conversation_id ? " is-active" : ""}`} onClick={() => { setSelectedId(item.conversation_id); setError(""); }}>
          <span className="chat-avatar">{item.is_group ? <Users size={17}/> : <UserRound size={17}/>}</span><span className="chat-person-copy"><strong>{item.full_name}</strong><small>{item.is_group ? `Grupo · ${item.member_count} integrantes` : roleNames[item.role ?? "alumno"]}</small></span>{item.unread_count > 0 && <span className="chat-unread-badge" aria-label={`${item.unread_count} mensajes sin leer`}>{item.unread_count > 99 ? "99+" : item.unread_count}</span>}
        </button>)}
        {!conversations.length && <p className="chat-empty-hint">Aún no tienes conversaciones.</p>}
      </div>
      {!creatingGroup && <><div className="chat-list-label"><Plus size={14}/> Iniciar chat</div><div className="chat-contact-list chat-new-list">
        {!visibleContacts.length ? <p className="chat-empty-hint">No hay cuentas con ese nombre.</p> : visibleContacts.slice(0, 80).map(contact => creatingGroup ? <button type="button" key={contact.id} className={`chat-person${groupMembers.includes(contact.id) ? " is-active" : ""}`} onClick={() => toggleGroupMember(contact.id)}><span className="chat-avatar"><UserRound size={17}/></span><span className="chat-person-copy"><strong>{contact.full_name}</strong><small>{roleNames[contact.role]}</small></span>{groupMembers.includes(contact.id) ? <Check size={16}/> : <Plus size={15}/>}</button> : <button type="button" key={contact.id} className="chat-person" disabled={busy} onClick={() => void openContact(contact)}><span className="chat-avatar"><UserRound size={17}/></span><span className="chat-person-copy"><strong>{contact.full_name}</strong><small>{roleNames[contact.role]}</small></span><Plus size={15}/></button>)}
      </div></>}
      {creatingGroup && <div className="chat-contact-list chat-new-list">{visibleContacts.slice(0, 80).map(contact => <button type="button" key={contact.id} className={`chat-person${groupMembers.includes(contact.id) ? " is-active" : ""}`} onClick={() => toggleGroupMember(contact.id)}><span className="chat-avatar"><UserRound size={17}/></span><span className="chat-person-copy"><strong>{contact.full_name}</strong><small>{roleNames[contact.role]}</small></span>{groupMembers.includes(contact.id) ? <Check size={16}/> : <Plus size={15}/>}</button>)}</div>}
    </aside>
    <div className="chat-thread">
      {selected ? <>
        <header className="chat-thread-header"><span className="chat-avatar">{selected.is_group ? <Users size={18}/> : <UserRound size={18}/>}</span><div><strong>{selected.full_name}</strong><small>{selected.is_group ? `${selected.member_count} integrantes` : roleNames[selected.role ?? "alumno"]}</small></div></header>
        <div className="chat-messages" aria-live="polite">
          {!messages.length ? <div className="chat-empty-thread"><MessageCircle size={22}/><p>Escribe el primer mensaje para iniciar la conversación.</p></div> : messages.map(item => <article key={item.id} className={`chat-bubble${item.sender_id === userId ? " mine" : ""}`}>
            {selected.is_group && item.sender_id !== userId && <strong className="chat-sender-name">{item.sender_name}</strong>}
            {item.body && <p>{item.body}</p>}
            {item.attachment_url && item.attachment_mime?.startsWith("image/") && <a className="chat-media-link" href={item.attachment_url} target="_blank" rel="noreferrer"><Image className="chat-image-attachment" src={item.attachment_url} alt={item.attachment_name ?? "Imagen adjunta"} width={360} height={300} unoptimized/></a>}
            {item.attachment_url && item.attachment_mime?.startsWith("video/") && <video className="chat-video-attachment" controls preload="metadata" src={item.attachment_url}/>}
            {item.attachment_url && item.attachment_mime?.startsWith("audio/") && <audio className="chat-audio-attachment" controls preload="metadata" src={item.attachment_url}/>}
            {item.attachment_url && item.attachment_mime !== null && !item.attachment_mime.startsWith("image/") && !item.attachment_mime.startsWith("video/") && !item.attachment_mime.startsWith("audio/") && <a className="chat-file-attachment" href={item.attachment_url} target="_blank" rel="noreferrer"><FileText size={17}/><span>{item.attachment_name ?? "Abrir archivo"}<small>{item.attachment_size ? `${(item.attachment_size / (1024 * 1024)).toFixed(1)} MB` : "Archivo adjunto"}</small></span></a>}
            {item.attachment_path && !item.attachment_url && <small className="chat-file-unavailable">Adjunto temporalmente no disponible.</small>}
            <small>{item.sender_id === userId ? "Tú" : item.sender_name} · {new Date(item.created_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}</small>
          </article>)}
        </div>
        <form className="chat-compose" onSubmit={submit}><label className="sr-only" htmlFor="chat-message">Escribe un mensaje</label><textarea id="chat-message" value={draft} onChange={event => setDraft(event.target.value)} placeholder="Escribe un mensaje…" maxLength={4000} rows={2}/><input ref={fileInput} className="chat-file-input" type="file" accept={acceptedMimeTypes.join(",")} onChange={event => setFile(event.target.files?.[0] ?? null)}/><button className="chat-attach-button" type="button" onClick={() => fileInput.current?.click()} aria-label="Adjuntar archivo" title="Adjuntar foto, multimedia o PDF"><ImagePlus size={19}/></button><button className="button" type="submit" disabled={busy || (!draft.trim() && !file)} aria-label="Enviar mensaje"><Send size={17}/><span>Enviar</span></button></form>
        {file && <div className="chat-selected-file"><FileText size={15}/><span>{file.name}</span><small>{(file.size / (1024 * 1024)).toFixed(1)} MB</small><button type="button" onClick={() => { setFile(null); if (fileInput.current) fileInput.current.value = ""; }} aria-label="Quitar archivo"><X size={15}/></button></div>}
      </> : <div className="chat-empty-thread chat-no-selection"><MessageCircle size={30}/><h2>Tu espacio de mensajes</h2><p>Selecciona una conversación, busca a una persona o crea un grupo con la comunidad.</p></div>}
      {error && <p className="form-error chat-error" role="alert">{error}</p>}
    </div>
  </section>;
}
