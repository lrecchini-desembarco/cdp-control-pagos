"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useMobileNav } from "@/components/layout/MobileNav";
import { OjoPrivacidad } from "@/components/layout/Privacidad";
import TourGuiado from "@/components/layout/TourGuiado";

const LABELS: Record<string, string> = {
  "": "Resumen",
  alertas: "Alertas",
  cruce: "Cruce CDP vs ventas",
  raven: "Consultar Raven",
  mapeos: "Mapeos",
  catalogo: "Control de catálogo",
  resenas: "Reseñas",
  usuarios: "Usuarios",
  guia: "¿Qué puedo hacer?",
};

export default function Topbar({ email, rolLabel }: { email: string; rolLabel: string }) {
  const path = usePathname();
  const { setAbierto } = useMobileNav();
  const seg = path.split("/").filter(Boolean)[0] ?? "";
  const [status, setStatus] = useState<"checking" | "online" | "offline">("checking");

  async function salir() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/login";
  }

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
    <header className="flex h-14 items-center justify-between border-b border-line bg-surface px-4 sm:px-6">
      <nav aria-label="Ruta" className="flex items-center gap-2 text-sm">
        <button
          onClick={() => setAbierto(true)}
          className="-ml-1 grid h-8 w-8 shrink-0 place-items-center rounded-md text-lg text-muted hover:bg-ink/5 lg:hidden"
          aria-label="Abrir menú"
        >
          ☰
        </button>
        <span className="hidden text-faint sm:inline">DS Group</span>
        <span className="hidden text-faint sm:inline">/</span>
        <span className="font-medium text-ink">{LABELS[seg]}</span>
      </nav>
      <div className="flex items-center gap-3 text-2xs text-muted sm:gap-4">
        <TourGuiado />
        <span className="hidden items-center gap-1.5 sm:inline-flex">
          <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
          {txt}
        </span>
        <OjoPrivacidad />
        <span className="hidden h-4 w-px bg-line sm:inline-block" />
        <span className="hidden text-faint md:inline">
          {email} · <span className="font-medium text-muted">{rolLabel}</span>
        </span>
        <button onClick={salir} className="font-medium text-muted hover:text-ink">
          Salir
        </button>
      </div>
    </header>
  );
}
