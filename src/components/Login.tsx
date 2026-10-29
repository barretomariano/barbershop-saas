"use client";

import { useState, type FormEvent } from "react";
import { getSupabase } from "@/lib/supabase";
import { aEmailDeAcceso } from "@/lib/usuario";

export default function Login() {
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  // Solo funciona con email (el dueño). Los barberos con usuario piden al dueño que les restablezca la clave.
  async function olvide() {
    setError(null);
    setAviso(null);
    if (!email.includes("@")) {
      setError("Escribí tu email arriba para recibir el enlace. Si entrás con usuario, pedile al dueño que te restablezca la clave.");
      return;
    }
    try {
      const { error: e } = await getSupabase().auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
      if (e) setError("No pudimos enviar el enlace. Intentá de nuevo en unos minutos.");
      else setAviso("Si el email está registrado, te enviamos un enlace para crear una contraseña nueva.");
    } catch {
      setError("No pudimos conectar. Revisá tu conexión e intentá de nuevo.");
    }
  }

  async function ingresar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault(); // evita que el navegador recargue la página
    if (enviando || !email || !clave) return;
    setEnviando(true);
    setError(null);
    try {
      const { error: e } = await getSupabase().auth.signInWithPassword({ email: aEmailDeAcceso(email), password: clave });
      if (e) setError("Email o contraseña incorrectos.");
    } catch {
      setError("No pudimos conectar. Revisá tu conexión e intentá de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-5 px-6 py-12">
      <form onSubmit={ingresar} className="flex flex-col gap-5">
        <h1 className="text-3xl font-semibold tracking-tight">Ingresar</h1>
        <label className="flex flex-col gap-1 text-sm">
          Email o usuario
          <input className="campo" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Contraseña
          <input className="campo" type="password" autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} />
        </label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {aviso && <p role="status" className="text-sm">{aviso}</p>}
        <button type="submit" className="boton" disabled={enviando || !email || !clave}>
          {enviando ? "Ingresando…" : "Ingresar"}
        </button>
        <button type="button" className="text-sm underline self-start" onClick={olvide}>Olvidé mi contraseña</button>
      </form>
    </main>
  );
}
