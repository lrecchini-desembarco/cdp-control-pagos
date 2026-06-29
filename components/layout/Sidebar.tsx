"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Resumen", icon: "◰" },
  { href: "/cruce", label: "Cruce CDP vs ventas", icon: "⇄" },
  { href: "/raven", label: "Consultar Raven", icon: "↧" },
  { href: "/mapeos", label: "Mapeos", icon: "⊞" },
];

export default function Sidebar() {
  const path = usePathname();
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
