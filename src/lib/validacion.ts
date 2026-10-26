// Convierte lo que escribe la persona ("12.500", "$ 12500") en pesos enteros.
export function parsearMonto(texto: string): number | null {
  const soloDigitos = texto.replace(/\D/g, "");
  if (soloDigitos === "" || soloDigitos.length > 9) return null;
  const monto = Number(soloDigitos);
  return monto >= 1 && monto <= 100_000_000 ? monto : null;
}

// Porcentaje entero 0-100 -> puntos base (1% = 100). Devuelve null si no es válido.
export function porcentajeABps(texto: string): number | null {
  if (!/^\d{1,3}$/.test(texto.trim())) return null;
  const pct = Number(texto);
  return pct >= 0 && pct <= 100 ? pct * 100 : null;
}
