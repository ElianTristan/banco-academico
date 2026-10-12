import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

export default async function PasswordUpdated({
  searchParams,
}: {
  searchParams: Promise<{ unlock?: string }>;
}) {
  const { unlock } = await searchParams;

  return (
    <section className="auth-form motion-form">
      <div className="form-success recovery-complete" role="status">
        <CheckCircle2 size={22} aria-hidden="true" />
        <div>
          <h1>Contraseña actualizada</h1>
          <p>
            {unlock === "error"
              ? "Tu nueva contraseña quedó guardada, pero no pudimos liberar el bloqueo automáticamente. Intenta iniciar sesión más tarde o contacta al administrador."
              : "Tu nueva contraseña quedó guardada y el bloqueo de acceso fue liberado. Ya puedes iniciar sesión."}
          </p>
        </div>
      </div>
      <Link className="button full recovery-login-link" href="/login">Ir a iniciar sesión</Link>
    </section>
  );
}
