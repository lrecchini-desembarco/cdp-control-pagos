"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/primitives";
import { descargarCSV } from "@/lib/exportar-csv";
import { parseNumero } from "@/lib/num";

// Bancos: resumen de la plata que liquidan tarjetas/adquirentes y de los movimientos
// de cuenta. Ingesta flexible por CSV: auto-detecta las columnas del archivo que subas
// (liquidación de tarjeta o extracto bancario) y arma los resúmenes. Cuando Sistemas
// exponga la vista de Tango Tesorería (docs/sql/tango-bancos.sql), pasa a vivo.

interface Fila {
  fecha: string;        // ISO yyyy-mm-dd
  banco: string;
  medio: string;        // tarjeta / medio de pago
  local: string;
  concepto: string;
  bruto: number;        // importe bruto / venta / cupón
  neto: number;         // acreditado / a depositar / liquidado
  comision: number;     // arancel / comisión / retención
  ingreso: number;      // extracto: crédito / haber
  egreso: number;       // extracto: débito / debe
  cuotas: string;
  comprobante: string;
}
type Campo = keyof Fila;

const SINONIMOS: Record<Campo, string[]> = {
  fecha: ["fecha acreditacion", "fecha liquidacion", "fecha pago", "fecha deposito", "fecha operacion", "fecha", "emision", "dia"],
  banco: ["banco", "entidad", "adquirente", "procesador"],
  medio: ["medio de pago", "medio pago", "tipo tarjeta", "tarjeta", "marca", "medio", "producto"],
  local: ["punto de venta", "nro comercio", "numero de comercio", "establecimiento", "comercio", "terminal", "sucursal", "local", "boca"],
  concepto: ["concepto", "detalle", "descripcion", "referencia", "movimiento", "glosa"],
  bruto: ["importe bruto", "monto bruto", "importe operacion", "importe venta", "importe cupon", "presentado", "bruto", "venta", "cupon"],
  neto: ["importe a acreditar", "neto a acreditar", "importe neto", "monto neto", "a acreditar", "acreditado", "a depositar", "liquidado", "abonado", "neto"],
  comision: ["arancel comision", "comision", "arancel", "descuento", "retenciones", "retencion", "gastos", "cargo"],
  ingreso: ["acreditacion", "credito", "haber", "ingreso", "deposito", "entrada"],
  egreso: ["debito", "debe", "egreso", "extraccion", "salida", "pago"],
  cuotas: ["cuotas", "cuota", "plan", "financiacion"],
  comprobante: ["codigo autorizacion", "autorizacion", "liquidacion", "lote", "cupon nro", "nro cupon", "operacion", "comprobante", "referencia", "numero", "nro", "id"],
};
const CAMPOS = Object.keys(SINONIMOS) as Campo[];
const NUMERICOS: Campo[] = ["bruto", "neto", "comision", "ingreso", "egreso"];

const ETIQUETA: Record<Campo, string> = {
  fecha: "fecha", banco: "banco", medio: "medio/tarjeta", local: "local", concepto: "concepto",
  bruto: "bruto $", neto: "neto $", comision: "comisión $", ingreso: "ingreso $", egreso: "egreso $",
  cuotas: "cuotas", comprobante: "comprobante/lote",
};

const normH = (s: string) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const money = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");
const moneyC = (n: number) => {
  const a = Math.abs(n);
  const s = a >= 1_000_000_000 ? (n / 1e9).toFixed(2).replace(".", ",") + " mil M"
    : a >= 1_000_000 ? (n / 1e6).toFixed(1).replace(".", ",") + " M"
    : a >= 1_000 ? Math.round(n / 1e3) + " k" : String(Math.round(n));
  return "$" + s;
};
const pct = (x: number) => `${(x * 100).toFixed(1).replace(".", ",")}%`;
const int = (n: number) => Math.round(n).toLocaleString("es-AR");
const num = parseNumero;
const fechaCorta = (iso: string) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" }) : "—");

function isoDe(s: string): string {
  s = (s || "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = "20" + y;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return "";
}

function parseCSV(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let field = "", row: string[] = [], inQ = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (field !== "" || row.length) { row.push(field); rows.push(row); row = []; field = ""; }
      if (c === "\r" && text[i + 1] === "\n") i++;
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export default function BancosView() {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [det, setDet] = useState<Partial<Record<Campo, boolean>>>({});
  const [archivo, setArchivo] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"banco" | "medio" | "local" | "dia">("medio");

  // Modo: liquidación (tarjetas: bruto/neto/comisión) o extracto (cuenta: ingreso/egreso).
  const esExtracto = !!(det.ingreso || det.egreso) && !(det.bruto || det.neto);

  async function subir(file?: File) {
    if (!file) return;
    setError("");
    setArchivo(file.name);
    const text = await file.text();
    const first = text.replace(/^﻿/, "").split(/\r?\n/)[0] || "";
    const delim = first.split("\t").length > 2 ? "\t" : (first.split(";").length > first.split(",").length ? ";" : ",");
    const rows = parseCSV(text, delim);
    if (rows.length < 2) return setError("El archivo está vacío o no se pudo leer. Exportá la liquidación/extracto como CSV.");

    const head = rows[0].map(normH);
    const usados = new Set<number>();
    const idxDe = (campo: Campo): number => {
      for (const syn of SINONIMOS[campo]) {
        const i = head.findIndex((h, k) => !usados.has(k) && (h === syn || h.includes(syn)));
        if (i >= 0) { usados.add(i); return i; }
      }
      return -1;
    };
    const idx = Object.fromEntries(CAMPOS.map((c) => [c, idxDe(c)])) as Record<Campo, number>;
    const detectadas = Object.fromEntries(CAMPOS.map((c) => [c, idx[c] >= 0])) as Record<Campo, boolean>;
    setDet(detectadas);

    const tieneMonto = NUMERICOS.some((c) => idx[c] >= 0);
    if (!tieneMonto) {
      return setError("No encontré ninguna columna de plata (bruto, neto, comisión, ingreso o egreso). Revisá los encabezados; podés renombrarlos a: fecha, medio, banco, local, bruto, neto, comision.");
    }

    const g = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "") : "");
    const parsed: Fila[] = rows.slice(1)
      .filter((r) => r.some((c) => c && c.trim() !== ""))
      .map((r) => ({
        fecha: isoDe(g(r, idx.fecha)),
        banco: g(r, idx.banco).trim(),
        medio: g(r, idx.medio).trim(),
        local: g(r, idx.local).trim(),
        concepto: g(r, idx.concepto).trim(),
        bruto: num(g(r, idx.bruto)),
        neto: num(g(r, idx.neto)),
        comision: num(g(r, idx.comision)),
        ingreso: num(g(r, idx.ingreso)),
        egreso: Math.abs(num(g(r, idx.egreso))),
        cuotas: g(r, idx.cuotas).trim(),
        comprobante: g(r, idx.comprobante).trim(),
      }));
    setFilas(parsed);
    setTab(detectadas.medio ? "medio" : detectadas.banco ? "banco" : detectadas.local ? "local" : "dia");
  }

  // Normaliza cada fila a { bruto, neto, comision } (o ingreso/egreso en extracto).
  const norm = (f: Fila) => {
    if (esExtracto) return { bruto: f.ingreso, neto: f.ingreso - f.egreso, comision: 0, egreso: f.egreso, ingreso: f.ingreso };
    const bruto = f.bruto || (f.neto + f.comision) || f.neto;
    const comision = det.comision ? f.comision : Math.max(0, bruto - (f.neto || bruto));
    const neto = det.neto ? f.neto : bruto - comision;
    return { bruto, neto, comision, egreso: 0, ingreso: 0 };
  };

  const kpis = useMemo(() => {
    let bruto = 0, neto = 0, comision = 0, ingreso = 0, egreso = 0;
    for (const f of filas) { const n = norm(f); bruto += n.bruto; neto += n.neto; comision += n.comision; ingreso += n.ingreso; egreso += n.egreso; }
    return { bruto, neto, comision, ingreso, egreso, n: filas.length, comPct: bruto ? comision / bruto : 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, esExtracto, det]);

  const agrupar = (key: (f: Fila) => string) => {
    const m = new Map<string, { k: string; bruto: number; neto: number; comision: number; n: number }>();
    for (const f of filas) {
      const k = key(f) || "(sin dato)";
      const a = m.get(k) ?? { k, bruto: 0, neto: 0, comision: 0, n: 0 };
      const nn = norm(f); a.bruto += nn.bruto; a.neto += nn.neto; a.comision += nn.comision; a.n++;
      m.set(k, a);
    }
    return Array.from(m.values()).sort((a, b) => b.neto - a.neto);
  };
  const porMedio = useMemo(() => agrupar((f) => f.medio), [filas, esExtracto, det]); // eslint-disable-line react-hooks/exhaustive-deps
  const porBanco = useMemo(() => agrupar((f) => f.banco), [filas, esExtracto, det]); // eslint-disable-line react-hooks/exhaustive-deps
  const porLocal = useMemo(() => agrupar((f) => f.local), [filas, esExtracto, det]); // eslint-disable-line react-hooks/exhaustive-deps
  const porDia = useMemo(() => {
    const g = agrupar((f) => f.fecha);
    return g.filter((x) => x.k !== "(sin dato)").sort((a, b) => a.k.localeCompare(b.k));
  }, [filas, esExtracto, det]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = tab === "medio" ? porMedio : tab === "banco" ? porBanco : tab === "local" ? porLocal : porDia;
  const maxNeto = Math.max(1, ...rows.map((r) => Math.abs(r.neto)));

  function exportar() {
    descargarCSV(`bancos-${tab}.csv`, [tab === "dia" ? "fecha" : tab, "operaciones", "bruto", "comision", "neto"],
      rows.map((r) => [tab === "dia" ? r.k : r.k, r.n, Math.round(r.bruto), Math.round(r.comision), Math.round(r.neto)]));
  }

  const detList = CAMPOS.filter((c) => det[c]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Bancos</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">
            {esExtracto
              ? "Movimientos de cuenta: ingresos, egresos y neto por banco, día y concepto."
              : "Lo que las tarjetas y bancos te liquidan: bruto, comisiones y neto acreditado, por medio, banco, local y día."}
          </p>
        </div>
        <label className="cursor-pointer rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-ink/[0.03]">
          {filas.length ? "Cambiar archivo" : "Subir CSV"}
          <input type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={(e) => subir(e.target.files?.[0])} />
        </label>
      </div>

      {error && <Card className="border-bad/40 bg-bad/[0.04] p-3 text-sm text-bad">{error}</Card>}

      {filas.length === 0 ? (
        <Card className="p-6">
          <p className="text-sm text-muted">
            Subí el CSV de una <b>liquidación de tarjeta</b> (Payway, Fiserv, Naranja, Getnet…) o un <b>extracto bancario</b>.
            Detecto las columnas solo — idealmente que tenga <b>fecha</b>, un <b>medio/tarjeta</b> o <b>banco</b>, y al menos un
            importe (<b>bruto</b>, <b>neto</b>/acreditado o <b>comisión</b>; o <b>ingreso</b>/<b>egreso</b> para extractos).
            Si viene de Excel, exportalo como CSV.
          </p>
          <p className="mt-2 text-2xs text-faint">Cuando Sistemas exponga la vista de Tango Tesorería, esta pantalla pasa a leer en vivo sin subir nada.</p>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-2xs text-faint">
            <span className="rounded bg-ink/[0.04] px-2 py-1">{archivo}</span>
            <span>· {int(filas.length)} filas · columnas detectadas:</span>
            {detList.map((c) => <span key={c} className="rounded bg-ok/10 px-1.5 py-0.5 text-ok">{ETIQUETA[c]}</span>)}
          </div>

          {esExtracto ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi label="Ingresos" value={moneyC(kpis.ingreso)} full={money(kpis.ingreso)} tone="ok" sub={`${int(kpis.n)} movimientos`} />
              <Kpi label="Egresos" value={moneyC(kpis.egreso)} full={money(kpis.egreso)} tone="bad" />
              <Kpi label="Neto" value={moneyC(kpis.neto)} full={money(kpis.neto)} tone={kpis.neto < 0 ? "bad" : "ok"} sub="ingresos − egresos" />
              <Kpi label="Bancos" value={String(porBanco.length)} sub="con movimiento" plain />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi label="Bruto liquidado" value={moneyC(kpis.bruto)} full={money(kpis.bruto)} sub={`${int(kpis.n)} operaciones`} />
              <Kpi label="Comisión" value={moneyC(kpis.comision)} full={money(kpis.comision)} tone="bad" sub={`${pct(kpis.comPct)} del bruto`} />
              <Kpi label="Neto acreditado" value={moneyC(kpis.neto)} full={money(kpis.neto)} tone="ok" sub="lo que te queda" />
              <Kpi label="Medios / bancos" value={`${porMedio.length} / ${porBanco.length}`} sub="distintos" plain />
            </div>
          )}

          <Card className="overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
              <div className="flex flex-wrap gap-1">
                {([["medio", "Por medio"], ["banco", "Por banco"], ["local", "Por local"], ["dia", "Por día"]] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setTab(k)}
                    className={`rounded-md px-2.5 py-1 text-2xs font-medium ${tab === k ? "bg-ink/[0.06] text-ink" : "text-muted hover:bg-ink/[0.03]"}`}>{l}</button>
                ))}
              </div>
              <button onClick={exportar} className="text-2xs font-medium text-action hover:underline">Exportar CSV</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b border-line text-2xs uppercase tracking-wide text-faint">
                  <th className="px-4 py-2 font-medium">{tab === "dia" ? "Día" : tab === "medio" ? "Medio / tarjeta" : tab === "banco" ? "Banco" : "Local"}</th>
                  <th className="px-3 py-2 text-right font-medium">Ops</th>
                  {!esExtracto && <th className="px-3 py-2 text-right font-medium">Bruto</th>}
                  {!esExtracto && <th className="px-3 py-2 text-right font-medium">Comisión</th>}
                  <th className="px-3 py-2 font-medium">{esExtracto ? "Neto" : "Neto acreditado"}</th>
                </tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.k} className="border-b border-line/70 last:border-0 hover:bg-ink/[0.02]">
                      <td className="px-4 py-2 font-medium text-ink">{tab === "dia" ? fechaCorta(r.k) : r.k}</td>
                      <td className="px-3 py-2 text-right font-mono tnum text-muted">{int(r.n)}</td>
                      {!esExtracto && <td className="px-3 py-2 text-right font-mono tnum text-muted monto">{money(r.bruto)}</td>}
                      {!esExtracto && <td className="px-3 py-2 text-right font-mono tnum text-bad monto">{r.comision ? money(r.comision) : "—"}</td>}
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-ink/10"><div className={`h-full rounded-full ${r.neto < 0 ? "bg-bad/70" : "bg-ok/80"}`} style={{ width: `${Math.max(2, (Math.abs(r.neto) / maxNeto) * 100)}%` }} /></div>
                          <span className="font-mono tnum font-medium text-ink monto">{money(r.neto)}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, tone, full, plain }: { label: string; value: string; sub?: string; tone?: "ok" | "bad"; full?: string; plain?: boolean }) {
  const c = tone === "ok" ? "text-ok" : tone === "bad" ? "text-bad" : "text-ink";
  return (
    <Card className="group p-3">
      <p className="text-2xs uppercase tracking-wide text-faint">{label}</p>
      <p className={`mt-0.5 font-display text-base font-semibold leading-tight tnum sm:text-2xl ${c}`}>
        {plain
          ? value
          : <span className="monto">
              <span className="group-hover:hidden">{value}</span>
              {full && <span className="hidden whitespace-nowrap text-[0.7em] group-hover:inline">{full}</span>}
            </span>}
      </p>
      {sub && <p className="text-2xs text-faint">{sub}</p>}
    </Card>
  );
}
