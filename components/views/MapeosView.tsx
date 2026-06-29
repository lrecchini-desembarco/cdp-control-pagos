"use client";

import { useState } from "react";
import { SUCURSALES, PRODUCTO_MAP } from "@/lib/mock";
import { BRANDS, brandById } from "@/lib/brands";
import type { ProductoMap, Sucursal } from "@/lib/types";
import { Badge, Button, Card, inputClass } from "@/components/ui/primitives";

export default function MapeosView() {
  const [tab, setTab] = useState<"suc" | "prod">("suc");
  const [sucs, setSucs] = useState<Sucursal[]>(SUCURSALES);
  const [prods, setProds] = useState<ProductoMap[]>(PRODUCTO_MAP);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  const sinMapear = sucs.filter((s) => !s.canonico).length;

  function touch() {
    setDirty(true);
    setSaved(false);
  }
  function guardar() {
    // En esta etapa persiste en memoria; el backend se conecta más adelante.
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Mapeos</h1>
          <p className="mt-0.5 text-sm text-muted">
            Equivalencias que hacen posible el cruce: sucursales de Raven y descomposición de productos.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saved && <Badge tone="ok">Cambios guardados</Badge>}
          {dirty && <span className="text-2xs text-warn">Cambios sin guardar</span>}
          <Button onClick={guardar} disabled={!dirty}>
            Guardar cambios
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-line">
        <TabBtn active={tab === "suc"} onClick={() => setTab("suc")}>
          Sucursales
          {sinMapear > 0 && <Badge tone="warn">{sinMapear} sin mapear</Badge>}
        </TabBtn>
        <TabBtn active={tab === "prod"} onClick={() => setTab("prod")}>
          Productos · BOM
        </TabBtn>
      </div>

      {tab === "suc" && (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-2xs uppercase tracking-wide text-faint">
                <th className="px-4 py-2 font-medium">Cód. Raven</th>
                <th className="px-4 py-2 font-medium">Sucursal</th>
                <th className="px-4 py-2 font-medium">Marca</th>
                <th className="px-4 py-2 font-medium">Código canónico</th>
                <th className="px-4 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {sucs.map((s, i) => (
                <tr key={s.ravenCode} className="border-b border-line/70 last:border-0">
                  <td className="px-4 py-2 font-mono text-2xs text-muted">{s.ravenCode}</td>
                  <td className="px-4 py-2 text-ink">{s.nombre}</td>
                  <td className="px-4 py-2">
                    <span className="inline-flex items-center gap-2 text-muted">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: brandById(s.brand).color }}
                      />
                      {brandById(s.brand).name}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      className={`${inputClass} max-w-[140px] py-1 font-mono`}
                      value={s.canonico}
                      placeholder="—"
                      onChange={(e) => {
                        const v = e.target.value;
                        setSucs((p) => p.map((x, j) => (j === i ? { ...x, canonico: v } : x)));
                        touch();
                      }}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <button
                      className="inline-flex items-center gap-1.5 text-2xs"
                      onClick={() => {
                        setSucs((p) => p.map((x, j) => (j === i ? { ...x, activa: !x.activa } : x)));
                        touch();
                      }}
                    >
                      <span className={`h-2 w-2 rounded-full ${s.activa ? "bg-ok" : "bg-faint"}`} />
                      {s.activa ? "Activa" : "Inactiva"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {tab === "prod" && (
        <Card className="overflow-x-auto">
          <div className="border-b border-line px-4 py-2 text-2xs text-faint">
            Cada fila es un insumo del CDP que consume un producto vendido. El factor son las unidades de
            insumo por cada unidad vendida.
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-2xs uppercase tracking-wide text-faint">
                <th className="px-4 py-2 font-medium">Insumo CDP</th>
                <th className="px-4 py-2 font-medium">Producto de venta</th>
                <th className="px-4 py-2 font-medium">Factor</th>
                <th className="px-4 py-2 font-medium">Modo</th>
              </tr>
            </thead>
            <tbody>
              {prods.map((p, i) => (
                <tr key={i} className="border-b border-line/70 last:border-0">
                  <td className="px-4 py-2">
                    <span className="text-ink">{p.insumoNombre}</span>
                    <span className="ml-2 font-mono text-2xs text-faint">{p.codigoCdp}</span>
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-ink">{p.skuNombre}</span>
                    <span className="ml-2 font-mono text-2xs text-faint">{p.skuVenta}</span>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      className={`${inputClass} max-w-[90px] py-1 font-mono`}
                      value={p.factor}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setProds((pr) => pr.map((x, j) => (j === i ? { ...x, factor: v } : x)));
                        touch();
                      }}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={p.modo === "directo" ? "action" : "neutral"}>
                      {p.modo === "directo" ? "Directo" : "BOM"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function TabBtn({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm transition-colors ${
        active
          ? "border-action font-medium text-ink"
          : "border-transparent text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
