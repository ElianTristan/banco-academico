"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserPlus, UserRoundX } from "lucide-react";
import { createManagedUser, deactivateManagedUser, reactivateManagedUser } from "@/app/admin/actions";

type ManagedAccount = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
};

type RoleFilter = "all" | "alumno" | "docente";

const sectionForRole: Record<RoleFilter, string> = {
  all: "/admin/usuarios",
  alumno: "/admin/alumnos",
  docente: "/admin/docentes",
};

const labels: Record<RoleFilter, string> = {
  all: "Usuarios",
  alumno: "Alumnos",
  docente: "Docentes",
};

export function AdminUsersWorkspace({
  users,
  query,
  loadError,
  roleFilter,
  currentUserId,
}: {
  users: ManagedAccount[];
  query: string;
  loadError: string | null;
  roleFilter: RoleFilter;
  currentUserId: string;
}) {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<Exclude<RoleFilter, "all">>(roleFilter === "docente" ? "docente" : "alumno");
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [busy, startTransition] = useTransition();
  const sectionPath = sectionForRole[roleFilter];
  const activeCount = users.filter((account) => account.is_active).length;
  const invitedRole: Exclude<RoleFilter, "all"> = roleFilter === "all" ? selectedRole : roleFilter;

  function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    if (roleFilter === "all") formData.set("role", selectedRole);
    else formData.set("role", roleFilter);

    setMessage("");
    startTransition(async () => {
      const result = await createManagedUser(formData);
      setMessageIsError(!result.ok);
      setMessage(result.ok
        ? `Invitación enviada; la cuenta de ${invitedRole === "alumno" ? "alumno" : "docente"} quedó registrada.`
        : result.error);
      if (result.ok) {
        form.reset();
        router.refresh();
      }
    });
  }

  function deactivateAccount(account: ManagedAccount) {
    const name = [account.first_name, account.last_name].filter(Boolean).join(" ") || account.email;
    if (!window.confirm(`¿Desactivar el acceso de ${name}? Sus materias, calificaciones e historial se conservarán.`)) return;
    setMessage("");
    startTransition(async () => {
      const result = await deactivateManagedUser(account.id);
      setMessageIsError(!result.ok);
      setMessage(result.ok ? `Se desactivó el acceso de ${name}. Su historial se conservó.` : result.error);
      router.refresh();
    });
  }

  function reactivateAccount(account: ManagedAccount) {
    const name = [account.first_name, account.last_name].filter(Boolean).join(" ") || account.email;
    setMessage("");
    startTransition(async () => {
      const result = await reactivateManagedUser(account.id);
      setMessageIsError(!result.ok);
      setMessage(result.ok ? `Se restableció el acceso de ${name}.` : result.error);
      router.refresh();
    });
  }

  return <div className="admin-users-workspace">
    <section className="panel admin-directory">
      <div className="module-toolbar">
        <div>
          <h2>{roleFilter === "all" ? "Invitar a un alumno o docente" : `Dar de alta ${labels[roleFilter].toLowerCase()}`}</h2>
          <p className="muted">Se enviará una invitación al correo para que la persona active su cuenta y establezca su contraseña.</p>
        </div>
        <UserPlus size={20} aria-hidden="true"/>
      </div>
      <form className="material-form admin-account-form" onSubmit={createAccount}>
        {roleFilter === "all" && <label className="field"><span>Tipo de cuenta</span><select value={selectedRole} onChange={(event) => setSelectedRole(event.target.value as Exclude<RoleFilter, "all">)}><option value="alumno">Alumno</option><option value="docente">Docente</option></select></label>}
        <div className="form-grid">
          <label className="field"><span>Nombre(s)</span><input name="firstName" required maxLength={80} autoComplete="given-name"/></label>
          <label className="field"><span>Apellidos</span><input name="lastName" required maxLength={100} autoComplete="family-name"/></label>
          <label className="field fullcol"><span>Correo electrónico</span><input name="email" type="email" required maxLength={254} autoComplete="email"/></label>
          {invitedRole === "alumno"
            ? <label className="field"><span>Número de control</span><input name="controlNumber" required minLength={2} maxLength={40} autoComplete="off"/></label>
            : <>
              <label className="field"><span>Número de trabajador</span><input name="employeeNumber" required minLength={2} maxLength={40} autoComplete="off"/></label>
              <label className="field"><span>Departamento</span><input name="department" required minLength={2} maxLength={120} placeholder="Ej. Sistemas y Computación"/></label>
            </>}
        </div>
        {message && <p className={messageIsError ? "form-error" : "form-success"} role={messageIsError ? "alert" : "status"}>{message}</p>}
        <button className="button" type="submit" disabled={busy}><UserPlus size={15}/>{busy ? "Enviando invitación…" : "Enviar invitación y registrar"}</button>
      </form>
      <p className="admin-directory-foot">Desactivar una cuenta bloquea su acceso sin borrar su expediente académico.</p>
    </section>

    <section className="panel admin-directory">
      <div className="module-toolbar">
        <div><h2>{roleFilter === "all" ? "Directorio institucional" : `Cuentas de ${labels[roleFilter].toLowerCase()}`}</h2><p className="muted">Desactiva el acceso cuando corresponda; el historial permanece intacto.</p></div>
        <span className="pill">{activeCount} activas · {users.length - activeCount} desactivadas</span>
      </div>
      <form className="admin-directory-search" method="get" action={sectionPath}>
        <label htmlFor="admin-users-query">Buscar por nombre o correo</label>
        <div><input id="admin-users-query" name="q" type="search" defaultValue={query} placeholder="Nombre o correo institucional"/><button className="button" type="submit">Buscar</button>{query && <Link className="retry-link" href={sectionPath}>Limpiar</Link>}</div>
      </form>
      {loadError
        ? <div className="empty" role="alert"><p>No se pudo cargar el directorio.</p><Link className="retry-link" href={sectionPath}>Intentar de nuevo</Link></div>
        : !users.length
          ? <div className="empty">{query ? "No encontramos cuentas con esa búsqueda." : `Todavía no hay cuentas de ${labels[roleFilter].toLowerCase()}.`}</div>
          : <div className="admin-people-list">{users.map((account) => <article className={`admin-person-row${account.is_active ? "" : " is-inactive"}`} key={account.id}>
            <div className="admin-person-avatar" aria-hidden="true">{`${account.first_name.trim().charAt(0)}${account.last_name.trim().charAt(0)}`.toUpperCase() || account.email.charAt(0).toUpperCase() || "BA"}</div>
            <div className="admin-person-identity"><strong>{[account.first_name, account.last_name].filter(Boolean).join(" ") || "Nombre sin registrar"}</strong><a href={`mailto:${account.email}`}>{account.email}</a></div>
            <span className={`admin-role-badge role-${account.role}`}>{account.role === "alumno" ? "Alumno" : account.role === "docente" ? "Docente" : "Administrador"}</span>
            <span className={`admin-account-status${account.is_active ? " is-active" : ""}`}>{account.is_active ? "Activa" : "Desactivada"}</span>
            <time dateTime={account.created_at}>{new Date(account.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}</time>
            {account.is_active && account.id !== currentUserId && <button className="button button-secondary admin-deactivate-button" type="button" disabled={busy} onClick={() => deactivateAccount(account)}><UserRoundX size={14}/>Desactivar</button>}
            {!account.is_active && <button className="button button-secondary admin-deactivate-button" type="button" disabled={busy} onClick={() => reactivateAccount(account)}>Reactivar</button>}
          </article>)}</div>}
      <p className="admin-directory-foot">{users.length === 100 ? "Se muestran hasta 100 cuentas. Afina la búsqueda para encontrar una cuenta específica." : `${users.length} ${users.length === 1 ? "cuenta" : "cuentas"} encontradas`}</p>
    </section>
  </div>;
}
