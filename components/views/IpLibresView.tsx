"use client";

// IPs de la red (rollout de IPs fijas). El escaneo lo hace un script propio de
// sistemas; esta pantalla solo importa su CSV y deja tildar a mano qué IP está
// en uso y cuál libre. Nada de esto lo escanea la app — ver lib/ip-libres.ts.

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, Button, EmptyState, Skeleton, inputClass } from "@/components/ui/primitives";
import { parsearIps, type FilaImportIp } from "@/lib/ip-libres-import";
import type { IpEntry } from "@/lib/ip-libres";

const fecha = (iso?: string) =>
  iso ? new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

type Filtro = "todas" | "libres" | "usadas";

export default function IpLibresView() {
  const [items, setItems] = useState<IpEntry[]>([]);
  const [estado, setEstado] = useState<"loading" | "ok" | "error">("loading");
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [msg, setMsg] = useState("");

  async function cargar() {
    setEstado("loading");
    try {
      const j = await (await fetch("/api/ip-libres")).json();
      if (!j.ok) throw new Error();
      setItems(j.items);
      setEstado("ok");
    } catch {
      setEstado("error");
    }
  }
  useEffect(() => {
    cargar();
  }, []);

  async function editar(id: string, patch: { usada?: boolean; nota?: string }) {
    setMsg("");
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    try {
      const j = await (
        await fetch("/api/ip-libres", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...patch }) })
      ).json();
      if (j.ok) setItems(j.items);
      else setMsg(j.error || "No se pudo guardar.");
    } catch {
      setMsg("Error de red.");
    }
  }

  async function quitar(ip: IpEntry) {
    if (!confirm(`¿Quitar ${ip.ip} de la lista?`)) return;
    const j = await (await fetch(`/api/ip-libres?id=${encodeURIComponent(ip.id)}`, { method: "DELETE" })).json();
    if (j.ok) setItems(j.items);
    else setMsg(j.error || "No se pudo quitar.");
  }

  const filtradas = useMemo(() => {
    let l = items;
    if (filtro === "libres") l = l.filter((x) => !x.usada);
    if (filtro === "usadas") l = l.filter((x) => x.usada);
    const t = q.trim().toLowerCase();
    if (t) l = l.filter((x) => `${x.ip} ${x.red ?? ""} ${x.nota ?? ""}`.toLowerCase().includes(t));
    return l;
  }, [items, filtro, q]);

  const libres = useMemo(() => items.filter((x) => !x.usada).length, [items]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink">IPs libres</h1>
        <p className="mt-0.5 max-w-2xl text-sm text-muted">
          Importá el CSV que genera el script de escaneo y tildá acá qué IP está en uso. La app no escanea nada:
          es solo el checklist para el rollout de IPs fijas.
        </p>
      </div>

      <ImportarCsv onImportado={(l, aviso) => { setItems(l); setMsg(aviso); }} />

      <Card className="flex flex-wrap items-center gap-3 p-3">
        <div className="flex gap-1">
          {([["todas", "Todas"], ["libres", "Libres"], ["usadas", "En uso"]] as [Filtro, string][]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFiltro(id)}
              className={`rounded-full border px-3 py-1 text-2xs font-medium ${
                filtro === id ? "border-action bg-action/10 text-action" : "border-line bg-surface text-muted hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <input className={`${inputClass} max-w-[220px] py-1`} placeholder="Buscar IP, red, nota…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="ml-auto text-2xs text-faint">
          {items.length} IPs · {libres} libres
        </span>
      </Card>

      {msg && (
        <Card className="flex items-start gap-3 border-action/30 bg-action/5 p-3">
          <p className="flex-1 text-2xs text-ink">{msg}</p>
          <button onClick={() => setMsg("")} className="shrink-0 text-2xs font-medium text-muted hover:text-ink">Cerrar</button>
        </Card>
      )}

      {estado === "loading" ? (
        <Card className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</Card>
      ) : estado === "error" ? (
        <Card className="p-4 text-sm text-bad">No se pudo cargar la lista.</Card>
      ) : filtradas.length === 0 ? (
        <EmptyState
          title={items.length ? "Sin resultados" : "Todavía no se importó ninguna IP"}
          desc={items.length ? "Probá con otro filtro o búsqueda." : "Importá el CSV del script de escaneo para arrancar."}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-surface">
                <tr className="border-b border-line text-2xs uppercase tracking-wide text-faint">
                  <th className="px-4 py-2 font-medium">En uso</th>
                  <th className="px-3 py-2 font-medium">IP</th>
                  <th className="px-3 py-2 font-medium">Red</th>
                  <th className="px-3 py-2 font-medium">Nota</th>
                  <th className="px-3 py-2 font-medium">Vista</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((x) => (
                  <tr key={x.id} className="border-b border-line/70 last:border-0 hover:bg-ink/[0.02]">
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        checked={x.usada}
                        onChange={(e) => editar(x.id, { usada: e.target.checked })}
                        className="h-4 w-4 accent-action"
                        aria-label={`${x.ip} en uso`}
                      />
                    </td>
                    <td className={`px-3 py-2 font-mono text-sm ${x.usada ? "text-muted" : "text-ink"}`}>{x.ip}</td>
                    <td className="px-3 py-2 text-2xs text-muted">
                      {x.red ? <span className="rounded-full border border-line bg-ink/5 px-2 py-0.5">{x.red}</span> : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        defaultValue={x.nota ?? ""}
                        placeholder="A quién se le asignó…"
                        onBlur={(ev) => { const v = ev.target.value; if (v !== (x.nota ?? "")) editar(x.id, { nota: v }); }}
                        className={`${inputClass} min-w-[180px] py-1 text-2xs`}
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-2xs text-faint">{fecha(x.vistaEn)}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => quitar(x)} className="text-2xs font-medium text-bad hover:underline">Quitar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

/** Carga masiva desde el CSV del script. Se parsea en el navegador antes de mandar nada. */
function ImportarCsv({ onImportado }: { onImportado: (items: IpEntry[], aviso: string) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [archivo, setArchivo] = useState("");
  const [filas, setFilas] = useState<FilaImportIp[]>([]);
  const [error, setError] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const limpiar = () => {
    setArchivo("");
    setFilas([]);
    setError("");
    if (input.current) input.current.value = "";
  };

  async function leer(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError("");
    setFilas([]);
    setArchivo(f.name);
    try {
      const { filasDeArchivo } = await import("@/lib/bancos");
      const r = parsearIps(filasDeArchivo(f.name, await f.arrayBuffer()));
      if (r.fatal) setError(r.fatal);
      setFilas(r.filas);
    } catch {
      setError("No pude leer el archivo. Tiene que ser .csv, .xlsx o .xls.");
    }
  }

  async function importar() {
    const validas = filas.filter((f) => f.valida);
    if (validas.length === 0) return;
    setSubiendo(true);
    setError("");
    try {
      const j = await (
        await fetch("/api/ip-libres", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filas: validas.map(({ ip, red }) => ({ ip, red })) }),
        })
      ).json();
      if (!j.ok) throw new Error(j.error);
      onImportado(j.items, `Importadas: ${j.nuevas} nuevas y ${j.actualizadas} ya estaban (se les actualizó "vista").`);
      limpiar();
      setAbierto(false);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "No se pudo importar.");
    } finally {
      setSubiendo(false);
    }
  }

  const validas = filas.filter((f) => f.valida).length;
  const invalidas = filas.length - validas;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-2xs font-medium uppercase tracking-wide text-faint">Importar CSV del escaneo</p>
        <button onClick={() => { setAbierto((v) => !v); if (abierto) limpiar(); }} className="text-2xs font-medium text-action hover:underline">
          {abierto ? "Cancelar" : "+ Importar archivo"}
        </button>
      </div>

      {abierto && (
        <div className="mt-3 space-y-3">
          <p className="text-2xs text-muted">
            Una columna con la IP alcanza (con o sin encabezado); si el script también manda la red/VLAN, se
            toma sola. Las IPs que ya estaban en la lista NO pierden su tilde de "en uso" ni su nota — solo se
            actualiza que se las volvió a ver.
          </p>
          <input
            ref={input}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={leer}
            className="text-2xs text-muted file:mr-3 file:rounded-lg file:border file:border-line file:bg-ink/5 file:px-3 file:py-1.5 file:text-2xs file:font-medium file:text-ink hover:file:bg-ink/10"
          />

          {archivo && !error && (
            <p className="text-2xs text-faint">
              {archivo} · <b className="font-medium text-ok">{validas} IPs válidas</b>
              {invalidas > 0 && <> · <b className="font-medium text-bad">{invalidas} con problemas</b></>}
            </p>
          )}
          {error && <p className="text-2xs text-bad">{error}</p>}

          {filas.length > 0 && (
            <div className="max-h-64 overflow-auto rounded-lg border border-line">
              <table className="w-full text-left text-2xs">
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-b border-line uppercase tracking-wide text-faint">
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">IP</th>
                    <th className="px-3 py-2 font-medium">Red</th>
                    <th className="px-3 py-2 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={f.fila} className={`border-b border-line/70 last:border-0 ${!f.valida ? "bg-bad/5" : ""}`}>
                      <td className="px-3 py-1.5 text-faint">{f.fila}</td>
                      <td className="px-3 py-1.5 font-mono text-ink">{f.ip || "—"}</td>
                      <td className="px-3 py-1.5 text-muted">{f.red || "—"}</td>
                      <td className="px-3 py-1.5">{f.valida ? <span className="text-ok">OK</span> : <span className="text-bad">{f.motivo}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {validas > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={importar} disabled={subiendo}>{subiendo ? "Importando…" : `Importar ${validas} IPs`}</Button>
              <button onClick={limpiar} className="text-2xs font-medium text-muted hover:text-ink">Descartar</button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
