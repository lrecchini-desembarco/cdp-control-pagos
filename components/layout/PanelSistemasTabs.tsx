"use client";

// Navegación interna del Panel de Sistemas: todo lo 100% de sistemas vive acá
// adentro (no en el sidebar general), en pestañas. Mapeos y QA diario NO están
// porque los usa también Operaciones — quedan donde siempre estuvieron.

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/panel-sistemas", label: "Inicio" },
  { href: "/panel-sistemas/usuarios", label: "Usuarios" },
  { href: "/panel-sistemas/credenciales", label: "Credenciales" },
  { href: "/panel-sistemas/estado", label: "Salud y endpoints" },
  { href: "/panel-sistemas/ip-libres", label: "IPs libres" },
  { href: "/panel-sistemas/inventario", label: "Inventario" },
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
