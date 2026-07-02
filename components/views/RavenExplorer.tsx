"use client";

import { useEffect, useRef, useState } from "react";
import type { RavenItem } from "@/lib/types";
import { fmtInt } from "@/lib/brands";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Skeleton,
  inputClass,
} from "@/components/ui/primitives";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; msg: string }
  | { kind: "ok"; data: RavenItem };

// Insumos que HOY responden en Raven (provisorio). El resto da 404 porque todavía
// no están cargados con nuestro código; se actualiza cuando Raven confirme los códigos.
const RAVEN_OK = [{ code: "050027", name: "Bolas Blend 100g" }];
const RAVEN_PENDIENTE = [
  { code: "040022", name: "Medallón Tuki 80g" },
  { code: "080002", name: "Panceta feteada" },
  { code: "150001", name: "Milanesa de carne" },
  { code: "060015", name: "Pan brioche" },
];

export default function RavenExplorer() {
  const [code, setCode] = useState("050027");
  const [date, setDate] = useState("2026-06-25");
  const [state, setState] = useState<State>({ kind: "idle" });
  const codeRef = useRef(code);
  const dateRef = useRef(date);
  codeRef.current = code;
  dateRef.current = date;

  function usar(c: string) {
    setCode(c);
    codeRef.current = c;
    consultar();
  }

  async function consultar() {
    setState({ kind: "loading" });
    try {
      const r = await fetch(
        `/api/raven?code=${encodeURIComponent(codeRef.current)}&date=${encodeURIComponent(dateRef.current)}`
      );
      const j = await r.json();
      if (!r.ok) {
        setState({ kind: "error", msg: j.error ?? "Error desconocido." });
        return;
      }
      setState({ kind: "ok", data: j as RavenItem });
    } catch {
      setState({ kind: "error", msg: "Fallo de red. Reintentá." });
    }
  }

  // Deep-link desde el detalle del cruce: /raven?code=&date= precarga y consulta
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const c = sp.get("code");
    const d = sp.get("date");
    if (c) {
      setCode(c);
      codeRef.current = c;
    }
    if (d) {
      setDate(d);
      dateRef.current = d;
    }
    if (c && d) consultar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const max =
    state.kind === "ok"
      ? Math.max(1, ...state.data.branches.map((b) => b.qty))
      : 1;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink">Consultar Raven</h1>
        <p className="mt-0.5 text-sm text-muted">
          Pedidos al CDP por producto y fecha de entrega, desglosados por sucursal.
        </p>
      </div>

      {/* Provisorio: solo algunos insumos están cargados en Raven (el resto da 404). */}
      <Card className="border-l-4 border-l-warn/50 p-4">
        <div className="flex items-center gap-2">
          <span className="rounded bg-warn/25 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-warn">
            provisorio
          </span>
          <p className="text-sm font-medium text-ink">Datos de Raven en alineación</p>
        </div>
        <p className="mt-1.5 text-xs text-muted">
          La API de Raven es temporal y varios insumos todavía no están cargados con nuestro código (dan 404).
          Por ahora <b>solo estos responden</b> — tocá para consultarlos:
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {RAVEN_OK.map((p) => (
            <button
              key={p.code}
              onClick={() => usar(p.code)}
              className="inline-flex items-center gap-1.5 rounded-full border border-ok/30 bg-ok/10 px-2.5 py-1 text-xs font-medium text-ok transition-colors hover:bg-ok/20"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-ok" />
              {p.name}
              <span className="font-mono text-2xs opacity-70">{p.code}</span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-2xs text-faint">
          Pendientes (404, esperando el código real de Raven): {RAVEN_PENDIENTE.map((p) => p.name).join(" · ")}.
        </p>
      </Card>

      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Código de producto" hint="Numérico, 3 a 8 dígitos (ej. 050027)">
            <input
              className={inputClass}
              value={code}
              inputMode="numeric"
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && consultar()}
            />
          </Field>
          <Field label="Fecha de entrega" hint="AAAA-MM-DD">
            <input
              type="date"
              className={inputClass}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Button onClick={consultar} disabled={state.kind === "loading"}>
            {state.kind === "loading" ? "Consultando…" : "Consultar"}
          </Button>
        </div>
      </Card>

      {state.kind === "idle" && (
        <EmptyState
          title="Listo para consultar"
          desc="Ingresá un código y una fecha de entrega. Vas a ver el total pedido al CDP y cómo se reparte entre sucursales."
        />
      )}

      {state.kind === "loading" && (
        <Card className="space-y-3 p-4">
          <Skeleton className="h-6 w-1/3" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </Card>
      )}

      {state.kind === "error" && <ErrorState msg={state.msg} onRetry={consultar} />}

      {state.kind === "ok" && (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
            <div>
              <p className="font-display text-sm font-semibold text-ink">
                {state.data.name}{" "}
                <span className="font-mono text-2xs font-normal text-faint">
                  {state.data.code}
                </span>
              </p>
              <p className="text-2xs text-muted">
                {state.data.branches.length} sucursales · unidad: {state.data.unit}
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono text-2xl font-semibold tnum text-ink">
                {fmtInt(state.data.qty)}
              </p>
              <p className="text-2xs text-faint">total pedido</p>
            </div>
          </div>

          {state.data.branches.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="Sin pedidos para esa fecha"
                desc="Raven respondió correctamente pero no hay pedidos de este producto en la fecha elegida. Probá otra fecha de entrega."
              />
            </div>
          ) : (
            <ul className="divide-y divide-line/70">
              {state.data.branches
                .slice()
                .sort((a, b) => b.qty - a.qty)
                .map((b) => (
                  <li key={b.branch_code} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="w-36 shrink-0 truncate text-sm text-ink">
                      {b.branch_name}
                    </span>
                    <span className="font-mono text-2xs text-faint">{b.branch_code}</span>
                    <div className="relative h-2.5 flex-1 rounded bg-ink/[0.04]">
                      <div
                        className="h-full rounded bg-action"
                        style={{ width: `${(b.qty / max) * 100}%` }}
                      />
                    </div>
                    <span className="w-16 shrink-0 text-right font-mono tnum text-sm text-ink">
                      {fmtInt(b.qty)}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
