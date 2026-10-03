import { createClient } from "@/lib/supabase/server";
import { AdvisoryWorkspace } from "@/components/advisory-workspace";
import type { AppRole } from "@/lib/roles";

export async function AdvisorySection({role,userId}:{role:AppRole;userId:string}){
  const supabase=await createClient();
  const query=supabase.from("advisory_sessions").select("id,title,description,starts_at,ends_at,capacity,status,subject_id,teacher_id").order("starts_at",{ascending:true}).limit(100);
  const [sessionsResult,subjectsResult,reservationsResult]=await Promise.all([
    role==="alumno"?query.eq("status","Disponible").gte("starts_at",new Date().toISOString()):query,
    supabase.from("subjects").select("id,name,code").eq("active",true).order("name"),
    role==="alumno"?supabase.from("advisory_reservations").select("session_id").eq("student_id",userId).eq("status","Reservada"):Promise.resolve({data:[],error:null}),
  ]);
  return <AdvisoryWorkspace sessions={sessionsResult.data??[]} subjects={subjectsResult.data??[]} reservedIds={(reservationsResult.data??[]).map(item=>item.session_id)} role={role}/>;
}
