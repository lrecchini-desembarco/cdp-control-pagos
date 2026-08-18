// IPs de la red (rollout de IPs fijas): config pura, usable en cliente y servidor.
//
// El dato NO lo escanea esta app ni ningún servidor propio: sistemas corre su
// propio script de escaneo y lo importa como CSV desde la pantalla. Después
// cada IP se tilda a mano como "en uso" o se deja libre — ver
// lib/ip-libres-store.ts y app/api/ip-libres/route.ts.

export interface IpEntry {
  id: string;
  ip: string;
  /** Red/VLAN, si el CSV la trae (columna "Red", "VLAN", "Subred"...). */
  red?: string;
  /** true = en uso (tildada a mano); false/undefined = libre. */
  usada: boolean;
  nota?: string;
  /** Última vez que el script la vio en un CSV importado (ISO). */
  vistaEn?: string;
  actualizado: string;
  actualizadoPor?: string;
}
