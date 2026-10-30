// Cabecera fija que se esconde al bajar, pero no enseguida: hay que bajar un buen tramo antes de que se vaya,
// y vuelve apenas se sube un poco. Lógica pura para poder probarla; el componente solo le pasa la posición.

export interface EstadoCabecera { oculta: boolean; ultimoY: number; acumulado: number }

export const INICIAL_CABECERA: EstadoCabecera = { oculta: false, ultimoY: 0, acumulado: 0 };

// Cuánto hay que bajar (en px, de corrido) antes de esconderla, y cuánto subir antes de mostrarla.
export const UMBRAL = { arriba: 24, abajo: 72, zonaSegura: 80 } as const;

export function siguienteCabecera(e: EstadoCabecera, y: number): EstadoCabecera {
  // El rebote de iOS puede dar posiciones negativas.
  const pos = Math.max(0, y);
  const delta = pos - e.ultimoY;
  if (delta === 0) return e;
  // Cerca del tope siempre se ve.
  if (pos <= UMBRAL.zonaSegura) return { oculta: false, ultimoY: pos, acumulado: 0 };
  // Si cambia la dirección, se empieza a contar de nuevo.
  const acumulado = Math.sign(delta) === Math.sign(e.acumulado) ? e.acumulado + delta : delta;
  if (!e.oculta && acumulado >= UMBRAL.abajo) return { oculta: true, ultimoY: pos, acumulado: 0 };
  if (e.oculta && acumulado <= -UMBRAL.arriba) return { oculta: false, ultimoY: pos, acumulado: 0 };
  return { oculta: e.oculta, ultimoY: pos, acumulado };
}
