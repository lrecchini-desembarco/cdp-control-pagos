"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/primitives";
import { descargarCSV } from "@/lib/exportar-csv";
import { abrirInformePDF } from "@/lib/informe-consumo";
import ComprasCsvView from "./ComprasCsvView";

// Tablero "Consumo (CMV) vs Ventas" — datos REALES de la base del grupo (Neon),
// vía /api/consumo. Cruza el consumo de insumos valorizado (CMV) contra las
// ventas de Tango, mes a mes, con rentabilidad, más/menos consumido y drill por
// insumo. Filtros por marca (Desembarco/Mr Tasty), propios/franquicias y local.
// La carga manual de compras por CSV queda como pestaña secundaria (ComprasCsvView).

interface ResumenMes { mes: string; ventas: number; unidades: number; cmv: number; margen: number; margenPct: number | null }
interface InsumoComp { codigo: string; descripcion: string; unidad: string; cantA: number; costoA: number; cantB: number; costoB: number; varCosto: number | null }
interface InsumoPer { codigo: string; descripcion: string; unidad: string; cantidad: number; costo: number; locales: number }
interface LocalRentab { id: number; nombre: string; marca: string; esPropia: boolean; ventas: number; unidades: number; cmv: number; margenPct: number | null; cmvPct: number | null; sinConsumo: boolean; sinVentas: boolean }
interface Sucursal { id: number; nombre: string; marca: string; esPropia: boolean }

type Tab = "rentabilidad" | "movimientos" | "insumo" | "local" | "csv";

// $ compacto para plata grande (miles de millones): "$5,5 mil M", "$2,0 M".
const moneyC = (n: number) => {
  const a = Math.abs(n);
  const s = a >= 1e9 ? (n / 1e9).toFixed(1).replace(".", ",") + " mil M"
    : a >= 1e6 ? (n / 1e6).toFixed(1).replace(".", ",") + " M"
    : a >= 1e3 ? Math.round(n / 1e3) + " k" : String(Math.round(n));
  return "$" + s;
};
const money = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");
const int = (n: number) => Math.round(n).toLocaleString("es-AR");
const pct = (n: number | null) => (n == null ? "—" : n.toFixed(1).replace(".", ",") + " %");
const mesLabel = (m: string) => {
  const [y, mo] = m.split("-");
  return `${["", "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][+mo] || mo} ${y.slice(2)}`;
};

export default function ComprasView() {
  const [tab, setTab] = useState<Tab>("rentabilidad");

  // Filtros globales
  const [marca, setMarca] = useState<"" | "D" | "T">("");
  const [propias, setPropias] = useState<"" | "1" | "0">("");
  const [sucursal, setSucursal] = useState<string>("");
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [meses, setMeses] = useState<string[]>([]);

  // Selección de período
  const [mesA, setMesA] = useState<string>("");
  const [mesB, setMesB] = useState<string>("");

  // Datos
  const [resumen, setResumen] = useState<ResumenMes[]>([]);
  const [comparativo, setComparativo] = useState<InsumoComp[]>([]);
  const [porInsumo, setPorInsumo] = useState<InsumoPer[]>([]);
  const [porLocal, setPorLocal] = useState<LocalRentab[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  const qs = useCallback(() => {
    const p = new URLSearchParams();
    if (marca) p.set("marca", marca);
    if (propias) p.set("propias", propias);
    if (sucursal) p.set("sucursal", sucursal);
    return p;
  }, [marca, propias, sucursal]);

  // Carga inicial: meses + sucursales (una vez)
  useEffect(() => {
    (async () => {
      try {
        const [jm, js] = await Promise.all([
          fetch("/api/consumo?q=meses").then((r) => r.json()),
          fetch("/api/consumo?q=sucursales").then((r) => r.json()),
        ]);
        if (js.ok) setSucursales(js.sucursales);
        if (jm.ok && jm.meses.length) {
          const ms: string[] = jm.meses; // más nuevo primero; el [0] suele ser el mes en curso (parcial)
          setMeses(ms);
          // Default: los dos últimos meses COMPLETOS (evita comparar el parcial en curso).
          if (ms.length >= 3) { setMesB(ms[1]); setMesA(ms[2]); }
          else if (ms.length === 2) { setMesB(ms[0]); setMesA(ms[1]); }
          else { setMesB(ms[0]); setMesA(ms[0]); }
        } else {
          setError("No hay meses en la base de consumo todavía.");
        }
      } catch (e) {
        setError("No pude conectar con la base de consumo: " + String(e));
      }
    })();
  }, []);

  // Resumen mensual (depende de filtros)
  useEffect(() => {
    if (!meses.length) return;
    setCargando(true); setError("");
    fetch("/api/consumo?q=resumen&" + qs().toString())
      .then((r) => r.json())
      .then((j) => { if (j.ok) setResumen(j.meses); else setError(j.error || "Error trayendo el resumen."); })
      .catch((e) => setError(String(e)))
      .finally(() => setCargando(false));
  }, [meses, qs]);

  // Comparativo A vs B (para movimientos) — depende de período + filtros
  useEffect(() => {
    if (!mesA || !mesB) return;
    const p = qs(); p.set("q", "comparativo"); p.set("mesA", mesA); p.set("mesB", mesB);
    fetch("/api/consumo?" + p.toString())
      .then((r) => r.json())
      .then((j) => { if (j.ok) setComparativo(j.insumos); })
      .catch(() => {});
  }, [mesA, mesB, qs]);

  // Consumo por insumo + rentabilidad por local del período (mesA..mesB)
  useEffect(() => {
    if (!mesA || !mesB) return;
    const desde = mesA <= mesB ? mesA : mesB, hasta = mesA <= mesB ? mesB : mesA;
    const pi = qs(); pi.set("q", "insumo"); pi.set("desde", desde); pi.set("hasta", hasta);
    fetch("/api/consumo?" + pi.toString()).then((r) => r.json()).then((j) => { if (j.ok) setPorInsumo(j.insumos); }).catch(() => {});
    const pl = qs(); pl.set("q", "local"); pl.set("desde", desde); pl.set("hasta", hasta);
    fetch("/api/consumo?" + pl.toString()).then((r) => r.json()).then((j) => { if (j.ok) setPorLocal(j.locales); }).catch(() => {});
  }, [mesA, mesB, qs]);

  const rowA = resumen.find((r) => r.mes === mesA);
  const rowB = resumen.find((r) => r.mes === mesB);
  // El mes más nuevo es el que está corriendo → marcarlo "parcial" en los selectores.
  const mesesOpc = useMemo<[string, string][]>(
    () => meses.map((m, i) => [m, i === 0 ? `${mesLabel(m)} · parcial` : mesLabel(m)]),
    [meses]
  );
  const mesBParcial = mesB && mesB === meses[0];

  function informePDF() {
    const nombreMarca = marca === "D" ? "Desembarco" : marca === "T" ? "Mr Tasty" : "Todas las marcas";
    const nombreTipo = propias === "1" ? "propios" : propias === "0" ? "franquicias" : "todos";
    const nombreLocal = sucursal ? sucursales.find((s) => String(s.id) === sucursal)?.nombre ?? "" : "";
    const subtitulo = [nombreMarca, `tipo: ${nombreTipo}`, nombreLocal && `local: ${nombreLocal}`].filter(Boolean).join(" · ");
    abrirInformePDF({
      titulo: "Consumo (CMV) vs Ventas",
      subtitulo,
      mesA: mesLabel(mesA), mesB: mesLabel(mesB),
      generado: new Date().toLocaleString("es-AR"),
      resumen,
      topInsumos: porInsumo,
      // Mismo umbral relativo que la pestaña Movimientos (para que PDF y pantalla coincidan).
      variaciones: (() => {
        const totalB = comparativo.reduce((s, x) => s + x.costoB, 0);
        const min = Math.max(50_000, totalB * 0.001);
        return comparativo.filter((v) => v.costoA >= min || v.costoB >= min).slice()
          .sort((a, b) => (b.varCosto ?? -1e9) - (a.varCosto ?? -1e9));
      })(),
      mesLabel,
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink">Consumo (CMV) vs Ventas</h1>
        <p className="mt-0.5 max-w-3xl text-sm text-muted">
          Rentabilidad real del grupo: consumo de insumos valorizado (CMV, de Tango) contra ventas, mes a mes.
          Detectá qué se consume más/menos y dónde se mueve el margen. Datos reales, actualizados a diario.
        </p>
      </div>

      {/* Filtros globales */}
      <Card className="flex flex-wrap items-end gap-3 p-3">
        <Selector label="Marca" value={marca} onChange={(v) => setMarca(v as any)}
          opciones={[["", "Todas"], ["D", "Desembarco"], ["T", "Mr Tasty"]]} />
        <Selector label="Tipo" value={propias} onChange={(v) => setPropias(v as any)}
          opciones={[["", "Todos"], ["1", "Propios"], ["0", "Franquicias"]]} />
        <label className="text-2xs text-faint">
          <span className="mb-1 block font-medium uppercase tracking-wide">Local</span>
          <select value={sucursal} onChange={(e) => setSucursal(e.target.value)}
            className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink">
            <option value="">Todos</option>
            {sucursales
              .filter((s) => (!marca || s.marca === marca) && (propias === "" || s.esPropia === (propias === "1")))
              .map((s) => <option key={s.id} value={s.id}>{s.nombre}{s.marca === "T" ? " · MrT" : ""}</option>)}
          </select>
        </label>
        <div className="ml-auto flex items-end gap-2">
          <Selector label="Mes A" value={mesA} onChange={setMesA} opciones={mesesOpc} />
          <span className="pb-1.5 text-xs text-faint">vs</span>
          <Selector label="Mes B" value={mesB} onChange={setMesB} opciones={mesesOpc} />
        </div>
      </Card>

      {error && <Card className="p-3 text-sm text-bad">{error}</Card>}
      {mesBParcial && !error && (
        <Card className="p-2.5 text-2xs text-warn">⚠ El mes B ({mesLabel(mesB)}) está en curso: sus totales son parciales. Para comparar meses completos elegí meses anteriores.</Card>
      )}

      {/* Pestañas */}
      <Card className="flex flex-wrap items-center gap-2 p-2">
        <div className="flex flex-wrap gap-1 rounded-lg border border-line p-0.5">
          <TabBtn activo={tab === "rentabilidad"} onClick={() => setTab("rentabilidad")}>Rentabilidad</TabBtn>
          <TabBtn activo={tab === "movimientos"} onClick={() => setTab("movimientos")}>Más / menos consumido</TabBtn>
          <TabBtn activo={tab === "insumo"} onClick={() => setTab("insumo")}>Por insumo</TabBtn>
          <TabBtn activo={tab === "local"} onClick={() => setTab("local")}>Por local (foodcost)</TabBtn>
          <TabBtn activo={tab === "csv"} onClick={() => setTab("csv")}>Compras (CSV)</TabBtn>
        </div>
        {cargando && <span className="text-2xs text-action">actualizando…</span>}
        {tab !== "csv" && (
          <button onClick={informePDF} disabled={!resumen.length}
            title="Genera un informe imprimible del período y filtros actuales (Guardar como PDF)"
            className="ml-auto rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:border-action/40 hover:text-action disabled:opacity-40">
            ⬇ Informe PDF
          </button>
        )}
      </Card>

      {tab === "rentabilidad" && (
        <RentabilidadTab resumen={resumen} rowA={rowA} rowB={rowB} mesA={mesA} mesB={mesB} />
      )}
      {tab === "movimientos" && (
        <MovimientosTab comparativo={comparativo} mesA={mesA} mesB={mesB} />
      )}
      {tab === "insumo" && (
        <InsumoTab porInsumo={porInsumo} mesA={mesA} mesB={mesB} />
      )}
      {tab === "local" && (
        <LocalTab locales={porLocal} mesA={mesA} mesB={mesB} />
      )}
      {tab === "csv" && (
        <Card className="p-4"><ComprasCsvView /></Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Rentabilidad

function RentabilidadTab({ resumen, rowA, rowB, mesA, mesB }: {
  resumen: ResumenMes[]; rowA?: ResumenMes; rowB?: ResumenMes; mesA: string; mesB: string;
}) {
  const delta = (a?: number, b?: number) => (a == null || b == null || a === 0 ? null : ((b - a) / a) * 100);
  const exportar = () => descargarCSV("rentabilidad_mensual",
    ["Mes", "Ventas", "CMV", "Margen $", "Margen %", "Unidades"],
    resumen.map((r) => [mesLabel(r.mes), Math.round(r.ventas), Math.round(r.cmv), Math.round(r.margen), r.margenPct?.toFixed(1) ?? "", Math.round(r.unidades)]));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={`Ventas · ${mesB ? mesLabel(mesB) : ""}`} value={rowB ? moneyC(rowB.ventas) : "—"} delta={delta(rowA?.ventas, rowB?.ventas)} />
        <Kpi label={`CMV · ${mesB ? mesLabel(mesB) : ""}`} value={rowB ? moneyC(rowB.cmv) : "—"} delta={delta(rowA?.cmv, rowB?.cmv)} deltaInverso />
        <Kpi label="Margen bruto" value={rowB ? pct(rowB.margenPct) : "—"} delta={rowA?.margenPct != null && rowB?.margenPct != null ? rowB.margenPct - rowA.margenPct : null} deltaPuntos />
        <Kpi label="Unidades" value={rowB ? int(rowB.unidades) : "—"} delta={delta(rowA?.unidades, rowB?.unidades)} />
      </div>
      <p className="-mt-1 text-2xs text-faint">
        <b>Margen bruto</b> = (Ventas − CMV) / Ventas. Es margen sobre insumos: <b>no</b> descuenta regalías, alquiler,
        sueldos ni impuestos (no es rentabilidad neta). Ventas <b>netas de IVA</b> (÷1,21, mismo criterio que Tango), para
        que sean comparables con el costo.
      </p>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-[15px] font-semibold text-ink">Ventas vs CMV por mes</h2>
          <button onClick={exportar} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:border-action/40 hover:text-action">⬇ Exportar</button>
        </div>
        <BarrasMensuales datos={resumen} destacar={[mesA, mesB]} />
      </Card>

      <Card className="overflow-hidden">
        <TablaSimple
          cols={["Mes", "Ventas", "CMV", "Margen $", "Margen %", "Unidades"]}
          alinearDesde={1}
          filas={resumen.map((r) => [
            mesLabel(r.mes), money(r.ventas), money(r.cmv), money(r.margen),
            <b key="m" className={r.margenPct != null && r.margenPct >= 60 ? "text-ok" : "text-warn"}>{pct(r.margenPct)}</b>,
            int(r.unidades),
          ])}
        />
      </Card>
      <p className="text-2xs text-faint">
        <b>CMV</b> = costo de los insumos consumidos (real, de Tango). <b>Margen bruto</b> = (Ventas − CMV) / Ventas;
        no descuenta regalías, alquileres ni mano de obra. Base desde jun-2026 (el comparativo año contra año se habilita al haber histórico 2025).
      </p>
    </div>
  );
}

// Gráfico de barras agrupadas Ventas vs CMV por mes (SVG propio, sin librería).
function BarrasMensuales({ datos, destacar }: { datos: ResumenMes[]; destacar: string[] }) {
  if (!datos.length) return <p className="py-8 text-center text-sm text-faint">Sin datos.</p>;
  const max = Math.max(...datos.map((d) => d.ventas), 1);
  const W = Math.max(360, datos.length * 120), H = 220, padB = 42, padT = 12, padL = 8;
  const bw = 26, gap = 10;
  const grupoW = W / datos.length;
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxWidth: W }} role="img" aria-label="Ventas vs CMV por mes">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={padL} x2={W} y1={y(max * f)} y2={y(max * f)} className="stroke-line" strokeWidth={1} />
        ))}
        {datos.map((d, i) => {
          const cx = i * grupoW + grupoW / 2;
          const dest = destacar.includes(d.mes);
          return (
            <g key={d.mes}>
              <rect x={cx - bw - gap / 2} y={y(d.ventas)} width={bw} height={y(0) - y(d.ventas)} rx={3}
                className={dest ? "fill-action" : "fill-action/50"} />
              <rect x={cx + gap / 2} y={y(d.cmv)} width={bw} height={y(0) - y(d.cmv)} rx={3}
                className={dest ? "fill-warn" : "fill-warn/50"} />
              <text x={cx} y={y(0) + 14} textAnchor="middle" className="fill-muted text-[10px]">{mesLabel(d.mes)}</text>
              <text x={cx} y={y(0) + 28} textAnchor="middle" className="fill-ink text-[10px] font-semibold">{pct(d.margenPct)}</text>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-center gap-4 text-2xs text-muted">
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-action" /> Ventas</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-warn" /> CMV</span>
        <span>· % = margen bruto</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Movimientos

function MovimientosTab({ comparativo, mesA, mesB }: { comparativo: InsumoComp[]; mesA: string; mesB: string }) {
  const [orden, setOrden] = useState<"consumo" | "suba" | "baja">("consumo");
  // Umbral RELATIVO al período/filtro (QA #4): ignora insumos < 0,1% del consumo del mes B,
  // con un piso de $50k. Así escala igual mirando el grupo entero o un solo local.
  const MIN = useMemo(() => {
    const totalB = comparativo.reduce((s, x) => s + x.costoB, 0);
    return Math.max(50_000, totalB * 0.001);
  }, [comparativo]);

  const filas = useMemo(() => {
    const c = comparativo.slice();
    if (orden === "consumo") return c.sort((a, b) => b.costoB - a.costoB);
    const conBase = c.filter((x) => x.costoA >= MIN || x.costoB >= MIN);
    if (orden === "suba") return conBase.sort((a, b) => (b.varCosto ?? -1e9) - (a.varCosto ?? -1e9));
    return conBase.sort((a, b) => (a.varCosto ?? 1e9) - (b.varCosto ?? 1e9));
  }, [comparativo, orden, MIN]);

  const exportar = () => descargarCSV(`consumo_${mesA}_vs_${mesB}`,
    ["Código", "Insumo", "Unidad", `Costo ${mesA}`, `Costo ${mesB}`, "Variación %", `Cant ${mesA}`, `Cant ${mesB}`],
    comparativo.map((r) => [r.codigo, r.descripcion, r.unidad, Math.round(r.costoA), Math.round(r.costoB), r.varCosto?.toFixed(1) ?? "", r.cantA, r.cantB]));

  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-center gap-2 p-3">
        <span className="text-2xs uppercase tracking-wide text-faint">Ordenar por</span>
        <TabBtn activo={orden === "consumo"} onClick={() => setOrden("consumo")}>Más consumido ({mesLabel(mesB)})</TabBtn>
        <TabBtn activo={orden === "suba"} onClick={() => setOrden("suba")}>Mayores subas</TabBtn>
        <TabBtn activo={orden === "baja"} onClick={() => setOrden("baja")}>Mayores bajas</TabBtn>
        <button onClick={exportar} className="ml-auto rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:border-action/40 hover:text-action">⬇ Exportar</button>
      </Card>
      <Card className="overflow-hidden">
        <TablaSimple
          cols={["Insumo", "Un.", `Costo ${mesLabel(mesA)}`, `Costo ${mesLabel(mesB)}`, "Variación"]}
          alinearDesde={2}
          filas={filas.slice(0, 300).map((r) => [
            <span key="d"><span className="text-sm text-ink">{r.descripcion}</span><span className="ml-1 font-mono text-2xs text-faint">{r.codigo}</span></span>,
            <span key="u" className="text-2xs text-faint">{r.unidad}</span>,
            <span key="a" className="font-mono tnum text-muted">{money(r.costoA)}</span>,
            <b key="b" className="font-mono tnum text-ink">{money(r.costoB)}</b>,
            <Variacion key="v" v={r.varCosto} />,
          ])}
        />
      </Card>
      <p className="text-2xs text-faint">Las variaciones ignoran insumos con consumo menor a {moneyC(MIN)} en ambos meses (ruido). "Más consumido" ordena por costo de {mesLabel(mesB)}.</p>
    </div>
  );
}

// ---------------------------------------------------------------- Por insumo

function InsumoTab({ porInsumo, mesA, mesB }: { porInsumo: InsumoPer[]; mesA: string; mesB: string }) {
  const [busca, setBusca] = useState("");
  const total = useMemo(() => porInsumo.reduce((s, r) => s + r.costo, 0), [porInsumo]);
  const filas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return porInsumo.filter((r) => !q || r.descripcion.toLowerCase().includes(q) || r.codigo.includes(q));
  }, [porInsumo, busca]);
  const rango = mesA === mesB ? mesLabel(mesA) : `${mesLabel(mesA < mesB ? mesA : mesB)} → ${mesLabel(mesA < mesB ? mesB : mesA)}`;
  const exportar = () => descargarCSV("consumo_por_insumo",
    ["Código", "Insumo", "Unidad", "Cantidad", "Costo", "% del CMV", "Locales"],
    filas.map((r) => [r.codigo, r.descripcion, r.unidad, r.cantidad, Math.round(r.costo), total ? (100 * r.costo / total).toFixed(2) : "", r.locales]));

  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-center gap-3 p-3">
        <span className="text-2xs uppercase tracking-wide text-faint">Período {rango} · CMV total {moneyC(total)}</span>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar insumo o código…"
          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-ink placeholder:text-faint" />
        <button onClick={exportar} className="ml-auto rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:border-action/40 hover:text-action">⬇ Exportar</button>
      </Card>
      <Card className="overflow-hidden">
        <TablaSimple
          cols={["Insumo", "Un.", "Cantidad", "Costo", "% CMV", "Locales"]}
          alinearDesde={2}
          filas={filas.slice(0, 400).map((r) => [
            <span key="d"><span className="text-sm text-ink">{r.descripcion}</span><span className="ml-1 font-mono text-2xs text-faint">{r.codigo}</span></span>,
            <span key="u" className="text-2xs text-faint">{r.unidad}</span>,
            <span key="q" className="font-mono tnum text-muted">{int(r.cantidad)}</span>,
            <b key="c" className="font-mono tnum text-ink">{money(r.costo)}</b>,
            <span key="p" className="font-mono tnum text-faint">{total ? (100 * r.costo / total).toFixed(1).replace(".", ",") + "%" : "—"}</span>,
            <span key="l" className="text-2xs text-faint">{r.locales}</span>,
          ])}
        />
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- Por local

function LocalTab({ locales, mesA, mesB }: { locales: LocalRentab[]; mesA: string; mesB: string }) {
  const [orden, setOrden] = useState<"peor" | "mejor" | "ventas">("peor");
  const rango = mesA === mesB ? mesLabel(mesA) : `${mesLabel(mesA < mesB ? mesA : mesB)} → ${mesLabel(mesA < mesB ? mesB : mesA)}`;

  // Piso de foodcost plausible: por debajo de esto, el consumo está cargado a medias
  // (no es eficiencia real). Un foodcost < ~15% es físicamente imposible en gastronomía.
  // Se toma el mayor entre 15% y la mitad de la mediana del grupo filtrado (QA #2).
  const piso = useMemo(() => {
    const vals = locales.filter((l) => !l.sinConsumo && !l.sinVentas && l.cmvPct != null).map((l) => l.cmvPct!).sort((a, b) => a - b);
    const med = vals.length ? vals[Math.floor(vals.length / 2)] : 0;
    return Math.max(15, med * 0.5);
  }, [locales]);
  const dudoso = (l: LocalRentab) => !l.sinConsumo && !l.sinVentas && l.cmvPct != null && l.cmvPct < piso;

  // Cobertura: locales con ambas fuentes vs con datos incompletos (QA de negocio #2).
  const conVentas = locales.filter((l) => l.ventas > 0).length;
  const conConsumo = locales.filter((l) => l.cmv > 0).length;
  const incompletos = locales.filter((l) => l.sinConsumo || l.sinVentas || dudoso(l)).length;

  const filas = useMemo(() => {
    const l = locales.slice();
    if (orden === "ventas") return l.sort((a, b) => b.ventas - a.ventas);
    // Ranking por foodcost: peor = mayor CMV%. Los de cobertura dudosa/incompleta van al fondo
    // (si no, un local cargado a medias con foodcost irreal aparecería como el "mejor").
    const val = (x: LocalRentab) => (x.sinConsumo || x.sinVentas || dudoso(x) || x.cmvPct == null ? null : x.cmvPct);
    return l.sort((a, b) => {
      const va = val(a), vb = val(b);
      if (va == null && vb == null) return b.ventas - a.ventas;
      if (va == null) return 1;
      if (vb == null) return -1;
      return orden === "peor" ? vb - va : va - vb;
    });
  }, [locales, orden, piso]);

  const exportar = () => descargarCSV(`foodcost_por_local_${mesA}_${mesB}`,
    ["Local", "Marca", "Tipo", "Ventas", "CMV", "Foodcost %", "Margen %", "Cobertura"],
    locales.map((l) => [l.nombre, l.marca === "T" ? "Mr Tasty" : "Desembarco", l.esPropia ? "propio" : "franquicia",
      Math.round(l.ventas), Math.round(l.cmv), l.cmvPct?.toFixed(1) ?? "", l.margenPct?.toFixed(1) ?? "",
      l.sinConsumo ? "sin consumo" : l.sinVentas ? "sin ventas" : "completa"]));

  return (
    <div className="space-y-3">
      {incompletos > 0 && (
        <Card className="p-2.5 text-2xs text-warn">
          ⚠ Cobertura despareja: {conVentas} locales con ventas y {conConsumo} con consumo cargado en el período.
          {" "}{incompletos} tienen datos incompletos (marcados abajo): en esos el foodcost/margen no es confiable — típico del mes en curso o cargas atrasadas.
        </Card>
      )}
      <Card className="flex flex-wrap items-center gap-2 p-3">
        <span className="text-2xs uppercase tracking-wide text-faint">Período {rango} · ordenar por</span>
        <TabBtn activo={orden === "peor"} onClick={() => setOrden("peor")}>Peor foodcost</TabBtn>
        <TabBtn activo={orden === "mejor"} onClick={() => setOrden("mejor")}>Mejor foodcost</TabBtn>
        <TabBtn activo={orden === "ventas"} onClick={() => setOrden("ventas")}>Más ventas</TabBtn>
        <button onClick={exportar} className="ml-auto rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:border-action/40 hover:text-action">⬇ Exportar</button>
      </Card>
      <Card className="overflow-hidden">
        <TablaSimple
          cols={["Local", "Ventas", "CMV", "Foodcost", "Margen"]}
          alinearDesde={1}
          filas={filas.slice(0, 250).map((l) => {
            const incompleto = l.sinConsumo || l.sinVentas || dudoso(l);
            return [
            <span key="n">
              <span className="text-sm text-ink">{l.nombre}</span>
              {l.marca === "T" && <span className="ml-1 text-2xs text-faint">MrT</span>}
              {l.sinConsumo && <span className="ml-1 rounded bg-warn/10 px-1 text-2xs text-warn">sin consumo</span>}
              {l.sinVentas && <span className="ml-1 rounded bg-warn/10 px-1 text-2xs text-warn">sin ventas</span>}
              {dudoso(l) && <span className="ml-1 rounded bg-warn/10 px-1 text-2xs text-warn">revisar carga</span>}
            </span>,
            <span key="v" className="font-mono tnum text-muted">{moneyC(l.ventas)}</span>,
            <span key="c" className="font-mono tnum text-muted">{moneyC(l.cmv)}</span>,
            <b key="f" className={`font-mono tnum ${incompleto || l.cmvPct == null ? "text-faint" : l.cmvPct > 40 ? "text-bad" : l.cmvPct > 35 ? "text-warn" : "text-ok"}`}>
              {incompleto || l.cmvPct == null ? "—" : pct(l.cmvPct)}
            </b>,
            <span key="m" className="font-mono tnum text-muted">{incompleto || l.margenPct == null ? "—" : pct(l.margenPct)}</span>,
          ]; })}
        />
      </Card>
      <p className="text-2xs text-faint">
        <b>Foodcost</b> = CMV / Ventas (cuánto de cada venta se va en insumos). Rojo &gt; 40 %, ámbar 35–40 %, verde &lt; 35 %.
        Los marcados <b>"revisar carga"</b> tienen consumo cargado a medias (foodcost irreal) y quedan fuera del ranking.
        Ventas netas de IVA, así el foodcost es comparable al estándar de la industria.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- Primitivas

function Kpi({ label, value, delta, deltaInverso, deltaPuntos }: {
  label: string; value: string; delta?: number | null; deltaInverso?: boolean; deltaPuntos?: boolean;
}) {
  const up = delta != null && delta > 0;
  const bueno = delta == null ? null : deltaInverso ? !up : up;
  return (
    <Card className="p-3">
      <p className="text-2xs uppercase tracking-wide text-faint">{label}</p>
      <p className="mt-0.5 font-display text-lg font-semibold text-ink">{value}</p>
      {delta != null && (
        <p className={`mt-0.5 text-2xs font-medium ${bueno ? "text-ok" : "text-bad"}`}>
          {up ? "▲" : "▼"} {Math.abs(delta).toFixed(1).replace(".", ",")}{deltaPuntos ? " pts" : " %"} vs mes A
        </p>
      )}
    </Card>
  );
}

function Variacion({ v }: { v: number | null }) {
  if (v == null) return <span className="text-2xs text-faint">nuevo</span>;
  const up = v > 0;
  return <span className={`font-mono tnum text-xs font-semibold ${up ? "text-bad" : "text-ok"}`}>{up ? "▲" : "▼"} {Math.abs(v).toFixed(1).replace(".", ",")}%</span>;
}

function Selector({ label, value, onChange, opciones }: {
  label: string; value: string; onChange: (v: string) => void; opciones: [string, string][];
}) {
  return (
    <label className="text-2xs text-faint">
      <span className="mb-1 block font-medium uppercase tracking-wide">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink">
        {opciones.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

function TabBtn({ children, activo, onClick }: { children: React.ReactNode; activo: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${activo ? "bg-action text-white" : "text-muted hover:text-ink"}`}>
      {children}
    </button>
  );
}

function TablaSimple({ cols, filas, alinearDesde = 99 }: { cols: string[]; filas: React.ReactNode[][]; alinearDesde?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-line">
            {cols.map((c, i) => (
              <th key={c} className={`px-4 py-2.5 text-2xs font-medium uppercase tracking-wide text-faint ${i >= alinearDesde ? "text-right" : ""}`}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 ? (
            <tr><td colSpan={cols.length} className="px-4 py-6 text-center text-sm text-faint">Sin datos.</td></tr>
          ) : (
            filas.map((f, i) => (
              <tr key={i} className="border-b border-line last:border-0 hover:bg-ink/5">
                {f.map((c, j) => (
                  <td key={j} className={`px-4 py-2 align-middle ${j >= alinearDesde ? "text-right" : ""}`}>{c}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
