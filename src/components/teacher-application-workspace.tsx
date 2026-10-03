"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, FileCheck2, ShieldAlert } from "lucide-react";
import { reviewTeacherApplication, submitTeacherApplication } from "@/app/academic/actions";

type Application = {id:string;status:string;employee_number:string;department:string;justification:string;rejection_reason:string|null;created_at:string};

export function TeacherRequestForm({application}:{application:Application|null}) {
  const [message,setMessage]=useState("");const [busy,startTransition]=useTransition();const router=useRouter();
  function submit(data:FormData){setMessage("");startTransition(async()=>{const result=await submitTeacherApplication(data);if(!result.ok){setMessage(result.error);return;}setMessage("Solicitud enviada. Un administrador revisará tus datos.");router.refresh();});}
  if(application?.status==="Pendiente")return <section className="panel teacher-request"><span className="status status-pendiente">Solicitud en revisión</span><h2>Acceso docente solicitado</h2><p>Enviada el {new Date(application.created_at).toLocaleDateString("es-MX")} para {application.department}. Solo administración puede aprobarla.</p></section>;
  if(application?.status==="Aprobada")return <section className="panel teacher-request"><span className="status status-aprobado">Aprobada</span><h2>Tu cuenta ya es docente</h2><p>Cierra sesión y vuelve a entrar para abrir tu espacio docente.</p></section>;
  return <section className="panel teacher-request"><div className="module-toolbar"><div><span className="eyebrow">Acceso institucional</span><h2>Solicitar acceso docente</h2><p>La solicitud requiere validación de una persona administradora. Enviarla no cambia tu rol.</p></div><ShieldAlert size={19}/></div>
    {application?.status==="Rechazada"&&<p className="form-error">Solicitud anterior rechazada: {application.rejection_reason||"contacta a administración para más información."}</p>}
    <form action={submit} className="material-form"><div className="form-grid">
      <label className="field"><span>Número de trabajador</span><input name="employeeNumber" required minLength={2} maxLength={40}/></label>
      <label className="field"><span>Departamento</span><input name="department" required minLength={2} maxLength={120} placeholder="Ej. Sistemas y Computación"/></label>
      <label className="field fullcol"><span>Motivo y datos para validar tu solicitud</span><textarea name="justification" rows={4} required minLength={20} maxLength={2000} placeholder="Indica tu área de adscripción y cómo puede administración verificar tu vínculo institucional."/></label>
    </div>{message&&<p className={message.startsWith("Solicitud enviada")?"form-success":"form-error"} role="status">{message}</p>}<button className="button" disabled={busy}>{busy?"Enviando…":"Enviar a revisión"}</button></form>
  </section>;
}

type ReviewItem=Application&{user_id:string;applicant:{first_name:string;last_name:string;email:string}|null};
export function TeacherApplicationsWorkspace({applications}:{applications:ReviewItem[]}) {
  const [message,setMessage]=useState("");const [busy,startTransition]=useTransition();const router=useRouter();
  function decide(data:FormData){const id=String(data.get("applicationId")||"");const decision=String(data.get("decision"));const reason=String(data.get("reason")||"");if(decision!=="Aprobada"&&decision!=="Rechazada")return;setMessage("");startTransition(async()=>{const result=await reviewTeacherApplication(id,decision,reason);if(!result.ok){setMessage(result.error);return;}setMessage(decision==="Aprobada"?"Solicitud aprobada; ya tiene acceso docente.":"Solicitud rechazada.");router.refresh();});}
  return <div className="module-stack"><section className="panel"><div className="module-toolbar"><div><span className="eyebrow">Administración · acceso</span><h2>Solicitudes docentes</h2><p>Verifica el vínculo institucional antes de aprobar. La decisión se registra en la bitácora.</p></div><FileCheck2 size={20}/></div>{message&&<p className="form-success" role="status">{message}</p>}
    {!applications.length?<div className="empty">No hay solicitudes pendientes.</div>:<div className="application-list">{applications.map(item=><article className="application-card" key={item.id}>
      <div className="application-head"><div><span className="status status-pendiente">Pendiente</span><h3>{[item.applicant?.first_name,item.applicant?.last_name].filter(Boolean).join(" ")||"Usuario"}</h3><p>{item.applicant?.email||item.user_id}</p></div><small>{new Date(item.created_at).toLocaleDateString("es-MX")}</small></div>
      <div className="application-facts"><p><b>Número de trabajador:</b> {item.employee_number}</p><p><b>Departamento:</b> {item.department}</p><p><b>Motivo:</b> {item.justification}</p></div>
      <form action={decide} className="application-actions"><input type="hidden" name="applicationId" value={item.id}/><label className="field"><span>Motivo de rechazo (requerido si rechazas)</span><input name="reason" maxLength={1000} placeholder="Explica qué debe corregir o verificar"/></label><div><button className="button" name="decision" value="Aprobada" disabled={busy}><BadgeCheck size={15}/> Aprobar y habilitar docente</button><button className="button button-secondary" name="decision" value="Rechazada" disabled={busy}>Rechazar solicitud</button></div></form>
    </article>)}</div>}</section></div>;
}
