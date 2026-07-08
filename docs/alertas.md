# Centro de Alertas

Monitoreo automático del control CDP ↔ ventas. El sistema recorre el cruce y los
mapeos, y saca a la superficie **todo lo que merece atención**, ordenado por
urgencia, con tres cosas en cada alerta:

1. **Qué pasa** — el hecho, con números.
2. **Por qué importa** — el impacto si no se actúa.
3. **Qué hacer** — un botón que lleva directo a la pantalla donde se resuelve.

El objetivo es detectar errores y situaciones de riesgo que hoy quedan invisibles
hasta que estallan (un faltante, una sucursal sin controlar, un insumo que nadie
cruza).

---

## Dónde se ve

- **`/alertas`** — el centro completo: KPIs por severidad, filtros por urgencia y
  por tipo, y la lista de tarjetas. Al pie, un desplegable "¿Cómo se calcula cada
  alerta?" documenta las reglas dentro de la propia app.
- **Sidebar** — la entrada *Alertas* muestra un contador rojo con la cantidad de
  alertas urgentes (críticas + altas).
- **Resumen (`/`)** — una banda arriba de todo resume el estado: verde si está al
  día, ámbar/rojo con el desglose si hay alertas abiertas.

## Severidades

| Nivel | Significado | Ejemplos |
|-------|-------------|----------|
| **Crítica** | Hay que actuar hoy | Quiebre fuerte (sub-pedido >25%), desvío crónico (≥5 días) |
| **Alta** | Revisar pronto | Quiebre (sub-pedido >15%), sobre-pedido fuerte, desvío recurrente, sucursal sin mapear |
| **Media** | Tener en agenda | Sobre-pedido moderado, insumo sin receta |

## Reglas de detección

Todas viven en `lib/alertas.ts` (`detectarAlertas()`), una función **pura**: mismas
entradas → mismas salidas. Los umbrales están centralizados arriba del archivo, así
ajustar la sensibilidad del sistema es cambiar un número.

| Tipo | Cuándo se dispara | Acción |
|------|-------------------|--------|
| **Quiebre** | Una sucursal vendió (en insumo equivalente) >15% por encima de lo que pidió al CDP en el último día. >25% = crítico. | Ver en el cruce |
| **Sobre-pedido** | Pidió >15% por encima de lo que explican sus ventas. >25% = alta. | Ver en el cruce |
| **Recurrente** | El mismo sucursal+insumo quedó fuera de ±15% en ≥3 de los últimos días (≥5 = crónico). | Revisar la regla del producto |
| **Punto ciego · sucursal** | Sucursal activa que Raven reporta pero sin código canónico: no entra al cruce. | Mapear sucursal |
| **Punto ciego · insumo** | Insumo que el CDP despacha pero sin receta cargada: no se puede contrastar contra ventas. | Cargar regla |

### Umbrales (en `lib/alertas.ts`)

```
TOL             = 0.15   // fuera de ±15% deja de ser tolerable
QUIEBRE_GRAVE   = 0.25   // sub-pedido >25% = crítico
SOBRE_GRAVE     = 0.25   // sobre-pedido >25% = alta
DIAS_RECURRENTE = 3      // repetirse N días lo vuelve patrón
DIAS_CRONICO    = 5      // repetirse N días lo vuelve crónico
```

## Cómo agregar una regla nueva

1. Sumá el caso a `AlertaTipo` en `lib/types.ts`.
2. Agregá un bloque en `detectarAlertas()` que haga `alertas.push({...})` con
   `titulo` / `detalle` / `porque` / `accion`.
3. Registrá su etiqueta en `TIPO` dentro de `components/views/AlertasView.tsx` y
   sumala al desplegable de documentación (`ComoFunciona`).

Cada alerta lleva un `id` estable (ej. `quiebre:Pilar:040022:2026-06-29`), pensado
para que más adelante se puedan **silenciar/snoozear** o deduplicar sin tocar la
lógica de detección.

## Origen de los datos

Las alertas se calculan en `/api/alertas` sobre el cruce real que arma
`getCruce()` (pedidos de **Raven** + ventas de **Tango**, ver [`datos.md`](datos.md)).
La detección (`detectarAlertas(cruce)`) es pura y no depende de la fuente: con
`DATA_SOURCE=mock` opera igual sobre datos de desarrollo.

## Próximos pasos

- **Notificación** por email (Google Workspace) al superar umbral, en vez de entrar a mirar.
- **Silenciar / snooze** de alertas resueltas (los `id` ya son estables).
- **Valorizar en $** para priorizar por plata expuesta.
- **Stock teórico acumulado** en vez de comparar día a día.
