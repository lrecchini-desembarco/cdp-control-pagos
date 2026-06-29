"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const LABELS: Record<string, string> = {
  "": "Resumen",
  cruce: "Cruce CDP vs ventas",
  raven: "Consultar Raven",
  mapeos: "Mapeos",
};

export default function Topbar() {
  const path = usePathname();
  const seg = path.split("/").filter(Boolean)[0] ?? "";
  const [status, setStatus] = useState<"checking" | "online" | "offline">("checking");

  // Visibilidad del estado del sistema (Nielsen #1): ping real a Raven vía proxy
  useEffect(() => {
    let alive = true;
    fetch("/api/raven?code=050027&date=2026-06-25")
      .then((r) => alive && setStatus(r.ok ? "online" : "offline"))
      .catch(() => alive && setStatus("offline"));
    return () => {
      alive = false;
    };
  }, []);

  const dot =
    status === "online" ? "bg-ok" : status === "offline" ? "bg-bad" : "bg-warn";
  const txt =
    status === "online"
      ? "Raven conectado"
      : status === "offline"
      ? "Raven sin respuesta"
      : "Verificando Raven…";

  return (
    <header className="flex h-14 items-center justify-between border-b border-line bg-surface px-6">
      <nav aria-label="Ruta" className="flex items-center gap-2 text-sm">
        <span className="text-faint">DS Group</span>
        <span className="text-faint">/</span>
        <span className="font-medium text-ink">{LABELS[seg]}</span>
      </nav>
      <div className="flex items-center gap-4 text-2xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
          {txt}
        </span>
      </div>
    </header>
  );
}
