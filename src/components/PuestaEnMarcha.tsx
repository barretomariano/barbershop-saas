"use client";

import { useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { MODULOS, type DatosNegocio, type Membresia, type ModuloNegocio } from "@/lib/tipos";
import { CLAVE_MARCA, guardarLocal, serializarMarca, type Marca } from "@/lib/tema";
import SelectorColores from "@/components/SelectorColores";

interface Props { yo: Membresia; negocio: DatosNegocio; marca: Marca; onMarca: (m: Marca) => void; onListo: () => void }

// Primera vez del dueño: paso 1, los colores de su barbería; paso 2, qué módulos va a usar. Todo se puede cambiar después en Ajustes.
export default function PuestaEnMarcha({ yo, negocio, marca, onMarca, onListo }: Props) {
  const [paso, setPaso] = useState<1 | 2>(1);
  const [elegidos, setElegidos] = useState<ModuloNegocio[]>(negocio.modulos);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function alternar(m: ModuloNegocio) {
    setElegidos((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  }

  async function guardarColores() {
    setEnviando(true);
    setError(null);
    guardarLocal(CLAVE_MARCA, serializarMarca(marca));
    const { error: e } = await getSupabase().from("businesses").update({ primary_color: marca.principal, secondary_color: marca.secundario }).eq("id", yo.business_id);
    setEnviando(false);
    // Si todavía falta la migración 13, los colores quedan en este dispositivo y se puede seguir: se guardan al aplicarla.
    if (e) setError("Los colores quedaron solo en este dispositivo (falta aplicar la migración 13 en Supabase). Podés seguir.");
    setPaso(2);
  }

  async function terminar() {
    setEnviando(true);
    setError(null);
    const { error: e } = await getSupabase().rpc("save_modules", {
      p_business: yo.business_id, p_enabled: elegidos, p_finish_setup: true,
    });
    setEnviando(false);
    if (e) setError(e.message); else onListo();
  }

  if (paso === 1) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-6 py-10">
        <div>
          <p className="texto-suave text-sm font-semibold">Paso 1 de 2</p>
          <h1 className="titulo mt-1 text-3xl">Los colores de {negocio.nombre || "tu barbería"}</h1>
          <p className="texto-suave mt-2 text-sm">
            Elegí un color principal y uno secundario. Así la app se siente parte de tu barbería y combina con tu logo.
            Podés cambiarlos cuando quieras desde Ajustes.
          </p>
        </div>
        <SelectorColores marca={marca} onCambio={onMarca} deshabilitado={enviando} />
        <button className="boton" onClick={() => void guardarColores()} disabled={enviando}>{enviando ? "Guardando…" : "Siguiente"}</button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-6 py-10">
      <div>
        <p className="texto-suave text-sm font-semibold">Paso 2 de 2</p>
        <h1 className="titulo mt-1 text-3xl">Armemos {negocio.nombre || "tu barbería"}</h1>
        <p className="texto-suave mt-2 text-sm">
          Ventas, comisiones y gastos ya están incluidos. Elegí qué más querés usar. No se pierde nada:
          podés encender o apagar cualquiera cuando quieras desde Ajustes.
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {MODULOS.map((m) => {
          const activo = elegidos.includes(m.valor);
          return (
            <li key={m.valor}>
              <button type="button" onClick={() => alternar(m.valor)} aria-pressed={activo}
                className="flex w-full items-start gap-3 tarjeta text-left"
                style={{ borderColor: activo ? "var(--acento-vivo)" : "var(--linea)" }}>
                <span aria-hidden className="mt-1 inline-block h-5 w-5 shrink-0 rounded border text-center text-xs leading-5"
                  style={{ borderColor: "var(--acento-vivo)", background: activo ? "var(--acento-vivo)" : "transparent", color: "var(--sobre-vivo)" }}>
                  {activo ? "✓" : ""}
                </span>
                <span>
                  <span className="block font-medium">{m.titulo}</span>
                  <span className="texto-suave block text-sm">{m.detalle}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button className="boton-fantasma" onClick={() => { setError(null); setPaso(1); }} disabled={enviando}>Atrás</button>
        <button className="boton flex-1" onClick={terminar} disabled={enviando}>{enviando ? "Guardando…" : "Empezar"}</button>
      </div>
    </main>
  );
}
