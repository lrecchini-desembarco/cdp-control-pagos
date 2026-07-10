"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { FRESH_META } from "@/lib/roles";
import type { Rol, NavItem, Fresh } from "@/lib/roles";

export default function Sidebar({ rol, items }: { rol: Rol; items: NavItem[] }) {
  const path = usePathname();
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
    <aside data-rol={rol} className="flex w-60 shrink-0 flex-col border-r border-sidebar-line bg-sidebar text-white">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 font-display text-sm font-bold">
          DS
        </div>
        <div className="leading-tight">
          <p className="font-display text-sm font-semibold">CDP · Control</p>
          <p className="text-2xs text-sidebar-muted">DS Group</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-2">
        {items.map((n, i) => {
          const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
          // Encabezado de sección: se muestra cuando la sección cambia respecto al ítem anterior.
          const header = n.section && n.section !== items[i - 1]?.section ? n.section : null;
          return (
            <div key={n.href}>
              {header && (
                <p className="mb-1 mt-3 px-3 text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted/70">
                  {header}
                </p>
              )}
              <Link
                href={n.href}
                draggable={false}
                aria-current={active ? "page" : undefined}
                className={`group mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active ? "bg-white/10 text-white" : "text-sidebar-muted hover:bg-white/5 hover:text-white"
                }`}
              >
                <span className="w-4 text-center text-base opacity-80">{n.icon}</span>
                <span className="flex-1 truncate">{n.label}</span>
                {n.beta && (
                  <span className="shrink-0 rounded bg-warn/25 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-warn" title="En construcción (beta)">
                    beta
                  </span>
                )}
                <FreshTag fresh={n.fresh ?? "carga"} />
                {n.href === "/alertas" && urgentes > 0 && (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-bad px-1.5 text-2xs font-semibold text-white">
                    {urgentes}
                  </span>
                )}
              </Link>
            </div>
          );
        })}
      </nav>

      {/* Leyenda de los tags de frescura */}
      <div className="border-t border-sidebar-line px-4 py-3 text-[10px] leading-tight text-sidebar-muted">
        <p className="mb-1.5 font-medium uppercase tracking-wider text-sidebar-muted/70">Origen del dato</p>
        <div className="space-y-1">
          <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ok/90" /> En vivo · tiempo real</div>
          <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 shrink-0 rounded-full border border-sidebar-muted/60" /> Se carga a mano</div>
          <div className="flex items-center gap-2"><span className="shrink-0 rounded bg-warn/25 px-1 text-[9px] font-semibold uppercase text-warn">revisar</span> Frescura a confirmar</div>
        </div>
      </div>
    </aside>
  );
}

// Tag de frescura del dato de una pantalla (ver FRESH_META en lib/roles).
function FreshTag({ fresh }: { fresh: Fresh }) {
  const meta = FRESH_META[fresh];
  const title = `${meta.label} — ${meta.desc}`;
  if (fresh === "revisar") {
    return (
      <span className="shrink-0 rounded bg-warn/25 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-warn" title={title}>
        revisar
      </span>
    );
  }
  return (
    <span
      title={title}
      aria-label={meta.label}
      className={`h-1.5 w-1.5 shrink-0 rounded-full ${fresh === "vivo" ? "bg-ok/90 animate-pulse" : "border border-sidebar-muted/60"}`}
    />
  );
}
