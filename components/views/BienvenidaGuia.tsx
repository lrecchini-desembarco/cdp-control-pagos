"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FRESH_META, type Fresh, type NavItem } from "@/lib/roles";

// Cartel de bienvenida + guía de herramientas en el Resumen. Muestra SOLO lo que el
// usuario puede ver, agrupado por sección, con qué hace cada una y su tag de frescura
// (en vivo / se carga / revisar). Colapsable y recordado por navegador.

function FreshChip({ fresh }: { fresh: Fresh }) {
  const m = FRESH_META[fresh];
  const cls =
    fresh === "vivo" ? "bg-ok/10 text-ok" : fresh === "revisar" ? "bg-warn/20 text-warn" : "bg-ink/5 text-muted";
  return (
    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${cls}`} title={m.desc}>
      {m.label}
    </span>
  );
}

export default function BienvenidaGuia({ items, nombre }: { items: NavItem[]; nombre?: string }) {
  const [abierto, setAbierto] = useState(true);
  useEffect(() => {
    try { if (localStorage.getItem("cdp-guia-oculta") === "1") setAbierto(false); } catch {}
  }, []);
  function toggle() {
    setAbierto((a) => {
      const nuevo = !a;
      try { localStorage.setItem("cdp-guia-oculta", nuevo ? "0" : "1"); } catch {}
      return nuevo;
    });
  }

  // Agrupar por sección, respetando el orden del catálogo (los sin sección van arriba).
  const grupos: { section: string; items: NavItem[] }[] = [];
  for (const it of items) {
    const sec = it.section ?? "Tablero";
    const last = grupos[grupos.length - 1];
    if (last && last.section === sec) last.items.push(it);
    else grupos.push({ section: sec, items: [it] });
  }

  return (
    <section className="overflow-hidden rounded-card border border-action/25 bg-action/[0.04]">
      <button
        onClick={toggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
        aria-expanded={abierto}
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-action/15 text-base">👋</span>
        <div className="flex-1">
          <p className="font-display text-sm font-semibold text-ink">
            {nombre ? `Hola, ${nombre}. ` : ""}Bienvenido/a a CDP · Control
          </p>
          <p className="text-2xs text-muted">
            Estas son tus herramientas y qué hace cada una. {abierto ? "Tocá para ocultar." : "Tocá para ver la guía."}
          </p>
        </div>
        <span className="shrink-0 text-muted transition-transform" style={{ transform: abierto ? "rotate(180deg)" : "none" }}>▾</span>
      </button>

      {abierto && (
        <div className="space-y-4 border-t border-action/20 px-4 py-4">
          {/* Leyenda: qué significa cada tag */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-2xs text-muted">
            <span className="font-medium uppercase tracking-wide text-faint">Origen del dato:</span>
            <span className="flex items-center gap-1.5"><FreshChip fresh="vivo" /> tiempo real (Tango/Raven), se actualiza solo</span>
            <span className="flex items-center gap-1.5"><FreshChip fresh="carga" /> lo carga/edita el equipo</span>
            <span className="flex items-center gap-1.5"><FreshChip fresh="revisar" /> una foto o dato a confirmar</span>
          </div>

          {grupos.map((g) => (
            <div key={g.section}>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-faint">{g.section}</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map((it) => (
                  <Link
                    key={it.href}
                    href={it.href}
                    className="group flex gap-3 rounded-lg border border-line bg-surface p-2.5 transition-colors hover:border-action/40"
                  >
                    <span className="mt-0.5 w-4 shrink-0 text-center text-base text-muted">{it.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-semibold text-ink group-hover:text-action">{it.label}</span>
                        <FreshChip fresh={it.fresh ?? "carga"} />
                      </div>
                      {it.desc && <p className="mt-0.5 text-2xs leading-snug text-muted">{it.desc}</p>}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}

          <p className="border-t border-action/15 pt-3 text-2xs text-faint">
            El tablero <b>lee</b> Tango y Raven (no los modifica). ¿Dudas de qué podés hacer? Entrá a{" "}
            <Link href="/guia" className="font-medium text-action hover:underline">¿Qué puedo hacer?</Link> para el paso a paso.
          </p>
        </div>
      )}
    </section>
  );
}
