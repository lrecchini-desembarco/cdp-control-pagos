# IPs libres (rollout de IPs fijas)

Sistemas está pasando los dispositivos a IP fija y necesita un checklist de qué
IP está libre y cuál ya está asignada. El escaneo de la red lo hace **un script
propio de sistemas** (no esta app): esta pantalla solo importa lo que ese script
encuentra y deja tildar a mano, IP por IP, si está en uso.

**Pantalla: Sistema → IPs libres** (solo admin).

## Formato del CSV

Una columna con la IP alcanza. Si el script también manda a qué red/VLAN
pertenece cada una, se toma sola. El importador tolera con o sin encabezado, y
varios nombres de columna habituales:

| Columna | Alias aceptados |
|---|---|
| IP (obligatoria) | `ip`, `direccion`, `direccion ip`, `ip address`, `address`, `host` |
| Red (opcional) | `red`, `vlan`, `subred`, `network`, `rango` |

Ejemplos válidos:
```
ip,red
192.168.1.50,192.168.1.0/24
192.168.1.62,192.168.1.0/24
```
```
192.168.1.50
192.168.1.62
192.168.1.80
```

También acepta `.xlsx`/`.xls` (mismo lector que usa Bancos).

## Cómo se importa

1. **Sistema → IPs libres → Importar archivo**, elegir el CSV.
2. Se previsualiza fila por fila (válida / repetida / no parece una IP) antes de
   mandar nada — el archivo se lee en el navegador, no se sube tal cual.
3. Al confirmar: las IPs nuevas entran como **libres**; las que ya estaban en la
   lista **no pierden** su tilde de "en uso" ni su nota — solo se actualiza que
   el script las volvió a ver. Así un re-escaneo no borra el trabajo manual ya
   hecho.

## Uso diario

Cada fila tiene un checkbox **En uso**. Sin tildar = libre para asignar. La
columna **Nota** es texto libre (a quién se le asignó, qué equipo, etc.) — para
el equipo en sí, la IP se anota en **Inventario**, en el campo IP de cada
equipo (ver `docs/inventario.md`).

## Implementación

- `lib/ip-libres.ts` — tipo `IpEntry`.
- `lib/ip-libres-import.ts` — parseo/validación del CSV (puro, corre en el
  navegador para la previsualización).
- `lib/ip-libres-store.ts` — persistencia (KV), import masivo sin pisar lo
  tildado a mano, edición puntual (`usada`/`nota`), baja.
- `app/api/ip-libres/route.ts` — API, solo admin.
