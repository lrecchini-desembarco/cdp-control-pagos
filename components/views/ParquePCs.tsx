"use client";

import { Fragment, useMemo, useState } from "react";
import { Card, inputClass, Button, EmptyState } from "@/components/ui/primitives";
import { descargarCSV } from "@/lib/exportar-csv";
import { ESTADOS_PC, FLAGS_PC, estadoPC, flagPC, toneCls } from "@/lib/parque";

export interface EquipoPC {
  id: string;
  nro: number;
  usuario: string;
  area: string;
  tipo: string;
  hostname: string;
  marca: string;
  modelo: string;
  cpu: string;
  ram: string;
  almacenamiento: string;
  gpu: string;
  so: string;
  correo: string;
  observaciones: string;
  ramGb: number;
  discoGb: number;
  flags: string[];
  estado: string;
  manual?: boolean;
  nota?: string;
  ip?: string;
}

// Campos que se pueden corregir a mano en un equipo cargado desde la UI. Los del
// relevamiento no se editan acá: se corrigen en el CSV y se vuelve a correr el seed.
const EDITABLES: { id: keyof EquipoPC; label: string }[] = [
  { id: "usuario", label: "Usuario" },
  { id: "area", label: "Área / local" },
  { id: "tipo", label: "Tipo" },
  { id: "hostname", label: "Hostname" },
  { id: "marca", label: "Marca" },
  { id: "modelo", label: "Modelo" },
  { id: "cpu", label: "CPU" },
  { id: "ram", label: "RAM" },
  { id: "almacenamiento", label: "Almacenamiento" },
  { id: "gpu", label: "GPU" },
  { id: "so", label: "SO" },
  { id: "correo", label: "Correo" },
];

type Campo = "nro" | "usuario" | "ip" | "area" | "tipo" | "equipo" | "ramGb" | "discoGb" | "estado";

const COLUMNAS: { id: Campo; label: string; num?: boolean }[] = [
  { id: "nro", label: "#", num: true },
  { id: "usuario", label: "Usuario" },
  { id: "ip", label: "IP" },
  { id: "area", label: "Área / local" },
  { id: "tipo", label: "Tipo" },
  { id: "equipo", label: "Marca y modelo" },
  { id: "ramGb", label: "RAM", num: true },
  { id: "discoGb", label: "Disco", num: true },
  { id: "estado", label: "Estado" },
];

const valorDe = (eq: EquipoPC, c: Campo): string | number =>
  c === "equipo" ? `${eq.marca} ${eq.modelo}`.trim() : (eq[c as keyof EquipoPC] as string | number) ?? "";

/**
 * Tabla del parque de computadoras. Se usa en dos pestañas con el mismo componente:
 *   inventario -> equipos en uso · faltantes -> a reemplazar / sin equipo.
 */
export default function ParquePCs({
  equipos,
  esAdmin,
  onEditar,
  onQuitar,
  vacio,
}: {
  equipos: EquipoPC[];
  esAdmin: boolean;
  onEditar: (id: string, patch: Record<string, string>) => void;
  onQuitar?: (eq: EquipoPC) => void;
  vacio: { title: string; desc: string };
}) {
  const [q, setQ] = useState("");
  const [fArea, setFArea] = useState("");
  const [fTipo, setFTipo] = useState("");
  const [fFlag, setFFlag] = useState("");
  const [orden, setOrden] = useState<{ campo: Campo; asc: boolean }>({ campo: "nro", asc: true });
  const [detalle, setDetalle] = useState<string | null>(null);

  const areas = useMemo(
    () => Array.from(new Set(equipos.map((e) => e.area).filter(Boolean))).sort(),
    [equipos]
  );
  const tipos = useMemo(
    () => Array.from(new Set(equipos.map((e) => e.tipo).filter(Boolean))).sort(),
    [equipos]
  );

  const filtrados = useMemo(() => {
    let l = equipos;
    if (fArea) l = l.filter((e) => e.area === fArea);
    if (fTipo) l = l.filter((e) => e.tipo === fTipo);
    if (fFlag) l = l.filter((e) => e.flags.includes(fFlag));
    const t = q.trim().toLowerCase();
    if (t) {
      l = l.filter((e) =>
        `${e.usuario} ${e.ip ?? ""} ${e.area} ${e.hostname} ${e.marca} ${e.modelo} ${e.cpu} ${e.correo} ${e.observaciones}`
          .toLowerCase()
          .includes(t)
      );
    }
    const { campo, asc } = orden;
    return [...l].sort((a, b) => {
      const va = valorDe(a, campo);
      const vb = valorDe(b, campo);
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "es");
      return asc ? cmp : -cmp;
    });
  }, [equipos, fArea, fTipo, fFlag, q, orden]);

  function ordenar(campo: Campo) {
    setOrden((o) => (o.campo === campo ? { campo, asc: !o.asc } : { campo, asc: true }));
  }

  function exportar() {
    descargarCSV(
      "parque-computadoras",
      ["#", "Usuario", "IP", "Área", "Tipo", "Hostname", "Marca", "Modelo", "CPU", "RAM", "Almacenamiento", "SO", "Correo", "Estado", "Flags", "Observaciones", "Nota"],
      filtrados.map((e) => [
        e.nro, e.usuario, e.ip ?? "", e.area, e.tipo, e.hostname, e.marca, e.modelo, e.cpu, e.ram, e.almacenamiento,
        e.so, e.correo, estadoPC(e.estado).label, e.flags.map((f) => flagPC(f).label).join(" · "), e.observaciones, e.nota ?? "",
      ])
    );
  }

  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-center gap-2 p-3">
        <select className={`${inputClass} max-w-[170px] py-1`} value={fArea} onChange={(e) => setFArea(e.target.value)}>
          <option value="">Toda el área / local</option>
          {areas.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select className={`${inputClass} max-w-[150px] py-1`} value={fTipo} onChange={(e) => setFTipo(e.target.value)}>
          <option value="">Todos los tipos</option>
          {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className={`${inputClass} max-w-[190px] py-1`} value={fFlag} onChange={(e) => setFFlag(e.target.value)}>
          <option value="">Todas las alertas</option>
          {FLAGS_PC.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
        <input className={`${inputClass} max-w-[220px] py-1`} placeholder="Buscar usuario, hostname, modelo…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="ml-auto text-2xs text-faint">{filtrados.length} equipos</span>
        <Button variant="outline" onClick={exportar} disabled={!filtrados.length}>⬇ Exportar</Button>
      </Card>

      {filtrados.length === 0 ? (
        <EmptyState title={equipos.length ? "Sin resultados" : vacio.title} desc={equipos.length ? "Probá aflojando los filtros." : vacio.desc} />
      ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-t border-action/28 border-b border-ink/10 font-mono text-[9.5px] uppercase tracking-[.16em] text-ink/40">
                  {COLUMNAS.map((c) => (
                    <th key={c.id} className={`px-3 py-2 font-medium ${c.num ? "text-right" : ""}`}>
                      <button onClick={() => ordenar(c.id)} className="inline-flex items-center gap-1 hover:text-action">
                        {c.label}
                        {orden.campo === c.id && <span>{orden.asc ? "▲" : "▼"}</span>}
                      </button>
                    </th>
                  ))}
                  <th className="px-3 py-2 font-medium">Alertas</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((e) => {
                  const es = estadoPC(e.estado);
                  const abierto = detalle === e.id;
                  return (
                    <Fragment key={e.id}>
                      <tr className="border-b border-ink/7 hover:bg-ink/[.035]">
                        <td className="px-3 py-2 text-right font-mono tnum text-2xs text-faint">{e.nro}</td>
                        <td className="px-3 py-2">
                          <p className="font-medium text-ink">{e.usuario || "—"}</p>
                          <p className="text-2xs text-faint">{e.hostname || "sin hostname"}</p>
                        </td>
                        <td className="px-3 py-2">
                          {esAdmin ? (
                            <input
                              defaultValue={e.ip ?? ""}
                              placeholder="192.168.1.—"
                              onBlur={(ev) => {
                                const v = ev.target.value.trim();
                                if (v !== (e.ip ?? "")) onEditar(e.id, { ip: v });
                              }}
                              className={`${inputClass} w-32 py-1 font-mono text-2xs`}
                            />
                          ) : (
                            <span className="font-mono text-2xs text-muted">{e.ip || "—"}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-2xs text-muted">{e.area || "—"}</td>
                        <td className="px-3 py-2 text-2xs text-muted">{e.tipo || "—"}</td>
                        <td className="px-3 py-2">
                          <p className="text-2xs text-ink">{[e.marca, e.modelo].filter(Boolean).join(" · ") || "—"}</p>
                          <p className="text-2xs text-faint">{e.cpu || "—"}</p>
                        </td>
                        <td className={`px-3 py-2 text-right font-mono tnum text-2xs ${e.flags.includes("ram-baja") ? "text-warn" : "text-muted"}`}>
                          {e.ramGb ? `${e.ramGb} GB` : "—"}
                        </td>
                        <td className={`px-3 py-2 text-right font-mono tnum text-2xs ${e.flags.includes("ssd-chico") ? "text-warn" : "text-muted"}`}>
                          {e.discoGb ? (e.discoGb >= 1024 ? `${(e.discoGb / 1024).toFixed(1)} TB` : `${e.discoGb} GB`) : "—"}
                        </td>
                        <td className="px-3 py-2">
                          {esAdmin ? (
                            <select
                              value={e.estado}
                              onChange={(ev) => onEditar(e.id, { estado: ev.target.value })}
                              className={`rounded border px-2.5 py-1 text-2xs font-medium ${toneCls(es.tone)}`}
                            >
                              {ESTADOS_PC.map((x) => <option key={x.id} value={x.id} className="bg-surface text-ink">{x.label}</option>)}
                            </select>
                          ) : (
                            <span className={`rounded border px-2.5 py-1 text-2xs font-medium ${toneCls(es.tone)}`}>{es.label}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {e.flags.map((f) => {
                              const fi = flagPC(f);
                              return (
                                <span key={f} title={fi.desc} className={`rounded border px-1.5 py-px text-[10px] font-medium ${toneCls(fi.tone)}`}>
                                  {fi.corto}
                                </span>
                              );
                            })}
                            {!e.flags.length && <span className="text-2xs text-faint">—</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button onClick={() => setDetalle(abierto ? null : e.id)} className="text-2xs font-medium text-muted hover:text-ink">
                            {abierto ? "Cerrar" : "Detalle"}
                          </button>
                        </td>
                      </tr>
                      {abierto && (
                        <tr className="border-b border-line/70 bg-ink/[0.02]">
                          <td colSpan={COLUMNAS.length + 2} className="px-4 py-3">
                            {e.manual && esAdmin ? (
                              // Cargado a mano: se corrige acá mismo (guarda al salir del campo).
                              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {EDITABLES.map((c) => (
                                  <label key={c.id} className="block">
                                    <span className="text-[10px] uppercase tracking-wide text-faint">{c.label}</span>
                                    <input
                                      defaultValue={String(e[c.id] ?? "")}
                                      onBlur={(ev) => { if (ev.target.value !== String(e[c.id] ?? "")) onEditar(e.id, { [c.id]: ev.target.value }); }}
                                      className={`${inputClass} py-1 text-2xs`}
                                    />
                                  </label>
                                ))}
                              </div>
                            ) : (
                              <div className="grid gap-x-6 gap-y-1 text-2xs text-muted sm:grid-cols-2 lg:grid-cols-3">
                                <p><span className="text-faint">Hostname:</span> {e.hostname || "—"}</p>
                                <p><span className="text-faint">CPU:</span> {e.cpu || "—"}</p>
                                <p><span className="text-faint">RAM:</span> {e.ram || "—"}</p>
                                <p><span className="text-faint">Almacenamiento:</span> {e.almacenamiento || "—"}</p>
                                <p><span className="text-faint">GPU:</span> {e.gpu || "—"}</p>
                                <p><span className="text-faint">SO:</span> {e.so || "—"}</p>
                                <p><span className="text-faint">Correo:</span> {e.correo || "—"}</p>
                              </div>
                            )}
                            {e.manual && esAdmin ? (
                              <label className="mt-3 block">
                                <span className="text-[10px] uppercase tracking-wide text-faint">Observaciones</span>
                                <input
                                  defaultValue={e.observaciones ?? ""}
                                  placeholder="Cuenta local, monitor, acta firmada…"
                                  onBlur={(ev) => { if (ev.target.value !== (e.observaciones ?? "")) onEditar(e.id, { observaciones: ev.target.value }); }}
                                  className={`${inputClass} py-1 text-2xs`}
                                />
                              </label>
                            ) : (
                              e.observaciones && <p className="mt-2 text-2xs text-muted"><span className="text-faint">Observaciones del relevamiento:</span> {e.observaciones}</p>
                            )}
                            {e.flags.length > 0 && (
                              <ul className="mt-2 space-y-0.5">
                                {e.flags.map((f) => (
                                  <li key={f} className="text-2xs text-muted">· <b className="font-medium text-ink">{flagPC(f).label}</b> — {flagPC(f).desc}</li>
                                ))}
                              </ul>
                            )}
                            {esAdmin && (
                              <input
                                defaultValue={e.nota ?? ""}
                                placeholder="Nota de sistemas (qué se decidió, a quién se le asigna…)"
                                onBlur={(ev) => { if (ev.target.value !== (e.nota ?? "")) onEditar(e.id, { nota: ev.target.value }); }}
                                className={`${inputClass} mt-3 max-w-xl py-1 text-2xs`}
                              />
                            )}
                            {!esAdmin && e.nota && <p className="mt-2 text-2xs text-muted"><span className="text-faint">Nota:</span> {e.nota}</p>}
                            {esAdmin && e.manual && onQuitar && (
                              <div className="mt-3 flex items-center gap-3">
                                <button onClick={() => onQuitar(e)} className="text-2xs font-medium text-bad hover:underline">Quitar equipo</button>
                                <span className="text-2xs text-faint">Cargado a mano · las alertas se recalculan solas al guardar.</span>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}
