"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, UserRound } from "lucide-react";
import { signOut } from "@/app/auth/actions";

export function ProfileMenu({ name, role, href }: { name: string; role: string; href: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function outside(event: MouseEvent) { if (!root.current?.contains(event.target as Node)) setOpen(false); }
    function escape(event: KeyboardEvent) { if (event.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", escape); };
  }, []);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  return <div className="profile-menu-root" ref={root}>
    <button type="button" className="profile-menu-trigger" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)}><span className="profile-menu-avatar">{initials || <UserRound size={16}/>}</span><span className="profile-menu-name">{name}</span><ChevronDown size={14}/></button>
    {open && <div className="profile-menu-popover" role="menu"><div className="profile-menu-meta"><strong>{name}</strong><small>{role}</small></div><Link role="menuitem" href={href} onClick={() => setOpen(false)}><UserRound size={15}/>Mi perfil</Link><form action={signOut}><button role="menuitem" type="submit"><LogOut size={15}/>Cerrar sesión</button></form></div>}
  </div>;
}
