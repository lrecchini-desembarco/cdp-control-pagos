// Arma un informe imprimible (KPIs + rentabilidad mensual + top insumos + variaciones)
// y lo abre en una ventana nueva lista para "Guardar como PDF" / imprimir. Self-contained
// (HTML + CSS inline), sin dependencias — el PDF sale del diálogo de impresión del navegador.

interface ResumenMes { mes: string; ventas: number; unidades: number; cmv: number; margen: number; margenPct: number | null }
interface InsumoComp { codigo: string; descripcion: string; unidad: string; costoA: number; costoB: number; varCosto: number | null }
interface InsumoPer { codigo: string; descripcion: string; costo: number }

export interface DatosInforme {
  titulo: string;              // "Consumo (CMV) vs Ventas"
  subtitulo: string;           // filtros aplicados en texto
  mesA: string; mesB: string;  // etiquetas ya legibles (ej "jun 26")
  generado: string;            // fecha/hora legible
  resumen: ResumenMes[];
  topInsumos: InsumoPer[];     // más consumidos del período
  variaciones: InsumoComp[];   // mayores subas (ya ordenadas)
  mesLabel: (m: string) => string;
}

const money = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");
const int = (n: number) => Math.round(n).toLocaleString("es-AR");
const pct = (n: number | null) => (n == null ? "—" : n.toFixed(1).replace(".", ",") + " %");
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));

export function abrirInformePDF(d: DatosInforme): void {
  const rowB = d.resumen.find((r) => d.mesLabel(r.mes) === d.mesB) ?? d.resumen[d.resumen.length - 1];
  const kpis = rowB
    ? [
        ["Ventas", money(rowB.ventas)],
        ["CMV (consumo)", money(rowB.cmv)],
        ["Margen bruto", pct(rowB.margenPct)],
        ["Unidades", int(rowB.unidades)],
      ]
    : [];

  const filaResumen = (r: ResumenMes) => `
    <tr>
      <td>${esc(d.mesLabel(r.mes))}</td>
      <td class="n">${money(r.ventas)}</td>
      <td class="n">${money(r.cmv)}</td>
      <td class="n">${money(r.margen)}</td>
      <td class="n b">${pct(r.margenPct)}</td>
      <td class="n">${int(r.unidades)}</td>
    </tr>`;

  const filaInsumo = (i: InsumoPer) => `
    <tr><td>${esc(i.descripcion)} <span class="cod">${esc(i.codigo)}</span></td><td class="n">${money(i.costo)}</td></tr>`;

  const filaVar = (v: InsumoComp) => {
    const up = (v.varCosto ?? 0) > 0;
    const flecha = v.varCosto == null ? "nuevo" : `${up ? "▲" : "▼"} ${Math.abs(v.varCosto).toFixed(1).replace(".", ",")}%`;
    return `<tr><td>${esc(v.descripcion)}</td><td class="n">${money(v.costoA)}</td><td class="n">${money(v.costoB)}</td><td class="n ${up ? "bad" : "ok"}">${flecha}</td></tr>`;
  };

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${esc(d.titulo)} — ${esc(d.mesA)} vs ${esc(d.mesB)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 28px 32px; }
  .top { display: flex; align-items: center; gap: 12px; border-bottom: 2px solid #111; padding-bottom: 12px; }
  .logo { width: 34px; height: 34px; border-radius: 8px; background: #111; color: #fff; display: grid; place-items: center; font-weight: 700; font-size: 13px; }
  h1 { font-size: 17px; margin: 0; }
  .sub { color: #666; font-size: 11px; margin-top: 2px; }
  .kpis { display: flex; gap: 10px; margin: 18px 0; }
  .kpi { flex: 1; border: 1px solid #ddd; border-radius: 8px; padding: 10px 12px; }
  .kpi .l { font-size: 9px; text-transform: uppercase; letter-spacing: .04em; color: #888; }
  .kpi .v { font-size: 17px; font-weight: 700; margin-top: 3px; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #444; margin: 20px 0 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #eee; }
  th { font-size: 9px; text-transform: uppercase; letter-spacing: .03em; color: #888; }
  td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
  td.b { font-weight: 700; }
  td.ok { color: #0a7d33; font-weight: 600; }
  td.bad { color: #c0392b; font-weight: 600; }
  .cod { color: #aaa; font-size: 9px; }
  .cols { display: flex; gap: 24px; }
  .cols > div { flex: 1; }
  .foot { margin-top: 22px; border-top: 1px solid #eee; padding-top: 8px; font-size: 9px; color: #999; }
  @media print { body { padding: 0; } @page { margin: 14mm; } }
</style></head><body>
  <div class="top">
    <div class="logo">DS</div>
    <div>
      <h1>${esc(d.titulo)}</h1>
      <div class="sub">${esc(d.subtitulo)} · comparación ${esc(d.mesA)} vs ${esc(d.mesB)}</div>
    </div>
  </div>

  <div class="kpis">
    ${kpis.map(([l, v]) => `<div class="kpi"><div class="l">${l} · ${esc(d.mesB)}</div><div class="v">${v}</div></div>`).join("")}
  </div>

  <h2>Rentabilidad por mes</h2>
  <table>
    <thead><tr><th>Mes</th><th class="n">Ventas</th><th class="n">CMV</th><th class="n">Margen $</th><th class="n">Margen %</th><th class="n">Unidades</th></tr></thead>
    <tbody>${d.resumen.map(filaResumen).join("")}</tbody>
  </table>

  <div class="cols">
    <div>
      <h2>Más consumido (${esc(d.mesA)}–${esc(d.mesB)})</h2>
      <table><thead><tr><th>Insumo</th><th class="n">Costo</th></tr></thead>
        <tbody>${d.topInsumos.slice(0, 15).map(filaInsumo).join("")}</tbody></table>
    </div>
    <div>
      <h2>Mayores variaciones (${esc(d.mesA)}→${esc(d.mesB)})</h2>
      <table><thead><tr><th>Insumo</th><th class="n">${esc(d.mesA)}</th><th class="n">${esc(d.mesB)}</th><th class="n">Var.</th></tr></thead>
        <tbody>${d.variaciones.slice(0, 15).map(filaVar).join("")}</tbody></table>
    </div>
  </div>

  <div class="foot">Generado ${esc(d.generado)} · CDP · Control — DS Group · Fuente: consumo de insumos valorizado y ventas de Tango. Margen bruto = (Ventas − CMV) / Ventas: <b>no</b> descuenta regalías, alquileres ni mano de obra, y las ventas se toman como las registra Tango (a confirmar si incluyen IVA — de ser así el margen quedaría sobreestimado ~8 pts respecto del food cost neto).</div>
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 300); };</script>
</body></html>`;

  const w = window.open("", "_blank", "width=900,height=1200");
  if (!w) { alert("El navegador bloqueó la ventana del informe. Habilitá los pop-ups para descargarlo."); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
