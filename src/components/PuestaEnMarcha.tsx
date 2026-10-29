"use client";

import { useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { MODULOS, type DatosNegocio, type Membresia, type ModuloNegocio } from "@/lib/tipos";

interface Props { yo: Membresia; negocio: DatosNegocio; onListo: () => void }

// Primera vez del dueño: elige qué módulos va a usar. Se puede cambiar después en Ajustes.
export default function PuestaEnMarcha({ yo, negocio, onListo }: Props) {
  const [elegidos, setElegidos] = useState<ModuloNegocio[]>(negocio.modulos);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function alternar(m: ModuloNegocio) {
    setElegidos((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
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

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold">Armemos {negocio.nombre || "tu barbería"}</h1>
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
                className="flex w-full items-start gap-3 rounded-xl border p-4 text-left"
                style={{ borderColor: activo ? "var(--acento)" : "var(--linea)" }}>
                <span aria-hidden className="mt-1 inline-block h-5 w-5 shrink-0 rounded border text-center text-xs leading-5"
                  style={{ borderColor: "var(--acento)", background: activo ? "var(--acento)" : "transparent", color: "var(--fondo)" }}>
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
      <button className="boton" onClick={terminar} disabled={enviando}>{enviando ? "Guardando…" : "Empezar"}</button>
    </main>
  );
}
