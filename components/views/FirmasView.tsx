"use client";

import { Card } from "@/components/ui/primitives";

// Generador de firmas (proyecto aparte, publicado en GitHub Pages). Se puede
// reapuntar con NEXT_PUBLIC_FIRMAS_URL sin tocar código.
const FIRMAS_URL =
  process.env.NEXT_PUBLIC_FIRMAS_URL ?? "https://lrecchini-desembarco.github.io/firmas-eldesembarco/";

export default function FirmasView() {
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Firmas de empleados</h1>
          <p className="mt-0.5 text-sm text-muted">
            Generá la firma de mail de cada empleado. Integrado acá para tener todo en un solo lugar.
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

      <Card className="flex-1 overflow-hidden p-0">
        <iframe
          src={FIRMAS_URL}
          title="Generador de firmas"
          className="h-[78vh] w-full border-0"
          loading="lazy"
        />
      </Card>
    </div>
  );
}
