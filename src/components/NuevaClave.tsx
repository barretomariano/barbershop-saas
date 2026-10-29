"use client";

import { useState, type FormEvent } from "react";
import { getSupabase } from "@/lib/supabase";

// Se muestra cuando la persona entra desde el enlace de "olvidé mi contraseña".
export default function NuevaClave({ onListo }: { onListo: () => void }) {
  const [clave, setClave] = useState("");
  const [repetida, setRepetida] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (clave.length < 8) { setError("La contraseña debe tener al menos 8 caracteres."); return; }
    if (clave !== repetida) { setError("Las contraseñas no coinciden."); return; }
    setEnviando(true);
    setError(null);
    const { error: err } = await getSupabase().auth.updateUser({ password: clave });
    setEnviando(false);
    if (err) setError("No se pudo cambiar la contraseña. Pedí un enlace nuevo e intentá de nuevo.");
    else onListo();
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-5 px-6 py-12">
      <form onSubmit={guardar} className="flex flex-col gap-5">
        <h1 className="text-3xl font-semibold tracking-tight">Nueva contraseña</h1>
        <label className="flex flex-col gap-1 text-sm">
          Contraseña nueva (mínimo 8 caracteres)
          <input className="campo" type="password" autoComplete="new-password" value={clave} onChange={(e) => setClave(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Repetila
          <input className="campo" type="password" autoComplete="new-password" value={repetida} onChange={(e) => setRepetida(e.target.value)} />
        </label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button type="submit" className="boton" disabled={enviando || !clave || !repetida}>
          {enviando ? "Guardando…" : "Guardar contraseña"}
        </button>
      </form>
    </main>
  );
}
