"use client";

import { useRef, useState } from "react";
import { extraerColores, normalizarHex, tintaSobre } from "@/lib/colores";
import { SUGERENCIAS, type Marca } from "@/lib/tema";
import { Icono } from "@/components/ui";

interface Props { marca: Marca; onCambio: (m: Marca) => void; deshabilitado?: boolean }

// Elige el color principal y el secundario de la barbería. Cada cambio se aplica al instante en toda la app (vista previa en vivo).
export default function SelectorColores({ marca, onCambio, deshabilitado }: Props) {
  const archivo = useRef<HTMLInputElement>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function desdeImagen(f: File | undefined) {
    if (!f) return;
    setAviso(null);
    try {
      const bmp = await createImageBitmap(f);
      const lado = 64;
      const lienzo = document.createElement("canvas");
      lienzo.width = lado; lienzo.height = lado;
      const ctx = lienzo.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("sin lienzo");
      ctx.drawImage(bmp, 0, 0, lado, lado);
      const r = extraerColores(ctx.getImageData(0, 0, lado, lado).data);
      if (!r) setAviso("Esa imagen no tiene colores marcados (es blanca, negra o gris). Elegí los colores a mano.");
      else { onCambio(r); setAviso("Listo: tomamos los colores de tu logo. Podés ajustarlos."); }
    } catch {
      setAviso("No se pudo leer esa imagen. Probá con un PNG o JPG.");
    } finally {
      if (archivo.current) archivo.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3">
        <Slot etiqueta="Principal" detalle="Cápsulas, metas y gráficos" valor={marca.principal} deshabilitado={deshabilitado} onCambio={(v) => onCambio({ ...marca, principal: v })} />
        <Slot etiqueta="Secundario" detalle="Comparaciones y detalles" valor={marca.secundario} deshabilitado={deshabilitado} onCambio={(v) => onCambio({ ...marca, secundario: v })} />
      </div>

      <div className="flex flex-col gap-2">
        <p className="campo-etiqueta">Combinaciones sugeridas</p>
        <div className="flex flex-wrap gap-2">
          {SUGERENCIAS.map((s) => {
            const activa = s.marca.principal === marca.principal && s.marca.secundario === marca.secundario;
            return (
              <button key={s.id} type="button" className="chip flex items-center gap-2" aria-pressed={activa} disabled={deshabilitado}
                style={activa ? { borderColor: "var(--acento-vivo)", boxShadow: "0 0 0 1.5px var(--acento-vivo)" } : undefined}
                onClick={() => onCambio(s.marca)}>
                <span className="flex" aria-hidden>
                  <span className="h-4 w-4 rounded-full" style={{ background: s.marca.principal }} />
                  <span className="-ml-1.5 h-4 w-4 rounded-full" style={{ background: s.marca.secundario }} />
                </span>
                {s.nombre}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <button type="button" className="boton-fantasma flex items-center justify-center gap-2" disabled={deshabilitado} onClick={() => archivo.current?.click()}>
          <Icono nombre="apariencia" tam={18} /> Tomar los colores de mi logo
        </button>
        <input ref={archivo} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void desdeImagen(e.target.files?.[0])} />
        <p className="texto-suave text-xs">La imagen se lee en tu celular; no se sube a ningún lado.</p>
        {aviso && <p role="status" className="text-sm font-medium">{aviso}</p>}
      </div>

      <Vista />
    </div>
  );
}

function Slot({ etiqueta, detalle, valor, onCambio, deshabilitado }: { etiqueta: string; detalle: string; valor: string; onCambio: (v: string) => void; deshabilitado?: boolean }) {
  const [texto, setTexto] = useState(valor);
  const [previo, setPrevio] = useState(valor);
  // Si el color cambia desde afuera (sugerencia, logo), el campo de texto lo acompaña.
  if (valor !== previo) { setPrevio(valor); setTexto(valor); }
  const valido = normalizarHex(texto);

  return (
    <div className="tarjeta flex flex-col gap-3" style={{ padding: 14, borderRadius: 24 }}>
      <div>
        <p className="font-semibold">{etiqueta}</p>
        <p className="texto-suave text-xs">{detalle}</p>
      </div>
      <label className="relative block h-16 w-full cursor-pointer overflow-hidden rounded-[18px] border" style={{ background: valor, borderColor: "var(--borde-vidrio)" }}>
        <span className="absolute inset-0 grid place-items-center" style={{ color: tintaSobre(valor) }}><Icono nombre="apariencia" tam={22} /></span>
        <input type="color" aria-label={`Color ${etiqueta.toLowerCase()}`} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" disabled={deshabilitado}
          value={valor.toLowerCase()} onChange={(e) => { const h = normalizarHex(e.target.value); if (h) onCambio(h); }} />
      </label>
      <input className="campo" style={{ minHeight: 46, textTransform: "uppercase" }} aria-label={`Código del color ${etiqueta.toLowerCase()}`} aria-invalid={!valido} maxLength={7} spellCheck={false} autoCapitalize="characters"
        disabled={deshabilitado} value={texto}
        onChange={(e) => { setTexto(e.target.value); const h = normalizarHex(e.target.value); if (h) onCambio(h); }}
        onBlur={() => setTexto(valor)} />
    </div>
  );
}

// Muestra cómo se va a ver: cápsula del color principal, chip del secundario y la tinta, sobre el fondo del tema actual.
function Vista() {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      <p className="campo-etiqueta">Así se ve</p>
      <div className="rounded-[28px] p-4" style={{ background: "var(--acento-vivo)", color: "var(--sobre-vivo)" }}>
        <p className="text-sm font-semibold opacity-80">Ganancia bruta</p>
        <p className="monto text-[30px] leading-tight">$ 177.349</p>
        <span className="mt-2 inline-block rounded-full px-3 py-1 text-xs font-bold" style={{ background: "var(--par-vivo)", color: "var(--sobre-par)" }}>+ 12% vs. mes anterior</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="rounded-full px-4 py-2 text-sm font-semibold" style={{ background: "var(--tinta)", color: "var(--sobre-tinta)" }}>Mes</span>
        <span className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--linea)" }}><span className="block h-full w-2/3 rounded-full" style={{ background: "var(--acento-vivo)" }} /></span>
        <span className="text-sm font-bold" style={{ color: "var(--acento)" }}>56%</span>
      </div>
    </div>
  );
}
