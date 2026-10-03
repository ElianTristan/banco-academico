"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { requestPasswordReset, signIn, signUp, updatePassword } from "@/app/auth/actions";

type Mode = "login" | "register" | "reset" | "new-password";

const messages: Record<string,string> = {
  datos: "Revisa los campos. La contraseña debe tener al menos 10 caracteres, mayúscula, minúscula y número.",
  credenciales: "No pudimos iniciar sesión. Verifica tu correo y contraseña.",
  registro: "No pudimos crear la cuenta. Verifica los datos o intenta iniciar sesión.",
  existente: "Este correo ya tiene una cuenta. Intenta iniciar sesión o recuperar tu contraseña.",
  enlace: "El enlace no es válido o venció. Solicita uno nuevo.",
  actualizar: "No pudimos actualizar la contraseña. Solicita un enlace nuevo.",
};

export function AuthForm({ mode }: { mode: Mode }) {
  const params = useSearchParams();
  const [show, setShow] = useState(false);
  const error = params.get("error");
  const action = mode === "login" ? signIn : mode === "register" ? signUp : mode === "reset" ? requestPasswordReset : updatePassword;
  const title = { login:"Inicia sesión", register:"Crea tu cuenta", reset:"Recupera tu cuenta", "new-password":"Crea una contraseña nueva" }[mode];
  return <form action={action}>
    <div className="auth-form-head"><span className="eyebrow">Banco Académico</span><h1>{title}</h1><p className="muted">{mode === "login" ? "Accede a tu espacio académico." : mode === "register" ? "Regístrate para consultar tu información académica." : mode === "reset" ? "Te enviaremos un enlace a tu correo." : "Elige una contraseña segura para continuar."}</p></div>
    {error && <p className="form-error" role="alert">{messages[error] ?? "Ocurrió un problema. Inténtalo de nuevo."}</p>}
    {params.get("success") && <p className="form-success" role="status">Cuenta creada. Revisa tu correo para confirmar la dirección antes de iniciar sesión.</p>}
    {params.get("sent") && <p className="form-success" role="status">Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña.</p>}
    {params.get("passwordUpdated") && <p className="form-success" role="status">Contraseña actualizada. Ya puedes iniciar sesión.</p>}
    {mode === "register" && <><p className="auth-role-note"><span className="role-note-dot"/>Registro para alumnos <span>·</span> Las cuentas docentes se habilitan mediante una solicitud revisada por la institución.</p><Field name="firstName" label="Nombre(s)" autoComplete="given-name"/><Field name="lastName" label="Apellidos" autoComplete="family-name"/><Field name="controlNumber" label="Número de control (opcional)" autoComplete="off"/></>}
    {mode !== "new-password" && <Field name="email" label="Correo electrónico" type="email" autoComplete="email"/>}
    {(mode === "login" || mode === "register" || mode === "new-password") && <PasswordField name="password" label="Contraseña" show={show} setShow={setShow} autoComplete={mode === "login" ? "current-password" : "new-password"}/>}
    {(mode === "register" || mode === "new-password") && <PasswordField name="confirmPassword" label="Confirmar contraseña" show={show} setShow={setShow} autoComplete="new-password"/>}
    {mode === "login" && <div style={{textAlign:"right",fontSize:12,margin:"-5px 0 16px"}}><Link className="text-link" href="/recuperar">¿Olvidaste tu contraseña?</Link></div>}
    <SubmitButton label={{login:"Iniciar sesión",register:"Crear cuenta",reset:"Enviar enlace", "new-password":"Actualizar contraseña"}[mode]}/>
    <div className="auth-bottom">{mode === "login" ? <>¿No tienes cuenta? <Link className="text-link" href="/registro">Regístrate</Link></> : mode === "register" ? <>¿Ya tienes cuenta? <Link className="text-link" href="/login">Inicia sesión</Link></> : <Link className="text-link" href="/login">Volver a iniciar sesión</Link>}</div>
  </form>;
}

function SubmitButton({label}:{label:string}) {
  const {pending}=useFormStatus();
  return <button className="button full" type="submit" disabled={pending} aria-busy={pending}>{pending&&<span className="submit-spinner" aria-hidden="true"/>}{pending?"Procesando…":label}</button>;
}

function Field({ name,label,type="text",autoComplete }: {name:string;label:string;type?:string;autoComplete?:string}) {
  return <div className="field"><label htmlFor={name}>{label}</label><input id={name} name={name} type={type} autoComplete={autoComplete} required={name !== "controlNumber"}/></div>;
}
function PasswordField({name,label,show,setShow,autoComplete}:{name:string;label:string;show:boolean;setShow:(v:boolean)=>void;autoComplete:string}) {
  return <div className="field"><label htmlFor={name}>{label}</label><div className="password-wrap"><input id={name} name={name} type={show?"text":"password"} autoComplete={autoComplete} required minLength={name === "password" || name === "confirmPassword" ? 10 : undefined} aria-describedby={name === "password" && autoComplete === "new-password" ? "password-help" : undefined}/><button type="button" onClick={()=>setShow(!show)} aria-label={show?"Ocultar contraseña":"Mostrar contraseña"}>{show?<EyeOff size={15}/>:<Eye size={15}/>} {show?"Ocultar":"Mostrar"}</button></div>{name === "password" && autoComplete === "new-password" && <small className="field-help" id="password-help">Usa 10 caracteres o más, con mayúscula, minúscula y número.</small>}</div>;
}
