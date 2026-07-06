"use client";

import { useEffect, useMemo, useState } from "react";
import { marcaAp, lf } from "@/lib/aperturas";

interface Item {
  id: string;
  nombre: string;
  marca: string;
  local: string;
  firma: string;
  actualizado: string;
}

const REFRESCO_MS = 15000; // se actualiza sola cada 15s

export default function CarteleraApertura() {
  const [items, setItems] = useState<Item[]>([]);
  const [hora, setHora] = useState("");

  async function cargar() {
    try {
      const j = await (await fetch("/api/aperturas", { cache: "no-store" })).json();
      if (j.ok) setItems(j.items);
      setHora(new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }));
    } catch {}
  }
  useEffect(() => {
    cargar();
    const t = setInterval(cargar, REFRESCO_MS);
    return () => clearInterval(t);
  }, []);

  const cols = useMemo(() => {
    const n = Math.min(4, Math.max(1, Math.ceil(items.length / 16)));
    const per = Math.ceil(items.length / n) || 1;
    return Array.from({ length: n }, (_, c) => items.slice(c * per, (c + 1) * per));
  }, [items]);

  const tot = useMemo(() => {
    const by = (m: string) => items.filter((i) => i.marca === m).length;
    return {
      total: items.length,
      tasty: by("tasty"),
      tastyMila: by("tasty-mila"),
      desembarco: by("desembarco"),
      mila: by("mila"),
      firmados: items.filter((i) => i.firma === "si").length,
      reservados: items.filter((i) => i.local === "reservado").length,
    };
  }, [items]);

  const Icono = ({ estado }: { estado: string }) => {
    const e = lf(estado);
    return <span style={{ color: e.color }} className="text-[1.1em] font-black leading-none">{e.icon}</span>;
  };

  return (
    <div className="flex min-h-screen flex-col bg-white text-[#181818]">
      {/* Banda superior */}
      <div className="h-2.5 w-full" style={{ background: "linear-gradient(90deg,#B5472E,#E0A024)" }} />

      {/* Marcas */}
      <div className="flex items-center justify-around px-10 py-4">
        <span className="font-display text-3xl font-extrabold tracking-tight" style={{ color: "#E0A024" }}>Mr. <span className="italic">Tasty</span></span>
        <span className="font-display text-3xl font-black tracking-tight text-[#181818]">EL DESEMBARCO</span>
        <span className="font-display text-3xl font-black leading-none" style={{ color: "#B5472E" }}>MILA <span className="text-xl align-middle">&</span> GO</span>
      </div>

      {/* Título */}
      <div className="bg-[#111] py-2 text-center">
        <h1 className="font-display text-xl font-bold uppercase tracking-[0.35em] text-white">Apertura de Locales</h1>
      </div>

      {/* Grilla */}
      <div className="flex flex-1 items-stretch gap-3 px-4 py-3">
        {cols.map((col, ci) => (
          <div key={ci} className="flex-1">
            {/* encabezado columna */}
            <div className="grid grid-cols-[1fr_2.2rem_2.2rem_5.5rem] items-center rounded-t bg-[#E0A024] px-2 py-1 text-2xs font-bold uppercase tracking-wide text-white">
              <span>Sucursal</span><span className="text-center">L</span><span className="text-center">F</span><span className="text-center">Marca</span>
            </div>
            <div>
              {col.map((it) => {
                const m = marcaAp(it.marca);
                return (
                  <div key={it.id} className="grid grid-cols-[1fr_2.2rem_2.2rem_5.5rem] items-center border-b border-white text-sm">
                    <span className="truncate px-2 py-[3px] font-semibold uppercase" style={{ backgroundColor: m.filaBg }}>{it.nombre}</span>
                    <span className="grid place-items-center bg-[#F3F0E9] py-[3px]"><Icono estado={it.local} /></span>
                    <span className="grid place-items-center bg-[#F3F0E9] py-[3px]"><Icono estado={it.firma} /></span>
                    <span className="truncate px-1 py-[3px] text-center text-2xs font-bold" style={{ backgroundColor: m.filaBg, color: m.color }}>{m.corto}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Totales */}
      <div className="flex items-stretch justify-center gap-6 px-6 py-3">
        <div className="rounded-xl border-2 border-[#E0A024] px-6 py-2 text-center">
          <p className="text-sm font-semibold">Mr. Tasty <b className="ml-2 text-lg">{tot.tasty}</b></p>
          <p className="text-sm font-semibold">Mr Tasty / Mila &amp; Go <b className="ml-2 text-lg">{tot.tastyMila}</b></p>
          {tot.desembarco > 0 && <p className="text-sm font-semibold">Desembarco <b className="ml-2 text-lg">{tot.desembarco}</b></p>}
        </div>
        <div className="grid place-items-center rounded-xl border-2 border-[#E0A024] px-8">
          <p className="font-display text-lg font-bold uppercase">Total Locales <b className="ml-3 text-3xl">{tot.total}</b></p>
        </div>
        <div className="rounded-xl border-2 border-[#E0A024] px-6 py-2 text-center">
          <p className="text-sm font-semibold">Locales Firmados <b className="ml-2 text-lg">{tot.firmados}</b></p>
          <p className="text-sm font-semibold">Locales Reservados <b className="ml-2 text-lg">{tot.reservados}</b></p>
        </div>
      </div>

      {/* Referencias */}
      <div className="flex items-center justify-center gap-6 bg-[#111] py-1.5 text-2xs font-medium text-white">
        <span style={{ color: "#2FA84F" }}>✓ <span className="text-white">Sí</span></span>
        <span style={{ color: "#D64541" }}>✗ <span className="text-white">No</span></span>
        <span style={{ color: "#E0A024" }}>! <span className="text-white">Reservado</span></span>
        <span className="ml-4 inline-flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-sm" style={{ background: "#F7DFA0" }} /> Mr. Tasty</span>
        <span className="inline-flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-sm" style={{ background: "#EFA6A2" }} /> Mr Tasty y Mila &amp; Go</span>
        <span className="inline-flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-sm" style={{ background: "#F6C39B" }} /> Desembarco</span>
        <span className="ml-4 text-white/50">● en vivo · {hora}</span>
      </div>
    </div>
  );
}
