"use client";

import { usePathname } from "next/navigation";
import { NAV_CATALOG } from "@/lib/roles";

// Banner que avisa cuando la sección actual está en construcción (beta). Se muestra
// arriba del contenido para que quede evidente al entrar. La marca "beta" vive en
// NAV_CATALOG (lib/roles.ts), misma fuente que el chip del menú lateral.
export default function EstadoSeccion() {
  const path = usePathname();
  const ruta = path === "/" ? "/" : "/" + (path.split("/").filter(Boolean)[0] ?? "");
  const item = NAV_CATALOG.find((i) => i.href === ruta);
  if (!item?.beta) return null;
  return (
    <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5">
      <span className="mt-px shrink-0 rounded bg-warn/25 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-warn">
        beta
      </span>
      <p className="text-xs text-ink">
        <b>Sección en construcción.</b> Los datos todavía pueden no ser definitivos — no la uses aún para
        tomar decisiones. Se habilita completa cuando lleguen los datos que faltan (Raven / recetas / Sistemas).
      </p>
    </div>
  );
}
