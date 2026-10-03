"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, BookOpenCheck, Clock3, Download, UploadCloud } from "lucide-react";

type Entry = { id: string; title: string; status: string; created_at: string; download_count: number };
export function ActivityDashboard({ role, entries, approvedCount, pendingCount, availableCount, favoriteCount }:{role:"alumno"|"docente"|"administrador";entries:Entry[];approvedCount:number;pendingCount:number;availableCount:number;favoriteCount:number}) {
  const [range, setRange] = useState<7|30|180>(30);
  const chart = useMemo(() => {
    const now = Date.now();
    const points = range === 7 ? 7 : range === 30 ? 10 : 6;
    const span = range === 7 ? 1 : range === 30 ? 3 : 30;
    return Array.from({length:points}, (_, i) => {
      const end = now - (points - i - 1) * span * 86400000;
      const start = end - span * 86400000;
      const count = entries.filter(row => {const time = new Date(row.created_at).getTime();return time >= start && time < end;}).length;
      return { label: range === 7 ? new Date(end).toLocaleDateString("es-MX",{weekday:"short"}) : new Date(end).toLocaleDateString("es-MX",{month:"short",day:range===30?"numeric":undefined}), count };
    });
  }, [entries, range]);
  const max = Math.max(1, ...chart.map(point => point.count));
  const reviewed = approvedCount + pendingCount;
  const progress = reviewed ? Math.round(approvedCount / reviewed * 100) : 0;
  const own = role !== "administrador";
  const latest = [...entries].slice(0,4);
  return <div className="dashboard-lower grid w-full gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,.9fr)]">
    <section className="panel activity-panel">
      <div className="table-head"><div><span className="eyebrow">Banco de recursos</span><h2>Ritmo de aportaciones</h2></div><select aria-label="Periodo de actividad" value={range} onChange={event=>setRange(Number(event.target.value) as 7|30|180)}><option value={7}>7 días</option><option value={30}>30 días</option><option value={180}>6 meses</option></select></div>
      <div className="activity-chart" role="img" aria-label={`Actividad de materiales: ${chart.reduce((sum,p)=>sum+p.count,0)} aportaciones en el periodo`}>
        {chart.map((point,i)=><div className="chart-column" key={`${point.label}-${i}`} title={`${point.count} materiales`}><span className="chart-value">{point.count || ""}</span><div className="chart-track"><i style={{height:`${Math.max(point.count ? 12 : 4, point.count / max * 100)}%`}}/></div><small>{point.label}</small></div>)}
      </div>
      <div className="progress-caption"><div><BookOpenCheck size={16}/><span>{own?"Revisión de tus aportaciones":"Materiales con aprobación"}</span></div><strong>{progress}%</strong></div>
      <div className="progress-track" role="progressbar" aria-label="Porcentaje de materiales aprobados" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><span style={{width:`${progress}%`}}/></div>
      <div className="progress-foot"><span>{approvedCount} aprobados</span><span>{pendingCount} pendientes</span></div>
    </section>
    <section className="panel contribution-panel">
      <div className="table-head"><div><span className="eyebrow">Actividad reciente</span><h2>{own?"Tus aportaciones":"Últimos materiales"}</h2></div><UploadCloud size={18}/></div>
      <div className="mini-metrics"><div><Download size={15}/><span>{role==="alumno"?availableCount:entries.reduce((sum,item)=>sum+Number(item.download_count||0),0)}</span><small>{role==="alumno"?"disponibles":"descargas"}</small></div><div><Clock3 size={15}/><span>{role==="alumno"?favoriteCount:pendingCount}</span><small>{role==="alumno"?"favoritos":"por revisar"}</small></div><div><ArrowUpRight size={15}/><span>{role==="alumno"?entries.length:approvedCount}</span><small>{role==="alumno"?"compartidos":"aprobados"}</small></div></div>
      {latest.length ? <div className="latest-list">{latest.map(item=><div className="latest-item" key={item.id}><span><strong>{item.title}</strong><small>{new Date(item.created_at).toLocaleDateString("es-MX",{day:"numeric",month:"short"})}</small></span><em className={`status status-${item.status.toLowerCase()}`}>{item.status}</em></div>)}</div> : <div className="empty">Cuando compartas material, aquí verás el avance de revisión.</div>}
    </section>
  </div>;
}
