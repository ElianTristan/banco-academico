import Link from "next/link";
import { BookOpen, Facebook, Globe2, Headset, Instagram, Mail, Download } from "lucide-react";
import { appInfo } from "@/lib/app-info";

export function InstitutionalFooter({ variant = "system" }: { variant?: "system" | "auth" }) {
  const mailto = appInfo.supportEmail
    ? `mailto:${appInfo.supportEmail}?subject=${encodeURIComponent(`${appInfo.name} | Solicitud de soporte`)}`
    : null;
  const helpdeskHref = appInfo.supportPhone ? `tel:${appInfo.supportPhone.replace(/[^\d+]/g, "")}` : appInfo.helpdeskUrl;

  return (
    <footer className={`institutional-footer institutional-footer-${variant}`}>
      <div className="institutional-footer-brand">
        <strong>{appInfo.name}</strong>
        <span>{appInfo.institution} · v{appInfo.version}</span>
        <small>{appInfo.teamName}</small>
      </div>
      <nav className="institutional-footer-actions" aria-label="Ayuda y enlaces institucionales">
        {mailto && <a href={mailto} aria-label={`Escribir a soporte ${appInfo.supportEmail}`}><Mail size={16} aria-hidden="true"/><span>{appInfo.supportEmail}</span></a>}
        {helpdeskHref && <a href={helpdeskHref} target={helpdeskHref.startsWith("https://") ? "_blank" : undefined} rel={helpdeskHref.startsWith("https://") ? "noopener noreferrer" : undefined} aria-label={appInfo.supportPhone ? `Llamar a mesa de ayuda ${appInfo.supportPhone}` : "Abrir directorio institucional del ITSLP"}><Headset size={16} aria-hidden="true"/><span>{appInfo.supportPhone ? `Llamar ${appInfo.supportPhone}` : "Directorio ITSLP"}</span></a>}
        <Link href={appInfo.manualPagePath} aria-label="Abrir manual de usuario"><BookOpen size={16} aria-hidden="true"/><span>Manual</span></Link>
        <a href={appInfo.manualPdfPath} download aria-label="Descargar manual de usuario en PDF"><Download size={16} aria-hidden="true"/><span>Descargar PDF</span></a>
        <a href={appInfo.websiteUrl} target="_blank" rel="noopener noreferrer" aria-label="Abrir sitio oficial del Instituto Tecnológico de San Luis Potosí"><Globe2 size={16} aria-hidden="true"/><span>Sitio oficial</span></a>
        {appInfo.facebookUrl && <a href={appInfo.facebookUrl} target="_blank" rel="noopener noreferrer" aria-label="Abrir Facebook institucional"><Facebook size={16} aria-hidden="true"/><span>Facebook</span></a>}
        {appInfo.instagramUrl && <a href={appInfo.instagramUrl} target="_blank" rel="noopener noreferrer" aria-label="Abrir Instagram institucional"><Instagram size={16} aria-hidden="true"/><span>Instagram</span></a>}
      </nav>
      <small className="institutional-footer-updated">Interfaz actualizada: {appInfo.interfaceUpdatedAt}</small>
    </footer>
  );
}
