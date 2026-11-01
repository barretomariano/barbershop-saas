"use client";

import { useId, useState } from "react";
import { DIAS_CORTO, DIAS_LARGO, type Calor, type MesTira } from "@/lib/series";

// Gráficos propios en SVG/CSS, sin librerías. Todos usan solo variables de color de la marca:
// principal (--acento-vivo) para lo actual, secundario (--par) para la comparación.

type Pt = { x: number; y: number };

// Curva suave que pasa por todos los puntos (Catmull-Rom → Bézier), sin salirse del alto del gráfico.
function curva(p: Pt[], min: number, max: number): string {
  if (p.length === 0) return "";
  if (p.length === 1) return `M${p[0].x},${p[0].y}`;
  const c = (v: number) => Math.min(max, Math.max(min, v));
  let d = `M${p[0].x},${p[0].y}`;
  for (let i = 0; i < p.length - 1; i++) {
    const [a, b, c1, c2] = [p[i - 1] ?? p[i], p[i], p[i + 1], p[i + 2] ?? p[i + 1]];
    d += ` C${b.x + (c1.x - a.x) / 6},${c(b.y + (c1.y - a.y) / 6)} ${c1.x - (c2.x - b.x) / 6},${c(c1.y - (c2.y - b.y) / 6)} ${c1.x},${c1.y}`;
  }
  return d;
}

function indicesEje(n: number): number[] {
  const paso = n <= 12 ? 1 : Math.ceil(n / 6);
  return Array.from({ length: n }, (_, i) => i).filter((i) => i % paso === 0);
}

interface AreaProps {
  etiquetas: string[]; actual: (number | null)[]; previo: (number | null)[];
  formato: (n: number) => string; descripcion: string; etiquetaPrevio?: string;
}

// Línea y área del período actual contra el anterior (punteado). Tocá o arrastrá para ver el valor de cada punto.
export function GraficoArea({ etiquetas, actual, previo, formato, descripcion, etiquetaPrevio = "Antes" }: AreaProps) {
  const id = useId().replace(/:/g, "");
  const n = etiquetas.length;
  const ultimo = actual.reduce<number>((u, v, i) => (v !== null ? i : u), 0);
  const [elegido, setElegido] = useState<number | null>(null);
  const sel = Math.min(elegido ?? ultimo, n - 1);

  const [W, H, top, base] = [360, 170, 12, 4];
  const max = Math.max(1, ...actual.map((v) => v ?? 0), ...previo.map((v) => v ?? 0)) * 1.1;
  const x = (i: number) => 6 + (n <= 1 ? 0 : (i * (W - 12)) / (n - 1));
  const y = (v: number) => top + (1 - v / max) * (H - top - base);
  const ptsA = actual.flatMap((v, i) => (v === null ? [] : [{ x: x(i), y: y(v) }]));
  const ptsP = previo.flatMap((v, i) => (v === null ? [] : [{ x: x(i), y: y(v) }]));
  const lineaA = curva(ptsA, top, H - base);
  const area = ptsA.length > 1 ? `${lineaA} L${ptsA[ptsA.length - 1].x},${H} L${ptsA[0].x},${H} Z` : "";
  const vA = actual[sel], vP = previo[sel];
  const hayPrevio = previo.some((v) => v !== null);

  function mover(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left) / r.width) * (n - 1));
    setElegido(Math.min(n - 1, Math.max(0, i)));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2" aria-live="polite">
        {hayPrevio && <span className="burbuja burbuja-previa" title={etiquetaPrevio}>{vP === null || vP === undefined ? "—" : formato(vP)}</span>}
        <span className="burbuja burbuja-actual"><b>{vA === null || vA === undefined ? "—" : formato(vA)}</b></span>
        <span className="texto-suave text-xs">{etiquetas[sel]}{hayPrevio ? ` · ${etiquetaPrevio} / ahora` : ""}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="grafico w-full" style={{ touchAction: "pan-y", height: "auto" }} role="img" aria-label={descripcion}
        onPointerMove={mover} onPointerDown={mover}>
        <defs>
          <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--acento-vivo)" stopOpacity="0.65" />
            <stop offset="100%" stopColor="var(--acento-vivo)" stopOpacity="0.04" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1="0" x2={W} y1={top + f * (H - top - base)} y2={top + f * (H - top - base)} stroke="var(--linea)" strokeWidth="1" />)}
        {area && <path d={area} fill={`url(#g${id})`} />}
        {ptsP.length > 1 && <path d={curva(ptsP, top, H - base)} fill="none" stroke="var(--par)" strokeWidth="2" strokeDasharray="5 5" strokeLinecap="round" />}
        {ptsA.length > 1 && <path d={lineaA} fill="none" stroke="var(--acento-vivo)" strokeWidth="3" strokeLinecap="round" />}
        <line x1={x(sel)} x2={x(sel)} y1={top} y2={H} stroke="var(--suave)" strokeWidth="1" />
        {vP !== null && vP !== undefined && <circle cx={x(sel)} cy={y(vP)} r="4" fill="var(--fondo)" stroke="var(--par)" strokeWidth="2" />}
        {vA !== null && vA !== undefined && <circle cx={x(sel)} cy={y(vA)} r="5.5" fill="var(--fondo)" stroke="var(--acento-vivo)" strokeWidth="3" />}
      </svg>
      <div className="eje" role="group" aria-label="Elegir punto">
        {indicesEje(n).map((i) => (
          <button key={i} type="button" className="eje-etiqueta" aria-pressed={i === sel} onClick={() => setElegido(i)}>{etiquetas[i]}</button>
        ))}
      </div>
    </div>
  );
}

interface BarrasProps {
  etiquetas: string[]; a: (number | null)[]; b?: (number | null)[];
  nombreA: string; nombreB?: string; formato: (n: number) => string; descripcion: string;
}

// Barras por período; con dos series se agrupan (principal y secundario).
export function BarrasDobles({ etiquetas, a, b, nombreA, nombreB, formato, descripcion }: BarrasProps) {
  const n = etiquetas.length;
  const [elegido, setElegido] = useState<number | null>(null);
  const ultimo = a.reduce<number>((u, v, i) => (v !== null ? i : u), 0);
  const sel = Math.min(elegido ?? ultimo, n - 1);
  const [W, H, base] = [360, 150, 2];
  const max = Math.max(1, ...a.map((v) => v ?? 0), ...(b ?? []).map((v) => v ?? 0)) * 1.1;
  const paso = (W - 8) / n;
  const ancho = Math.max(2, Math.min(22, paso * (b ? 0.34 : 0.6)));
  const alto = (v: number | null) => Math.max(v ? 2 : 0, ((v ?? 0) / max) * (H - base - 4));

  function mover(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    setElegido(Math.min(n - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * n))));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2" aria-live="polite">
        <span className="burbuja burbuja-actual"><b>{formato(a[sel] ?? 0)}</b></span>
        {b && <span className="burbuja burbuja-previa" style={{ borderColor: "var(--par)" }}>{formato(b[sel] ?? 0)}</span>}
        <span className="texto-suave text-xs">{etiquetas[sel]} · {nombreA}{nombreB ? ` / ${nombreB}` : ""}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="grafico w-full" style={{ touchAction: "pan-y", height: "auto" }} role="img" aria-label={descripcion} onPointerMove={mover} onPointerDown={mover}>
        <line x1="0" x2={W} y1={H - base} y2={H - base} stroke="var(--linea)" />
        {etiquetas.map((_, i) => {
          const cx = 4 + paso * i + paso / 2;
          const activa = i === sel;
          const hA = alto(a[i]), hB = alto(b?.[i] ?? null);
          return (
            <g key={i} opacity={activa ? 1 : 0.55}>
              <rect x={b ? cx - ancho - 0.5 : cx - ancho / 2} y={H - base - hA} width={ancho} height={hA} rx={Math.min(5, ancho / 2)} fill="var(--acento-vivo)" />
              {b && <rect x={cx + 0.5} y={H - base - hB} width={ancho} height={hB} rx={Math.min(5, ancho / 2)} fill="var(--par-vivo)" />}
            </g>
          );
        })}
      </svg>
      <div className="eje" role="group" aria-label="Elegir período">
        {indicesEje(n).map((i) => <button key={i} type="button" className="eje-etiqueta" aria-pressed={i === sel} onClick={() => setElegido(i)}>{etiquetas[i]}</button>)}
      </div>
      {b && (
        <div className="flex gap-4 text-xs" style={{ color: "var(--suave)" }}>
          <span className="flex items-center gap-1.5"><i className="punto-leyenda" style={{ background: "var(--acento-vivo)" }} />{nombreA}</span>
          <span className="flex items-center gap-1.5"><i className="punto-leyenda" style={{ background: "var(--par-vivo)" }} />{nombreB}</span>
        </div>
      )}
    </div>
  );
}

// Día de la semana × hora. Cuanto más oscuro el color principal, más movimiento. Tocá una celda para ver el detalle.
export function MapaCalor({ calor, unidad }: { calor: Calor; unidad: string }) {
  const [sel, setSel] = useState<{ d: number; h: number } | null>(null);
  const horas = Array.from({ length: calor.horaMax - calor.horaMin + 1 }, (_, i) => calor.horaMin + i);
  const paso = horas.length > 12 ? 3 : 2;
  return (
    <div className="flex flex-col gap-2">
      <div className="calor" style={{ gridTemplateColumns: `20px repeat(${horas.length}, minmax(0, 1fr))` }}>
        {DIAS_CORTO.map((nombre, d) => (
          <div key={nombre} className="calor-fila">
            <span className="calor-dia">{nombre.slice(0, 1)}</span>
            {horas.map((h) => {
              const v = calor.celdas[d][h];
              const pct = calor.max > 0 ? Math.round((v / calor.max) * 100) : 0;
              const activa = sel?.d === d && sel.h === h;
              return (
                <button key={h} type="button" className="calor-celda" aria-label={`${DIAS_LARGO[d]} ${h} h: ${v} ${unidad}`} data-activa={activa}
                  style={{ background: v > 0 ? `color-mix(in srgb, var(--acento-vivo) ${Math.max(14, pct)}%, var(--sup-2))` : "var(--sup-2)" }}
                  onClick={() => setSel({ d, h })} />
              );
            })}
          </div>
        ))}
        <div className="calor-fila calor-horas" aria-hidden="true">
          <span className="calor-dia" />
          {horas.map((h) => <span key={h} className="calor-hora">{(h - calor.horaMin) % paso === 0 ? h : ""}</span>)}
        </div>
      </div>
      <p className="texto-suave text-xs" aria-live="polite">
        {sel ? `${DIAS_LARGO[sel.d]} ${sel.h} h: ${calor.celdas[sel.d][sel.h]} ${unidad}` : "Tocá un casillero para ver el detalle."}
      </p>
    </div>
  );
}

// Los últimos meses como cápsulas: el actual en color sobre fondo oscuro, los anteriores rayados.
export function TiraMeses({ meses }: { meses: MesTira[] }) {
  const max = Math.max(1, ...meses.map((m) => m.total));
  return (
    <div className="tira" role="img" aria-label={`Ventas de los últimos ${meses.length} meses`}>
      {meses.map((m) => (
        <div key={m.etiqueta + m.actual} className="tira-mes" data-actual={m.actual}>
          <div className="tira-cap"><span style={{ height: `${Math.max(m.total > 0 ? 10 : 0, (m.total / max) * 100)}%` }} /></div>
          <span>{m.etiqueta}</span>
        </div>
      ))}
    </div>
  );
}
