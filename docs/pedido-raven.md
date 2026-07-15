# Pedido a Raven — datos del CDP para el dashboard (cta cte de franquicias)

Contexto: la cuenta corriente de franquicias (lo que cada franquiciado le debe al
grupo) ya está en el dashboard, alimentada por **Tango** (la plata, vencimientos,
cobrado). Lo que **Tango no tiene** y hoy se arma **a mano en el Excel** es la
**clasificación de cada factura por CONCEPTO** — y ese dato sale del **CDP (Raven)**.

En el Excel actual eso vive en la hoja **"Facturas"** (19.227 filas): un mapa
`comprobante → concepto`, que el Excel cruza (VLOOKUP) para poner la columna
*Detalle* de cada deuda. Distribución real de conceptos:

| Concepto | Facturas |
|---|---|
| **CDP** (mercadería del CDP central) | **18.202** |
| REGALIAS / REGALÍAS | 417 |
| TANGO / GESTIÓN DE APLICACIONES | 559 |
| MARKETING, ACUERDO COMERCIAL, VIAJES, otros | ~75 |

El **94% de las facturas son "CDP"** = mercadería que el CDP le facturó al
franquiciado. Ese es el dato de Raven.

---

## 1) Lo mínimo (desbloquea la clasificación en vivo)

Un listado de los **comprobantes que emite/gestiona el CDP**, con su concepto:

```
nro_comprobante   -> el N° de la factura (debe cruzar con el de Tango)
concepto          -> CDP / REGALIAS / MARKETING / etc.
```

Con esto, la deuda en vivo queda clasificada por concepto sola (hoy la columna
*Detalle* se arma a mano). Formato: CSV, API o acceso de lectura — lo que sea más
simple para Raven.

**Clave:** que el `nro_comprobante` de Raven **cruce con el N° de comprobante de
Tango** (mismo formato, ej. `A0001100005244`). Si Raven usa otro ID, necesitamos
también el N° de Tango asociado, o una tabla de equivalencia.

## 2) Lo ideal (habilita la conciliación CDP)

Para cruzar **lo facturado contra lo entregado** (Etapa 4 — detectar sobre/sub-
facturación del CDP a los franquiciados), el detalle de la mercadería CDP con grano:

```
nro_comprobante, fecha, franquiciado (o local/código), importe,
detalle de la entrega (remito/pedido asociado, ítems si están)
```

Esto permite: (a) validar que la línea "CDP" de la cta cte = lo que realmente se
entregó, y (b) linkear cada factura con su remito/pedido del CDP.

## 3) A confirmar con Raven

- ¿El N° de comprobante de Raven es el mismo que el de Tango, o hay dos numeraciones?
- ¿Raven identifica al franquiciado por código, por local, o por CUIT? (para cruzar
  con el maestro — que ya tiene código + CUIT + local + empresa).
- ¿Se puede exponer como export periódico (CSV/planilla) o hay API?

---

## Qué NO hace falta pedir (ya lo tenemos de Tango)

La plata, los vencimientos, el importe, el cobrado, el estado del comprobante y los
datos del cliente salen de **Tango** (conector ya construido, ver
`docs/sql/tango-franquicias.sql` y `docs/pedido-sistemas.md`). De Raven solo falta
**la clasificación por concepto** y, opcionalmente, **la trazabilidad de la
mercadería CDP** para conciliar.
