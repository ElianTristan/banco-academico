"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { downloadMaterial, publishMaterial, reviewMaterial, toggleFavorite } from "@/app/academic/actions";

type Material = { id:string; title:string; description:string; material_type:string; status:string; semester:number|null; unit:string|null; storage_path:string|null; download_count:number; created_at:string; created_by:string; review_note:string|null; subject_id:string|null };
type Subject = { id:string; name:string; code:string };
type Props = { items:Material[]; subjects:Subject[]; favoriteIds:string[]; userId:string; role:"alumno"|"docente"|"administrador"; favoritesOnly?:boolean; mineOnly?:boolean };
const materialTypes = ["Apuntes","Guía","Ejercicios","Presentación","Práctica","Lectura","Resumen","Otro"];
const acceptedTypes = ["application/pdf","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.ms-powerpoint","application/vnd.openxmlformats-officedocument.presentationml.presentation","application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","text/plain"];

export function MaterialWorkspace({items,subjects,favoriteIds,userId,role,favoritesOnly=false,mineOnly=false}:Props){
  const router=useRouter(); const [query,setQuery]=useState(""); const [status,setStatus]=useState(""); const [kind,setKind]=useState(""); const [message,setMessage]=useState(""); const [pending,startTransition]=useTransition();
  const favorites=new Set(favoriteIds);
  const visible=useMemo(()=>{const favoriteSet=new Set(favoriteIds);return items.filter(m=>(!favoritesOnly||favoriteSet.has(m.id))&&(!status||m.status===status)&&(!kind||m.material_type===kind)&&(!query||`${m.title} ${m.description} ${m.unit??""}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())));},[items,favoritesOnly,favoriteIds,status,kind,query]);
  function run(action:()=>Promise<{ok:boolean;error?:string;data?:{url?:string}}>,after?: (result:{ok:boolean;error?:string;data?:{url?:string}})=>void){setMessage("");startTransition(async()=>{const result=await action();if(!result.ok)setMessage(result.error??"No se pudo completar la acción.");else {setMessage("Cambios guardados.");after?.(result);router.refresh();}})}
  return <div className="module-stack">
    {(role!=="administrador"&&!favoritesOnly)&&<details className="panel material-create"><summary>Compartir material académico</summary><MaterialForm subjects={subjects} userId={userId} onMessage={setMessage}/></details>}
    <section className="panel"><div className="module-toolbar"><div><h2>{favoritesOnly?"Mis favoritos":mineOnly?"Mis materiales":role==="administrador"?"Biblioteca y revisión":"Biblioteca académica"}</h2><p className="muted">{role==="administrador"?"Revisa los materiales enviados por la comunidad.":mineOnly?"Consulta el estado de tus publicaciones.":"Encuentra recursos por título, tipo o estado."}</p></div><span className="pill">{visible.length} materiales</span></div>
      <div className="searchbar"><input aria-label="Buscar materiales" placeholder="Buscar por título o descripción" value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label="Filtrar por tipo" value={kind} onChange={e=>setKind(e.target.value)}><option value="">Todos los tipos</option>{materialTypes.map(t=><option key={t}>{t}</option>)}</select>{role==="administrador"&&<select aria-label="Filtrar por estado" value={status} onChange={e=>setStatus(e.target.value)}><option value="">Todos los estados</option>{["Pendiente","Aprobado","Verificado","Rechazado"].map(s=><option key={s}>{s}</option>)}</select>}</div>
      {message&&<p className={message.startsWith("No ")?"form-error":"form-success"} role="status">{message}</p>}
      {!visible.length?<div className="empty">{favoritesOnly?"Aún no guardas favoritos. Explora la biblioteca y agrega los recursos que te interesen.":role==="administrador"?"No hay materiales pendientes de revisión.":"No encontramos materiales con esos criterios."}</div>:<div className="material-list">{visible.map(m=><article className="material-row" key={m.id}><div className="material-main"><div className="material-heading"><h3>{m.title}</h3><span className={`status status-${m.status.toLocaleLowerCase()}`}>{m.status}</span></div><p>{m.description||"Sin descripción adicional."}</p><div className="material-meta"><span>{m.material_type}</span>{m.semester&&<span>Semestre {m.semester}</span>}{m.unit&&<span>{m.unit}</span>}<span>{new Date(m.created_at).toLocaleDateString("es-MX")}</span><span>{m.download_count} descargas</span></div>{m.review_note&&role!=="alumno"&&<small className="muted">Nota de revisión: {m.review_note}</small>}</div><div className="material-actions-row">
        {role==="alumno"&&m.status!=="Pendiente"&&<button className="button button-secondary" disabled={pending} onClick={()=>run(()=>toggleFavorite(m.id,favorites.has(m.id)))}>{favorites.has(m.id)?"Quitar favorito":"Guardar"}</button>}
        {role==="administrador"&&m.status==="Pendiente"&&<><button className="button button-secondary" disabled={pending} onClick={()=>run(()=>reviewMaterial(m.id,"Rechazado","No cumple los criterios de publicación."))}>Rechazar</button><button className="button" disabled={pending} onClick={()=>run(()=>reviewMaterial(m.id,"Aprobado"))}>Aprobar</button></>}
        {m.storage_path&&m.status!=="Pendiente"&&<button className="button" disabled={pending} onClick={()=>run(()=>downloadMaterial(m.id),result=>{if(result.data?.url)window.location.assign(result.data.url)})}>Descargar</button>}
      </div></article>)}</div>}
    </section>
  </div>;
}

function MaterialForm({subjects,userId,onMessage}:{subjects:Subject[];userId:string;onMessage:(value:string)=>void}){
  const router=useRouter();const [pending,startTransition]=useTransition();const [fileName,setFileName]=useState("");
  function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget;const data=new FormData(form);const file=data.get("file");const fileObject=file instanceof File&&file.size?file:null;
    startTransition(async()=>{
      let path="";
      if(fileObject){if(!acceptedTypes.includes(fileObject.type)||fileObject.size>25*1024*1024){onMessage("El archivo debe ser PDF, Office o texto y pesar máximo 25 MB.");return;}const clean=fileObject.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g,"-").slice(-100);path=`${userId}/${crypto.randomUUID()}/${clean}`;const {error}=await createClient().storage.from("academic-materials").upload(path,fileObject,{contentType:fileObject.type,upsert:false});if(error){onMessage("No pudimos subir el archivo. Inténtalo de nuevo.");return;}}
      if(path)data.set("storagePath",path);
      const result=await publishMaterial(data);
      if(!result.ok){if(path)await createClient().storage.from("academic-materials").remove([path]);onMessage(result.error);return;}
      form.reset();setFileName("");onMessage("Material enviado. Quedará pendiente de revisión antes de publicarse.");router.refresh();
    });
  }
  return <form className="material-form" onSubmit={submit}><div className="form-grid"><label className="field"><span>Título</span><input name="title" required minLength={3} maxLength={180}/></label><label className="field"><span>Tipo de material</span><select name="materialType" required>{materialTypes.map(t=><option key={t}>{t}</option>)}</select></label><label className="field"><span>Materia</span><select name="subjectId" defaultValue=""><option value="">General</option>{subjects.map(s=><option value={s.id} key={s.id}>{s.code} · {s.name}</option>)}</select></label><label className="field"><span>Semestre (opcional)</span><input name="semester" type="number" min="1" max="20"/></label><label className="field"><span>Unidad (opcional)</span><input name="unit" maxLength={80}/></label><label className="field"><span>Archivo (máx. 25 MB)</span><input name="file" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt" onChange={e=>setFileName(e.target.files?.[0]?.name??"")}/>{fileName&&<small>{fileName}</small>}</label><label className="field fullcol"><span>Descripción</span><textarea name="description" rows={3} maxLength={4000}/></label></div><p className="muted form-hint">Los materiales se revisan antes de aparecer en la biblioteca. No subas información personal sensible.</p><button className="button" disabled={pending}>{pending?"Enviando…":"Enviar a revisión"}</button></form>;
}
