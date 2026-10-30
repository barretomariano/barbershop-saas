"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import { leerMarcaInyectada } from "@/lib/marca";
import { getSupabase } from "@/lib/supabase";
import { aEmailDeAcceso } from "@/lib/usuario";
import { Campo } from "@/components/ui";

export default function Login() {
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const marca = useSyncExternalStore(() => () => {}, leerMarcaInyectada, () => null);

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
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-5 py-12">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="logo-marco" style={{ width: 88, height: 88 }}>
          {marca?.logo
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={marca.logo} alt="" width={88} height={88} />
            : <span className="titulo text-4xl">{(marca?.nombre ?? "B").slice(0, 1).toUpperCase()}</span>}
        </div>
        <h1 className="titulo text-[34px] leading-tight">{marca?.nombre ?? "Barbería"}</h1>
        <p className="texto-suave text-[15px]">Ingresá para ver tu día</p>
      </div>
      <form onSubmit={ingresar} className="tarjeta flex flex-col gap-4">
        <Campo etiqueta="Email o usuario">
          <input className="campo" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} />
        </Campo>
        <Campo etiqueta="Contraseña">
          <input className="campo" type="password" autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} />
        </Campo>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {aviso && <p role="status" className="text-sm">{aviso}</p>}
        <button type="submit" className="boton" disabled={enviando || !email || !clave}>
          {enviando ? "Ingresando…" : "Ingresar"}
        </button>
        <button type="button" className="texto-suave self-center text-sm underline" onClick={olvide}>Olvidé mi contraseña</button>
      </form>
    </main>
  );
}
