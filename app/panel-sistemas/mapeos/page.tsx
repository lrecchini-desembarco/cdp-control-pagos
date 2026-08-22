import Link from "next/link";
import MapeosView from "@/components/views/MapeosView";

// Espejo de /mapeos (Operaciones también lo usa y sigue entrando por ahí): NO
// se toca MapeosView -- cambiarla acá afectaría esa ruta también. Solo se
// envuelve en la card punteada de "espejo" que pide el handoff de la consola.
export default function Page() {
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[23px] font-semibold tracking-[-.02em] text-[#ece9e2]">Mapeos</h1>
          <p className="mt-1 max-w-[640px] text-[12.5px] leading-[1.5] text-ink/55">
            El dueño de esta pantalla sigue siendo Operaciones — acá está el mismo contenido para no tener que
            salir de la consola.
          </p>
        </div>
        <Link
          href="/mapeos"
          target="_blank"
          className="shrink-0 rounded border border-ink/20 px-3 py-1.5 text-[12px] font-medium text-ink/70 transition-colors hover:border-action/60 hover:text-action"
        >
          Abrir en el CDP ↗
        </Link>
      </div>
      <div className="rounded border border-dashed border-ink/20 p-4">
        <MapeosView />
      </div>
    </div>
  );
}
