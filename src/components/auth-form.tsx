"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { requestPasswordReset, signIn, signUp, updatePassword } from "@/app/auth/actions";

type Mode = "login" | "register" | "reset" | "new-password";
type AppRole = "alumno" | "docente" | "administrador";

type PasswordCheck = { label: string; valid: boolean };

const messages: Record<string, string> = {
  datos: "Revisa los datos ingresados e inténtalo de nuevo.",
  correo: "Escribe una dirección de correo válida.",
  auth: "El acceso no está disponible en este momento. Inténtalo de nuevo más tarde.",
  ocupado: "Hay un intento de acceso en proceso. Espera un momento y vuelve a intentarlo.",
  lookup: "No pudimos validar el acceso en este momento. Intenta con tu correo o vuelve a intentarlo más tarde.",
  rol: "El rol seleccionado no coincide con tu cuenta. Selecciona el rol autorizado para este perfil.",
  registro: "No pudimos crear la cuenta. Verifica los datos o intenta iniciar sesión.",
  inactive: "El acceso a esta cuenta fue desactivado por administración. Contacta al área administrativa de tu institución.",
  existente: "Este correo ya tiene una cuenta. Intenta iniciar sesión o recuperar tu contraseña.",
  configuracion: "El servicio de autenticación no está configurado para este entorno. Contacta al administrador.",
  enlace: "El enlace no es válido o venció. Solicita uno nuevo.",
  recuperacion: "No pudimos iniciar la recuperación en este momento. Inténtalo más tarde.",
  actualizar: "No pudimos actualizar la contraseña. Solicita un enlace nuevo.",
};

const roles: { value: AppRole; label: string; hint: string }[] = [
  { value: "alumno", label: "Estudiante", hint: "Control o correo" },
  { value: "docente", label: "Docente", hint: "Trabajador o correo" },
  { value: "administrador", label: "Admin", hint: "Correo institucional" },
];

function getPasswordChecks(password: string): PasswordCheck[] {
  return [
    { label: "8 caracteres", valid: password.length >= 8 },
    { label: "Mayúscula", valid: /[A-Z]/.test(password) },
    { label: "Minúscula", valid: /[a-z]/.test(password) },
    { label: "Número", valid: /\d/.test(password) },
    { label: "Carácter especial", valid: /[^\p{L}\p{N}]/u.test(password) },
  ];
}

export function AuthForm({ mode }: { mode: Mode }) {
  const params = useSearchParams();
  const [show, setShow] = useState(false);
  const [selectedRole, setSelectedRole] = useState<AppRole>("alumno");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const error = params.get("error");
  const action = mode === "login" ? signIn : mode === "register" ? signUp : mode === "reset" ? requestPasswordReset : updatePassword;
  const title = { login: "Inicia sesión", register: "Crea tu cuenta", reset: "Recupera tu cuenta", "new-password": "Crea una contraseña nueva" }[mode];
  const attempt = Number(params.get("attempt"));
  const failedAttempt = mode === "login" && error === "credenciales" && Number.isInteger(attempt) && attempt >= 1 && attempt <= 2;
  const passwordChecks = getPasswordChecks(password);
  const isPasswordSecure = passwordChecks.every((check) => check.valid);

  return <form action={action} className="auth-form motion-form">
    <div className="auth-form-head"><span className="eyebrow">Banco Académico</span><h1>{title}</h1><p className="muted">{mode === "login" ? "Accede a tu espacio académico." : mode === "register" ? "Regístrate para consultar tu información académica." : mode === "reset" ? "Te enviaremos un enlace a tu correo." : "Elige una contraseña segura para continuar."}</p></div>
    {failedAttempt
      ? <p className="form-error auth-attempt-message" role="alert">Intento {attempt} de 3. Verifica tu correo y contraseña.</p>
      : error && <p className="form-error" role="alert">{messages[error] ?? "Ocurrió un problema. Inténtalo de nuevo."}</p>}
    {mode === "reset" && params.get("blocked") === "1" && <p className="form-error auth-attempt-message" role="alert">Intento 3 de 3. Tu acceso ha sido bloqueado temporalmente. Puedes recuperar tu cuenta ahora; el bloqueo se libera automáticamente después de 15 minutos.</p>}
    {mode === "login" && params.get("registered") && <p className="form-success" role="status">Registro recibido. Revisa tu correo si se requiere confirmar la cuenta; después podrás iniciar sesión.</p>}
    {mode === "login" && params.get("confirmed") && <p className="form-success" role="status">Correo confirmado. Ya puedes iniciar sesión.</p>}
    {params.get("sent") && <p className="form-success" role="status">Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña.</p>}
    {mode === "login" && <div className="auth-role-picker motion-stack" role="radiogroup" aria-label="Selecciona tu rol">
      {roles.map((role) => (
        <button
          key={role.value}
          type="button"
          className={`auth-role-option ${selectedRole === role.value ? "is-selected" : ""}`}
          aria-pressed={selectedRole === role.value}
          onClick={() => setSelectedRole(role.value)}
        >
          <span>{role.label}</span>
          <small>{role.hint}</small>
        </button>
      ))}
      <input type="hidden" name="role" value={selectedRole} />
    </div>}
    {mode === "register" && <><p className="auth-role-note"><span className="role-note-dot"/>Registro para estudiantes. Las cuentas docentes requieren solicitud y aprobación institucional.</p><Field name="firstName" label="Nombre(s)" autoComplete="given-name"/><Field name="lastName" label="Apellidos" autoComplete="family-name"/><Field name="controlNumber" label="Número de control (opcional)" autoComplete="off"/></>}
    {mode !== "new-password" && <Field name={mode === "login" ? "identifier" : "email"} label={mode === "login" ? (selectedRole === "alumno" ? "Número de control o correo" : selectedRole === "docente" ? "Número de trabajador o correo" : "Correo institucional") : "Correo electrónico"} type={mode === "login" ? "text" : "email"} autoComplete={mode === "login" ? "username" : "email"}/>}
    {(mode === "login" || mode === "register" || mode === "new-password") && (
      <PasswordField
        name="password"
        label="Contraseña"
        show={show}
        setShow={setShow}
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        value={password}
        onChange={setPassword}
        checks={mode === "register" || mode === "new-password" ? passwordChecks : []}
        isSecure={isPasswordSecure}
      />
    )}
    {(mode === "register" || mode === "new-password") && <PasswordField name="confirmPassword" label="Confirmar contraseña" show={show} setShow={setShow} autoComplete="new-password" value={confirmPassword} onChange={setConfirmPassword} />}
    {mode === "login" && <div style={{ textAlign: "right", fontSize: 12, margin: "-5px 0 16px" }}><Link className="text-link" href="/recuperar">¿Olvidaste tu contraseña?</Link></div>}
    <SubmitButton label={{ login: "Iniciar sesión", register: "Crear cuenta", reset: "Enviar enlace", "new-password": "Actualizar contraseña" }[mode]} />
    <div className="auth-bottom">{mode === "login" ? <>¿No tienes cuenta? <Link className="text-link" href="/registro">Regístrate</Link></> : mode === "register" ? <><Link className="text-link" href="/registro">Elegir tipo de cuenta</Link><span aria-hidden="true"> · </span><Link className="text-link" href="/login">Iniciar sesión</Link></> : <Link className="text-link" href="/login">Volver a iniciar sesión</Link>}</div>
  </form>;
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button className="button full motion-button" type="submit" disabled={pending} aria-busy={pending}>{pending && <span className="submit-spinner" aria-hidden="true" />}{pending ? "Procesando…" : label}</button>;
}

function Field({ name, label, type = "text", autoComplete }: { name: string; label: string; type?: string; autoComplete?: string }) {
  return <div className="field motion-field"><label htmlFor={name}>{label}</label><input id={name} name={name} type={type} autoComplete={autoComplete} required={name !== "controlNumber"} /></div>;
}

function PasswordField({
  name,
  label,
  show,
  setShow,
  autoComplete,
  value,
  onChange,
  checks,
  isSecure,
}: {
  name: string;
  label: string;
  show: boolean;
  setShow: (value: boolean) => void;
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
  checks?: PasswordCheck[];
  isSecure?: boolean;
}) {
  const validatesNewPassword = autoComplete === "new-password";
  return <div className="field motion-field"><label htmlFor={name}>{label}</label><div className="password-wrap"><input id={name} name={name} type={show ? "text" : "password"} autoComplete={autoComplete} required minLength={validatesNewPassword && (name === "password" || name === "confirmPassword") ? 8 : undefined} value={value} onChange={(event) => onChange(event.target.value)} aria-describedby={checks?.length && name === "password" ? "password-help" : undefined} /><button type="button" onClick={() => setShow(!show)} aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}>{show ? <EyeOff size={15} /> : <Eye size={15} />} {show ? "Ocultar" : "Mostrar"}</button></div>{checks && checks.length > 0 && name === "password" && <><ul className="password-checklist" id="password-help" aria-live="polite">{checks.map((check) => <li key={check.label} className={check.valid ? "is-valid" : ""}><span aria-hidden="true">{check.valid ? "✓" : "•"}</span>{check.label}</li>)}</ul>{isSecure && <p className="password-strength" role="status">Contraseña segura</p>}</>}</div>;
}
