"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, inputClass } from "@/components/ui/primitives";
import { descargarCSV } from "@/lib/exportar-csv";

interface Cliente {
  telefono: string;
  nombre: string;
  locales: string[];
  marcas: string[];
  rating: number | null;
  consent: boolean;
  cupones: number;
  canjes: number;
  primera: string;
  ultima: string;
}

const MARCA_LABEL: Record<string, string> = { desembarco: "El Desembarco", tasty: "Mr Tasty", mila: "Mila & Go" };
const fecha = (iso: string) => (iso ? iso.slice(0, 10) : "");
const diasDesde = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

export default function ClientesView() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  // filtros / segmentos
  const [q, setQ] = useState("");
  const [local, setLocal] = useState("");
  const [marca, setMarca] = useState("");
  const [ratingMin, setRatingMin] = useState(0);
  const [soloConsent, setSoloConsent] = useState(false);
  const [engagement, setEngagement] = useState<"" | "canjearon" | "sin-canjear">("");

  useEffect(() => {
    (async () => {
      try {
        const j = await (await fetch("/api/clientes")).json();
        if (j.ok) setClientes(j.clientes); else setError(j.error || "No se pudo cargar.");
      } catch { setError("Error de red."); } finally { setCargando(false); }
    })();
  }, []);

  const locales = useMemo(() => Array.from(new Set(clientes.flatMap((c) => c.locales))).sort(), [clientes]);
  const marcas = useMemo(() => Array.from(new Set(clientes.flatMap((c) => c.marcas))).sort(), [clientes]);

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    return clientes.filter((c) => {
      if (t && !c.nombre.toLowerCase().includes(t) && !c.telefono.includes(t)) return false;
      if (local && !c.locales.includes(local)) return false;
      if (marca && !c.marcas.includes(marca)) return false;
      if (ratingMin && (c.rating ?? 0) < ratingMin) return false;
      if (soloConsent && !c.consent) return false;
      if (engagement === "canjearon" && c.canjes === 0) return false;
      if (engagement === "sin-canjear" && c.canjes > 0) return false;
      return true;
    });
  }, [clientes, q, local, marca, ratingMin, soloConsent, engagement]);

  const kpis = useMemo(() => {
    const conConsent = filtrados.filter((c) => c.consent).length;
    const conRating = filtrados.filter((c) => c.rating != null);
    const ratingProm = conRating.length ? conRating.reduce((s, c) => s + (c.rating ?? 0), 0) / conRating.length : null;
    const canjes = filtrados.reduce((s, c) => s + c.canjes, 0);
    return { total: filtrados.length, conConsent, ratingProm, canjes };
  }, [filtrados]);

  function exportar() {
    descargarCSV(
      "clientes",
      ["Nombre", "Teléfono", "Locales", "Marcas", "Rating", "Consiente WhatsApp", "Cupones", "Canjes", "Primera visita", "Última visita"],
      filtrados.map((c) => [
        c.nombre, `+${c.telefono}`, c.locales.join(" / "), c.marcas.map((m) => MARCA_LABEL[m] ?? m).join(" / "),
        c.rating ?? "", c.consent ? "sí" : "no", c.cupones, c.canjes, fecha(c.primera), fecha(c.ultima),
      ])
    );
  }

  function whatsapp(c: Cliente) {
    const msg = `¡Hola ${c.nombre.split(" ")[0]}! Gracias por tu reseña 🙌 Te recordamos tu 15% OFF en tus próximas compras.`;
    window.open(`https://wa.me/${c.telefono}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Clientes</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">
            Base de clientes capturada en las reseñas. Segmentá por local, marca, calificación o consentimiento,
            exportá o escribiles por WhatsApp.
          </p>
        </div>
        <button onClick={exportar} disabled={!filtrados.length}
          className="shrink-0 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:border-action/40 hover:text-action disabled:opacity-40">
          ⬇ Exportar segmento ({filtrados.length})
        </button>
      </div>

      {error && <Card className="p-3 text-sm text-bad">{error}</Card>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Clientes (segmento)" value={String(kpis.total)} />
        <Kpi label="Aceptan WhatsApp" value={String(kpis.conConsent)} />
        <Kpi label="Rating promedio" value={kpis.ratingProm != null ? `${kpis.ratingProm.toFixed(1)} ★` : "—"} />
        <Kpi label="Canjes totales" value={String(kpis.canjes)} />
      </div>

      {/* Segmentos / filtros */}
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <input className={inputClass} placeholder="🔎 Nombre o teléfono" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className={inputClass} value={local} onChange={(e) => setLocal(e.target.value)}>
            <option value="">Todos los locales</option>
            {locales.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <select className={inputClass} value={marca} onChange={(e) => setMarca(e.target.value)}>
            <option value="">Todas las marcas</option>
            {marcas.map((m) => <option key={m} value={m}>{MARCA_LABEL[m] ?? m}</option>)}
          </select>
          <select className={inputClass} value={ratingMin} onChange={(e) => setRatingMin(Number(e.target.value))}>
            <option value={0}>Cualquier rating</option>
            <option value={5}>Solo 5 ★</option>
            <option value={4}>4 ★ o más</option>
            <option value={3}>3 ★ o más</option>
            <option value={1}>1–2 ★ (a recuperar)</option>
          </select>
          <select className={inputClass} value={engagement} onChange={(e) => setEngagement(e.target.value as any)}>
            <option value="">Canjeó o no</option>
            <option value="canjearon">Ya canjearon</option>
            <option value="sin-canjear">No canjearon</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={soloConsent} onChange={(e) => setSoloConsent(e.target.checked)} />
            Aceptan WhatsApp
          </label>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-2xs uppercase tracking-wide text-faint">
                <th className="px-4 py-2 font-medium">Cliente</th>
                <th className="px-4 py-2 font-medium">Locales</th>
                <th className="px-4 py-2 font-medium">Marca</th>
                <th className="px-4 py-2 text-center font-medium">Rating</th>
                <th className="px-4 py-2 text-center font-medium">Cupones</th>
                <th className="px-4 py-2 text-center font-medium">Canjes</th>
                <th className="px-4 py-2 font-medium">Última</th>
                <th className="px-4 py-2 font-medium">WhatsApp</th>
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr><td colSpan={8} className="px-4 py-6 text-center text-faint">Cargando…</td></tr>
              ) : filtrados.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-6 text-center text-faint">Sin clientes en este segmento.</td></tr>
              ) : filtrados.slice(0, 500).map((c) => (
                <tr key={c.telefono} className="border-b border-line last:border-0 hover:bg-ink/5">
                  <td className="px-4 py-2">
                    <div className="text-ink">{c.nombre}</div>
                    <div className="font-mono text-2xs text-faint">+{c.telefono}</div>
                  </td>
                  <td className="px-4 py-2 text-muted">{c.locales.join(", ")}</td>
                  <td className="px-4 py-2 text-2xs text-muted">{c.marcas.map((m) => MARCA_LABEL[m] ?? m).join(", ")}</td>
                  <td className="px-4 py-2 text-center">{c.rating != null ? <span className="text-ink">{c.rating} ★</span> : <span className="text-faint">—</span>}</td>
                  <td className="px-4 py-2 text-center font-mono text-muted">{c.cupones}</td>
                  <td className="px-4 py-2 text-center font-mono text-muted">{c.canjes}</td>
                  <td className="px-4 py-2 text-2xs text-faint">{fecha(c.ultima)}<div className="text-faint">hace {diasDesde(c.ultima)}d</div></td>
                  <td className="px-4 py-2">
                    <button onClick={() => whatsapp(c)} title={c.consent ? "Aceptó promos" : "No dio consentimiento explícito"}
                      className={`rounded-md px-2 py-1 text-2xs font-medium ${c.consent ? "bg-ok/10 text-ok hover:bg-ok/20" : "bg-ink/5 text-muted hover:bg-ink/10"}`}>
                      💬 Escribir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-2xs text-faint">
        WhatsApp abre <code className="rounded bg-paper px-1">wa.me</code> con el mensaje pre-armado (envío manual, gratis). Para
        campañas masivas/automáticas hace falta la API de WhatsApp Business (con opt-in y plantillas aprobadas).
        Escribile solo a quien <b>aceptó recibir promos</b> (chip verde).
      </p>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-3">
      <p className="text-2xs uppercase tracking-wide text-faint">{label}</p>
      <p className="mt-0.5 font-display text-lg font-semibold text-ink">{value}</p>
    </Card>
  );
}
