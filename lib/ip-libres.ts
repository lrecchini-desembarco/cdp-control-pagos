// IPs libres de la red: tipos compartidos entre la API y la pantalla. Config pura.
//
// El dato lo genera un servidor propio dentro de la empresa, que escanea la LAN
// todo el tiempo y publica cuáles IPs están libres. Esta app solo lo consulta
// (ver app/api/ip-libres/route.ts) — no escanea nada ella misma.

export interface IpLibre {
  ip: string;
  /** Red/VLAN a la que pertenece, si el servidor la manda (ej. "192.168.1.0/24"). */
  red?: string;
  /** Hace cuánto la vio libre por última vez el escaneo (lo manda el servidor). */
  vistoLibreEn?: string;
}
