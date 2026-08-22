"use client";

// Paleta de comandos (⌘K / Ctrl+K) de la consola. Alcance de esta primera
// etapa (el handoff deja las "acciones" para más adelante): navegar a
// cualquiera de las 10 secciones, y buscar tickets por título/solicitante —
// elegir uno navega a /panel-sistemas/tickets?q=<texto>, que TicketsView lee
// para precargar el buscador. No hay ruta de detalle de ticket hoy, así que
// esto es el "salto a la vista filtrada" real, sin inventar una ruta nueva.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Ticket } from "@/lib/tickets";

interface Seccion {
  label: string;
  href: string;
  hint: string;
}
const SECCIONES: Seccion[] = [
  { label: "Inicio", href: "/panel-sistemas", hint: "guardia" },
  { label: "Tickets", href: "/panel-sistemas/tickets", hint: "guardia" },
  { label: "Usuarios", href: "/panel-sistemas/usuarios", hint: "gente y accesos" },
  { label: "Google Workspace", href: "/panel-sistemas/workspace", hint: "gente y accesos" },
  { label: "Credenciales", href: "/panel-sistemas/credenciales", hint: "gente y accesos" },
  { label: "Salud y endpoints", href: "/panel-sistemas/estado", hint: "infraestructura" },
  { label: "IPs libres", href: "/panel-sistemas/ip-libres", hint: "infraestructura" },
  { label: "Inventario", href: "/panel-sistemas/inventario", hint: "infraestructura" },
  { label: "Mapeos", href: "/panel-sistemas/mapeos", hint: "espejo operaciones" },
  { label: "QA diario", href: "/panel-sistemas/qa", hint: "espejo operaciones" },
];

type Resultado = { tipo: "seccion"; label: string; hint: string; ir: () => void } | { tipo: "ticket"; label: string; hint: string; ir: () => void };

export default function PaletaComandos({ abierta, onCerrar }: { abierta: boolean; onCerrar: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [activo, setActivo] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const cerrar = useCallback(() => {
    onCerrar();
    setQ("");
    setActivo(0);
  }, [onCerrar]);

  useEffect(() => {
    if (abierta) {
      inputRef.current?.focus();
      if (!tickets) {
        fetch("/api/tickets")
          .then((r) => r.json())
          .then((j) => j.ok && setTickets(j.items))
          .catch(() => {});
      }
    }
  }, [abierta, tickets]);

  if (!abierta) return null;

  const t = q.trim().toLowerCase();
  const resultados: Resultado[] = [];
  for (const s of SECCIONES) {
    if (!t || s.label.toLowerCase().includes(t)) {
      resultados.push({ tipo: "seccion", label: s.label, hint: s.hint, ir: () => { router.push(s.href); cerrar(); } });
    }
  }
  if (t && tickets) {
    for (const tk of tickets) {
      if (`${tk.titulo} ${tk.solicitante}`.toLowerCase().includes(t)) {
        resultados.push({
          tipo: "ticket",
          label: `#${tk.nro} · ${tk.titulo}`,
          hint: "ticket",
          ir: () => { router.push(`/panel-sistemas/tickets?q=${encodeURIComponent(tk.titulo)}`); cerrar(); },
        });
      }
      if (resultados.length >= 20) break;
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActivo((a) => Math.min(a + 1, resultados.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActivo((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); resultados[activo]?.ir(); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cerrar(); }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-[#0a0908]/55" onClick={cerrar}>
      <div
        className="mx-auto mt-[120px] w-[560px] max-w-[90vw] overflow-hidden rounded-[6px] border border-action/40 bg-surface shadow-[0_24px_60px_rgba(0,0,0,.55)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-ink/10 px-4 py-3">
          <span className="text-ink/40">⌕</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setActivo(0); }}
            onKeyDown={onKeyDown}
            placeholder="Buscar sección o ticket…"
            className="flex-1 bg-transparent text-[13.5px] text-ink placeholder:text-ink/45 focus:outline-none"
          />
          <span className="font-mono text-[10px] text-ink/35">Esc</span>
        </div>
        <div className="max-h-[360px] overflow-y-auto py-1.5">
          {resultados.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12.5px] text-ink/40">Sin resultados.</p>
          ) : (
            resultados.map((r, i) => (
              <button
                key={`${r.tipo}-${r.label}-${i}`}
                onClick={r.ir}
                onMouseEnter={() => setActivo(i)}
                className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-[13px] text-ink/85 ${i === activo ? "bg-action/8" : ""}`}
              >
                <span className="truncate">{r.label}</span>
                <span className="shrink-0 font-mono text-[10px] text-ink/35">{r.hint}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
