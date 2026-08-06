# Remitos vs Ventas

Pantalla `/remitos`: subís los **PDF de remitos** (lo entregado por el CDP) — o el CSV
consolidado — y audita la **cobertura contra las ventas de Tango** del mismo período:
qué sucursales recibieron mercadería pero **no registran ventas** (y viceversa).
Todo exportable a Sheets/Excel.

## Flujo (1 paso)
`/remitos` → *Elegir PDFs o CSV…* → seleccionás los PDF tal cual te llegan (multi-select).
- Se parsean **client-side** (pdfjs, igual criterio que `scripts/parsear-remitos.py`).
- Las cargas se **acumulan**: podés subir de a tandas, incluso con archivos repetidos —
  un remito ya cargado (mismo número) **no se duplica** (chip "N repetidas").
- **✕ Limpiar todo** resetea la pantalla para empezar otro período.
- Deriva el período (min/max fecha) y trae las ventas de Tango por sucursal.
- Muestra 3 vistas: **Cobertura (audit)**, **Por sucursal**, **Por insumo**, cada una
  con **⬇ Exportar (Sheets/Excel)**.

También sigue aceptando el CSV del script (`remitos_consolidado.csv`, columnas: fecha,
marca, sucursal, codigo, descripcion, cantidad, remito) — vía alternativa por consola:
```bash
pip install pypdf            # una vez
python scripts/parsear-remitos.py --desde 2026-06-16 --hasta 2026-06-30
```

## Qué audita
- **REMITO SIN VENTAS** 🔴 — recibió del CDP pero no registra ventas en Tango (revisar).
- **VENTAS SIN REMITO** 🟠 — vende pero no recibió del CDP en el período (franquicias del
  interior, se abastecen por otra vía).
- **OK** — tiene ambas.

El cruce es a nivel **sucursal**. La reconciliación unidad-a-unidad **insumo↔producto**
necesita la receta (BOM) producto→insumo (no disponible como dato real).

## Estructura
- `lib/remitos.ts` — parser de PDF (líneas por Y/X + regex de remito) y `mergeRemitos` (dedupe por nº).
- `scripts/parsear-remitos.py` — PDFs → CSV (vía alternativa por consola).
- `components/views/RemitosView.tsx` + `app/remitos/page.tsx` — pantalla (parsea PDF/CSV client-side).
- `app/api/ventas/sucursales` (`lib/ventas.ts` → `getVentasPorSucursal`) — ventas por sucursal (Tango).
- Nav: `Sidebar.tsx` + `lib/roles.ts` (admin y operaciones).
