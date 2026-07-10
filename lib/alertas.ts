import { PRODUCTS } from "./catalogo";
import { getCruce } from "./cruce";
import { getMapeos } from "./mapeos-store";
import { getRankingLocales } from "./actividad";
import { idsSilenciados } from "./silencios";
import { fmtInt, fmtPct } from "./brands";
import type { MapeosData } from "./mapeos-store";
import type { LocalActividad } from "./actividad";
import type { Alerta, CruceRow, ResumenAlertas, Severidad } from "./types";

// Umbrales del control. Centralizados acá para que ajustar la sensibilidad
// del sistema sea cambiar un número, no buscar condiciones repartidas.
const TOL = 0.15;          // fuera de ±15% deja de ser tolerable
const QUIEBRE_GRAVE = 0.25; // sub-pedido >25% = crítico
const SOBRE_GRAVE = 0.25;   // sobre-pedido >25% = alta
const DIAS_RECURRENTE = 3;  // repetirse N días lo vuelve patrón
const DIAS_CRONICO = 5;     // repetirse N días lo vuelve crónico

const PESO: Record<Severidad, number> = { critica: 3, alta: 2, media: 1, info: 0 };

const desvio = (r: CruceRow) =>
  r.pedidoCdp ? (r.pedidoCdp - r.ventaEquiv) / r.pedidoCdp : 0;

/**
 * Motor de alertas: recorre el cruce y los mapeos y devuelve todo lo que
 * merece atención, ordenado por urgencia. Cada regla está aislada y comentada
 * para que sumar o ajustar una sea local. Es una función pura: mismas entradas,
 * mismas salidas (clave para testear y, más adelante, para deduplicar/silenciar).
 */
export function detectarAlertas(cruce: CruceRow[], mapeos: MapeosData, sinMovimiento: LocalActividad[] = []): Alerta[] {
  const fechas = Array.from(new Set(cruce.map((r) => r.fecha))).sort().reverse();
  const ultima = fechas[0];
  const alertas: Alerta[] = [];

  // ── Regla 1 y 2 · Desvíos del último día ────────────────────────────────
  // Lo accionable "hoy": dónde hay que mover un pedido ya mismo.
  for (const r of cruce.filter((x) => x.fecha === ultima)) {
    const pct = desvio(r);

    if (pct <= -TOL) {
      // Pidió menos de lo que vendió -> se está quedando corto.
      const critica = pct <= -QUIEBRE_GRAVE;
      alertas.push({
        id: `quiebre:${r.sucursal}:${r.codigoCdp}:${r.fecha}`,
        tipo: "quiebre",
        severidad: critica ? "critica" : "alta",
        titulo: `Posible quiebre de ${r.producto} en ${r.sucursal}`,
        detalle: `Vendió el equivalente a ${fmtInt(r.ventaEquiv)} ${r.unidad} pero solo pidió ${fmtInt(
          r.pedidoCdp
        )} al CDP (${fmtPct(pct)}). Está consumiendo más de lo que repone.`,
        porque:
          "Si el ritmo de venta se sostiene, el local se queda sin insumo y pierde ventas. Es el desvío más urgente de corregir.",
        accion: {
          label: "Ver en el cruce",
          href: `/cruce?fecha=${r.fecha}&q=${encodeURIComponent(r.sucursal)}`,
        },
        sucursal: r.sucursal,
        brand: r.brand,
        codigoCdp: r.codigoCdp,
        fecha: r.fecha,
        metrica: fmtPct(pct),
      });
    } else if (pct >= TOL) {
      // Pidió más de lo que vendió -> exceso.
      const alta = pct >= SOBRE_GRAVE;
      alertas.push({
        id: `sobrepedido:${r.sucursal}:${r.codigoCdp}:${r.fecha}`,
        tipo: "sobrepedido",
        severidad: alta ? "alta" : "media",
        titulo: `Sobre-pedido de ${r.producto} en ${r.sucursal}`,
        detalle: `Pidió ${fmtInt(r.pedidoCdp)} ${r.unidad} al CDP pero las ventas solo explican ${fmtInt(
          r.ventaEquiv
        )} (${fmtPct(pct)}).`,
        porque:
          "Exceso de stock: inmoviliza capital y arriesga vencimientos o merma. Si se repite, puede esconder un faltante de control.",
        accion: {
          label: "Ver en el cruce",
          href: `/cruce?fecha=${r.fecha}&q=${encodeURIComponent(r.sucursal)}`,
        },
        sucursal: r.sucursal,
        brand: r.brand,
        codigoCdp: r.codigoCdp,
        fecha: r.fecha,
        metrica: fmtPct(pct),
      });
    }
  }

  // ── Regla 3 · Desvío recurrente ─────────────────────────────────────────
  // Lo que HOY no se puede ver: el mismo sucursal+insumo fuera de tolerancia
  // varios días. Un caso suelto es ruido; repetido es un problema sistemático.
  const grupos = new Map<string, { row: CruceRow; dias: number }>();
  for (const r of cruce) {
    if (Math.abs(desvio(r)) > TOL) {
      const k = `${r.sucursal}::${r.codigoCdp}`;
      const g = grupos.get(k);
      if (g) g.dias++;
      else grupos.set(k, { row: r, dias: 1 });
    }
  }
  Array.from(grupos.values()).forEach((g) => {
    if (g.dias >= DIAS_RECURRENTE) {
      const cronico = g.dias >= DIAS_CRONICO;
      alertas.push({
        id: `recurrente:${g.row.sucursal}::${g.row.codigoCdp}`,
        tipo: "recurrente",
        severidad: cronico ? "critica" : "alta",
        titulo: `Desvío recurrente: ${g.row.producto} en ${g.row.sucursal}`,
        detalle: `Quedó fuera de tolerancia ${g.dias} de los últimos ${fechas.length} días. No es un caso aislado.`,
        porque:
          "Un desvío puntual se corrige solo; uno que se repite indica un parámetro mal cargado, un cambio de carta no reflejado o una fuga constante.",
        accion: {
          label: "Revisar la regla del producto",
          href: `/mapeos?tab=prod&insumo=${g.row.codigoCdp}`,
        },
        sucursal: g.row.sucursal,
        brand: g.row.brand,
        codigoCdp: g.row.codigoCdp,
        metrica: `${g.dias}/${fechas.length} días`,
      });
    }
  });

  // ── Regla 4 · Sucursal activa sin mapear ────────────────────────────────
  // Punto ciego: vende y pide, pero al no tener código canónico no entra al
  // cruce. Hoy esto pasa desapercibido hasta que estalla un faltante grande.
  for (const s of mapeos.sucursales.filter((x) => x.activa && !x.canonico)) {
    alertas.push({
      id: `sucursal-sin-mapear:${s.ravenCode}`,
      tipo: "sucursal-sin-mapear",
      severidad: "alta",
      titulo: `${s.nombre} está activa pero sin mapear`,
      detalle: `Raven la reporta (cód. ${s.ravenCode}) pero no tiene código canónico, así que no entra al cruce. Vende y pide sin control.`,
      porque:
        "Cada día sin mapear es un día sin visibilidad sobre esa sucursal. Es el tipo de error silencioso que el control debería no dejar pasar.",
      accion: { label: "Mapear sucursal", href: "/mapeos" },
      brand: s.brand,
    });
  }

  // ── Regla 5 · Insumo del CDP sin receta ─────────────────────────────────
  // El CDP lo despacha, pero ninguna regla dice qué producto vendido lo
  // consume -> sus pedidos no se pueden contrastar contra ventas.
  for (const p of PRODUCTS) {
    if (!mapeos.productoMap.some((m) => m.codigoCdp === p.code)) {
      alertas.push({
        id: `insumo-sin-receta:${p.code}`,
        tipo: "insumo-sin-receta",
        severidad: "media",
        titulo: `${p.name} no tiene receta cargada`,
        detalle: `El CDP entrega este insumo (cód. ${p.code}) pero no hay ninguna regla que indique qué producto vendido lo consume.`,
        porque:
          "Sin receta, el insumo queda fuera del control: cualquier sobre-pedido o faltante sobre él es invisible.",
        accion: { label: "Cargar regla", href: "/mapeos?tab=prod" },
        brand: p.brand,
        codigoCdp: p.code,
      });
    }
  }

  // ── Regla 6 · Local sin movimiento ──────────────────────────────────────
  // Un local que dejó de registrar ventas en Tango mientras el resto vende. Es
  // el problema que arrancó todo esto (Mrt San Miguel): plata que se pierde sin
  // avisar. Se mide con ventas reales (independiente de que pedidos sea mock).
  for (const l of sinMovimiento) {
    const critica = l.diasDesde >= 5;
    alertas.push({
      id: `local-sin-movimiento:${l.sucursal}`,
      tipo: "local-sin-movimiento",
      severidad: critica ? "critica" : "alta",
      titulo: `${l.sucursal} sin ventas hace ${l.diasDesde} día${l.diasDesde === 1 ? "" : "s"}`,
      detalle: `No registra ventas desde el ${l.ultimaVenta} (hace ${l.diasDesde} días) mientras el resto de los locales está al día. Vendió ${fmtInt(l.unidades)} unidades en la ventana previa.`,
      porque:
        "Un local que dejó de vender es plata que se pierde y no avisa solo: puede ser un cierre no informado, un problema de caja/Tango, o el local realmente frenado. Es de lo más urgente de chequear.",
      accion: { label: "Ver actividad de locales", href: "/actividad" },
      sucursal: l.sucursal,
      brand: l.marca === "tasty" ? "tasty" : l.marca === "mila" ? "mila" : "desembarco",
      metrica: `hace ${l.diasDesde}d`,
    });
  }

  return alertas.sort((a, b) => PESO[b.severidad] - PESO[a.severidad]);
}

/** Conteo por severidad para badges y KPIs. */
export function resumenAlertas(alertas: Alerta[]): ResumenAlertas {
  const r: ResumenAlertas = { total: alertas.length, critica: 0, alta: 0, media: 0, info: 0 };
  for (const a of alertas) r[a.severidad]++;
  return r;
}

/**
 * Orquestador: trae el cruce, corre la detección sobre los mapeos efectivos y
 * aparta las alertas silenciadas (no cuentan ni notifican mientras estén vigentes).
 */
export async function getAlertas(): Promise<{
  alertas: Alerta[];
  silenciadas: Alerta[];
  resumen: ResumenAlertas;
}> {
  const [cruce, mapeos, ranking] = await Promise.all([getCruce(), getMapeos(), getRankingLocales().catch(() => null)]);
  const sinMov = (ranking?.locales ?? []).filter((l) => l.estado === "sin-movimiento");
  const todas = detectarAlertas(cruce, mapeos, sinMov);
  const silenciados = await idsSilenciados();
  const alertas = todas.filter((a) => !silenciados.has(a.id));
  const silenciadas = todas.filter((a) => silenciados.has(a.id));
  return { alertas, silenciadas, resumen: resumenAlertas(alertas) };
}
