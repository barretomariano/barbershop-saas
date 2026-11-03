// Última vez que el barbero miró la pantalla de Cobros (para el punto de "hay novedades"). Solo en este celular.
const clave = (negocio: string, usuario: string) => `cobros_visto:${negocio}:${usuario}`;

export function leerVisto(negocio: string, usuario: string): string | null {
  try { return localStorage.getItem(clave(negocio, usuario)); } catch { return null; }
}
export function marcarVisto(negocio: string, usuario: string): void {
  try { localStorage.setItem(clave(negocio, usuario), new Date().toISOString()); } catch { /* sin almacenamiento: el punto simplemente seguirá */ }
}
