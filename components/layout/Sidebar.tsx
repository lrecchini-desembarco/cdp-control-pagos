"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { puedeVer } from "@/lib/roles";
import type { Rol } from "@/lib/roles";

const NAV = [
  { href: "/", label: "Resumen", icon: "◰" },
  { href: "/alertas", label: "Alertas", icon: "!" },
  { href: "/cruce", label: "Cruce CDP vs ventas", icon: "⇄" },
  { href: "/ventas", label: "Ventas por turno", icon: "▦" },
  { href: "/precios", label: "Precios", icon: "$" },
  { href: "/raven", label: "Consultar Raven", icon: "↧" },
  { href: "/mapeos", label: "Mapeos", icon: "⊞" },
  { href: "/catalogo", label: "Control de catálogo", icon: "▤" },
  { href: "/resenas", label: "Reseñas", icon: "★" },
  { href: "/usuarios", label: "Usuarios", icon: "◑" },
  { href: "/firmas", label: "Firmas", icon: "✎" },
  { href: "/guia", label: "¿Qué puedo hacer?", icon: "?" },
];

export default function Sidebar({ rol }: { rol: Rol }) {
  const path = usePathname();
  const items = NAV.filter((n) => puedeVer(rol, n.href));
  const verAlertas = items.some((n) => n.href === "/alertas");

  const [urgentes, setUrgentes] = useState(0);
  useEffect(() => {
    if (!verAlertas) return;
    let vivo = true;
    fetch("/api/alertas")
      .then((r) => r.json())
      .then((j) => {
        if (vivo && j.ok) setUrgentes((j.resumen?.critica ?? 0) + (j.resumen?.alta ?? 0));
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [path, verAlertas]);

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-sidebar-line bg-sidebar text-white">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 font-display text-sm font-bold">
          DS
        </div>
        <div className="leading-tight">
          <p className="font-display text-sm font-semibold">CDP · Control</p>
          <p className="text-2xs text-sidebar-muted">DS Group</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-2">
        {items.map((n) => {
          const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={`mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                active ? "bg-white/10 text-white" : "text-sidebar-muted hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="w-4 text-center text-base opacity-80">{n.icon}</span>
              {n.label}
              {n.href === "/alertas" && urgentes > 0 && (
                <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-bad px-1.5 text-2xs font-semibold text-white">
                  {urgentes}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-line px-5 py-4 text-2xs text-sidebar-muted">
        Acceso por rol · DS Group
      </div>
    </aside>
  );
}
