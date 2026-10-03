import { createClient } from "@/lib/supabase/server";
import { MaterialWorkspace } from "@/components/material-workspace";
import type { AppRole } from "@/lib/roles";

export async function MaterialSection({role,userId,favoritesOnly=false,mineOnly=false}:{role:AppRole;userId:string;favoritesOnly?:boolean;mineOnly?:boolean}){
  const supabase=await createClient();
  const selected=supabase.from("materials").select("id,title,description,material_type,status,semester,unit,storage_path,download_count,created_at,created_by,review_note,subject_id");
  const materialRequest=favoritesOnly?selected.limit(0):mineOnly
    ?selected.eq("created_by",userId).order("created_at",{ascending:false}).limit(100)
    :selected.order("created_at",{ascending:false}).limit(100);
  const [materialsResult,subjectsResult,favoritesResult]=await Promise.all([
    materialRequest,
    supabase.from("subjects").select("id,name,code").eq("active",true).order("name"),
    role==="alumno"?supabase.from("material_favorites").select("material_id").eq("student_id",userId):Promise.resolve({data:[],error:null}),
  ]);
  const favoriteIds=(favoritesResult.data??[]).map(row=>row.material_id);
  let items=materialsResult.data??[];
  if(favoritesOnly&&favoriteIds.length){const {data}=await supabase.from("materials").select("id,title,description,material_type,status,semester,unit,storage_path,download_count,created_at,created_by,review_note,subject_id").in("id",favoriteIds).order("created_at",{ascending:false});items=data??[];}
  return <MaterialWorkspace items={items} subjects={subjectsResult.data??[]} favoriteIds={favoriteIds} userId={userId} role={role} favoritesOnly={favoritesOnly} mineOnly={mineOnly}/>;
}
