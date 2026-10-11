"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Command, Search } from "lucide-react";
import type { AppRole } from "@/lib/roles";
import { searchAdminDirectory } from "@/app/academic/actions";

const destinations:Record<AppRole,{label:string;href:string;group:string}[]>={
  alumno:[
    {label:"Inicio",href:"/alumno",group:"General"},{label:"Explorar materiales",href:"/alumno/explorar",group:"Biblioteca"},{label:"Favoritos",href:"/alumno/favoritos",group:"Biblioteca"},{label:"Mis materias",href:"/alumno/materias",group:"Académico"},{label:"Horario",href:"/alumno/horario",group:"Académico"},{label:"Calificaciones",href:"/alumno/calificaciones",group:"Académico"},{label:"Asesorías",href:"/alumno/asesorias",group:"Comunidad"},{label:"Avisos",href:"/alumno/avisos",group:"Comunidad"},{label:"Perfil",href:"/alumno/perfil",group:"Cuenta"},
  ],
  docente:[
    {label:"Inicio",href:"/docente",group:"General"},{label:"Mis grupos",href:"/docente/grupos",group:"Académico"},{label:"Mis materias",href:"/docente/materias",group:"Académico"},{label:"Alumnos",href:"/docente/alumnos",group:"Académico"},{label:"Calificaciones",href:"/docente/calificaciones",group:"Académico"},{label:"Horario",href:"/docente/horario",group:"Académico"},{label:"Compartir material",href:"/docente/subir",group:"Biblioteca"},{label:"Mis materiales",href:"/docente/mis-materiales",group:"Biblioteca"},{label:"Asesorías",href:"/docente/asesorias",group:"Comunidad"},{label:"Avisos",href:"/docente/avisos",group:"Comunidad"},{label:"Estadísticas",href:"/docente/estadisticas",group:"Gestión"},{label:"Perfil",href:"/docente/perfil",group:"Cuenta"},
  ],
  administrador:[
    {label:"Inicio",href:"/admin",group:"Administración"},{label:"Usuarios",href:"/admin/usuarios",group:"Directorio"},{label:"Alumnos",href:"/admin/alumnos",group:"Directorio"},{label:"Docentes",href:"/admin/docentes",group:"Directorio"},{label:"Solicitudes docentes",href:"/admin/solicitudes",group:"Accesos"},{label:"Materias",href:"/admin/materias",group:"Académico"},{label:"Carreras",href:"/admin/carreras",group:"Académico"},{label:"Grupos",href:"/admin/grupos",group:"Académico"},{label:"Calificaciones",href:"/admin/calificaciones",group:"Académico"},{label:"Periodos",href:"/admin/periodos",group:"Académico"},{label:"Biblioteca y revisión",href:"/admin/materiales",group:"Operación"},{label:"Asesorías",href:"/admin/asesorias",group:"Operación"},{label:"Avisos",href:"/admin/avisos",group:"Operación"},{label:"Reportes",href:"/admin/reportes",group:"Operación"},{label:"Bitácora",href:"/admin/bitacora",group:"Seguridad"},{label:"Accesos",href:"/admin/accesos",group:"Seguridad"},{label:"Configuración",href:"/admin/configuracion",group:"Administración"},{label:"Respaldos",href:"/admin/respaldos",group:"Seguridad"},{label:"Perfil",href:"/admin/perfil",group:"Cuenta"},
  ],
};

export function CommandMenu({role}:{role:AppRole}){
  const [open,setOpen]=useState(false);
  const [query,setQuery]=useState("");
  const [directoryItems,setDirectoryItems]=useState<{title:string;detail:string;href:string;kind:string}[]>([]);
  const [searching,setSearching]=useState(false);
  const dialogRef=useRef<HTMLDialogElement>(null);
  const inputRef=useRef<HTMLInputElement>(null);
  const pathname=usePathname();
  const filtered=useMemo(()=>destinations[role].filter(item=>`${item.label} ${item.group}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())),[role,query]);

  useEffect(()=>{
    if(!open||role!=="administrador"||query.trim().length<2){setDirectoryItems([]);setSearching(false);return;}
    let current=true;
    const timer=window.setTimeout(()=>{setSearching(true);void searchAdminDirectory(query).then(result=>{if(current){setDirectoryItems(result.ok?result.items:[]);setSearching(false);}}).catch(()=>{if(current){setDirectoryItems([]);setSearching(false);}});},220);
    return ()=>{current=false;window.clearTimeout(timer);};
  },[open,query,role]);

  useEffect(()=>{
    const dialog=dialogRef.current;
    if(!dialog)return;
    if(open&&!dialog.open){dialog.showModal();requestAnimationFrame(()=>inputRef.current?.focus());}
    if(!open&&dialog.open)dialog.close();
  },[open]);

  useEffect(()=>{
    const onKeyDown=(event:KeyboardEvent)=>{
      if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="k"){
        event.preventDefault();setQuery("");setOpen(value=>!value);
      }
    };
    window.addEventListener("keydown",onKeyDown);
    return ()=>window.removeEventListener("keydown",onKeyDown);
  },[]);

  useEffect(()=>{setOpen(false);setQuery("");},[pathname]);

  return <>
    <button className="command-trigger" type="button" aria-haspopup="dialog" aria-expanded={open} onClick={()=>{setQuery("");setOpen(true);}}>
      <Search size={15}/><span>Ir a…</span><kbd><Command size={11}/> K</kbd>
    </button>
    <dialog ref={dialogRef} className="command-dialog" aria-label="Navegación rápida" onClose={()=>setOpen(false)} onClick={event=>{if(event.target===dialogRef.current)setOpen(false);}}>
      <div className="command-search"><Search size={18}/><input ref={inputRef} value={query} onChange={event=>setQuery(event.target.value)} placeholder="Buscar una sección…" aria-label="Buscar secciones" onKeyDown={event=>{if(event.key==="Escape")setOpen(false);}}/><kbd>ESC</kbd></div>
      <div className="command-results" role="list" aria-label="Secciones y resultados">
        {filtered.map(item=><Link aria-current={pathname===item.href?"page":undefined} key={item.href} href={item.href} onClick={()=>setOpen(false)}><span className="command-result-group">{item.group}</span><span>{item.label}</span><ArrowRight size={15}/></Link>)}
        {directoryItems.map((item,index)=><Link aria-current={pathname===item.href?"page":undefined} key={`${item.kind}-${item.href}-${index}`} href={item.href} onClick={()=>setOpen(false)}><span className="command-result-group">{item.kind}</span><span className="command-directory-result"><strong>{item.title}</strong><small>{item.detail}</small></span><ArrowRight size={15}/></Link>)}
        {searching&&<p className="command-empty" role="status">Buscando en el directorio académico…</p>}
        {!searching&&!filtered.length&&!directoryItems.length&&<p className="command-empty">No encontramos resultados.</p>}
      </div>
      <footer><span><kbd>⌘</kbd> <kbd>K</kbd> para abrir</span><span>Banco Académico</span></footer>
    </dialog>
  </>;
}
