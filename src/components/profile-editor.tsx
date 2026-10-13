"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Camera, Moon, Sun } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { saveProfile } from "@/app/academic/actions";

const specialties = [
  "Ciberseguridad",
  "Gestión de Servicios de TI",
] as const;

type EnrolledSubject = { id: string; code: string; name: string; specialty: string | null };
type Props = {
  userId: string; firstName: string; lastName: string; email: string;
  theme: "light" | "dark"; avatarUrl: string | null; avatarPath: string | null;
  student: { semester: number | null; specialty: string } | null;
  enrolledSubjects: EnrolledSubject[];
  subjectsError: string | null;
  academicError: string | null;
};

export function ProfileEditor(props: Props) {
  const [theme, setTheme] = useState(props.theme);
  const [avatarPath, setAvatarPath] = useState(props.avatarPath ?? "");
  const [specialty, setSpecialty] = useState(props.student?.specialty ?? "");
  const [preview, setPreview] = useState<string | null>(props.avatarUrl);
  const [message, setMessage] = useState("");
  const [busy, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const initials = `${props.firstName.trim().charAt(0)}${props.lastName.trim().charAt(0)}`.toLocaleUpperCase() || "BA";

  async function uploadPhoto(file?: File) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024) {
      setMessage("Elige una imagen JPG, PNG o WebP de máximo 5 MB."); return;
    }
    setMessage("Subiendo fotografía…");
    const ext = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
    const path = `${props.userId}/${crypto.randomUUID()}.${ext}`;
    const supabase = createClient();
    const { error } = await supabase.storage.from("profile-photos").upload(path, file, { contentType: file.type, upsert: false });
    if (error) { setMessage("No se pudo subir la foto. Comprueba que ya aplicaste la migración 0003."); return; }
    const { data } = await supabase.storage.from("profile-photos").createSignedUrl(path, 3600);
    setAvatarPath(path); setPreview(data?.signedUrl ?? URL.createObjectURL(file)); setMessage("Fotografía lista. Guarda los cambios del perfil.");
  }

  function changeTheme(value: "light" | "dark") {
    setTheme(value);
    document.querySelector<HTMLElement>(".app-shell")?.setAttribute("data-theme", value);
  }

  function changeSpecialty(value: string) {
    const incompatible = props.enrolledSubjects.filter(subject => subject.specialty && subject.specialty !== value);
    if (value && incompatible.length) {
      const names = incompatible.map(subject => subject.name).join(", ");
      const accepted = window.confirm(
        `Tienes materias inscritas fuera de la especialidad seleccionada: ${names}. ` +
        "Cambiar tu especialidad no modificará ni cancelará esas inscripciones. ¿Quieres continuar?",
      );
      if (!accepted) return;
    }
    setSpecialty(value);
  }

  function submit(formData: FormData) {
    formData.set("theme", theme);
    formData.set("avatarPath", avatarPath || "");
    setMessage("");
    startTransition(async () => {
      const result = await saveProfile(formData);
      if (!result.ok) { setMessage(result.error); return; }
      setMessage("Perfil actualizado correctamente.");
      router.refresh();
    });
  }

  return <section className="panel profile-editor mx-auto w-full max-w-5xl overflow-hidden p-0">
    <div className="profile-cover flex items-center gap-5 px-5 py-7 sm:px-10 sm:py-9">
      <div className="profile-photo-wrap">
        {preview ? <Image className="profile-photo" src={preview} width={82} height={82} unoptimized alt="Foto de perfil"/> : <span className="profile-photo profile-photo-initials" aria-label={`Avatar de ${props.firstName} ${props.lastName}`}>{initials}</span>}
        <button className="photo-button" type="button" onClick={() => fileInput.current?.click()} aria-label="Cambiar fotografía"><Camera size={16}/></button>
        <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event => uploadPhoto(event.target.files?.[0])}/>
      </div>
      <div><p className="eyebrow">Tu cuenta académica</p><h2>{props.firstName || "Completa tu perfil"} {props.lastName}</h2><p className="muted">{props.email}</p></div>
    </div>
    <form action={submit} className="profile-form px-5 py-7 sm:px-10 sm:py-9">
      <div className="table-head"><div><h2>Información personal</h2><p className="muted">Mantén tus datos actualizados para personalizar tu experiencia.</p></div></div>
      <div className="form-grid">
        <label className="field"><span>Nombre(s)</span><input name="firstName" required maxLength={80} defaultValue={props.firstName}/></label>
        <label className="field"><span>Apellidos</span><input name="lastName" required maxLength={100} defaultValue={props.lastName}/></label>
        {props.student && <>
          <label className="field"><span>Carrera</span><input value="Ingeniería en Sistemas" readOnly aria-readonly="true"/><small className="field-help">Carrera institucional fija del programa.</small></label>
          <label className="field"><span>Semestre</span><select name="semester" defaultValue={props.student.semester ?? ""} required>
            <option value="" disabled>Selecciona un semestre</option>
            {props.student.semester !== null && (props.student.semester < 1 || props.student.semester > 13) && <option value={props.student.semester} disabled>Valor previo inválido: {props.student.semester}</option>}
            {Array.from({length: 13}, (_,i) => i+1).map(semester => <option key={semester} value={semester}>{semester}° semestre</option>)}
          </select></label>
          <label className="field fullcol"><span>Especialidad</span><select name="specialty" value={specialty} onChange={event => changeSpecialty(event.target.value)}>
            <option value="">Sin seleccionar</option>
            {specialty && !specialties.some(option => option === specialty) && <option value={specialty} disabled>Valor previo no válido</option>}
            {specialties.map(option => <option key={option} value={option}>{option}</option>)}
          </select><small className="field-help">Solo puedes elegir una de las especialidades autorizadas. Tus inscripciones no se cancelan al cambiarla.</small></label>
          <section className="profile-subjects fullcol" aria-labelledby="profile-subjects-title">
            <div><h3 id="profile-subjects-title">Materias inscritas</h3><p className="muted">Consulta tu carga vigente. Las inscripciones las administra la institución.</p></div>
            {props.academicError ? <p className="form-error" role="alert">{props.academicError}</p> : props.subjectsError ? <p className="form-error" role="alert">{props.subjectsError}</p> : props.enrolledSubjects.length ? <ul>
              {props.enrolledSubjects.map(subject => <li key={subject.id}><span>{subject.name}</span><small>{subject.code}{subject.specialty ? ` · ${subject.specialty}` : ""}</small></li>)}
            </ul> : <p className="empty">No tienes materias inscritas en este periodo.</p>}
          </section>
        </>}
      </div>
      <div className="theme-row"><div><strong>Apariencia</strong><p className="muted">Elige cómo quieres ver el Banco Académico.</p></div><div className="theme-picker" role="group" aria-label="Tema visual">
        <button type="button" aria-pressed={theme === "light"} className={theme === "light" ? "selected" : ""} onClick={() => changeTheme("light")}><Sun size={16}/> Claro</button>
        <button type="button" aria-pressed={theme === "dark"} className={theme === "dark" ? "selected" : ""} onClick={() => changeTheme("dark")}><Moon size={16}/> Oscuro</button>
      </div></div>
      {message && <p className={message.includes("correctamente") ? "form-success" : "form-hint muted"} role="status">{message}</p>}
      <button className="button" disabled={busy}>{busy ? "Guardando…" : "Guardar cambios"}</button>
    </form>
  </section>;
}
