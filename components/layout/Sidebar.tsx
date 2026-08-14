"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { FRESH_META } from "@/lib/roles";
import { useMobileNav } from "@/components/layout/MobileNav";
import type { Rol, NavItem, Fresh } from "@/lib/roles";

// Secciones del menú que el usuario dejó abiertas (se recuerdan entre visitas).
const SECCIONES_KEY = "cdp:nav:secciones";

const norm = (s: string) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function Sidebar({ rol, items }: { rol: Rol; items: NavItem[] }) {
  const path = usePathname();
  const { abierto, setAbierto } = useMobileNav();
  const verAlertas = items.some((n) => n.href === "/alertas");

  // Buscador de ítems del menú: filtra por nombre, sección o descripción (sin acentos).
  const [q, setQ] = useState("");
  const visibles = q.trim()
    ? items.filter((n) => {
        const t = norm(q);
        return norm(n.label).includes(t) || norm(n.section ?? "").includes(t) || norm(n.desc ?? "").includes(t);
      })
    : items;

  // Ítems agrupados por sección, respetando el orden en que vienen.
  // Los que no tienen sección (Resumen, Alertas) van sueltos arriba, siempre visibles.
  const sueltos = visibles.filter((n) => !n.section);
  const grupos: { section: string; items: NavItem[] }[] = [];
  for (const n of visibles) {
    if (!n.section) continue;
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.section === n.section) ultimo.items.push(n);
    else grupos.push({ section: n.section, items: [n] });
  }

  // Sección donde está parado el usuario: se abre sí o sí.
  const seccionActiva = items.find((n) => (n.href === "/" ? path === "/" : path.startsWith(n.href)))?.section ?? null;

  // Secciones abiertas (se recuerdan entre visitas). Al buscar se abre todo.
  const [abiertas, setAbiertas] = useState<string[] | null>(null);
  useEffect(() => {
    try {
      const guardado = localStorage.getItem(SECCIONES_KEY);
      setAbiertas(guardado ? (JSON.parse(guardado) as string[]) : seccionActiva ? [seccionActiva] : []);
    } catch {
      setAbiertas(seccionActiva ? [seccionActiva] : []);
    }
    // Solo al montar: después manda el estado del usuario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSeccion = (s: string) => {
    setAbiertas((prev) => {
      const base = prev ?? [];
      const next = base.includes(s) ? base.filter((x) => x !== s) : [...base, s];
      try {
        localStorage.setItem(SECCIONES_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const buscando = q.trim().length > 0;
  const estaAbierta = (s: string) => buscando || s === seccionActiva || (abiertas ?? []).includes(s);

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
    <>
    {abierto && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setAbierto(false)} aria-hidden />}
    <aside data-rol={rol}
      className={`fixed inset-y-0 left-0 z-50 flex w-60 shrink-0 flex-col border-r border-sidebar-line bg-sidebar text-white transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0 ${abierto ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}>
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 font-display text-sm font-bold">
          DS
        </div>
        <div className="leading-tight">
          <p className="font-display text-sm font-semibold">CDP · Control</p>
          <p className="text-2xs text-sidebar-muted">DS Group</p>
        </div>
      </div>

      {/* Buscador de ítems del menú */}
      <div className="px-3 pb-2">
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-sidebar-muted">⌕</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar en el menú…"
            aria-label="Buscar ítems del menú"
            className="w-full rounded-lg border border-sidebar-line bg-white/5 py-1.5 pl-7 pr-2 text-sm text-white placeholder:text-sidebar-muted focus:border-white/30 focus:outline-none"
          />
        </div>
      </div>

      <nav data-tour="nav" className="flex-1 overflow-y-auto px-3 py-2">
        {visibles.length === 0 && (
          <p className="px-3 py-4 text-xs text-sidebar-muted">Sin resultados para “{q}”.</p>
        )}
        {sueltos.map((n) => (
          <ItemLink key={n.href} n={n} path={path} urgentes={urgentes} onNavegar={() => setAbierto(false)} />
        ))}

        {grupos.map((g) => {
          const open = estaAbierta(g.section);
          const id = `nav-sec-${norm(g.section).replace(/\W+/g, "-")}`;
          return (
            <div key={g.section} className="mt-3 first:mt-2">
              <button
                type="button"
                onClick={() => toggleSeccion(g.section)}
                aria-expanded={open}
                aria-controls={id}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted/70 transition-colors hover:bg-white/5 hover:text-white"
              >
                <span className={`shrink-0 text-[9px] transition-transform duration-150 ${open ? "rotate-90" : ""}`}>▶</span>
                <span className="flex-1 truncate text-left">{g.section}</span>
                {!open && <span className="shrink-0 tabular-nums opacity-60">{g.items.length}</span>}
              </button>
              {open && (
                <div id={id} className="mt-0.5">
                  {g.items.map((n) => (
                    <ItemLink key={n.href} n={n} path={path} urgentes={urgentes} onNavegar={() => setAbierto(false)} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Leyenda de los tags de frescura */}
      <div data-tour="fresh" className="border-t border-sidebar-line px-4 py-3 text-[10px] leading-tight text-sidebar-muted">
        <p className="mb-1.5 font-medium uppercase tracking-wider text-sidebar-muted/70">Origen del dato</p>
        <div className="space-y-1">
          <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ok/90" /> En vivo · tiempo real</div>
          <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 shrink-0 rounded-full border border-sidebar-muted/60" /> Se carga a mano</div>
          <div className="flex items-center gap-2"><span className="shrink-0 rounded bg-warn/25 px-1 text-[9px] font-semibold uppercase text-warn">revisar</span> Frescura a confirmar</div>
        </div>
      </div>
    </aside>
    </>
  );
}

// Un ítem del menú (link + tags de beta, frescura y alertas urgentes).
function ItemLink({
  n,
  path,
  urgentes,
  onNavegar,
}: {
  n: NavItem;
  path: string;
  urgentes: number;
  onNavegar: () => void;
}) {
  const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
  return (
    <Link
      href={n.href}
      draggable={false}
      onClick={onNavegar}
      title={n.desc}
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
