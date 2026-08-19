"use client";

// Navegación interna del Panel de Sistemas: lo 100% de sistemas vive SOLO
// acá (Usuarios, Credenciales, Salud, IPs libres, Inventario ya no están en
// el sidebar general). Mapeos y QA diario los sigue viendo Operaciones en su
// lugar de siempre (/mapeos, /qa) — acá son solo un acceso rápido con el
// mismo contenido, para no tener que salir del panel.

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/panel-sistemas", label: "Inicio" },
  { href: "/panel-sistemas/usuarios", label: "Usuarios" },
  { href: "/panel-sistemas/credenciales", label: "Credenciales" },
  { href: "/panel-sistemas/estado", label: "Salud y endpoints" },
  { href: "/panel-sistemas/ip-libres", label: "IPs libres" },
  { href: "/panel-sistemas/inventario", label: "Inventario" },
  { href: "/panel-sistemas/mapeos", label: "Mapeos" },
  { href: "/panel-sistemas/qa", label: "QA diario" },
];

export default function PanelSistemasTabs() {
  const path = usePathname();
  return (
    <nav className="flex flex-wrap gap-1.5" aria-label="Secciones del Panel de Sistemas">
      {TABS.map((t) => {
        const activo = t.href === "/panel-sistemas" ? path === t.href : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`rounded-full border px-3.5 py-1.5 text-2xs font-medium transition-colors ${
              activo ? "border-action bg-action/10 text-action" : "border-line bg-surface text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
