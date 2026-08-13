# Inventario de IT — parque, compras y faltantes

`/inventario`, en tres pestañas:

| Pestaña | Qué muestra | Dónde vive |
|---|---|---|
| **Inventario** | El parque de computadoras en uso, una fila por equipo/usuario | `lib/parque-seed.json` + overrides (`parque-overrides` en el store) |
| **Compras** | Equipos y recursos comprados o en proceso de alta, con la aprobación del Dueño | key `inventario` del store (el CRUD que ya existía) |
| **Faltantes** | Equipos marcados *A reemplazar* y puestos *Sin equipo* | mismo origen que Inventario, filtrado por estado |

Cada tabla filtra por área/local, tipo, alerta y texto libre, y ordena por cualquier columna.
El botón **Exportar** baja lo que estás viendo (respeta los filtros).

## Cargar el relevamiento

```bash
node scripts/seed-inventario-pcs.mjs "C:\ruta\inventario_pcs.csv"
```

Genera `lib/parque-seed.json` (hay que commitearlo). Columnas esperadas:

```
Nro,Usuario,Area,Tipo,Hostname,Marca,Modelo,CPU,RAM,Almacenamiento,GPU,SO,Correo,Observaciones
```

El parser tolera dos cosas del relevamiento real: comillas sin escapar en el medio del texto
(`Monitor 24"`) y comas dentro de Observaciones, que es la última columna.

## Agregar un equipo a mano

En la pestaña **Inventario**, el admin tiene **+ Agregar equipo**: se pide solo el usuario o
puesto; el resto (área, tipo, marca, modelo, CPU, RAM, disco, SO, correo, observaciones) es
opcional y se puede completar después desde **Detalle** de la fila, que para estos equipos son
campos editables. Las alertas se recalculan solas con lo que cargues.

Los cargados a mano se guardan en la key `parque-manual` del store, aparte del seed, y son los
únicos que se pueden **quitar** desde la UI (los del relevamiento se corrigen en el CSV y se
vuelve a correr el script).

## Alertas (flags)

Se derivan en cada lectura desde las specs — vale igual para el relevamiento y para lo cargado
a mano, porque la regla vive en un solo lugar (`flagsDe` en `lib/parque.ts`):

| Flag | Regla |
|---|---|
| RAM baja | 8 GB o menos |
| SSD chico | 128 GB o menos |
| Cuenta local | Observaciones dice "cuenta local" |
| Cuenta personal | sesión con cuenta personal (Gmail/Hotmail) en máquina de la empresa |
| Sin cuenta corporativa | falta el alta de `@eldesembarco.com` |
| SO sin soporte | Windows fuera de soporte |
| Candidato a reemplazo | marcado así en el relevamiento |
| Datos pendientes | falta marca, modelo o CPU |

Los umbrales (`RAM_BAJA`, `DISCO_CHICO`) están en `lib/parque.ts`. Cambiarlos ahí alcanza:
no hay que regenerar el seed, las alertas se recalculan en la próxima carga.

## Estado y overrides

El estado (`en-uso` / `reemplazar` / `sin-equipo`) es lo que decide en qué pestaña cae cada
equipo, y el admin lo cambia desde la tabla. Esas ediciones (estado y nota) se guardan **aparte**
del seed, como override por id: volver a correr el script con un relevamiento nuevo actualiza
las specs sin pisar lo que se decidió a mano.

Para descartar los overrides: borrar la key `parque-overrides` del store
(`.data/parque-overrides.json` en local, KV en producción).
