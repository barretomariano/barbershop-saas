"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase, supabaseConfigurado } from "@/lib/supabase";
import type { Membresia } from "@/lib/tipos";
import Login from "@/components/Login";
import Vender from "@/components/Vender";
import Resumen from "@/components/Resumen";
import Ajustes from "@/components/Ajustes";

type Pestana = "vender" | "resumen" | "ajustes";
const COLUMNAS = "id,business_id,user_id,role,display_name,active,commission_model,commission_bps,commission_configured";

export default function Inicio() {
  if (!supabaseConfigurado()) return <SinConfigurar />;
  return <App />;
}

function App() {
  const [sesion, setSesion] = useState<Session | null>(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    const sb = getSupabase();
    void sb.auth.getSession().then(({ data }) => { setSesion(data.session); setListo(true); });
    const { data } = sb.auth.onAuthStateChange((_evento, s) => setSesion(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!listo) return <Mensaje texto="Cargando…" />;
  if (!sesion) return <Login />;
  return <Panel userId={sesion.user.id} />;
}

function Panel({ userId }: { userId: string }) {
  const [equipo, setEquipo] = useState<Membresia[] | null>(null);
  const [negocio, setNegocio] = useState<string>("");
  const [pestana, setPestana] = useState<Pestana>("vender");

  const [version, setVersion] = useState(0);
  const cargar = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let vivo = true;
    void cargarEquipo(userId).then((r) => {
      if (!vivo) return;
      setEquipo(r.equipo);
      setNegocio(r.negocio);
    });
    return () => { vivo = false; };
  }, [userId, version]);

  if (equipo === null) return <Mensaje texto="Cargando…" />;
  const yo = equipo.find((m) => m.user_id === userId);
  if (!yo) {
    return (
      <Mensaje texto="Tu usuario todavía no está asignado a ninguna barbería. Pedile al dueño que te agregue.">
        <button className="boton-chico" onClick={() => getSupabase().auth.signOut()}>Salir</button>
      </Mensaje>
    );
  }

  const barberos = equipo.filter((m) => m.role === "BARBER");
  const pestanas: { id: Pestana; texto: string }[] = [
    { id: "vender", texto: "Vender" },
    { id: "resumen", texto: "Resumen" },
    ...(yo.role !== "BARBER" ? [{ id: "ajustes" as Pestana, texto: "Ajustes" }] : []),
  ];

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-5 px-5 py-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{negocio || "Barbería"}</h1>
          <p className="texto-suave text-sm">{yo.display_name} · {yo.role === "OWNER" ? "Dueño" : yo.role === "MANAGER" ? "Encargado" : "Barbero"}</p>
        </div>
        <button className="text-sm underline" onClick={() => getSupabase().auth.signOut()}>Salir</button>
      </header>

      <nav className="flex gap-2" aria-label="Secciones">
        {pestanas.map((p) => (
          <button key={p.id} onClick={() => setPestana(p.id)} aria-current={pestana === p.id}
            className={`chip ${pestana === p.id ? "chip-activo" : ""}`}>{p.texto}</button>
        ))}
      </nav>

      {pestana === "vender" && <Vender yo={yo} barberos={barberos} />}
      {pestana === "resumen" && <Resumen yo={yo} equipo={equipo} />}
      {pestana === "ajustes" && yo.role !== "BARBER" && <Ajustes yo={yo} equipo={equipo} onCambio={cargar} />}
    </main>
  );
}

async function cargarEquipo(userId: string): Promise<{ equipo: Membresia[]; negocio: string }> {
  const sb = getSupabase();
  const { data } = await sb.from("memberships").select(COLUMNAS).eq("active", true);
  const filas = (data as Membresia[]) ?? [];
  const mia = filas.find((m) => m.user_id === userId);
  let negocio = "";
  if (mia) {
    const { data: b } = await sb.from("businesses").select("name").eq("id", mia.business_id).single();
    negocio = (b as { name: string } | null)?.name ?? "";
  }
  return { equipo: filas.filter((m) => !mia || m.business_id === mia.business_id), negocio };
}

function Mensaje({ texto, children }: { texto: string; children?: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-start justify-center gap-4 px-6">
      <p>{texto}</p>
      {children}
    </main>
  );
}

function SinConfigurar() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Barbershop SaaS</h1>
      <p className="texto-suave">
        La aplicación está funcionando, pero todavía no está conectada a la base de datos.
        Falta cargar las variables NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY.
      </p>
    </main>
  );
}
