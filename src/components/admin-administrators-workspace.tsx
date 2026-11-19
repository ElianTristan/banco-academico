"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Pencil, ShieldCheck, UserPlus, UserRoundX } from "lucide-react";
import {
  createManagedAdministrator,
  deactivateManagedAdministrator,
  reactivateManagedAdministrator,
  updateManagedAdministrator,
} from "@/app/admin/actions";

export type AdministratorAccount = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  is_active: boolean;
  created_at: string;
};

export function AdminAdministratorsWorkspace({
  administrators,
  currentUserId,
  loadError,
}: {
  administrators: AdministratorAccount[];
  currentUserId: string;
  loadError: string | null;
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [busy, startTransition] = useTransition();
  const activeCount = administrators.filter((account) => account.is_active).length;

  function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setMessage("");
    startTransition(async () => {
      const result = await createManagedAdministrator(formData);
      setMessageIsError(!result.ok);
      setMessage(result.ok
        ? "Se creó la cuenta. La persona deberá cambiar la contraseña temporal en su primer acceso."
        : result.error);
      if (result.ok) {
        form.reset();
        router.refresh();
      }
    });
  }

  function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setMessage("");
    startTransition(async () => {
      const result = await updateManagedAdministrator(formData);
      setMessageIsError(!result.ok);
      setMessage(result.ok ? "Se actualizaron los datos del administrador." : result.error);
      if (result.ok) {
        setEditingId(null);
        router.refresh();
      }
    });
  }

  function submitDeactivation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setMessage("");
    startTransition(async () => {
      const result = await deactivateManagedAdministrator(formData);
      setMessageIsError(!result.ok);
      setMessage(result.ok
        ? "Se desactivó el acceso. El expediente se conservó."
        : result.error);
      if (result.ok) {
        setConfirmingId(null);
        router.refresh();
      }
    });
  }

  function submitReactivation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setMessage("");
    startTransition(async () => {
      const result = await reactivateManagedAdministrator(formData);
      setMessageIsError(!result.ok);
      setMessage(result.ok ? "Se reactivó el acceso del administrador." : result.error);
      if (result.ok) {
        setConfirmingId(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="admin-administrators-workspace">
      <section className="panel admin-directory">
        <div className="module-toolbar">
          <div>
            <h2>Agregar administrador</h2>
            <p className="muted">Confirma cada alta con tu contraseña actual. La cuenta nueva deberá cambiar su contraseña temporal al ingresar.</p>
          </div>
          <UserPlus size={20} aria-hidden="true"/>
        </div>
        <form className="material-form admin-account-form" onSubmit={submitCreate} aria-busy={busy}>
          <div className="form-grid">
            <label className="field">
              <span>Nombre(s)</span>
              <input name="firstName" required maxLength={80} autoComplete="given-name"/>
            </label>
            <label className="field">
              <span>Apellidos</span>
              <input name="lastName" required maxLength={100} autoComplete="family-name"/>
            </label>
            <label className="field fullcol">
              <span>Correo electrónico</span>
              <input name="email" type="email" required maxLength={254} autoComplete="email"/>
            </label>
            <label className="field fullcol">
              <span>Tu contraseña actual</span>
              <input name="currentPassword" type="password" required maxLength={256} autoComplete="current-password"/>
            </label>
          </div>
          {message && <p className={messageIsError ? "form-error" : "form-success"} role={messageIsError ? "alert" : "status"}>{message}</p>}
          <button className="button" type="submit" disabled={busy}>
            <UserPlus size={15}/>{busy ? "Creando cuenta…" : "Crear administrador"}
          </button>
        </form>
        <p className="admin-directory-foot">La baja de una cuenta conserva su historial y no permite dejar el sistema sin administradores activos.</p>
      </section>

      <section className="panel admin-directory" aria-labelledby="administrator-directory-title">
        <div className="module-toolbar">
          <div>
            <h2 id="administrator-directory-title">Administradores registrados</h2>
            <p className="muted">Edita datos o administra el acceso de otras cuentas. Para cambiar tus datos, usa Perfil.</p>
          </div>
          <span className="pill">{activeCount} activas · {administrators.length - activeCount} desactivadas</span>
        </div>
        {loadError
          ? <div className="empty" role="alert">{loadError}</div>
          : !administrators.length
            ? <div className="empty">No se encontraron cuentas administradoras.</div>
            : <div className="admin-administrator-list">{administrators.map((account) => {
                const isCurrent = account.id === currentUserId;
                const name = [account.first_name, account.last_name].filter(Boolean).join(" ") || "Nombre sin registrar";
                return (
                  <div className="admin-administrator-item" key={account.id}>
                    <article className={`admin-person-row${account.is_active ? "" : " is-inactive"}`}>
                      <div className="admin-person-avatar" aria-hidden="true">
                        {`${account.first_name.trim().charAt(0)}${account.last_name.trim().charAt(0)}`.toUpperCase() || account.email.charAt(0).toUpperCase()}
                      </div>
                      <div className="admin-person-identity">
                        <strong>{name}{isCurrent ? " · Tú" : ""}</strong>
                        <a href={`mailto:${account.email}`}>{account.email}</a>
                      </div>
                      <span className="admin-role-badge role-administrador">Administrador</span>
                      <span className={`admin-account-status${account.is_active ? " is-active" : ""}`}>
                        {account.is_active ? "Activa" : "Desactivada"}
                      </span>
                      <time dateTime={account.created_at}>
                        {new Date(account.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}
                      </time>
                      {!isCurrent && account.is_active && (
                        <>
                          <button
                            className="button button-secondary admin-deactivate-button"
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setEditingId(editingId === account.id ? null : account.id);
                              setConfirmingId(null);
                              setMessage("");
                            }}
                          >
                            <Pencil size={14}/>Editar
                          </button>
                          <button
                            className="button button-secondary admin-deactivate-button"
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setConfirmingId(confirmingId === account.id ? null : account.id);
                              setEditingId(null);
                              setMessage("");
                            }}
                          >
                            <UserRoundX size={14}/>Desactivar
                          </button>
                        </>
                      )}
                      {!isCurrent && !account.is_active && (
                        <button
                          className="button button-secondary admin-deactivate-button"
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setConfirmingId(confirmingId === account.id ? null : account.id);
                            setEditingId(null);
                            setMessage("");
                          }}
                        >
                          <ShieldCheck size={14}/>Reactivar
                        </button>
                      )}
                    </article>

                    {editingId === account.id && (
                      <form className="admin-administrator-form" onSubmit={submitEdit} aria-busy={busy}>
                        <input type="hidden" name="userId" value={account.id}/>
                        <div className="form-grid">
                          <label className="field"><span>Nombre(s)</span><input name="firstName" required maxLength={80} defaultValue={account.first_name} autoComplete="given-name"/></label>
                          <label className="field"><span>Apellidos</span><input name="lastName" required maxLength={100} defaultValue={account.last_name} autoComplete="family-name"/></label>
                          <label className="field fullcol"><span>Correo electrónico</span><input name="email" type="email" required maxLength={254} defaultValue={account.email} autoComplete="email"/></label>
                          <label className="field fullcol"><span>Tu contraseña actual</span><input name="currentPassword" type="password" required maxLength={256} autoComplete="current-password"/></label>
                        </div>
                        <div className="admin-administrator-form-actions">
                          <button className="button" type="submit" disabled={busy}><KeyRound size={15}/>{busy ? "Guardando…" : "Confirmar cambios"}</button>
                          <button className="button button-secondary" type="button" disabled={busy} onClick={() => setEditingId(null)}>Cancelar</button>
                        </div>
                      </form>
                    )}

                    {confirmingId === account.id && (
                      <form className="admin-administrator-confirm" onSubmit={account.is_active ? submitDeactivation : submitReactivation} aria-busy={busy}>
                        <input type="hidden" name="userId" value={account.id}/>
                        <p>{account.is_active
                          ? `Vas a desactivar el acceso de ${name}. Sus datos y su historial se conservarán.`
                          : `Vas a restablecer el acceso de ${name}.`}</p>
                        <label className="field">
                          <span>Tu contraseña actual</span>
                          <input name="currentPassword" type="password" required maxLength={256} autoComplete="current-password"/>
                        </label>
                        <div className="admin-administrator-form-actions">
                          <button className="button" type="submit" disabled={busy}>
                            <KeyRound size={15}/>{busy ? "Confirmando…" : account.is_active ? "Confirmar baja" : "Confirmar reactivación"}
                          </button>
                          <button className="button button-secondary" type="button" disabled={busy} onClick={() => setConfirmingId(null)}>Cancelar</button>
                        </div>
                      </form>
                    )}
                  </div>
                );
              })}</div>}
      </section>
    </div>
  );
}
