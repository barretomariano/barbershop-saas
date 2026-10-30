"use client";

import { urlLogo } from "@/lib/marca";
import { INICIAL_CABECERA, siguienteCabecera } from "@/lib/cabecera";
import { setMontosOcultos } from "@/lib/dinero";
import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase, supabaseConfigurado } from "@/lib/supabase";
import type { DatosNegocio, Membresia, ModuloNegocio, PlanNegocio } from "@/lib/tipos";
import Login from "@/components/Login";
import NuevaClave from "@/components/NuevaClave";
import PuestaEnMarcha from "@/components/PuestaEnMarcha";
import Inicio from "@/components/Inicio";
import AvisoCierre from "@/components/AvisoCierre";
import Agenda from "@/components/Agenda";
import ResumenHub from "@/components/ResumenHub";
import AjustesHub from "@/components/AjustesHub";
import VentaModal, { type TurnoACobrar } from "@/components/VentaModal";
import { Icono, type NombreIcono } from "@/components/ui";
import { mostrarBotonVenta, pestanasVisibles, ubicar, type Destino, type SubAjustes, type SubResumen, type Tab } from "@/lib/navegacion";
import { ACENTO_POR_DEFECTO, aplicarApariencia, esAcento, leerAcentoLocal, leerTema, guardarLocal, CLAVE_ACENTO, type IdAcento, type Tema } from "@/lib/tema";

const COLUMNAS = "id,business_id,user_id,role,display_name,active,commission_model,commission_bps,commission_configured,fixed_monthly";
const CLAVE_MONTOS = "montos-ocultos";
const ICONO_TAB: Record<Tab, NombreIcono> = { inicio: "inicio", agenda: "agenda", resumen: "resumen", ajustes: "ajustes" };
const TITULO_TAB: Record<Exclude<Tab, "inicio">, string> = { agenda: "Agenda", resumen: "Resumen", ajustes: "Ajustes" };

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
  const [tab, setTab] = useState<Tab>("inicio");
  const [subResumen, setSubResumen] = useState<SubResumen>("panorama");
  const [subAjustes, setSubAjustes] = useState<SubAjustes | null>(null);
  const [venta, setVenta] = useState<{ turno: TurnoACobrar | null } | null>(null);
  const [refresco, setRefresco] = useState(0);
  // Panel solo se dibuja después de iniciar sesión (en el navegador), así que se puede leer el dispositivo directo.
  const [tema, setTema] = useState<Tema>(() => (typeof window === "undefined" ? "oscuro" : leerTema()));
  const [acento, setAcento] = useState<IdAcento>(() => (typeof window === "undefined" ? ACENTO_POR_DEFECTO : leerAcentoLocal()));

  // Privacidad: tapar los montos (se recuerda en este dispositivo). El interruptor vive en la cabecera.
  const [ocultos, setOcultos] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    let v = false;
    try { v = window.localStorage.getItem(CLAVE_MONTOS) === "1"; } catch { /* sin almacenamiento: se muestran */ }
    setMontosOcultos(v);
    return v;
  });
  function alternarMontos() {
    const v = !ocultos;
    setMontosOcultos(v); // antes de redibujar, para que todo el árbol ya salga tapado (o visible)
    try { window.localStorage.setItem(CLAVE_MONTOS, v ? "1" : "0"); } catch { /* idem */ }
    setOcultos(v);
  }

  // Cabecera fija: se esconde al bajar (con demora) y vuelve al subir.
  const [cabOculta, setCabOculta] = useState(false);
  useEffect(() => {
    let estado = INICIAL_CABECERA;
    let pendiente = false;
    const alScroll = () => {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(() => {
        pendiente = false;
        const sig = siguienteCabecera(estado, window.scrollY);
        estado = sig;
        setCabOculta((prev) => (prev === sig.oculta ? prev : sig.oculta));
      });
    };
    window.addEventListener("scroll", alScroll, { passive: true });
    return () => window.removeEventListener("scroll", alScroll);
  }, []);

  const [version, setVersion] = useState(0);
  const cargar = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let vivo = true;
    void cargarDatos(userId).then((r) => {
      if (!vivo) return;
      setEquipo(r.equipo);
      setNegocio(r.negocio);
      // El color del negocio manda sobre lo guardado en este dispositivo.
      if (r.acento) {
        setAcento(r.acento);
        guardarLocal(CLAVE_ACENTO, r.acento);
      }
    });
    return () => { vivo = false; };
  }, [userId, version]);

  useEffect(() => { aplicarApariencia(tema, acento); }, [tema, acento]);

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
  const pestanas = pestanasVisibles(negocio.modulos);
  // Si se apagó el módulo de la pestaña abierta (Agenda), se vuelve al inicio.
  const activa: Tab = pestanas.some((p) => p.id === tab) ? tab : "inicio";

  function irA(d: Destino) {
    const u = ubicar(d, yo!.role, negocio!.modulos);
    setTab(u.tab);
    if (u.tab === "resumen") setSubResumen((u.sub as SubResumen | null) ?? "panorama");
    if (u.tab === "ajustes") setSubAjustes((u.sub as SubAjustes | null) ?? null);
    window.scrollTo({ top: 0 });
    setCabOculta(false);
  }
  function irATab(t: Tab) {
    if (t === activa) {
      if (t === "ajustes") setSubAjustes(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setTab(t);
    if (t === "ajustes") setSubAjustes(null);
    // Resumen siempre se abre en Panorama (y Panorama en "Hoy").
    if (t === "resumen") setSubResumen("panorama");
    window.scrollTo({ top: 0 });
    setCabOculta(false);
  }

  const nombrePila = yo.display_name.split(" ")[0];
  const rol = yo.role === "OWNER" ? "Dueño" : yo.role === "MANAGER" ? "Encargado" : "Barbero";

  return (
    <>
      <main className="pantalla flex flex-col gap-5">
        <header className="cabecera" data-oculta={cabOculta ? "true" : undefined}>
          {activa === "inicio" ? (
            <div className="flex min-w-0 items-center gap-3">
              {negocio.logoVersion > 0 && (
                <span className="logo-marco" style={{ width: 52, height: 52 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={urlLogo(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", yo.business_id, negocio.logoVersion, 192)} alt="" width={52} height={52} />
                </span>
              )}
              <div className="min-w-0">
                <h1 className="titulo truncate text-[36px] leading-[1.05]">{negocio.nombre || "Barbería"}</h1>
                <p className="texto-suave mt-1 truncate text-[15px] font-medium">Hola, {nombrePila} · {rol}</p>
              </div>
            </div>
          ) : (
            <h1 className="titulo text-[28px] font-semibold leading-tight">{TITULO_TAB[activa]}</h1>
          )}
          <button className="boton-cab flex-none" aria-pressed={ocultos} aria-label={ocultos ? "Mostrar montos" : "Ocultar montos"} title={ocultos ? "Mostrar montos" : "Ocultar montos"} onClick={alternarMontos}>
            <Icono nombre={ocultos ? "ojoTachado" : "ojo"} tam={22} />
          </button>
        </header>
        <div className="barra-estado" aria-hidden="true" />

        {hayAgenda && activa !== "agenda" && <AvisoCierre negocio={yo.business_id} onVer={() => irA("agenda")} />}

        {activa === "inicio" && <Inicio yo={yo} equipo={equipo} modulos={negocio.modulos} irA={irA} refresco={refresco} />}
        {activa === "agenda" && hayAgenda && (
          <Agenda yo={yo} equipo={equipo} hayClientes={hayClientes} refresco={refresco} onCobrar={(t) => setVenta({ turno: t })} />
        )}
        {activa === "resumen" && <ResumenHub key={refresco} yo={yo} equipo={equipo} modulos={negocio.modulos} hayClientes={hayClientes} sub={subResumen} onSub={setSubResumen} irA={irA} />}
        {activa === "ajustes" && (
          <AjustesHub yo={yo} equipo={equipo} negocio={negocio} sub={subAjustes} onSub={setSubAjustes} onCambio={cargar}
            tema={tema} acento={acento} onTema={setTema} onAcento={setAcento} />
        )}
      </main>

      {mostrarBotonVenta(activa) && !venta && (
        <button className="fab" onClick={() => setVenta({ turno: null })} aria-label="Nueva venta">
          <Icono nombre="mas" tam={22} /> Nueva venta
        </button>
      )}

      <nav className="nav-inferior" aria-label="Secciones">
        <div>
          {pestanas.map((p) => (
            <button key={p.id} className="nav-item" aria-current={activa === p.id ? "page" : undefined} onClick={() => irATab(p.id)}>
              <Icono nombre={ICONO_TAB[p.id]} tam={23} />
              {p.texto}
            </button>
          ))}
        </div>
      </nav>

      {venta && (
        <VentaModal yo={yo} equipo={equipo} hayClientes={hayClientes} turno={venta.turno}
          onCerrar={() => setVenta(null)} onRegistrada={() => setRefresco((r) => r + 1)} />
      )}
    </>
  );
}

async function cargarDatos(userId: string): Promise<{ equipo: Membresia[]; negocio: DatosNegocio | null; acento: IdAcento | null }> {
  const sb = getSupabase();
  const { data } = await sb.from("memberships").select(COLUMNAS).eq("active", true);
  const filas = (data as Membresia[]) ?? [];
  const mia = filas.find((m) => m.user_id === userId);
  if (!mia) return { equipo: filas, negocio: null, acento: null };

  const [{ data: b }, { data: mods }, { data: color }, { data: marcaFila }] = await Promise.all([
    sb.from("businesses").select("name,plan,setup_completed_at").eq("id", mia.business_id).single(),
    sb.from("business_modules").select("module,enabled").eq("business_id", mia.business_id),
    // Aparte: si todavía no existe la columna (migración 9), solo falla esta consulta y la app sigue con el color por defecto.
    sb.from("businesses").select("accent").eq("id", mia.business_id).maybeSingle(),
    // Igual: si falta la migración 11, la app sigue sin marca propia.
    sb.from("businesses").select("slug,logo_version").eq("id", mia.business_id).maybeSingle(),
  ]);
  const acentoDb = (color as { accent: unknown } | null)?.accent;
  const marca = marcaFila as { slug: string | null; logo_version: number } | null;
  const fila = b as { name: string; plan: PlanNegocio; setup_completed_at: string | null } | null;
  const modulos = ((mods as { module: ModuloNegocio; enabled: boolean }[]) ?? []).filter((m) => m.enabled).map((m) => m.module);
  return {
    equipo: filas.filter((m) => m.business_id === mia.business_id),
    acento: esAcento(acentoDb) ? acentoDb : null,
    negocio: {
      nombre: fila?.name ?? "",
      plan: fila?.plan ?? "BASICO",
      configuracionTerminada: Boolean(fila?.setup_completed_at),
      modulos,
      slug: marca?.slug ?? null,
      logoVersion: marca?.logo_version ?? 0,
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
