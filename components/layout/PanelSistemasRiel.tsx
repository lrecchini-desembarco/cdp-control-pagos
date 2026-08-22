"use client";

// Riel de navegación de la consola del Panel de Sistemas — reemplaza a
// PanelSistemasTabs.tsx. Agrupado por trabajo (no es cosmético, es la
// reorganización que pide el handoff), con numerales correlativos y badges
// en vivo desde /api/panel-sistemas/resumen (no decoración: ver el mapeo de
// cada badge en README del handoff, línea "contadores en vivo, no decoración").
// Responsive: por debajo de 1100px pasa a barra horizontal scrollable.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

interface ItemRiel {
  n: string;
  href: string;
  label: string;
  badgeKey?: keyof Resumen | "pendientes";
}
interface GrupoRiel {
  titulo: string;
  items: ItemRiel[];
}
interface Resumen {
  ticketsAbiertos: number;
  esperandoUsuario: number;
  resueltosSemana: number;
  sinRol: number;
  altasPendientes: number;
  fuentesMock: number;
  ipsSinDocumentar: number;
  credencialesTotal: number;
}

const GRUPOS: GrupoRiel[] = [
  {
    titulo: "Guardia",
    items: [
      { n: "01", href: "/panel-sistemas", label: "Inicio", badgeKey: "pendientes" },
      { n: "02", href: "/panel-sistemas/tickets", label: "Tickets", badgeKey: "ticketsAbiertos" },
    ],
  },
  {
    titulo: "Gente y accesos",
    items: [
      { n: "03", href: "/panel-sistemas/usuarios", label: "Usuarios", badgeKey: "sinRol" },
      { n: "04", href: "/panel-sistemas/workspace", label: "Workspace" },
      { n: "05", href: "/panel-sistemas/credenciales", label: "Credenciales", badgeKey: "credencialesTotal" },
    ],
  },
  {
    titulo: "Infraestructura",
    items: [
      { n: "06", href: "/panel-sistemas/estado", label: "Salud", badgeKey: "fuentesMock" },
      { n: "07", href: "/panel-sistemas/ip-libres", label: "IPs libres" },
      { n: "08", href: "/panel-sistemas/inventario", label: "Inventario", badgeKey: "altasPendientes" },
    ],
  },
  {
    titulo: "Espejo operaciones",
    items: [
      { n: "09", href: "/panel-sistemas/mapeos", label: "Mapeos" },
      { n: "10", href: "/panel-sistemas/qa", label: "QA diario" },
    ],
  },
];

export default function PanelSistemasRiel() {
  const path = usePathname();
  const [resumen, setResumen] = useState<Resumen | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch("/api/panel-sistemas/resumen")
      .then((r) => r.json())
      .then((j) => {
        if (vivo && j.ok) setResumen(j);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  // "Inicio" no tiene una sola cifra propia — su badge es cuántas categorías
  // de pendientes tienen algo para atender hoy (0 a 5), el mismo concepto
  // que lista la pantalla de Guardia.
  const pendientesActivos = resumen
    ? [resumen.sinRol, resumen.altasPendientes, resumen.fuentesMock, resumen.esperandoUsuario, resumen.ipsSinDocumentar].filter((n) => n > 0)
        .length
    : undefined;

  function badgeDe(item: ItemRiel): number | undefined {
    if (item.badgeKey === "pendientes") return pendientesActivos;
    if (!resumen || !item.badgeKey) return undefined;
    return resumen[item.badgeKey];
  }

  return (
    <div
      className="flex w-full flex-row items-stretch gap-1 overflow-x-auto border-b border-ink/9 bg-sidebar px-2 py-2 min-[1100px]:w-[214px] min-[1100px]:flex-none min-[1100px]:flex-col min-[1100px]:gap-0.5 min-[1100px]:overflow-y-auto min-[1100px]:overflow-x-visible min-[1100px]:border-b-0 min-[1100px]:border-r min-[1100px]:px-0 min-[1100px]:py-4"
      aria-label="Secciones del Panel de Sistemas"
    >
      {GRUPOS.map((g) => (
        <div key={g.titulo} className="flex flex-row items-stretch gap-1 min-[1100px]:flex-col min-[1100px]:gap-0.5">
          <div className="hidden shrink-0 items-end px-2 pb-1 min-[1100px]:flex min-[1100px]:px-4 min-[1100px]:pb-1.5 min-[1100px]:pt-3.5">
            <span className="font-mono text-[9.5px] uppercase tracking-[.2em] text-ink/32">{g.titulo}</span>
          </div>
          {g.items.map((it) => {
            const activo = it.href === "/panel-sistemas" ? path === it.href : path.startsWith(it.href);
            const badge = badgeDe(it);
            return (
              <Link
                key={it.href}
                href={it.href}
                className={`grid shrink-0 grid-cols-[22px_1fr_auto] items-center gap-2 whitespace-nowrap border-l-2 px-3.5 py-2 font-display text-[13px] font-semibold transition-colors min-[1100px]:px-4 ${
                  activo
                    ? "border-action bg-action/[.09] text-[#d3ecee]"
                    : "border-transparent text-ink/72 hover:bg-ink/5 hover:text-white"
                }`}
              >
                <span className={`font-mono text-[9.5px] ${activo ? "text-action" : "text-ink/30"}`}>{it.n}</span>
                <span>{it.label}</span>
                {badge !== undefined && (
                  <span className={`tnum font-mono text-[10px] ${activo ? "text-action" : "text-ink/35"}`}>{badge}</span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
      <div className="mt-auto hidden border-t border-ink/9 px-4 pb-1 pt-4 min-[1100px]:block">
        <p className="m-0 text-[10.5px] leading-[1.5] text-ink/35">
          Mapeos y QA son espejo de Operaciones: mismo contenido, sin salir de la consola.
        </p>
      </div>
    </div>
  );
}
