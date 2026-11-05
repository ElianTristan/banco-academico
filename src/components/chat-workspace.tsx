"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Plus, Send, UserRound } from "lucide-react";
import { loadChatMessages, sendChatMessage, startDirectChat } from "@/app/academic/actions";
import type { AppRole } from "@/lib/roles";

type Contact = { id: string; full_name: string; role: AppRole };
type Conversation = { conversation_id: string; contact_id: string; full_name: string; role: AppRole; updated_at: string };
type ChatMessage = { id: string; conversation_id: string; sender_id: string; sender_name: string; body: string; created_at: string };
const roleNames: Record<AppRole, string> = { alumno: "Alumno", docente: "Docente", administrador: "Administrador" };

export function ChatWorkspace({ userId, ready, contacts, conversations }: { userId: string; ready: boolean; contacts: Contact[]; conversations: Conversation[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(conversations[0]?.conversation_id ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
    router.refresh();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || !draft.trim()) return;
    setBusy(true); setError("");
    const result = await sendChatMessage(selectedId, draft);
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    setDraft("");
    await refreshMessages();
    router.refresh();
  }

  const visibleContacts = contacts.filter(contact => `${contact.full_name} ${roleNames[contact.role]}`.toLocaleLowerCase().includes(filter.toLocaleLowerCase()));

  if (!ready) return <section className="panel"><div className="empty" role="status"><MessageCircle size={22}/><h2>Chat por habilitar</h2><p>Aplica el archivo <strong>supabase/migrations/0014_posts_attachments_and_chat.sql</strong> en el SQL Editor de Supabase para crear conversaciones y permisos.</p></div></section>;

  return <section className="panel chat-workspace" aria-label="Mensajes directos">
    <aside className="chat-people">
      <div className="chat-section-title"><div><span className="eyebrow">Comunidad</span><h2>Conversaciones</h2></div><MessageCircle size={19}/></div>
      <label className="chat-search"><span className="sr-only">Buscar personas</span><input value={filter} onChange={event => setFilter(event.target.value)} placeholder="Buscar persona…"/></label>
      <div className="chat-list-label">Chats</div>
      <div className="chat-contact-list">
        {conversations.map(item => <button type="button" key={item.conversation_id} className={`chat-person${selectedId === item.conversation_id ? " is-active" : ""}`} onClick={() => { setSelectedId(item.conversation_id); setError(""); }}>
          <span className="chat-avatar"><UserRound size={17}/></span><span className="chat-person-copy"><strong>{item.full_name}</strong><small>{roleNames[item.role]}</small></span>
        </button>)}
        {!conversations.length && <p className="chat-empty-hint">Aún no tienes conversaciones.</p>}
      </div>
      <div className="chat-list-label"><Plus size={14}/> Iniciar chat</div>
      <div className="chat-contact-list chat-new-list">
        {!visibleContacts.length ? <p className="chat-empty-hint">No hay cuentas con ese nombre.</p> : visibleContacts.slice(0, 80).map(contact => <button type="button" key={contact.id} className="chat-person" disabled={busy} onClick={() => void openContact(contact)}>
          <span className="chat-avatar"><UserRound size={17}/></span><span className="chat-person-copy"><strong>{contact.full_name}</strong><small>{roleNames[contact.role]}</small></span><Plus size={15}/>
        </button>)}
      </div>
    </aside>
    <div className="chat-thread">
      {selected ? <>
        <header className="chat-thread-header"><span className="chat-avatar"><UserRound size={18}/></span><div><strong>{selected.full_name}</strong><small>{roleNames[selected.role]}</small></div></header>
        <div className="chat-messages" aria-live="polite">
          {!messages.length ? <div className="chat-empty-thread"><MessageCircle size={22}/><p>Escribe el primer mensaje para iniciar la conversación.</p></div> : messages.map(item => <article key={item.id} className={`chat-bubble${item.sender_id === userId ? " mine" : ""}`}><p>{item.body}</p><small>{item.sender_id === userId ? "Tú" : item.sender_name} · {new Date(item.created_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}</small></article>)}
        </div>
        <form className="chat-compose" onSubmit={submit}><label className="sr-only" htmlFor="chat-message">Escribe un mensaje</label><textarea id="chat-message" value={draft} onChange={event => setDraft(event.target.value)} placeholder="Escribe un mensaje…" maxLength={4000} rows={2} required/><button className="button" type="submit" disabled={busy || !draft.trim()} aria-label="Enviar mensaje"><Send size={17}/><span>Enviar</span></button></form>
      </> : <div className="chat-empty-thread chat-no-selection"><MessageCircle size={30}/><h2>Tu espacio de mensajes</h2><p>Selecciona una conversación o busca una persona para iniciar un chat privado.</p></div>}
      {error && <p className="form-error chat-error" role="alert">{error}</p>}
    </div>
  </section>;
}
