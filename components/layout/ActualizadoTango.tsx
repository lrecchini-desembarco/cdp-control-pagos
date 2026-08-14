"use client";

import { useEffect, useState } from "react";

// Sello de actualización REAL de los datos de Tango: fecha y hora de la última
// sincronización (sale de cierres.venta_tango_sync, que escribe el proceso de carga)
// y hasta qué día llega el dato. Se pone en cualquier pantalla que dependa de Tango
// para que nadie tenga que adivinar si lo que ve está fresco.
//
// Verde: sincronizado hace < 24 h · Ámbar: 24-48 h · Rojo: > 48 h o sin datos.

interface Sync {
  ultimaSync: string | null;
  ultimoDato: string | null;
  filas: number | null;
  atrasoHoras: number | null;
}

const fmtFechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const fmtFecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });

export default function ActualizadoTango({ className = "" }: { className?: string }) {
  const [sync, setSync] = useState<Sync | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch("/api/consumo?q=sync")
      .then((r) => r.json())
      .then((j) => { if (vivo) { if (j.ok) setSync(j.sync); else setError(true); } })
      .catch(() => { if (vivo) setError(true); });
    return () => { vivo = false; };
  }, []);

  if (error) return <span className={`text-2xs text-bad ${className}`}>⚠ No pude leer el estado de actualización de Tango</span>;
  if (!sync) return <span className={`text-2xs text-faint ${className}`}>Consultando actualización…</span>;
  if (!sync.ultimaSync) return <span className={`text-2xs text-bad ${className}`}>⚠ Sin registro de sincronización con Tango</span>;

  const h = sync.atrasoHoras ?? 0;
  const tono = h < 24 ? "text-ok" : h < 48 ? "text-warn" : "text-bad";
  const punto = h < 24 ? "bg-ok" : h < 48 ? "bg-warn" : "bg-bad";
  const desfasaje = h < 1 ? "recién" : h < 24 ? `hace ${h} h` : `hace ${Math.floor(h / 24)} d`;

  return (
    <span className={`inline-flex items-center gap-1.5 text-2xs ${className}`}
      title={`Última sincronización con Tango: ${fmtFechaHora(sync.ultimaSync)}${sync.ultimoDato ? ` · datos hasta el ${fmtFecha(sync.ultimoDato)}` : ""}${sync.filas ? ` · ${sync.filas.toLocaleString("es-AR")} filas de insumos` : ""}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${punto} ${h < 24 ? "animate-pulse" : ""}`} />
      <span className="text-faint">Tango actualizado</span>
      <b className={`font-medium ${tono}`}>{fmtFechaHora(sync.ultimaSync)}</b>
      <span className="text-faint">({desfasaje}{sync.ultimoDato ? ` · datos al ${fmtFecha(sync.ultimoDato)}` : ""})</span>
    </span>
  );
}
