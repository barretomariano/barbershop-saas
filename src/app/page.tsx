"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase, supabaseConfigurado } from "@/lib/supabase";
import type { DatosNegocio, Membresia, ModuloNegocio, PlanNegocio } from "@/lib/tipos";
import Login from "@/components/Login";
import NuevaClave from "@/components/NuevaClave";
import PuestaEnMarcha from "@/components/PuestaEnMarcha";
import Inicio from "@/components/Inicio";
import Vender from "@/components/Vender";
import Resumen from "@/components/Resumen";
import Ajustes from "@/components/Ajustes";
import Gastos from "@/components/Gastos";
import Agenda from "@/components/Agenda";
import Clientes from "@/components/Clientes";
import AvisoCierre from "@/components/AvisoCierre";
import Caja from "@/components/Caja";
import Reportes from "@/components/Reportes";

export type Pestana = "inicio" | "vender" | "agenda" | "clientes" | "resumen" | "reportes" | "caja" | "gastos" | "ajustes";
const COLUMNAS = "id,business_id,user_id,role,display_name,active,commission_model,commission_bps,commission_configured,fixed_monthly";

export default function Raiz() {
  if (!supabaseConfigurado()) return <SinConfigurar />;
  return <App />;
}

function App() {
  const [sesion, setSesion] = useState<Session | null>(null);
  const [listo, setListo] = useState(false);
  const [recuperando, setRecuperando] = useState(false);

  useEffect(() => {
    const sb = getSupabase();
    void sb.auth.getSession().then(({ data }) => { setSesion(data.session); setListo(true); });
    const { data } = sb.auth.onAuthStateChange((evento, s) => {
      setSesion(s);
      if (evento === "PASSWORD_RECOVERY") setRecuperando(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!listo) return <Mensaje texto="Cargando…" />;
  if (recuperando && sesion) return <NuevaClave onListo={() => setRecuperando(false)} />;
  if (!sesion) return <Login />;
  return <Panel userId={sesion.user.id} />;
}

function Panel({ userId }: { userId: string }) {
  const [equipo, setEquipo] = useState<Membresia[] | null>(null);
  const [negocio, setNegocio] = useState<DatosNegocio | null>(null);
  const [pestana, setPestana] = useState<Pestana>("inicio");

  const [version, setVersion] = useState(0);
  const cargar = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let vivo = true;
    void cargarDatos(userId).then((r) => {
      if (!vivo) return;
      setEquipo(r.equipo);
      setNegocio(r.negocio);
    });
    return () => { vivo = false; };
  }, [userId, version]);

  if (equipo === null) return <Mensaje texto="Cargando…" />;
  const yo = equipo.find((m) => m.user_id === userId);
  if (!yo || !negocio) {
    return (
      <Mensaje texto="Tu usuario todavía no está asignado a ninguna barbería. Pedile al dueño que te agregue.">
        <button className="boton-chico" onClick={() => getSupabase().auth.signOut()}>Salir</button>
      </Mensaje>
    );
  }

  // El dueño elige qué módulos usar la primera vez que entra.
  if (yo.role === "OWNER" && !negocio.configuracionTerminada) {
    return <PuestaEnMarcha yo={yo} negocio={negocio} onListo={cargar} />;
  }

  const hayAgenda = negocio.modulos.includes("AGENDA");
  const hayClientes = negocio.modulos.includes("CLIENTES");
  const gestion = yo.role !== "BARBER";
  const pestanas: { id: Pestana; texto: string }[] = [
    { id: "inicio", texto: "Inicio" },
    { id: "vender", texto: "Vender" },
    ...(hayAgenda ? [{ id: "agenda" as Pestana, texto: "Agenda" }] : []),
    ...(hayClientes ? [{ id: "clientes" as Pestana, texto: "Clientes" }] : []),
    { id: "resumen", texto: "Resumen" },
    { id: "reportes", texto: "Reportes" },
    ...(gestion ? [{ id: "caja" as Pestana, texto: "Caja" }, { id: "gastos" as Pestana, texto: "Gastos" }, { id: "ajustes" as Pestana, texto: "Ajustes" }] : []),
  ];
  // Si se apagó el módulo de la pestaña abierta, se vuelve al inicio.
  const activa = pestanas.some((p) => p.id === pestana) ? pestana : "inicio";

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-5 px-5 py-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{negocio.nombre || "Barbería"}</h1>
          <p className="texto-suave text-sm">{yo.display_name} · {yo.role === "OWNER" ? "Dueño" : yo.role === "MANAGER" ? "Encargado" : "Barbero"}</p>
        </div>
        <button className="text-sm underline" onClick={() => getSupabase().auth.signOut()}>Salir</button>
      </header>

      <nav className="flex flex-wrap gap-2" aria-label="Secciones">
        {pestanas.map((p) => (
          <button key={p.id} onClick={() => setPestana(p.id)} aria-current={activa === p.id}
            className={`chip ${activa === p.id ? "chip-activo" : ""}`}>{p.texto}</button>
        ))}
      </nav>

      {hayAgenda && activa !== "agenda" && <AvisoCierre negocio={yo.business_id} onVer={() => setPestana("agenda")} />}

      {activa === "inicio" && <Inicio yo={yo} equipo={equipo} modulos={negocio.modulos} irA={setPestana} />}
      {activa === "vender" && <Vender yo={yo} equipo={equipo} hayClientes={hayClientes} />}
      {activa === "agenda" && hayAgenda && <Agenda yo={yo} equipo={equipo} hayClientes={hayClientes} />}
      {activa === "clientes" && hayClientes && <Clientes yo={yo} />}
      {activa === "resumen" && <Resumen yo={yo} equipo={equipo} />}
      {activa === "reportes" && <Reportes yo={yo} hayClientes={hayClientes} />}
      {activa === "caja" && gestion && <Caja yo={yo} equipo={equipo} />}
      {activa === "gastos" && gestion && <Gastos yo={yo} />}
      {activa === "ajustes" && gestion && <Ajustes yo={yo} equipo={equipo} negocio={negocio} onCambio={cargar} />}
    </main>
  );
}

async function cargarDatos(userId: string): Promise<{ equipo: Membresia[]; negocio: DatosNegocio | null }> {
  const sb = getSupabase();
  const { data } = await sb.from("memberships").select(COLUMNAS).eq("active", true);
  const filas = (data as Membresia[]) ?? [];
  const mia = filas.find((m) => m.user_id === userId);
  if (!mia) return { equipo: filas, negocio: null };

  const [{ data: b }, { data: mods }] = await Promise.all([
    sb.from("businesses").select("name,plan,setup_completed_at").eq("id", mia.business_id).single(),
    sb.from("business_modules").select("module,enabled").eq("business_id", mia.business_id),
  ]);
  const fila = b as { name: string; plan: PlanNegocio; setup_completed_at: string | null } | null;
  const modulos = ((mods as { module: ModuloNegocio; enabled: boolean }[]) ?? []).filter((m) => m.enabled).map((m) => m.module);
  return {
    equipo: filas.filter((m) => m.business_id === mia.business_id),
    negocio: {
      nombre: fila?.name ?? "",
      plan: fila?.plan ?? "BASICO",
      configuracionTerminada: Boolean(fila?.setup_completed_at),
      modulos,
    },
  };
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
