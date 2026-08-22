"use client";

// Chrome propio del Panel de Sistemas como consola aparte: barra de título +
// riel de navegación + área de contenido + paleta de comandos. Vive del lado
// cliente porque maneja atajos de teclado (⌘K/Ctrl+K, Esc) y el "← Volver al
// CDP" (lee la última ruta del CDP guardada en sessionStorage por el botón
// del Topbar). El gate de acceso sigue en app/panel-sistemas/layout.tsx
// (server), que es quien monta este componente.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PanelSistemasRiel from "@/components/layout/PanelSistemasRiel";
import PaletaComandos from "@/components/layout/PaletaComandos";

export default function ConsolaShell({ email, children }: { email: string; children: React.ReactNode }) {
  const router = useRouter();
  const [paletaAbierta, setPaletaAbierta] = useState(false);
  const [bridge, setBridge] = useState<"checking" | "online" | "offline">("checking");

  useEffect(() => {
    let vivo = true;
    fetch("/api/raven?code=050027&date=2026-06-25")
      .then((r) => vivo && setBridge(r.ok ? "online" : "offline"))
      .catch(() => vivo && setBridge("offline"));
    return () => {
      vivo = false;
    };
  }, []);

  const volverAlCdp = useCallback(() => {
    let ruta = "/";
    try {
      ruta = sessionStorage.getItem("cdp:ultima-ruta") || "/";
    } catch {}
    router.push(ruta);
  }, [router]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletaAbierta((v) => !v);
      } else if (e.key === "Escape" && !paletaAbierta) {
        volverAlCdp();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletaAbierta, volverAlCdp]);

  const dot = bridge === "online" ? "bg-ok" : bridge === "offline" ? "bg-bad" : "bg-warn";
  const txt = bridge === "online" ? "bridge Tango en línea" : bridge === "offline" ? "bridge Tango sin respuesta" : "verificando bridge…";

  return (
    <div className="flex h-screen flex-col bg-paper text-ink">
      <div className="flex h-12 flex-none items-center justify-between gap-4 border-b border-action/[.28] bg-sidebar px-[18px]">
        <div className="flex items-center gap-3.5">
          <span className="text-[13px] text-action" aria-hidden>◈</span>
          <span className="font-mono text-[10.5px] uppercase tracking-[.18em] text-action">Panel de sistemas</span>
          <span className="h-4 w-px bg-ink/16" />
          <span className="text-xs text-ink/50">Consola de guardia · DS Group</span>
        </div>
        <div className="flex items-center gap-3.5 text-[11.5px] text-ink/55">
          <button
            onClick={() => setPaletaAbierta(true)}
            className="flex items-center gap-2 rounded border border-ink/18 px-2.5 py-[5px] text-ink/60 transition-colors hover:border-action/60 hover:text-action"
          >
            Buscar o ejecutar <span className="font-mono text-[10px] opacity-75">⌘K</span>
          </button>
          <span className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
            {txt}
          </span>
          <span className="h-4 w-px bg-ink/16" />
          <span className="font-mono text-[10.5px] text-ink/42">{email.split("@")[0]}</span>
          <button onClick={volverAlCdp} className="text-[11.5px] text-action hover:underline">
            ← Volver al CDP
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col min-[1100px]:flex-row">
        <PanelSistemasRiel />
        <main className="flex-1 overflow-auto bg-paper px-[22px] py-[22px] min-[1100px]:px-[26px]">{children}</main>
      </div>

      <PaletaComandos abierta={paletaAbierta} onCerrar={() => setPaletaAbierta(false)} />
    </div>
  );
}
