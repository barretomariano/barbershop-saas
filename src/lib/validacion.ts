// Convierte lo que escribe la persona ("12.500", "$ 12500") en pesos enteros.
// El punto o la coma con 3 dígitos después son separadores de miles ("12.500", "1,500").
// Con 1 o 2 dígitos después serían centavos ("1500,50", "12.5"): la app trabaja en pesos
// enteros, así que se rechaza en vez de leerlo mal (antes "1.500,50" se leía como 150050).
// Un signo menos tampoco es válido.
export function parsearMonto(texto: string): number | null {
  if (texto.includes("-") || /[.,]\d{1,2}\s*$/.test(texto)) return null;
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

// Mensaje para mostrar bajo el campo cuando hay algo escrito pero no es un monto válido.
export function explicarMontoInvalido(texto: string): string | null {
  if (texto.trim() === "" || parsearMonto(texto) !== null) return null;
  return "Ingresá el monto en pesos enteros, sin centavos ni signos (ej. 12500).";
}
