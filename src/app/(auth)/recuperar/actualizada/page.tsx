import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

export default function PasswordUpdated() {
  return (
    <section className="auth-form motion-form">
      <div className="form-success recovery-complete" role="status">
        <CheckCircle2 size={22} aria-hidden="true" />
        <div>
          <h1>Contraseña actualizada</h1>
          <p>Tu nueva contraseña quedó guardada. Ya puedes iniciar sesión.</p>
        </div>
      </div>
      <Link className="button full recovery-login-link" href="/login">Ir a iniciar sesión</Link>
    </section>
  );
}
