"use client";

import { Card } from "@/components/ui/primitives";

// Monta el generador de importación de Tango (public/tango-generador.html) en un
// iframe a pantalla casi completa. El tool es autocontenido (vanilla JS + parcheo
// quirúrgico del ZIP con deflate-raw); el iframe lo aísla del runtime de React.
export default function TangoView() {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Carga de artículos Tango masivos</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">
            Generá la planilla de importación de artículos promo y precios para Tango Delta. Elegí la empresa
            (Desembarco o Tasty), cargá las acciones y descargá el <b>.xlsx listo para importar</b>. El archivo
            se arma parcheando la plantilla real de Tango, sin regenerarla.
          </p>
        </div>
        <a href="/tango-generador.html" target="_blank" rel="noreferrer"
          className="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-muted hover:text-ink">Abrir en pestaña ↗</a>
      </div>
      <Card className="overflow-hidden p-0">
        <iframe
          src="/tango-generador.html"
          title="Generador de importación Tango"
          className="w-full"
          style={{ height: "calc(100vh - 190px)", minHeight: 560, border: 0, display: "block" }}
        />
      </Card>
    </div>
  );
}
