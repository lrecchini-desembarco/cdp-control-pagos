"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Rol, NavItem } from "@/lib/roles";

const ORDEN_KEY = "cdp_nav_orden";

export default function Sidebar({ rol, items }: { rol: Rol; items: NavItem[] }) {
  const path = usePathname();
  const verAlertas = items.some((n) => n.href === "/alertas");

  // Orden personalizado (drag) guardado en localStorage. null = todavía no cargado
  // (así el primer render coincide con el SSR = orden del catálogo).
  const [orden, setOrden] = useState<string[] | null>(null);
  const dragHref = useRef<string | null>(null);

  useEffect(() => {
    try {
      const s = localStorage.getItem(ORDEN_KEY);
      if (s) setOrden(JSON.parse(s));
    } catch {}
  }, []);

  // Items visibles: aplica el orden guardado (los que existan) + agrega los nuevos al final.
  const visibles = useMemo(() => {
    if (!orden) return items;
    const byHref = new Map(items.map((i) => [i.href, i]));
    const primero = orden.map((h) => byHref.get(h)).filter(Boolean) as NavItem[];
    const resto = items.filter((i) => !orden.includes(i.href));
    return [...primero, ...resto];
  }, [items, orden]);

  function guardar(nuevo: string[]) {
    setOrden(nuevo);
    try {
      localStorage.setItem(ORDEN_KEY, JSON.stringify(nuevo));
    } catch {}
  }
  function soltar(sobreHref: string) {
    const from = dragHref.current;
    dragHref.current = null;
    if (!from || from === sobreHref) return;
    const hrefs = visibles.map((i) => i.href);
    const iFrom = hrefs.indexOf(from);
    const iTo = hrefs.indexOf(sobreHref);
    if (iFrom < 0 || iTo < 0) return;
    hrefs.splice(iTo, 0, hrefs.splice(iFrom, 1)[0]);
    guardar(hrefs);
  }
  function resetear() {
    setOrden(null);
    try {
      localStorage.removeItem(ORDEN_KEY);
    } catch {}
  }

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
        {visibles.map((n) => {
          const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              draggable
              onDragStart={() => (dragHref.current = n.href)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                soltar(n.href);
              }}
              aria-current={active ? "page" : undefined}
              className={`group mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                active ? "bg-white/10 text-white" : "text-sidebar-muted hover:bg-white/5 hover:text-white"
              }`}
              title="Arrastrá para reordenar"
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

      <div className="flex items-center justify-between border-t border-sidebar-line px-5 py-3 text-2xs text-sidebar-muted">
        <span>Acceso por rol · DS Group</span>
        {orden && (
          <button onClick={resetear} className="hover:text-white" title="Volver al orden original">
            ↺ orden
          </button>
        )}
      </div>
    </aside>
  );
}
