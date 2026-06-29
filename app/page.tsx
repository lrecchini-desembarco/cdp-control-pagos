import Link from "next/link";
import { SUCURSALES, PRODUCTO_MAP } from "@/lib/catalogo";
import { getCruce } from "@/lib/cruce";
import { detectarAlertas, resumenAlertas } from "@/lib/alertas";
import { getControlCatalogo } from "@/lib/catalogo-control";
import { fmtInt, fmtPct, severidad } from "@/lib/brands";
import { Card } from "@/components/ui/primitives";
import type { CruceRow, ResumenCatalogo } from "@/lib/types";

export const dynamic = "force-dynamic";

const CAT_VACIO: ResumenCatalogo = {
  articulos: 0,
  conProblemas: 0,
  porTipo: { "precio-cero": 0, "cross-brand": 0, "sin-marca": 0, "sin-venta": 0 },
};

export default async function Page() {
  let cruce: CruceRow[] = [];
  let fuenteError: string | null = null;
  try {
    cruce = await getCruce();
  } catch (e) {
    fuenteError = e instanceof Error ? e.message : "No se pudo leer la fuente de datos.";
  }
  const alertas = resumenAlertas(detectarAlertas(cruce));

  let catalogo: ResumenCatalogo = CAT_VACIO;
  try {
    catalogo = (await getControlCatalogo()).resumen;
  } catch {
    /* si la fuente de catálogo falla, la banda queda en 0 */
  }
  const catCriticos = catalogo.porTipo["precio-cero"];

  const ultimaFecha = cruce.map((r) => r.fecha).sort().reverse()[0] ?? "—";
  const hoy = cruce.filter((r) => r.fecha === ultimaFecha);
  const pedido = hoy.reduce((s, r) => s + r.pedidoCdp, 0);
  const venta = hoy.reduce((s, r) => s + r.ventaEquiv, 0);
  const neto = pedido ? (pedido - venta) / pedido : 0;
  const fuera = hoy.filter((r) => {
    const pct = r.pedidoCdp ? (r.pedidoCdp - r.ventaEquiv) / r.pedidoCdp : 0;
    return severidad(pct) !== "ok";
  }).length;
  const activas = SUCURSALES.filter((s) => s.activa).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink">Resumen</h1>
        <p className="mt-0.5 text-sm text-muted">Estado de la operación CDP al {ultimaFecha}.</p>
      </div>

      {fuenteError && (
        <Card className="border-bad/20 bg-bad/5 p-4">
          <p className="text-sm font-medium text-bad">No se pudo leer la fuente de datos</p>
          <p className="mt-1 text-xs text-muted">{fuenteError}</p>
          <p className="mt-1 text-2xs text-faint">
            Configurá las variables de entorno (Raven + Tango) o usá <span className="font-mono">DATA_SOURCE=mock</span> para desarrollo. Ver <span className="font-mono">README</span> / <span className="font-mono">docs/datos.md</span>.
          </p>
        </Card>
      )}

      {/* Banda de alertas: lo primero que tiene que ver el operador al entrar */}
      <Link href="/alertas">
        <Card
          className={`group flex items-center gap-3 p-4 transition-colors ${
            alertas.critica > 0
              ? "border-bad/30 bg-bad/5 hover:border-bad/50"
              : alertas.total > 0
              ? "border-warn/30 bg-warn/5 hover:border-warn/50"
              : "hover:border-action/40"
          }`}
        >
          <span
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-base font-bold ${
              alertas.critica > 0
                ? "bg-bad/15 text-bad"
                : alertas.total > 0
                ? "bg-warn/15 text-warn"
                : "bg-ok/15 text-ok"
            }`}
          >
            {alertas.total > 0 ? "!" : "✓"}
          </span>
          <div className="flex-1">
            <p className="font-display text-sm font-semibold text-ink">
              {alertas.total === 0
                ? "Sin alertas abiertas"
                : `${alertas.total} alerta${alertas.total === 1 ? "" : "s"} abiertas`}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {alertas.total === 0
                ? "El control está al día: ningún desvío ni punto ciego."
                : `${alertas.critica} críticas · ${alertas.alta} altas · ${alertas.media} medias`}
            </p>
          </div>
          <span className="text-sm font-medium text-muted group-hover:text-action">Ver alertas →</span>
        </Card>
      </Link>

      {/* Banda de catálogo: estado de la calidad de datos de Tango */}
      <Link href="/catalogo">
        <Card
          className={`group flex items-center gap-3 p-4 transition-colors ${
            catCriticos > 0
              ? "border-bad/30 bg-bad/5 hover:border-bad/50"
              : catalogo.conProblemas > 0
              ? "border-warn/30 bg-warn/5 hover:border-warn/50"
              : "hover:border-action/40"
          }`}
        >
          <span
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-base font-bold ${
              catCriticos > 0
                ? "bg-bad/15 text-bad"
                : catalogo.conProblemas > 0
                ? "bg-warn/15 text-warn"
                : "bg-ok/15 text-ok"
            }`}
          >
            {catalogo.conProblemas > 0 ? "▤" : "✓"}
          </span>
          <div className="flex-1">
            <p className="font-display text-sm font-semibold text-ink">
              {catalogo.conProblemas === 0
                ? "Catálogo limpio"
                : `${catalogo.conProblemas} artículo${catalogo.conProblemas === 1 ? "" : "s"} a corregir`}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {catalogo.conProblemas === 0
                ? "Ningún artículo activo con precio $0, marca cruzada o sin clasificar."
                : `${catalogo.porTipo["precio-cero"]} en $0 · ${catalogo.porTipo["cross-brand"]} cross-brand · ${catalogo.porTipo["sin-marca"]} sin marca · ${catalogo.porTipo["sin-venta"]} a dar de baja`}
            </p>
          </div>
          <span className="text-sm font-medium text-muted group-hover:text-action">Ver catálogo →</span>
        </Card>
      </Link>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Pedido al CDP" value={fmtInt(pedido)} sub="último día" />
        <Stat label="Venta equivalente" value={fmtInt(venta)} sub="traducida a insumo" />
        <Stat label="Desvío neto" value={fmtPct(neto)} sub="pedido vs venta" tone={severidad(neto)} />
        <Stat
          label="Líneas a revisar"
          value={`${fuera} / ${hoy.length}`}
          sub="fuera de ±5%"
          tone={fuera === 0 ? "ok" : "warn"}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Access
          href="/cruce"
          title="Cruce CDP vs ventas"
          desc="Detectá sobre-pedido y faltantes por sucursal y producto."
        />
        <Access
          href="/raven"
          title="Consultar Raven"
          desc="Traé los pedidos de un producto para una fecha de entrega."
        />
        <Access
          href="/mapeos"
          title="Mapeos"
          desc={`${activas} sucursales activas · ${PRODUCTO_MAP.length} reglas de producto.`}
        />
        <Access
          href="/catalogo"
          title="Control de catálogo"
          desc="Precios en $0, marcas cruzadas y artículos a dar de baja."
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "ok" | "warn" | "bad";
}) {
  const color =
    tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : "text-ink";
  return (
    <Card className="p-4">
      <p className="text-2xs font-medium uppercase tracking-wide text-faint">{label}</p>
      <p className={`mt-1 font-display text-2xl font-semibold tnum ${color}`}>{value}</p>
      <p className="mt-0.5 text-2xs text-faint">{sub}</p>
    </Card>
  );
}

function Access({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link href={href}>
      <Card className="group p-4 transition-colors hover:border-action/40">
        <p className="font-display text-sm font-semibold text-ink group-hover:text-action">{title} →</p>
        <p className="mt-1 text-xs text-muted">{desc}</p>
      </Card>
    </Link>
  );
}
