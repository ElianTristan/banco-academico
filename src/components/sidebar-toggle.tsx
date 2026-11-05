"use client";

import { useEffect, useState } from "react";
import { Menu, PanelLeftClose } from "lucide-react";

const STORAGE_KEY = "banco-academico-sidebar-collapsed";

export function SidebarToggle() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY) === "true";
    setCollapsed(saved);
    const shell = document.querySelector(".app-shell");
    shell?.classList.toggle("sidebar-collapsed", saved);
    if (saved || window.matchMedia("(max-width: 900px)").matches) {
      document.querySelectorAll<HTMLDetailsElement>(".sidebar .nav-group").forEach(group => { group.open = true; });
    }
    if (!shell) return;
    const observer = new MutationObserver(() => {
      setCollapsed(shell.classList.contains("sidebar-collapsed"));
      setMobileOpen(shell.classList.contains("sidebar-mobile-open"));
    });
    observer.observe(shell, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  function toggle() {
    const shell = document.querySelector(".app-shell");
    const mobile = window.matchMedia("(max-width: 900px)").matches;
    if (mobile) {
      const next = !shell?.classList.contains("sidebar-mobile-open");
      setMobileOpen(next);
      shell?.classList.toggle("sidebar-mobile-open", next);
      return;
    }
    const next = !shell?.classList.contains("sidebar-collapsed");
    setCollapsed(next);
    window.localStorage.setItem(STORAGE_KEY, String(next));
    shell?.classList.toggle("sidebar-collapsed", next);
    document.querySelectorAll<HTMLDetailsElement>(".sidebar .nav-group").forEach(group => { group.open = true; });
  }
  return <button className="sidebar-toggle" type="button" onClick={toggle} aria-label={mobileOpen ? "Cerrar menú" : collapsed ? "Expandir menú" : "Colapsar menú"} aria-expanded={mobileOpen || !collapsed}>
    {mobileOpen || !collapsed ? <PanelLeftClose size={18}/> : <Menu size={18}/>}<span>{mobileOpen ? "Cerrar" : collapsed ? "Expandir menú" : "Contraer menú"}</span>
  </button>;
}
