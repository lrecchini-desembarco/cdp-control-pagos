"use client";

import { useMemo, useState } from "react";
import organigrama from "@/lib/organigrama-seed.json";
import { Card, inputClass } from "@/components/ui/primitives";

const FIRMAS_URL =
  process.env.NEXT_PUBLIC_FIRMAS_URL ?? "https://lrecchini-desembarco.github.io/firmas-eldesembarco/";

interface Persona {
  area: string;
  nombre: string;
  apellido: string;
  cargo: string;
  mail: string;
}
const GENTE = organigrama as Persona[];

export default function FirmasView() {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Persona | null>(null);
  const [copiado, setCopiado] = useState("");

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return GENTE.slice(0, 8);
    return GENTE.filter(
      (p) =>
        `${p.nombre} ${p.apellido}`.toLowerCase().includes(t) ||
        p.cargo.toLowerCase().includes(t) ||
        p.area.toLowerCase().includes(t) ||
        p.mail.toLowerCase().includes(t)
    ).slice(0, 10);
  }, [q]);

  function copiar(label: string, valor: string) {
    navigator.clipboard?.writeText(valor).then(() => {
      setCopiado(label);
      setTimeout(() => setCopiado(""), 1500);
    });
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Firmas de empleados</h1>
          <p className="mt-0.5 text-sm text-muted">
            Elegí un empleado del organigrama, copiá sus datos y pegalos en el generador. Todo en un solo lugar.
          </p>
        </div>
        <a
          href={FIRMAS_URL}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-action/40 hover:text-action"
        >
          Abrir en pestaña nueva ↗
        </a>
      </div>

      {/* Directorio: buscar empleado y copiar sus datos */}
      <Card className="p-4">
        <label className="mb-1 block text-2xs font-medium uppercase tracking-wide text-faint">
          Buscar empleado ({GENTE.length} en el organigrama)
        </label>
        <input
          className={inputClass}
          placeholder="Nombre, cargo, área o mail…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(null);
          }}
        />
        {q.trim() && !sel && (
          <div className="mt-1 max-h-52 overflow-y-auto rounded-lg border border-line">
            {filtrados.length === 0 ? (
              <p className="px-3 py-2 text-sm text-faint">Sin resultados…</p>
            ) : (
              filtrados.map((p) => (
                <button
                  key={p.mail}
                  onClick={() => {
                    setSel(p);
                    setQ(`${p.nombre} ${p.apellido}`);
                  }}
                  className="block w-full border-b border-line px-3 py-2 text-left last:border-0 hover:bg-ink/5"
                >
                  <span className="text-sm text-ink">{p.nombre} {p.apellido}</span>
                  <span className="ml-2 text-2xs text-faint">{p.cargo} · {p.area}</span>
                </button>
              ))
            )}
          </div>
        )}

        {sel && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-paper p-3">
            <span className="text-2xs uppercase tracking-wide text-faint">Copiar:</span>
            <CopyBtn label="Nombre" valor={`${sel.nombre} ${sel.apellido}`} copiado={copiado} onCopy={copiar} />
            <CopyBtn label="Puesto" valor={sel.cargo} copiado={copiado} onCopy={copiar} />
            <CopyBtn label="Email" valor={sel.mail} copiado={copiado} onCopy={copiar} />
            <span className="ml-1 text-2xs text-faint">→ pegá en el generador de abajo</span>
          </div>
        )}
      </Card>

      <Card className="flex-1 overflow-hidden p-0">
        <iframe src={FIRMAS_URL} title="Generador de firmas" className="h-[72vh] w-full border-0" loading="lazy" />
      </Card>
    </div>
  );
}

function CopyBtn({
  label,
  valor,
  copiado,
  onCopy,
}: {
  label: string;
  valor: string;
  copiado: string;
  onCopy: (label: string, valor: string) => void;
}) {
  const ok = copiado === label;
  return (
    <button
      onClick={() => onCopy(label, valor)}
      title={valor}
      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
        ok ? "border-ok bg-ok/10 text-ok" : "border-line bg-surface text-ink hover:border-action/40 hover:text-action"
      }`}
    >
      {ok ? "✓ copiado" : label}
    </button>
  );
}
