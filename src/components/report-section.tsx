import { createClient } from "@/lib/supabase/server";

export async function ReportSection({backupInfo=false}:{backupInfo?:boolean}){
  if(backupInfo)return <section className="panel"><span className="eyebrow">Continuidad de datos</span><h2>Copias de seguridad</h2><p className="muted">Las copias completas y la restauración pertenecen al servicio PostgreSQL de Supabase. Esta aplicación no guarda una clave privilegiada y no puede generar ni restaurar una copia íntegra de la base de datos.</p><div className="backup-note"><strong>Para respaldar este proyecto</strong><p>Abre el panel de Supabase del proyecto y utiliza la sección de copias de seguridad de la base de datos. Descarga o restaura allí la copia; no importes archivos JSON de demostración.</p></div><p className="footer-note">Los archivos académicos se almacenan en el bucket privado <code>academic-materials</code>; inclúyelos en la política de respaldo del proyecto.</p></section>;
  const supabase=await createClient();
  const [profiles,materials,downloads,pending,logs]=await Promise.all([
    supabase.from("profiles").select("id",{count:"exact",head:true}),
    supabase.from("materials").select("id",{count:"exact",head:true}),
    supabase.from("material_downloads").select("id",{count:"exact",head:true}),
    supabase.from("materials").select("id",{count:"exact",head:true}).eq("status","Pendiente"),
    supabase.from("activity_logs").select("id,user_id,occurred_at,action,module,description").order("occurred_at",{ascending:false}).limit(8),
  ]);
  return <div className="module-stack"><div className="stats"><ReportStat label="Cuentas" value={profiles.count}/><ReportStat label="Materiales" value={materials.count}/><ReportStat label="Pendientes" value={pending.count}/><ReportStat label="Descargas" value={downloads.count}/></div><section className="panel"><h2>Actividad reciente</h2>{logs.error||!logs.data?.length?<div className="empty">Todavía no hay actividad registrada.</div>:<div className="material-list">{logs.data.map(log=><article className="notice" key={log.id}><strong>{log.action}</strong><p>{log.module} · {log.description}</p><small>{new Date(log.occurred_at).toLocaleString("es-MX")}</small></article>)}</div>}</section></div>;
}
function ReportStat({label,value}:{label:string;value:number|null}){return <div className="stat"><span>{label}</span><strong>{value??"—"}</strong><small>Registros actuales</small></div>}
