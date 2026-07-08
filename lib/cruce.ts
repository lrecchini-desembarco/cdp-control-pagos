import { recentDates, unidadDe, nombreInsumo, brandDeInsumo } from "./catalogo";
import { getMapeos } from "./mapeos-store";
import { getRecetas } from "./recetas-store";
import { productoMapDesdeRecetas } from "./recetas";
import { getSources } from "./sources";
import { armarClaveSuc } from "./sucursal-key";
import type { MapeosData } from "./mapeos-store";
import type { PedidoCdp, VentaSku, RangoQuery } from "./sources/types";
import type { CruceComponente, CruceRow } from "./types";

/**
 * Combina pedidos (Raven) y ventas (Tango) en las filas del cruce. Función PURA:
 * misma entrada, misma salida. La venta equivalente se arma sumando, por insumo,
 * cada SKU vendido x su factor (el desglose que después explica el detalle).
 * Usa los mapeos efectivos (defaults + lo guardado en la pantalla Mapeos).
 * La reconciliación de nombres de sucursal vive en lib/sucursal-key (compartida
 * con Remitos y Compras para no divergir).
 */
export function construirCruce(pedidos: PedidoCdp[], ventas: VentaSku[], mapeos: MapeosData): CruceRow[] {
  const reglasPorSku = new Map(mapeos.productoMap.map((m) => [m.skuVenta, m]));
  // Nombre "lindo" por sucursal normalizada (para mostrar). Gana el de ventas (Tango).
  const nombrePorSuc = new Map<string, string>();
  // Clave de sucursal consciente de gemelos El Desembarco (no fusiona marcas distintas).
  const normSuc = armarClaveSuc([
    ...ventas.map((v) => v.sucursalCanonico),
    ...pedidos.map((p) => p.sucursalCanonico),
  ]);

  // 1) Acumular componentes de venta por (fecha, sucursalNorm, insumo)
  const comps = new Map<string, Map<string, CruceComponente>>();
  for (const v of ventas) {
    const regla = reglasPorSku.get(v.sku);
    if (!regla) continue; // SKU sin receta -> no aporta (se reporta como punto ciego)
    const suc = normSuc(v.sucursalCanonico);
    if (!nombrePorSuc.has(suc)) nombrePorSuc.set(suc, v.sucursalCanonico);
    const key = `${v.fecha}::${suc}::${regla.codigoCdp}`;
    const porSku = comps.get(key) ?? new Map<string, CruceComponente>();
    const prev = porSku.get(v.sku);
    const vendidas = (prev?.vendidas ?? 0) + v.unidades;
    porSku.set(v.sku, {
      sku: v.sku,
      nombre: regla.skuNombre,
      vendidas,
      factor: regla.factor,
      subtotal: vendidas * regla.factor,
    });
    comps.set(key, porSku);
  }

  // 2) Acumular pedidos por (fecha, sucursalNorm, insumo)
  const ped = new Map<string, number>();
  for (const p of pedidos) {
    const suc = normSuc(p.sucursalCanonico);
    if (!nombrePorSuc.has(suc)) nombrePorSuc.set(suc, p.sucursalCanonico);
    const key = `${p.fecha}::${suc}::${p.codigoCdp}`;
    ped.set(key, (ped.get(key) ?? 0) + p.unidades);
  }

  // 3) Unión de claves: una línea aparece si tuvo pedido O venta
  const claves = new Set<string>([...Array.from(ped.keys()), ...Array.from(comps.keys())]);
  const rows: CruceRow[] = [];
  Array.from(claves).forEach((key) => {
    const [fecha, sucNorm, codigoCdp] = key.split("::");
    const componentes = Array.from((comps.get(key) ?? new Map()).values());
    const ventaEquiv = componentes.reduce((a, c) => a + c.subtotal, 0);
    rows.push({
      fecha,
      brand: brandDeInsumo(codigoCdp),
      sucursal: nombrePorSuc.get(sucNorm) ?? sucNorm,
      codigoCdp,
      producto: nombreInsumo(codigoCdp),
      pedidoCdp: ped.get(key) ?? 0,
      ventaEquiv,
      unidad: unidadDe(codigoCdp),
      componentes,
    });
  });

  // Orden estable: fecha desc, luego sucursal, luego producto
  rows.sort(
    (a, b) =>
      b.fecha.localeCompare(a.fecha) ||
      a.sucursal.localeCompare(b.sucursal) ||
      a.producto.localeCompare(b.producto)
  );
  return rows;
}

/** Rango por defecto: últimos 7 días (incluye hoy). */
export function rangoPorDefecto(): RangoQuery {
  const fechas = recentDates(7);
  return { desde: fechas[fechas.length - 1], hasta: fechas[0] };
}

/**
 * Orquestador: trae pedidos y ventas de las fuentes configuradas (Raven + Tango,
 * o mock) y devuelve el cruce ya armado. Se usa desde las API routes y el server.
 */
export async function getCruce(q: RangoQuery = rangoPorDefecto()): Promise<CruceRow[]> {
  const { pedidos, ventas } = getSources();
  const [p, v, mapeos, recetas] = await Promise.all([
    pedidos.getPedidos(q), ventas.getVentas(q), getMapeos(), getRecetas(),
  ]);
  // El productoMap del cruce se deriva de las RECETAS (editable). Si por algún
  // motivo no hay recetas, cae al productoMap del maestro (defaults de catálogo).
  const derivado = productoMapDesdeRecetas(recetas);
  const productoMap = derivado.length ? derivado : mapeos.productoMap;
  return construirCruce(p, v, { ...mapeos, productoMap });
}
