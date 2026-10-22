import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { BookOpen, CalendarDays, ClipboardList, GraduationCap, LayoutDashboard, Megaphone, Settings, Shield, Users, UserRound, ScrollText, Library, LogOut, ChevronDown, Database } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";
import { MaterialSection } from "@/components/material-section";
import { AdvisorySection } from "@/components/advisory-section";
import { ReportSection } from "@/components/report-section";
import { BackupRecoveryWorkspace } from "@/components/backup-recovery-workspace";
import { ProfileEditor } from "@/components/profile-editor";
import { ActivityDashboard } from "@/components/activity-dashboard";
import { TeacherApplicationsWorkspace, TeacherRequestForm } from "@/components/teacher-application-workspace";
import { CommandMenu } from "@/components/command-menu";
import { ScrollReveal } from "@/components/scroll-reveal";
import { CampusHero } from "@/components/campus-hero";
import { CampusPhotoStory } from "@/components/campus-photo-story";
import { PageTransition } from "@/components/page-transition";
import { BrandLockup } from "@/components/brand-lockup";
import { AdminUsersWorkspace } from "@/components/admin-users-workspace";
import type { AppRole } from "@/lib/roles";
import { isAppRole, roleHomes } from "@/lib/roles";

const nav: Record<AppRole,{label:string;href:string;icon:typeof LayoutDashboard}[]> = {
  alumno:[{label:"Inicio",href:"/alumno",icon:LayoutDashboard},{label:"Explorar material",href:"/alumno/explorar",icon:Library},{label:"Mis materias",href:"/alumno/materias",icon:BookOpen},{label:"Favoritos",href:"/alumno/favoritos",icon:Library},{label:"Compartir material",href:"/alumno/subir",icon:Megaphone},{label:"Mis materiales",href:"/alumno/mis-materiales",icon:Library},{label:"Asesorías",href:"/alumno/asesorias",icon:Users},{label:"Avisos",href:"/alumno/avisos",icon:Megaphone},{label:"Calificaciones",href:"/alumno/calificaciones",icon:ClipboardList},{label:"Horario",href:"/alumno/horario",icon:CalendarDays},{label:"Perfil",href:"/alumno/perfil",icon:UserRound}],
  docente:[{label:"Inicio",href:"/docente",icon:LayoutDashboard},{label:"Mis grupos",href:"/docente/grupos",icon:Users},{label:"Mis materias",href:"/docente/materias",icon:BookOpen},{label:"Materiales",href:"/docente/materiales",icon:Library},{label:"Subir material",href:"/docente/subir",icon:Megaphone},{label:"Mis materiales",href:"/docente/mis-materiales",icon:Library},{label:"Asesorías",href:"/docente/asesorias",icon:Users},{label:"Avisos",href:"/docente/avisos",icon:Megaphone},{label:"Calificaciones",href:"/docente/calificaciones",icon:ClipboardList},{label:"Alumnos",href:"/docente/alumnos",icon:GraduationCap},{label:"Horario",href:"/docente/horario",icon:CalendarDays},{label:"Estadísticas",href:"/docente/estadisticas",icon:ScrollText},{label:"Perfil",href:"/docente/perfil",icon:UserRound}],
  administrador:[{label:"Inicio",href:"/admin",icon:LayoutDashboard},{label:"Usuarios",href:"/admin/usuarios",icon:Users},{label:"Alumnos",href:"/admin/alumnos",icon:GraduationCap},{label:"Docentes",href:"/admin/docentes",icon:UserRound},{label:"Solicitudes",href:"/admin/solicitudes",icon:Shield},{label:"Materias",href:"/admin/materias",icon:BookOpen},{label:"Carreras",href:"/admin/carreras",icon:Library},{label:"Grupos",href:"/admin/grupos",icon:ClipboardList},{label:"Calificaciones",href:"/admin/calificaciones",icon:ClipboardList},{label:"Periodos",href:"/admin/periodos",icon:CalendarDays},{label:"Biblioteca y revisión",href:"/admin/materiales",icon:Library},{label:"Asesorías",href:"/admin/asesorias",icon:Users},{label:"Avisos",href:"/admin/avisos",icon:Megaphone},{label:"Reportes",href:"/admin/reportes",icon:ScrollText},{label:"Bitácora",href:"/admin/bitacora",icon:ScrollText},{label:"Accesos",href:"/admin/accesos",icon:Shield},{label:"Configuración",href:"/admin/configuracion",icon:Settings},{label:"Respaldos",href:"/admin/respaldos",icon:Database},{label:"Perfil",href:"/admin/perfil",icon:UserRound}],
};
const roleLabel:Record<AppRole,string>={alumno:"Alumno",docente:"Docente",administrador:"Administrador"};
const roleHome:Record<AppRole,string>={alumno:"alumno",docente:"docente",administrador:"admin"};

function groupNavigation(items:typeof nav[AppRole]){
  const groups:{label:string;items:typeof nav[AppRole]}[]=[];
  const labels:Record<string,string>={Inicio:"Resumen","Explorar material":"Biblioteca",Favoritos:"Biblioteca","Compartir material":"Biblioteca","Subir material":"Biblioteca",Materiales:"Biblioteca","Mis materiales":"Biblioteca","Mis materias":"Académico",Horario:"Académico",Calificaciones:"Académico",Grupos:"Académico",Alumnos:"Académico",Materias:"Académico",Carreras:"Académico",Periodos:"Académico",Asesorías:"Comunidad",Avisos:"Comunidad",Publicaciones:"Comunidad",Usuarios:"Institución",Docentes:"Institución",Solicitudes:"Institución","Biblioteca y revisión":"Institución",Reportes:"Institución",Bitácora:"Institución",Accesos:"Institución",Configuración:"Institución",Respaldos:"Institución",Estadísticas:"Institución",Perfil:"Cuenta"};
  for(const item of items){const label=labels[item.label]??"General";let group=groups.find(candidate=>candidate.label===label);if(!group){group={label,items:[]};groups.push(group)}group.items.push(item)}
  return groups;
}

function AdminWorkspaceNav({active,home}:{active:string|undefined;home:string}){
  const tools=nav.administrador.filter(item=>!["Inicio","Solicitudes","Usuarios"].includes(item.label));
  return <nav className="admin-workspace-nav" aria-label="Administración">
    <Link href={`/${home}`} aria-current={!active?"page":undefined} className={!active?"active":""}><LayoutDashboard size={16}/>Resumen</Link>
    <Link href="/admin/solicitudes" aria-current={active==="solicitudes"?"page":undefined} className={active==="solicitudes"?"active":""}><Shield size={16}/>Solicitudes</Link>
    <Link href="/admin/usuarios" aria-current={active==="usuarios"?"page":undefined} className={active==="usuarios"?"active":""}><Users size={16}/>Usuarios</Link>
    <details className="admin-tools"><summary><Settings size={16}/>Herramientas<ChevronDown size={14}/></summary><div className="admin-tools-menu">{tools.map(item=>{const Icon=item.icon;return <Link key={item.href} href={item.href}><Icon size={15}/>{item.label}</Link>})}</div></details>
  </nav>;
}

function RoleQuickActions({role}:{role:"alumno"|"docente"}){
  const actions=role==="alumno"?[
    {label:"Explorar materiales",href:"/alumno/explorar",icon:Library},
    {label:"Consultar horario",href:"/alumno/horario",icon:CalendarDays},
    {label:"Ver calificaciones",href:"/alumno/calificaciones",icon:ClipboardList},
  ]:[
    {label:"Ver mis grupos",href:"/docente/grupos",icon:Users},
    {label:"Compartir material",href:"/docente/subir",icon:Megaphone},
    {label:"Abrir calificaciones",href:"/docente/calificaciones",icon:ClipboardList},
  ];
  return <nav className="role-quick-actions" aria-label="Accesos rápidos">{actions.map(action=>{const Icon=action.icon;return <Link key={action.href} href={action.href}><Icon size={16}/><span>{action.label}</span><span aria-hidden="true">↗</span></Link>})}</nav>;
}

const pageInfo:Record<string,{title:string;description:string;table?:string;column?:string}>={
  materias:{title:"Materias",description:"Consulta las materias de tu actividad académica.",table:"subjects",column:"name"},calificaciones:{title:"Calificaciones",description:"Revisa el avance académico registrado.",table:"grades",column:"score"},horario:{title:"Horario",description:"Consulta las sesiones programadas.",table:"schedules",column:"starts_at"},grupos:{title:"Grupos",description:"Grupos académicos asignados.",table:"groups",column:"code"},alumnos:{title:"Alumnos",description:"Registra y administra las cuentas de alumnado."},avisos:{title:"Avisos",description:"Publicaciones académicas recientes.",table:"posts",column:"title"},publicaciones:{title:"Publicaciones",description:"Avisos de la comunidad académica.",table:"posts",column:"title"},perfil:{title:"Perfil",description:"Tu información de cuenta y perfil."},usuarios:{title:"Usuarios",description:"Crea cuentas de alumnos y docentes, y administra su acceso."},docentes:{title:"Docentes",description:"Registra y administra las cuentas docentes."},solicitudes:{title:"Solicitudes docentes",description:"Revisa el vínculo institucional antes de aprobar el acceso."},carreras:{title:"Carreras",description:"Programas académicos registrados.",table:"careers",column:"name"},bitacora:{title:"Bitácora",description:"Registro de acciones y cambios administrativos.",table:"activity_logs",column:"action"},accesos:{title:"Accesos",description:"Consulta eventos de autenticación registrados.",table:"access_logs",column:"event_type"},configuracion:{title:"Configuración",description:"Información general del entorno académico."},estadisticas:{title:"Estadísticas",description:"Indicadores reales de tus materiales."},reportes:{title:"Reportes",description:"Indicadores generales del Banco Académico."},respaldos:{title:"Respaldo y Recuperación de Información",description:"Genera copias institucionales seguras y recupera el sistema con validación criptográfica SHA-256."},periodos:{title:"Periodos académicos",description:"Consulta los periodos configurados.",table:"academic_periods",column:"name"},explorar:{title:"Explorar material",description:"Encuentra recursos académicos aprobados."},materiales:{title:"Materiales",description:"Recursos académicos disponibles y en revisión."},subir:{title:"Compartir material",description:"Envía un recurso académico para revisión."},favoritos:{title:"Favoritos",description:"Material que guardaste para consultar después."},"mis-materiales":{title:"Mis materiales",description:"Consulta tus publicaciones y su estado."},asesorias:{title:"Asesorías",description:"Acompañamiento y apoyo académico."},
};

export async function Portal({role,section,query,authSuccess=false}:{role:AppRole;section?:string;query?:string;authSuccess?:boolean}) {
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect("/login");
  if(user.app_metadata?.must_change_password===true||user.user_metadata?.must_change_password===true){
    redirect("/recuperar/nueva?required=1");
  }
  const {data:profile}=await supabase.from("profiles").select("first_name,last_name,email,role,is_active,preferred_theme,avatar_path").eq("id",user.id).maybeSingle();
  if(!isAppRole(profile?.role))redirect("/acceso-pendiente");
  if(profile.is_active!==true)redirect("/login?error=inactive");
  if(profile.role!==role)redirect(roleHomes[profile.role]);
  const name=[profile?.first_name,profile?.last_name].filter(Boolean).join(" ")||profile?.email||user?.email||roleLabel[role];
  const home=roleHome[role];
  const active=section;
  const admin=role==="administrador";
  const title=active? pageInfo[active]?.title ?? active[0].toUpperCase()+active.slice(1) : "Inicio";
  const safeQuery=query?.replace(/[^\p{L}\p{N}@.-]/gu," ").trim().slice(0,80)??"";
  const results=active&&pageInfo[active]?.table&&active!=="usuarios" ? await (safeQuery&&admin?supabase.from(pageInfo[active].table!).select(pageInfo[active].column!).ilike(pageInfo[active].column!,`%${safeQuery}%`).limit(20):supabase.from(pageInfo[active].table!).select(pageInfo[active].column!).limit(20)) : null;
  const directoryBase=supabase.from("profiles").select("id,first_name,last_name,email,role,is_active,created_at").order("created_at",{ascending:false}).limit(100);
  const directoryByRole=active==="alumnos"?directoryBase.eq("role","alumno"):active==="docentes"?directoryBase.eq("role","docente"):directoryBase;
  const directoryRequest=safeQuery?directoryByRole.or(`first_name.ilike.%${safeQuery}%,last_name.ilike.%${safeQuery}%,email.ilike.%${safeQuery}%`):directoryByRole;
  const directoryUsers=admin&&["usuarios","alumnos","docentes"].includes(active??"")?await directoryRequest:null;
  const rowCount=results?.data?.length ?? 0;
  const students=admin?await supabase.from("students").select("id",{count:"exact",head:true}):null;
  const teachers=admin?await supabase.from("teachers").select("id",{count:"exact",head:true}):null;
  const subjects=admin?await supabase.from("subjects").select("id",{count:"exact",head:true}):null;
  const groups=admin?await supabase.from("groups").select("id",{count:"exact",head:true}):null;
  const enrolled=role==="alumno"?await supabase.from("enrollments").select("id",{count:"exact",head:true}).eq("student_id",user!.id):null;
  const teacherGroups=role==="docente"?await supabase.from("teacher_groups").select("group_id",{count:"exact",head:true}).eq("teacher_id",user!.id):null;
  const uploadsQuery=supabase.from("materials").select("id,title,status,created_at,download_count").order("created_at",{ascending:false}).limit(100);
  const uploadRows=admin?await uploadsQuery:await uploadsQuery.eq("created_by",user!.id);
  const ownApproved=(uploadRows.data??[]).filter(item=>item.status==="Aprobado"||item.status==="Verificado").length;
  const ownPending=(uploadRows.data??[]).filter(item=>item.status==="Pendiente").length;
  const globalApproved=admin?await supabase.from("materials").select("id",{count:"exact",head:true}).in("status",["Aprobado","Verificado"]):null;
  const globalPending=admin?await supabase.from("materials").select("id",{count:"exact",head:true}).eq("status","Pendiente"):null;
  const available=role==="alumno"?await supabase.from("materials").select("id",{count:"exact",head:true}).in("status",["Aprobado","Verificado"]):null;
  const favorites=role==="alumno"?await supabase.from("material_favorites").select("material_id",{count:"exact",head:true}).eq("student_id",user!.id):null;
  const studentInfo=role==="alumno"?await supabase.from("students").select("semester,specialty").eq("id",user.id).maybeSingle():null;
  const profileEnrollments=role==="alumno"&&active==="perfil"?await supabase.from("enrollments").select("group_id").eq("student_id",user.id).eq("status","active"):null;
  const profileGroupIds=[...new Set((profileEnrollments?.data??[]).map(row=>row.group_id))];
  const profileGroups=profileGroupIds.length?await supabase.from("groups").select("subject_id").in("id",profileGroupIds):null;
  const profileSubjectIds=[...new Set((profileGroups?.data??[]).map(row=>row.subject_id))];
  const profileSubjects=profileSubjectIds.length?await supabase.from("subjects").select("id,code,name").in("id",profileSubjectIds).order("name"):null;
  const profileSpecialties=profileSubjectIds.length?await supabase.from("subject_specialties").select("subject_id,specialty_code").in("subject_id",profileSubjectIds):null;
  const subjectSpecialtyLabel:Record<string,string>={ciberseguridad:"Ciberseguridad",gestion_servicios_ti:"Gestión de Servicios de TI"};
  const profileSubjectSpecialtyById=new Map((profileSpecialties?.data??[]).map(row=>[row.subject_id,subjectSpecialtyLabel[row.specialty_code]??row.specialty_code]));
  const enrolledSubjects=(profileSubjects?.data??[]).map(subject=>({...subject,specialty:profileSubjectSpecialtyById.get(subject.id)??null}));
  const profileSubjectsError=profileEnrollments?.error||profileGroups?.error||profileSubjects?.error||profileSpecialties?.error
    ? "No se pudieron cargar tus materias inscritas. Intenta recargar la página."
    : null;
  const ownApplication=active==="perfil"&&role==="alumno"?await supabase.from("teacher_applications").select("id,status,employee_number,department,justification,rejection_reason,created_at").eq("user_id",user.id).order("created_at",{ascending:false}).limit(1).maybeSingle():null;
  const applicationRows=active==="solicitudes"&&admin?await supabase.from("teacher_applications").select("id,user_id,employee_number,department,justification,status,rejection_reason,created_at").eq("status","Pendiente").order("created_at",{ascending:true}):null;
  const applicantIds=[...new Set((applicationRows?.data??[]).map(item=>item.user_id))];
  const applicantProfiles=applicantIds.length?await supabase.from("profiles").select("id,first_name,last_name,email").in("id",applicantIds):{data:[]};
  const applicantById=new Map((applicantProfiles.data??[]).map(item=>[item.id,item]));
  const pendingApplications=(applicationRows?.data??[]).map(item=>({...item,applicant:applicantById.get(item.user_id)??null}));
  const avatar=profile?.avatar_path?await supabase.storage.from("profile-photos").createSignedUrl(profile.avatar_path,3600):null;
  const posts=await supabase.from("posts").select("id,title,body,created_at").order("created_at",{ascending:false}).limit(3);
  const hasUser=Boolean(user);
  const focusSummary = role === "alumno" ? "Revisa materiales nuevos, horarios y tareas de tu semana." : role === "docente" ? "Consulta tus grupos, materiales pendientes y seguimiento del alumnado." : "Revisa solicitudes, directorio y recursos institucionales.";
  return <PageTransition className="app-shell-page"><div className="app-shell" data-theme={profile?.preferred_theme??"light"} data-role={role}><aside className="sidebar"><Link className="brand" href={`/${home}`} aria-label="Banco Académico, inicio"><BrandLockup size="compact"/></Link><div className="institution-logos" aria-label="Identidad institucional"><a href="https://slp.tecnm.mx/identidad/" target="_blank" rel="noreferrer" aria-label="Instituto Tecnológico de San Luis Potosí"><Image src="/brand/itslp.png" alt="ITSLP" width={299} height={280}/></a><a href="https://www.tecnm.mx/" target="_blank" rel="noreferrer" aria-label="Tecnológico Nacional de México"><Image src="/brand/tecnm.png" alt="TecNM" width={447} height={447}/></a></div><div className="nav-label">ESPACIO {roleLabel[role].toUpperCase()}</div><nav>{groupNavigation(nav[role]).map(group=><details className="nav-group" key={group.label} open={group.items.some(item=>item.href===`/${home}`?!active:item.href.endsWith(`/${active}`))}><summary>{group.label}<ChevronDown size={14}/></summary>{group.items.map(item=>{const Icon=item.icon;const isActive=item.href===`/${home}`?!active:item.href.endsWith(`/${active}`);return <Link key={item.href} href={item.href} aria-current={isActive?"page":undefined} className={`nav-item${isActive?" active":""}`}><Icon size={17}/><span>{item.label}</span></Link>})}</details>)}</nav><div className="sidebar-bottom"><div className="profile-mini">{avatar?.data?.signedUrl?<Image className="avatar" src={avatar.data.signedUrl} width={35} height={35} unoptimized alt=""/>:<span className="avatar">{name.split(/\s+/).filter(Boolean).slice(0,2).map((part: string) => part.charAt(0)).join("").toUpperCase()}</span>}<div><strong>{name}</strong><small>{roleLabel[role]}</small></div></div><form action={signOut}><button className="signout" type="submit"><LogOut size={15} style={{verticalAlign:"middle",marginRight:8}}/>Cerrar sesión</button></form></div></aside>
    <main className="main"><header className={active?"header-row":"portal-topbar"}>{active?<div><span className="eyebrow">{admin?"Administración":role==="docente"?"Espacio docente":"Espacio académico"}</span><h1>{title}</h1><p>{pageInfo[active]?.description}</p></div>:<div className="topbar-context"><BrandLockup size="compact"/><span className="topbar-institution">Instituto Tecnológico de San Luis Potosí</span></div>}<div className="header-actions"><CommandMenu role={role}/><span className="pill">{roleLabel[role]}{role==="alumno"&&studentInfo?.data?.semester?` · ${studentInfo.data.semester}° semestre`:""}</span></div></header>
      {authSuccess && <p className="form-success portal-login-success" role="status">Sesión iniciada correctamente.</p>}
      {admin&&<AdminWorkspaceNav active={active} home={home}/>}
      {active==="perfil"&&hasUser?<><ProfileEditor userId={user.id} firstName={profile?.first_name??""} lastName={profile?.last_name??""} email={profile?.email??user.email??""} theme={profile?.preferred_theme==="dark"?"dark":"light"} avatarUrl={avatar?.data?.signedUrl??null} avatarPath={profile?.avatar_path??null} student={role==="alumno"&&studentInfo?.data?{semester:studentInfo.data.semester,specialty:studentInfo.data.specialty??""}:null} enrolledSubjects={enrolledSubjects} subjectsError={profileSubjectsError} academicError={role==="alumno"&&(studentInfo?.error||!studentInfo?.data)?"No se pudieron recuperar tus datos académicos. Intenta recargar la página.":null}/>{role==="alumno"&&<TeacherRequestForm application={ownApplication?.data??null}/>}</>:active&&admin&&["usuarios","alumnos","docentes"].includes(active)?<AdminUsersWorkspace users={directoryUsers?.data??[]} query={safeQuery} loadError={directoryUsers?.error?"No se pudo cargar el directorio de cuentas.":null} roleFilter={active==="alumnos"?"alumno":active==="docentes"?"docente":"all"} currentUserId={user.id}/>:active==="solicitudes"&&admin?<TeacherApplicationsWorkspace applications={pendingApplications}/>:active&&["materiales","explorar","subir","favoritos","mis-materiales"].includes(active)&&hasUser?<MaterialSection role={role} userId={user.id} favoritesOnly={active==="favoritos"} mineOnly={active==="mis-materiales"}/>:active==="asesorias"&&hasUser?<AdvisorySection role={role} userId={user.id}/>:active==="reportes"&&admin?<ReportSection/>:active==="respaldos"&&admin?<BackupRecoveryWorkspace/>:active?<section className="panel"><div className="table-head"><h2>{title}</h2><span className="muted" style={{fontSize:12}}>Información actual</span></div>{results?.error?<div className="empty" role="alert"><p>No pudimos cargar esta información académica.</p><Link className="retry-link" href={`/${home}${active?`/${active}`:""}`}>Intentar de nuevo</Link></div>:rowCount===0?<div className="empty">{safeQuery?"No encontramos resultados para esa búsqueda.":"Aún no hay información registrada aquí."}</div>:<div style={{display:"grid",gridTemplateColumns:"1fr",gap:0}}>{results?.data?.map((row,index)=><div className="notice" key={index}><strong>{String((row as unknown as Record<string,unknown>)[pageInfo[active]?.column??""]??"—")}</strong></div>)}</div>}</section>:<>
        {!active&&<CampusHero role={role} name={name} semester={studentInfo?.data?.semester}/>}
      {admin?<div className="stats"><Stat label="Alumnos" value={students?.count}/><Stat label="Docentes" value={teachers?.count}/><Stat label="Materias" value={subjects?.count}/><Stat label="Grupos" value={groups?.count}/></div>:role==="alumno"?<div className="stats"><Stat label="Material disponible" value={available?.count}/><Stat label="Materias inscritas" value={enrolled?.count}/><Stat label="Favoritos" value={favorites?.count}/><Stat label="Material compartido" value={uploadRows.data?.length??0}/></div>:<div className="stats"><Stat label="Grupos asignados" value={teacherGroups?.count}/><Stat label="Materiales aprobados" value={ownApproved}/><Stat label="En revisión" value={ownPending}/><Stat label="Descargas de tus aportes" value={(uploadRows.data??[]).reduce((total,item)=>total+Number(item.download_count??0),0)}/></div>}
        {!active && <section className="portal-focus-wrap" aria-label={`${roleLabel[role]} resumen rápido`}>
          <div className="portal-focus-header">
            <span className="eyebrow">Atención del día</span>
            <p>{focusSummary}</p>
          </div>
          <div className="portal-focus-panel">
            <div className="portal-focus-card">
              <span>Ritmo</span>
              <strong>{role === "alumno" ? `${enrolled?.count ?? 0} materias` : role === "docente" ? `${teacherGroups?.count ?? 0} grupos` : `${students?.count ?? 0} alumnos`}</strong>
              <small>{role === "alumno" ? "inscritas este periodo" : role === "docente" ? "asignados actualmente" : "registrados en la institución"}</small>
            </div>
            <div className="portal-focus-card">
              <span>Recursos</span>
              <strong>{role === "alumno" ? `${available?.count ?? 0}` : `${admin ? globalApproved?.count ?? 0 : ownApproved}`}</strong>
              <small>{role === "alumno" ? "materiales disponibles" : admin ? "aprobados y visibles" : "aprobados por tu comunidad"}</small>
            </div>
            <div className="portal-focus-card">
              <span>Acciones</span>
              <strong>{role === "alumno" ? `${favorites?.count ?? 0}` : role === "docente" ? `${ownPending}` : `${globalPending?.count ?? 0}`}</strong>
              <small>{role === "alumno" ? "guardados" : role === "docente" ? "pendientes de revisar" : "solicitudes por atender"}</small>
            </div>
          </div>
        </section>}
        {role!=="administrador"&&<RoleQuickActions role={role}/>}
        {role!=="administrador"&&<ScrollReveal className="scroll-reveal"><CampusPhotoStory role={role}/></ScrollReveal>}
        {admin&&<div className="stats stats-secondary"><Stat label="Materiales aprobados" value={globalApproved?.count}/><Stat label="Pendientes de revisión" value={globalPending?.count}/></div>}
        <ScrollReveal className="scroll-reveal"><ActivityDashboard role={role} entries={uploadRows.data??[]} approvedCount={admin?globalApproved?.count??0:ownApproved} pendingCount={admin?globalPending?.count??0:ownPending} availableCount={available?.count??0} favoriteCount={favorites?.count??0}/></ScrollReveal>
        <ScrollReveal className="scroll-reveal"><section className="panel announcements"><div className="table-head"><div><span className="eyebrow">Comunidad</span><h2>Avisos recientes</h2></div><Megaphone size={18}/></div>{posts.error||!posts.data?.length?<div className="empty">No hay avisos publicados.</div>:posts.data.map(post=><article className="notice" key={post.id}><strong>{post.title}</strong><p>{post.body}</p></article>)}</section></ScrollReveal>
      </>}
    </main></div></PageTransition>;
}
function Stat({label,value}:{label:string;value:number|string|undefined|null}){return <div className="stat"><span>{label}</span><strong>{value??"—"}</strong><small>Datos actuales</small></div>}
