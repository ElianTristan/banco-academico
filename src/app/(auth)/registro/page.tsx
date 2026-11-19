import Link from "next/link";
import { Suspense } from "react";
import { BookOpen, ShieldCheck, Users } from "lucide-react";
import { AuthForm } from "@/components/auth-form";

type RegistrationType = "alumno" | "docente" | "administrador";

const choices: { role: RegistrationType; title: string; detail: string; href?: string; icon: typeof BookOpen }[] = [
  {
    role: "alumno",
    title: "Estudiante",
    detail: "Crea tu cuenta para consultar materias y recursos académicos.",
    href: "/registro?tipo=alumno",
    icon: BookOpen,
  },
  {
    role: "docente",
    title: "Docente",
    detail: "El acceso docente requiere una solicitud y aprobación institucional.",
    href: "/registro?tipo=docente",
    icon: Users,
  },
  {
    role: "administrador",
    title: "Administrador",
    detail: "Las cuentas administrativas se aprovisionan por un canal institucional seguro.",
    icon: ShieldCheck,
  },
];

function RegistrationChoices() {
  return (
    <section className="registration-choice">
      <div className="auth-form-head">
        <h1>Crear una cuenta</h1>
        <p className="muted">Elige el tipo de acceso que corresponde a tu vínculo con el instituto.</p>
      </div>
      <div className="registration-role-list">
        {choices.map(({ role, title, detail, href, icon: Icon }) => {
          const content = (
            <>
              <span className="registration-role-icon"><Icon size={18} aria-hidden="true" /></span>
              <span className="registration-role-copy"><strong>{title}</strong><small>{detail}</small></span>
              <span className="registration-role-action">{href ? "Continuar" : "Restringido"}</span>
            </>
          );
          return href
            ? <Link className="registration-role" href={href} key={role}>{content}</Link>
            : <div className="registration-role registration-role-restricted" aria-disabled="true" key={role}>{content}</div>;
        })}
      </div>
      <p className="registration-security-note">
        Los permisos se asignan en el servidor. Elegir una opción no concede ni cambia un rol institucional.
      </p>
      <div className="auth-bottom">¿Ya tienes cuenta? <Link className="text-link" href="/login">Iniciar sesión</Link></div>
    </section>
  );
}

function RestrictedRegistration({ type }: { type: "docente" | "administrador" }) {
  const isTeacher = type === "docente";
  return (
    <section className="registration-guidance">
      <div className="auth-form-head">
        <h1>{isTeacher ? "Acceso docente" : "Acceso administrativo"}</h1>
        <p className="muted">
          {isTeacher
            ? "Las cuentas docentes requieren validación institucional antes de obtener permisos."
            : "El registro público no permite crear cuentas de administrador."}
        </p>
      </div>
      <div className="registration-security-note" role="note">
        {isTeacher
          ? "Crea una cuenta de estudiante y, después de iniciar sesión, envía la solicitud docente desde tu perfil. Un administrador revisará la información y aprobará el cambio de rol."
          : "Las cuentas administrativas se aprovisionan mediante el procedimiento institucional de seguridad. La opción no puede habilitarse desde este formulario."}
      </div>
      <div className="registration-guidance-actions">
        {isTeacher && <Link className="button full" href="/registro?tipo=alumno">Crear cuenta de estudiante</Link>}
        <Link className="text-link" href="/login">Ya tengo acceso institucional</Link>
        <Link className="text-link" href="/registro">Volver a elegir</Link>
      </div>
    </section>
  );
}

export default async function Register({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { tipo } = await searchParams;
  if (tipo === "alumno") return <Suspense><AuthForm mode="register" /></Suspense>;
  if (tipo === "docente" || tipo === "administrador") return <RestrictedRegistration type={tipo} />;
  return <RegistrationChoices />;
}
