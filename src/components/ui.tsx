"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Íconos propios: trazo de 1.8 px, esquinas redondeadas, una sola familia visual.
const TRAZOS = {
  inicio: "M4 11.2 12 4l8 7.2V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z",
  agenda: "M5 6.5h14a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7.5a1 1 0 0 1 1-1zM4 10.5h16M8.5 4v4M15.5 4v4",
  resumen: "M5 20V12M12 20V5M19 20v-5",
  ajustes: "M4 7h9M17 7h3M4 17h3M11 17h9M15 4.5v5M9 14.5v5",
  mas: "M12 5v14M5 12h14",
  cerrar: "M6 6l12 12M18 6 6 18",
  volver: "M14.5 6 8.5 12l6 6",
  siguiente: "M9.5 6l6 6-6 6",
  check: "M5 12.5l4.5 4.5L19 7.5",
  clientes: "M9 11a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 9 11zM3.5 19.5c.4-3 2.6-4.7 5.5-4.7s5.1 1.7 5.5 4.7M16.5 5.2a3 3 0 0 1 0 5.6M18 14.9c1.6.5 2.6 1.9 2.9 4.1",
  servicios: "M6.2 7.4a2.4 2.4 0 1 0 0-.01M6.2 16.6a2.4 2.4 0 1 0 0-.01M8.1 8.9 19 18M8.1 15.1 19 6",
  equipo: "M12 12.5a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8zM5 20c.5-3.6 3.2-5.5 7-5.5s6.5 1.9 7 5.5",
  comisiones: "M7 17 17 7M8 9a1.5 1.5 0 1 0 0-.01M16 17a1.5 1.5 0 1 0 0-.01",
  horarios: "M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 8v4.2l2.8 1.8",
  modulos: "M5 5h6v6H5zM13 5h6v6h-6zM5 13h6v6H5zM16 13v6M13 16h6",
  metas: "M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM12 12h.01",
  apariencia: "M12 4a8 8 0 1 0 0 16c1.3 0 1.8-.9 1.5-1.8-.4-1.2.3-2.2 1.5-2.2H17a3 3 0 0 0 3-3A8 8 0 0 0 12 4zM8 11.5h.01M10.5 8h.01M14.5 8h.01",
  historial: "M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 5v3.5H8M12 8.5V12l2.5 1.5",
  salir: "M10 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h4M14.5 8.5 18 12l-3.5 3.5M18 12H9.5",
  editar: "M5 19l3.7-.8L19 8a1.9 1.9 0 0 0-2.7-2.7L6 15.6zM14.5 7l2.5 2.5",
  luna: "M19.5 14.2A7.6 7.6 0 0 1 9.8 4.5 7.6 7.6 0 1 0 19.5 14.2z",
  ojo: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 14.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6z",
  ojoTachado: "M4 4l16 16M9.9 5.8A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.6 3.4M6.3 7.6A15.7 15.7 0 0 0 2.5 12S6 18.5 12 18.5c1.5 0 2.8-.4 4-1M9.9 9.9a2.8 2.8 0 0 0 4.2 3.7",
  sol: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4",
} as const;

export type NombreIcono = keyof typeof TRAZOS;

export function Icono({ nombre, tam = 22, className }: { nombre: NombreIcono; tam?: number; className?: string }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d={TRAZOS[nombre]} />
    </svg>
  );
}

// Ventana que sube desde abajo (en celular) o se centra (en pantallas grandes).
export function Hoja({ titulo, onCerrar, children, ancho }: { titulo: string; onCerrar: () => void; children: ReactNode; ancho?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", tecla);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", tecla);
      previo?.focus?.();
    };
  }, [onCerrar]);

  return (
    <div className="fondo-hoja" onMouseDown={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={titulo} className="hoja outline-none" style={ancho ? { maxWidth: "40rem" } : undefined}>
        <div className="asa" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}

export function EncabezadoHoja({ titulo, detalle, onCerrar }: { titulo: string; detalle?: string; onCerrar: () => void }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="titulo text-2xl font-semibold">{titulo}</h2>
        {detalle && <p className="texto-suave text-sm">{detalle}</p>}
      </div>
      <button className="chip" style={{ width: 42, padding: 0, display: "grid", placeItems: "center" }} aria-label="Cerrar" onClick={onCerrar}>
        <Icono nombre="cerrar" tam={18} />
      </button>
    </div>
  );
}

export function Segmentado<T extends string>({ opciones, valor, onCambio, etiqueta }: {
  opciones: { valor: T; texto: string }[]; valor: T; onCambio: (v: T) => void; etiqueta: string;
}) {
  return (
    <div className="segmentado" role="group" aria-label={etiqueta}>
      {opciones.map((o) => (
        <button key={o.valor} aria-pressed={valor === o.valor} onClick={() => onCambio(o.valor)}>{o.texto}</button>
      ))}
    </div>
  );
}

export function Cargando({ filas = 2 }: { filas?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: filas }, (_, i) => <div key={i} className="esqueleto" style={{ height: i === 0 ? 150 : 96 }} />)}
    </div>
  );
}

export function Volver({ texto, onClick }: { texto: string; onClick: () => void }) {
  return (
    <button className="inline-flex items-center gap-1 self-start text-sm font-semibold texto-suave" onClick={onClick}>
      <Icono nombre="volver" tam={18} /> {texto}
    </button>
  );
}

// Campo de formulario con su etiqueta arriba: siempre apilado, nunca se superpone con el de al lado.
export function Campo({ etiqueta, ayuda, children }: { etiqueta: string; ayuda?: string; children: ReactNode }) {
  return (
    <label className="campo-grupo">
      <span className="campo-etiqueta">{etiqueta}</span>
      {children}
      {ayuda && <span className="texto-suave text-xs">{ayuda}</span>}
    </label>
  );
}

// Elección de una opción entre pocas, en botones que se acomodan solos.
export function Fichas<T extends string>({ opciones, valor, onCambio, etiqueta, columnas = 2 }: {
  opciones: { valor: T; texto: string; detalle?: string }[]; valor: T | null; onCambio: (v: T) => void; etiqueta: string; columnas?: 1 | 2 | 3;
}) {
  return (
    <div role="group" aria-label={etiqueta} className="fichas" data-cols={columnas}>
      {opciones.map((o) => (
        <button key={o.valor} type="button" className="opcion" aria-pressed={valor === o.valor} onClick={() => onCambio(o.valor)}>
          <span className="font-semibold">{o.texto}</span>
          {o.detalle && <span className="texto-suave text-xs">{o.detalle}</span>}
        </button>
      ))}
    </div>
  );
}

// Anillo de progreso (0 a 100).
export function Anillo({ pct, tam = 84, children }: { pct: number; tam?: number; children?: ReactNode }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const p = Math.min(100, Math.max(0, pct));
  return (
    <div style={{ position: "relative", width: tam, height: tam }} role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100}>
      <svg width={tam} height={tam} viewBox="0 0 80 80" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--linea)" strokeWidth="8" />
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--acento-vivo)" strokeWidth="8" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (c * p) / 100} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>{children}</div>
    </div>
  );
}

// Botón de acción principal de una pantalla (abre un modal).
export function BotonAccion({ texto, onClick, chico }: { texto: string; onClick: () => void; chico?: boolean }) {
  return (
    <button className={chico ? "boton-chico inline-flex items-center gap-1" : "boton inline-flex items-center justify-center gap-2"} onClick={onClick}>
      <Icono nombre="mas" tam={18} /> {texto}
    </button>
  );
}

// Pie de un modal: acciones alineadas y siempre visibles.
export function PieHoja({ children }: { children: ReactNode }) {
  return <div className="pie-hoja">{children}</div>;
}
