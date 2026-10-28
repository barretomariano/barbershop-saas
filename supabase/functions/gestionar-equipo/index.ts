// Función segura del servidor: gestionar-equipo.
// Permite al DUEÑO de un negocio crear accesos para su equipo (usuario y clave), restablecer
// claves, desactivar y reactivar personas. Se necesita en el servidor porque crear usuarios
// requiere la clave de administrador (service role), que NUNCA puede estar en el navegador.
//
// Archivo único y sin librerías externas (solo fetch), para pegarlo tal cual en el panel de
// Supabase (Edge Functions). Variables que Supabase ya provee: SUPABASE_URL, SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY. Opcional: EMAIL_DOMAIN (por defecto "equipo.invalid").
//
// Reglas de seguridad:
//  * Solo un OWNER activo del negocio indicado puede usarla (se verifica en cada llamada).
//  * Solo actúa sobre BARBER o MANAGER del MISMO negocio; nunca sobre un OWNER.
//  * Restablecer clave solo funciona con cuentas creadas por esta función (tienen username):
//    así nunca se cambia la clave de una persona que pueda tener acceso a otros negocios.
//  * Las claves no se guardan ni se pueden ver después: se muestran una sola vez al crearlas.

declare const Deno: any; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface Entorno { url: string; anonKey: string; serviceKey: string; dominio: string }
type Fetch = typeof fetch;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const PATRON_USUARIO = /^[a-z0-9._-]{3,30}$/;
const ALFABETO = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O, 1/l/I
const MODELOS = ["PERCENT", "CHAIR_RENT", "SALARY"];

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function responder(status: number, cuerpo: Record<string, unknown>): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
const fallo = (status: number, mensaje: string) => responder(status, { error: mensaje });

// Clave aleatoria legible (10 caracteres), sin sesgo y sin caracteres confundibles.
export function generarClave(largo = 10): string {
  const limite = 256 - (256 % ALFABETO.length);
  let salida = "";
  while (salida.length < largo) {
    const bytes = crypto.getRandomValues(new Uint8Array(largo * 2));
    for (const b of bytes) {
      if (b < limite && salida.length < largo) salida += ALFABETO[b % ALFABETO.length];
    }
  }
  return salida;
}

export function normalizarUsuario(texto: unknown): string | null {
  if (typeof texto !== "string") return null;
  const u = texto.trim().toLowerCase();
  return PATRON_USUARIO.test(u) ? u : null;
}

export const emailInterno = (usuario: string, dominio: string) => `${usuario}@${dominio}`;

interface Miembro { id: string; user_id: string; role: string; username: string | null; active: boolean }

export async function manejar(req: Request, env: Entorno, f: Fetch = fetch): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return fallo(405, "Método no permitido.");

  const cabecera = req.headers.get("Authorization") ?? "";
  const token = cabecera.startsWith("Bearer ") ? cabecera.slice(7).trim() : "";
  if (!token) return fallo(401, "Iniciá sesión para continuar.");

  let cuerpo: Record<string, unknown>;
  try {
    const texto = await req.text();
    if (texto.length > 4000) return fallo(413, "Pedido demasiado grande.");
    cuerpo = JSON.parse(texto);
    if (cuerpo === null || typeof cuerpo !== "object" || Array.isArray(cuerpo)) throw new Error("forma");
  } catch {
    return fallo(400, "El pedido no es válido.");
  }

  const cabeceraAdmin = { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}`, "Content-Type": "application/json" };
  const rest = (ruta: string, init: RequestInit = {}) =>
    f(`${env.url}/rest/v1/${ruta}`, { ...init, headers: { ...cabeceraAdmin, ...(init.headers as Record<string, string> | undefined) } });
  const admin = (ruta: string, init: RequestInit = {}) =>
    f(`${env.url}/auth/v1/admin/${ruta}`, { ...init, headers: { ...cabeceraAdmin, ...(init.headers as Record<string, string> | undefined) } });

  // 1. ¿Quién llama? (se valida el token contra Supabase Auth)
  let quien: string;
  try {
    const r = await f(`${env.url}/auth/v1/user`, { headers: { apikey: env.anonKey, Authorization: `Bearer ${token}` } });
    if (!r.ok) return fallo(401, "Tu sesión venció. Volvé a ingresar.");
    const u = (await r.json()) as { id?: string };
    if (!u.id || !UUID.test(u.id)) return fallo(401, "Tu sesión no es válida.");
    quien = u.id;
  } catch {
    return fallo(502, "No pudimos verificar tu sesión. Intentá de nuevo.");
  }

  // 2. ¿Es dueño activo del negocio indicado?
  const negocio = cuerpo.business_id;
  if (typeof negocio !== "string" || !UUID.test(negocio)) return fallo(400, "Falta indicar el negocio.");
  try {
    const r = await rest(`memberships?select=id&business_id=eq.${negocio}&user_id=eq.${quien}&role=eq.OWNER&active=eq.true`);
    const filas = r.ok ? ((await r.json()) as unknown[]) : [];
    if (filas.length !== 1) return fallo(403, "Solo el dueño del negocio puede gestionar al equipo.");
  } catch {
    return fallo(502, "No pudimos verificar tus permisos. Intentá de nuevo.");
  }

  const accion = cuerpo.accion;

  try {
    // ---------------------------------------------------------------- CREAR
    if (accion === "crear") {
      const nombre = typeof cuerpo.display_name === "string" ? cuerpo.display_name.trim() : "";
      if (nombre.length < 1 || nombre.length > 80) return fallo(400, "Escribí el nombre (hasta 80 caracteres).");
      const usuario = normalizarUsuario(cuerpo.usuario);
      if (!usuario) return fallo(400, "El usuario debe tener entre 3 y 30 caracteres: letras minúsculas, números, punto, guion o guion bajo.");
      const rol = cuerpo.rol;
      if (rol !== "BARBER" && rol !== "MANAGER") return fallo(400, "El rol debe ser Barbero o Encargado.");

      let clave: string;
      if (cuerpo.clave === undefined || cuerpo.clave === null || cuerpo.clave === "") clave = generarClave();
      else if (typeof cuerpo.clave === "string" && cuerpo.clave.length >= 8 && cuerpo.clave.length <= 72) clave = cuerpo.clave;
      else return fallo(400, "La clave debe tener entre 8 y 72 caracteres.");

      const fila: Record<string, unknown> = { business_id: negocio, role: rol, display_name: nombre, username: usuario };
      const com = cuerpo.comision as { modelo?: unknown; bps?: unknown } | undefined;
      if (com !== undefined && com !== null) {
        const bps = com.bps;
        if (typeof com.modelo !== "string" || !MODELOS.includes(com.modelo)) return fallo(400, "El modelo de comisión no es válido.");
        if (typeof bps !== "number" || !Number.isInteger(bps) || bps < 0 || bps > 10000 || (com.modelo !== "PERCENT" && bps !== 0)) {
          return fallo(400, "El porcentaje de comisión no es válido.");
        }
        fila.commission_model = com.modelo;
        fila.commission_bps = bps;
        fila.commission_configured = true;
      }

      const alta = await admin("users", { method: "POST", body: JSON.stringify({ email: emailInterno(usuario, env.dominio), password: clave, email_confirm: true }) });
      if (!alta.ok) {
        const detalle = await alta.text();
        console.error("crear usuario falló:", alta.status, detalle.slice(0, 300));
        if (alta.status === 422 || /already|exists|registered/i.test(detalle)) return fallo(409, "Ese usuario ya existe. Probá con otro.");
        if (/invalid/i.test(detalle) && /email/i.test(detalle)) return fallo(500, "Supabase no aceptó el dominio interno de los usuarios. Configurá el secreto EMAIL_DOMAIN con un dominio propio.");
        return fallo(502, "No se pudo crear el acceso. Intentá de nuevo.");
      }
      const creado = (await alta.json()) as { id?: string };
      if (!creado.id) return fallo(502, "No se pudo crear el acceso. Intentá de nuevo.");

      fila.user_id = creado.id;
      const ins = await rest("memberships", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(fila) });
      if (!ins.ok) {
        const detalle = await ins.text();
        console.error("insertar membresía falló:", ins.status, detalle.slice(0, 300));
        await admin(`users/${creado.id}`, { method: "DELETE" }); // deshacer: no dejar accesos huérfanos
        if (ins.status === 409 || /23505|duplicate/i.test(detalle)) return fallo(409, "Ese usuario ya existe. Probá con otro.");
        return fallo(500, "No se pudo agregar a la persona. No se creó nada.");
      }
      const insertadas = (await ins.json()) as { id: string }[];
      return responder(200, { ok: true, membership_id: insertadas[0]?.id ?? null, usuario, clave });
    }

    // ------------------------------------------- acciones sobre alguien existente
    if (accion === "restablecer" || accion === "desactivar" || accion === "reactivar") {
      const id = cuerpo.membership_id;
      if (typeof id !== "string" || !UUID.test(id)) return fallo(400, "Falta indicar a quién.");
      const r = await rest(`memberships?select=id,user_id,role,username,active&id=eq.${id}&business_id=eq.${negocio}`);
      const filas = r.ok ? ((await r.json()) as Miembro[]) : [];
      const objetivo = filas[0];
      if (!objetivo) return fallo(404, "Esa persona no existe en tu negocio.");
      if (objetivo.role !== "BARBER" && objetivo.role !== "MANAGER") return fallo(403, "No se puede modificar al dueño desde acá.");

      if (accion === "restablecer") {
        if (!objetivo.username) return fallo(409, "Esta cuenta no se creó desde la app, así que la clave no se puede restablecer desde acá.");
        let clave: string;
        if (cuerpo.clave === undefined || cuerpo.clave === null || cuerpo.clave === "") clave = generarClave();
        else if (typeof cuerpo.clave === "string" && cuerpo.clave.length >= 8 && cuerpo.clave.length <= 72) clave = cuerpo.clave;
        else return fallo(400, "La clave debe tener entre 8 y 72 caracteres.");
        const up = await admin(`users/${objetivo.user_id}`, { method: "PUT", body: JSON.stringify({ password: clave }) });
        if (!up.ok) { console.error("restablecer falló:", up.status); return fallo(502, "No se pudo cambiar la clave. Intentá de nuevo."); }
        return responder(200, { ok: true, usuario: objetivo.username, clave });
      }

      const activar = accion === "reactivar";
      const pa = await rest(`memberships?id=eq.${id}&business_id=eq.${negocio}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ active: activar }) });
      if (!pa.ok) { console.error("cambiar estado falló:", pa.status); return fallo(500, "No se pudo actualizar a la persona."); }
      return responder(200, { ok: true, active: activar });
    }

    return fallo(400, "Acción desconocida.");
  } catch (e) {
    console.error("error inesperado:", e instanceof Error ? e.message : "desconocido");
    return fallo(500, "Ocurrió un error inesperado. Intentá de nuevo.");
  }
}

// En Supabase (Deno) arranca el servidor. En las pruebas locales (Node) no existe Deno y no hace nada.
if (typeof Deno !== "undefined") {
  Deno.serve((req: Request) =>
    manejar(req, {
      url: Deno.env.get("SUPABASE_URL") ?? "",
      anonKey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      dominio: Deno.env.get("EMAIL_DOMAIN") ?? "equipo.invalid",
    }),
  );
}
