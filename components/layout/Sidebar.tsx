"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { resumenAlertas } from "@/lib/alertas";

const NAV = [
  { href: "/", label: "Resumen", icon: "◰" },
  { href: "/alertas", label: "Alertas", icon: "!" },
  { href: "/cruce", label: "Cruce CDP vs ventas", icon: "⇄" },
  { href: "/raven", label: "Consultar Raven", icon: "↧" },
  { href: "/mapeos", label: "Mapeos", icon: "⊞" },
];

export default function Sidebar() {
  const path = usePathname();
  // Contador de alertas urgentes (críticas + altas) para el badge de navegación.
  const urgentes = useMemo(() => {
    const r = resumenAlertas();
    return r.critica + r.alta;
  }, []);
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
        {NAV.map((n) => {
          const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={`mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-white/10 text-white"
                  : "text-sidebar-muted hover:bg-white/5 hover:text-white"
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
        Sin autenticación · entorno de desarrollo
      </div>
    </aside>
  );
}
