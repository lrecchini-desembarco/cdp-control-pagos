# Informe · Datos de Tango en CDP · Control

> Auditoría de dónde vive cada dato, qué está actualizado, qué no, y qué falta conectar.
> Fecha del informe: **14-ago-2026**. Última sincronización con Tango al momento del informe: **14-ago-2026 10:50** (datos hasta el 13-ago).

---

## 1. Resumen ejecutivo

| Pantalla | ¿Datos reales? | ¿Actualizado? | Estado |
|---|---|---|---|
| Consumo (CMV) vs Ventas | ✅ Tango | ✅ Diario | **OK** |
| Cruce CDP vs ventas | ✅ Raven + Tango | ✅ Diario | ⚠️ Recetario incompleto distorsiona el desvío |
| Ventas por turno / Facturación / Precios / Actividad / Ticket y horarios | ✅ Tango | ✅ Diario | **OK** |
| Insumos (maestro de costos) | ⚠️ Excel manual | ❌ **130/149 con +45 días** | **Desconectado de Tango** |
| Precios y margen · Rentabilidad · Estimación | Derivados del maestro | ❌ Heredan costo viejo | Margen **sobreestimado** |
| Inventario IT | Carga manual | Manual | **OK** |

**Conclusión:** no hay pantallas "roscas". El problema real es **un maestro de costos manual desconectado de Tango**, que contamina todos los márgenes derivados.

---

## 2. Dónde está alojada la base de datos

Tres capas, según el tipo de dato:

### 2.1 Tango — origen real (servidor propio, oficina)
- **SQL Server** en `SRVTANGO` → `192.168.15.5:1433`, instancia `AXSQLEXPRESS`
- Base: **`CENTRAL_ESTADISTICA`** (Tango Restô consolidado)
- Está en la **LAN**: no accesible desde internet. Vercel no llega directo → existe un **bridge HTTP** en esa máquina + túnel Cloudflare, y un proceso que empuja los datos a la nube.
- Genera: ventas, consumo de insumos, cobros, horas, mozos, anulados, precios.

### 2.2 Postgres del grupo — lo que consultan los dashboards (nube)
- Proveedor: **Neon** (Postgres serverless), región **AWS sa-east-1 (São Paulo)**, TLS obligatorio
- Host: `ep-cold-mouse-acpsgwnm.sa-east-1.aws.neon.tech`
- Esquema **`cierres`**. Tablas relevantes:
  - `consumo_insumo_tango` — consumo por insumo × local × día, **con `costo_unitario` y `costo_total`** → es el **CMV real**
  - `venta_tango_articulo` — ventas por artículo × local × día (`monto` = $, **con IVA**)
  - `sucursal_tango` — catálogo `id → nombre, marca (D/T), es_propia`
  - `venta_tango_sync` — **registro de cada sincronización** (`sincronizado_en`) ← fuente del sello de actualización
- **Compartida** entre Cierres, bi-ventas y el tablero Consumo vs Ventas del CDP.
- Variable de entorno: `DATABASE_URL` (cargada en Vercel production + preview).

### 2.3 Vercel KV (Redis) — lo que se carga a mano en el dashboard
- Guarda: usuarios, roles, mapeos, **maestro de insumos**, recetas, listas de precios, inventario, contactos.
- En local (sin KV) cae a archivos en la carpeta `.data/` del proyecto.

> **Dato clave del informe:** el **maestro de insumos vive en KV (manual)** mientras el **costo real vive en Neon/Tango**. De ahí que estén desincronizados.

---

## 3. Sello de actualización real (implementado)

Antes no había forma de saber si lo que se veía estaba fresco. Ahora sí, con **fecha y hora reales** (no estimadas): salen de `cierres.venta_tango_sync.sincronizado_en`, que escribe el propio proceso de carga.

Se muestra así en pantalla:

```
🟢 Tango actualizado 14/08/2026, 10:50 a. m.  (hace 2 h · datos al 13/08/2026)
```

- Semáforo: 🟢 < 24 h · 🟠 24–48 h · 🔴 +48 h o sin registro
- Tooltip con el detalle: día de dato y cantidad de filas sincronizadas (5.236 filas de insumos en la última corrida)

**Aplicado en 8 pantallas:** Consumo vs Ventas · Cruce CDP vs ventas · Ventas por turno · CDP vs Ventas (local) · Actividad de ventas · Facturación · Precios · Ticket y horarios.

Implementación: `lib/consumo.ts → getEstadoSync()`, API `/api/consumo?q=sync`, componente `components/layout/ActualizadoTango.tsx`.

---

## 4. Insumos — el hallazgo principal

### Diagnóstico
**No está roto. Está desconectado.** La pantalla funciona bien (149 insumos, filtros, alta/edición, costo con impuestos, y ya avisaba "costo desactualizado").

El problema es el dato:

| Métrica | Valor |
|---|---|
| Insumos en el maestro | 149 |
| Con costo de **más de 45 días** | **130** |
| **Sin `codTango`** (sin vínculo a Tango) | **148 de 149** |
| Fechas de carga | mar–jul 2026 (mayoría **may-2026**) |
| Insumos con costo real y fresco **en Tango** | **200** (actualizado a diario) |

Es un maestro sembrado de un Excel (hoja INS_L1) y editable a mano. **No existe ninguna ruta de código que refresque el costo**, salvo edición manual insumo por insumo.

### Impacto de negocio
El maestro es la raíz de un árbol de cálculos:

```
Maestro de insumos (costo viejo)
  └─> recetas.ts · costearReceta()
        └─> listas.ts · margenDe()      -> Precios y margen
        └─> /rentabilidad               -> Margen por producto
        └─> estimacion.ts               -> Costo estimado de compras
```

Con inflación argentina, un costo de 3–5 meses puede estar **10–25 % por debajo del real**. Ejemplo concreto:

> Hamburguesa a **$8.000**, costo real de receta **$3.200** → CMV real **40 %**.
> Si el maestro subvalúa 15 % → costo mostrado **$2.720** → CMV mostrado **34 %**.
> **Margen sobreestimado en ~6 puntos.**

El sesgo es **sistemático y siempre optimista** — el peor tipo de error para decidir precios. Un producto al límite se ve sano; uno en pérdida puede figurar rentable.

**Nota de consistencia:** `/insumos`, `/listas` y `/estimacion` costean **con IVA**; `/compras` (Consumo vs Ventas) trabaja el CMV **neto**. Son bases distintas: no comparar cifras entre pantallas sin ajustar.

### Mitigación aplicada
Banner de advertencia en la pantalla: *"X de 149 insumos con costo desactualizado. Este maestro se carga a mano, no se sincroniza solo con Tango. No usar para decidir precios hasta actualizarlos."*

### Solución de fondo (pendiente, requiere aprobación)
**Overlay del costo real de Tango sobre el maestro**, en 4 pasos:

1. **Bootstrap de la llave:** match automático por descripción (maestro ↔ `consumo_insumo_tango.descripcion`) para *proponer* `codTango`, con confirmación humana **una sola vez**. Arrancar por los 20–30 insumos de mayor peso en costo (regla 80/20).
2. **Sync periódico:** job que por `codTango` traiga `costo_unitario` fresco de Tango y lo superponga sobre el maestro.
3. **⚠️ Guardrail de unidad (crítico y no opcional):** Tango tiene el costo **por kg/unidad**; el maestro, **por unidad de receta** (gramos). Hay que convertir con el `factor` que ya vive en el maestro. Si el costo nuevo diverge más de un umbral (ej. 300 %, señal de mismatch kg↔gramo), **no pisar y marcar para revisión**. Sin esto, una receta de "80 g" contra un costo "por kg" da un error de **1000×**.
4. **Lo que Tango no tiene queda manual:** packaging e insumos internos siguen editándose a mano; el resto pasa a "costo Tango (auto)" y el KPI de desactualizados se vacía solo.

Riesgo residual: el mismatch de unidad es el único que puede meter un error grande y silencioso.

---

## 5. Cruce CDP vs ventas

**Los datos son reales y frescos:** 1.021 líneas de la semana en curso, fuentes `live` (Raven para pedidos + Tango para ventas).

**El problema es el recetario (BOM) incompleto:** para comparar, la venta se traduce a insumo usando las recetas. Donde falta la receta, la venta no se traduce y la línea aparece como **sobre-pedido sin serlo**.

| Métrica (semana 08–14 ago) | Valor |
|---|---|
| Líneas | 1.021 |
| **Sin traducir** (sin receta) | **82 (8 %)** |
| Pedido al CDP (total) | 124.747 |
| Venta equivalente (total) | 66.790 |
| **Cobertura global** | **53,5 %** |

Ejemplo del síntoma: pidió **700** de un insumo, venta-equivalente **2**.

**Mitigación aplicada:** banner que cuantifica cuántas líneas no se pudieron traducir y aclara que **el desvío es del recetario incompleto, no de la operación**, con el puntero a Mapeos / Recetas.

**Solución de fondo:** completar el recetario producto→insumo. Es un proyecto aparte (mismo prerrequisito que habilita el detalle unidad-a-unidad en Consumo vs Ventas).

---

## 6. Consumo (CMV) vs Ventas — estado OK

Tablero construido sobre datos reales de Tango. Cifras del grupo (ventas **netas de IVA**):

| Mes 2026 | Ventas | CMV | Margen bruto | Foodcost |
|---|---|---|---|---|
| Junio | $4.506 M | $1.996 M | **55,7 %** | 44,3 % |
| Julio | $4.784 M | $2.002 M | **58,2 %** | 41,8 % |
| Agosto (parcial) | $814 M | $329 M | **59,6 %** | 40,4 % |

Correcciones ya aplicadas tras el QA de negocio:
- **IVA neteado (÷1,21):** verificado que `venta_tango_articulo.monto` viene con IVA, contra `vw_PreciosProducto` de Tango (donde `precio_neto = precio / 1,21`). Antes el margen se mostraba ~8 pts inflado.
- **Locales con carga incompleta** (foodcost implausible, ej. 10,9 %) se marcan "revisar carga" y quedan **fuera del ranking**, en vez de aparecer como el mejor local.
- **Umbral de variaciones relativo** al período/filtro (no fijo), para que sirva igual a nivel grupo o de un solo local.
- Detección de **cobertura despareja** ventas vs consumo.

---

## 7. Inventario IT

- Nueva solapa **Disponibles**: equipos sin asignar (PCs/notebooks listos para entregar) y lo que está **en reparación**.
- Nuevos estados: `disponible`, `en-reparacion`. Nuevos tipos: Celular, Tablet, Otro.
- Alta del **Motorola Moto G32** (en reparación) con su ficha técnica completa.

> Nota de mantenimiento: el seed del parque lo regenera `scripts/seed-inventario-pcs.mjs` desde el CSV del relevamiento. Si se re-corre, hay que volver a agregar el celular.

---

## 8. Pendientes priorizados

### 🔴 Crítico
1. **Sync de costos reales de Tango → maestro de insumos** (con guardrail de unidad). Es *el* arreglo que resuelve el problema de fondo.
2. **Mapeo de `codTango`** (148 insumos sin vincular), arrancando por los de mayor peso en costo.

### 🟠 Importante
3. Unificar (o rotular claramente) la base de costo **neto vs con IVA** entre pantallas.
4. **Consumo por unidad vendida** en Consumo vs Ventas: separa "subió el CMV porque vendí más" de "subió por merma o precio". Barato y de alto valor.
5. **Umbral de foodcost por marca** (Mr Tasty corre estructuralmente más alto que Desembarco; un umbral único lo penaliza injustamente).

### 🟢 Deseable
6. **Completar el recetario (BOM)** → habilita el cruce confiable y el foodcost **teórico vs real** (que aísla merma y robo). Es la métrica de mayor retorno y el proyecto más grande.
7. **Alertas automáticas de desvío** por local (después de resolver 1 y 2, para evitar falsos positivos).
8. Botón "traer costo de Tango" por insumo, para sync puntual.

---

## 9. Riesgos de decidir con lo que se ve hoy

1. **Pricing con CMV subvaluado** → márgenes reales más flacos de lo que muestra el panel.
2. **Discontinuar el producto equivocado**: un ítem que figura rentable puede estar en pérdida.
3. **Cifras contradictorias entre pantallas** (el mismo insumo cuesta distinto en Insumos que en Consumo vs Ventas) → pérdida de confianza en ambas.
4. **Presupuesto de compras subestimado** en Estimación (las *cantidades* son confiables; el *dinero* no).
5. **Leer el "todo rojo" del Cruce como real**, cuando parte es recetario faltante.

---

## 10. Referencias de código

| Qué | Dónde |
|---|---|
| Sello de actualización | `lib/consumo.ts → getEstadoSync()` · `components/layout/ActualizadoTango.tsx` · `/api/consumo?q=sync` |
| Conexión a Neon | `lib/consumo-db.ts` (pool `pg`, reusable para el sync) |
| Tablero Consumo vs Ventas | `lib/consumo.ts` · `components/views/ComprasView.tsx` · `/api/consumo` |
| Maestro de insumos | `lib/insumos.ts` · `lib/insumos-store.ts` · `lib/insumos-seed.json` |
| Consumidores del costo | `lib/recetas.ts` · `lib/listas.ts` · `lib/estimacion.ts` |
| Cruce | `lib/cruce.ts` · `components/views/CruceView.tsx` · `/api/cruce` |
| Bridge / push de Tango | `scripts/tango-bridge.mjs` · `scripts/tango-push.mjs` |
| Spec del tablero | `docs/superpowers/specs/2026-08-07-consumo-cmv-vs-ventas-design.md` |
