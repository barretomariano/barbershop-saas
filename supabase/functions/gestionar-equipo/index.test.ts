import { beforeEach, describe, expect, it } from "vitest";
import { emailInterno, generarClave, manejar, normalizarUsuario, type Entorno } from "./index";

// ---- Supabase simulado (Auth + tabla memberships) -----------------------------------------
const ENTORNO: Entorno = { url: "https://x.supabase.co", anonKey: "ANON", serviceKey: "SERVICE", dominio: "equipo.invalid" };
const BIZ_A = "aaaaaaaa-0000-4000-8000-000000000001";
const BIZ_B = "bbbbbbbb-0000-4000-8000-000000000001";
const U_OWNER_A = "a1000000-0000-4000-8000-000000000001";
const U_OWNER_B = "b1000000-0000-4000-8000-000000000001";
const U_BARBER_A = "a1000000-0000-4000-8000-000000000002";
const U_OWNER_A_INACTIVO = "a1000000-0000-4000-8000-000000000009";

interface Fila { id: string; business_id: string; user_id: string; role: string; display_name: string; username: string | null; active: boolean; [k: string]: unknown }
let usuarios: Map<string, { email: string; password: string }>;
let filas: Fila[];
let fallarInsert = false;
let contador = 0;
const sesiones: Record<string, string> = { tokenOwnerA: U_OWNER_A, tokenOwnerB: U_OWNER_B, tokenBarberA: U_BARBER_A, tokenOwnerAInactivo: U_OWNER_A_INACTIVO };
const uuid = () => `00000000-0000-4000-8000-${String(++contador).padStart(12, "0")}`;

function filtrar(params: URLSearchParams): Fila[] {
  return filas.filter((f) => [...params.entries()].every(([k, v]) => {
    if (k === "select" || !v.startsWith("eq.")) return true;
    return String(f[k]) === v.slice(3);
  }));
}

const fakeFetch = (async (entrada: RequestInfo | URL, init: RequestInit = {}) => {
  const url = new URL(String(entrada));
  const h = new Headers(init.headers);
  const json = (s: number, c: unknown) => new Response(JSON.stringify(c), { status: s, headers: { "Content-Type": "application/json" } });
  const metodo = init.method ?? "GET";

  if (url.pathname === "/auth/v1/user") {
    const t = (h.get("Authorization") ?? "").replace("Bearer ", "");
    return sesiones[t] ? json(200, { id: sesiones[t] }) : json(401, { msg: "invalid" });
  }
  // Todo lo demás es solo del servidor: exige la clave de administrador
  if (h.get("apikey") !== "SERVICE" || h.get("Authorization") !== "Bearer SERVICE") return json(401, { msg: "sin clave de administrador" });

  if (url.pathname === "/auth/v1/admin/users" && metodo === "POST") {
    const { email, password, email_confirm } = JSON.parse(String(init.body));
    if (!email_confirm) return json(400, { msg: "falta email_confirm" });
    if ([...usuarios.values()].some((u) => u.email === email)) return json(422, { msg: "A user with this email address has already been registered" });
    const id = uuid();
    usuarios.set(id, { email, password });
    return json(200, { id });
  }
  const m = url.pathname.match(/^\/auth\/v1\/admin\/users\/([^/]+)$/);
  if (m && metodo === "PUT") { const u = usuarios.get(m[1]); if (!u) return json(404, {}); u.password = JSON.parse(String(init.body)).password; return json(200, { id: m[1] }); }
  if (m && metodo === "DELETE") { usuarios.delete(m[1]); return json(200, {}); }

  if (url.pathname === "/rest/v1/memberships") {
    if (metodo === "GET") return json(200, filtrar(url.searchParams));
    if (metodo === "POST") {
      if (fallarInsert) return json(500, { message: "falla simulada" });
      const nueva = JSON.parse(String(init.body)) as Fila;
      if (nueva.username && filas.some((f) => f.username === nueva.username)) return json(409, { code: "23505", message: "duplicate key" });
      const fila = { ...nueva, id: uuid(), active: true } as Fila;
      filas.push(fila);
      return json(201, [fila]);
    }
    if (metodo === "PATCH") { for (const f of filtrar(url.searchParams)) Object.assign(f, JSON.parse(String(init.body))); return new Response(null, { status: 204 }); }
  }
  return json(404, { msg: `ruta no simulada ${metodo} ${url.pathname}` });
}) as typeof fetch;

function pedir(token: string | null, cuerpo: unknown, metodo = "POST") {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return manejar(new Request("https://f.test/gestionar-equipo", { method: metodo, headers, body: metodo === "POST" ? JSON.stringify(cuerpo) : undefined }), ENTORNO, fakeFetch);
}
const cuerpoJson = async (r: Response) => (await r.json()) as Record<string, unknown>;

const crearBase = { accion: "crear", business_id: BIZ_A, display_name: "Juan Pérez", usuario: "juan.perez", rol: "BARBER" };

beforeEach(() => {
  contador = 0; fallarInsert = false;
  usuarios = new Map();
  filas = [
    { id: "c0000000-0000-4000-8000-000000000001", business_id: BIZ_A, user_id: U_OWNER_A, role: "OWNER", display_name: "Dueño A", username: null, active: true },
    { id: "c0000000-0000-4000-8000-000000000003", business_id: BIZ_A, user_id: U_OWNER_A_INACTIVO, role: "OWNER", display_name: "Ex dueño", username: null, active: false },
    { id: "c0000000-0000-4000-8000-000000000002", business_id: BIZ_B, user_id: U_OWNER_B, role: "OWNER", display_name: "Dueño B", username: null, active: true },
    { id: "c0000000-0000-4000-8000-000000000004", business_id: BIZ_A, user_id: U_BARBER_A, role: "BARBER", display_name: "Barbero A", username: "barbero.a", active: true },
    { id: "c0000000-0000-4000-8000-000000000005", business_id: BIZ_A, user_id: uuid(), role: "BARBER", display_name: "Cargado a mano", username: null, active: true },
    { id: "c0000000-0000-4000-8000-000000000006", business_id: BIZ_B, user_id: uuid(), role: "BARBER", display_name: "Barbero B", username: "barbero.b", active: true },
  ];
  usuarios.set(U_BARBER_A, { email: "barbero.a@equipo.invalid", password: "clave-vieja-1" });
});

describe("acceso y autenticación", () => {
  it("responde a OPTIONS (CORS) y rechaza métodos que no son POST", async () => {
    expect((await pedir(null, null, "OPTIONS")).status).toBe(204);
    expect((await pedir("tokenOwnerA", null, "GET")).status).toBe(405);
  });
  it("sin sesión o con sesión inválida: 401", async () => {
    expect((await pedir(null, crearBase)).status).toBe(401);
    expect((await pedir("tokenFalso", crearBase)).status).toBe(401);
  });
  it("un barbero NO puede gestionar al equipo (403) y no se crea nada", async () => {
    expect((await pedir("tokenBarberA", crearBase)).status).toBe(403);
    expect(usuarios.size).toBe(1);
  });
  it("el dueño de OTRO negocio no puede actuar sobre este (403)", async () => {
    expect((await pedir("tokenOwnerB", crearBase)).status).toBe(403);
    expect((await pedir("tokenOwnerB", { accion: "desactivar", business_id: BIZ_A, membership_id: "c0000000-0000-4000-8000-000000000004" })).status).toBe(403);
    expect(filas.find((f) => f.id === "c0000000-0000-4000-8000-000000000004")!.active).toBe(true);
  });
  it("un dueño desactivado ya no puede usarla (403)", async () => {
    expect((await pedir("tokenOwnerAInactivo", crearBase)).status).toBe(403);
  });
  it("rechaza un business_id manipulado (no inyecta filtros)", async () => {
    const r = await pedir("tokenOwnerA", { ...crearBase, business_id: `${BIZ_A}&role=eq.OWNER` });
    expect(r.status).toBe(400);
  });
  it("pedido que no es JSON: 400", async () => {
    const r = await manejar(new Request("https://f.test", { method: "POST", headers: { Authorization: "Bearer tokenOwnerA" }, body: "no es json" }), ENTORNO, fakeFetch);
    expect(r.status).toBe(400);
  });
});

describe("crear", () => {
  it("crea acceso y membresía, genera una clave y la devuelve una sola vez", async () => {
    const r = await pedir("tokenOwnerA", crearBase);
    expect(r.status).toBe(200);
    const c = await cuerpoJson(r);
    expect(c.usuario).toBe("juan.perez");
    expect(typeof c.clave).toBe("string");
    expect((c.clave as string).length).toBe(10);
    const creado = [...usuarios.values()].find((u) => u.email === "juan.perez@equipo.invalid");
    expect(creado?.password).toBe(c.clave);
    const fila = filas.find((f) => f.username === "juan.perez")!;
    expect(fila).toMatchObject({ business_id: BIZ_A, role: "BARBER", display_name: "Juan Pérez" });
    expect(fila.commission_configured).toBeUndefined(); // sin comisión: el dueño la configura después
  });
  it("acepta clave propia y comisión configurada", async () => {
    const r = await pedir("tokenOwnerA", { ...crearBase, clave: "MiClave123", comision: { modelo: "PERCENT", bps: 4000 } });
    expect((await cuerpoJson(r)).clave).toBe("MiClave123");
    const fila = filas.find((f) => f.username === "juan.perez")!;
    expect(fila).toMatchObject({ commission_model: "PERCENT", commission_bps: 4000, commission_configured: true });
  });
  it("normaliza el usuario (espacios y mayúsculas)", async () => {
    const r = await pedir("tokenOwnerA", { ...crearBase, usuario: "  Juan.Perez " });
    expect(r.status).toBe(200);
    expect(filas.some((f) => f.username === "juan.perez")).toBe(true);
  });
  it("valida usuario, rol, clave y comisión (400) sin crear nada", async () => {
    const malos = [
      { ...crearBase, usuario: "ab" },
      { ...crearBase, usuario: "a b c" },
      { ...crearBase, usuario: "juan@perez" },
      { ...crearBase, rol: "OWNER" },
      { ...crearBase, rol: "ADMIN" },
      { ...crearBase, display_name: "   " },
      { ...crearBase, clave: "corta" },
      { ...crearBase, comision: { modelo: "PERCENT", bps: 10001 } },
      { ...crearBase, comision: { modelo: "PERCENT", bps: 12.5 } },
      { ...crearBase, comision: { modelo: "CHAIR_RENT", bps: 500 } },
      { ...crearBase, comision: { modelo: "INVENTADO", bps: 0 } },
    ];
    for (const m of malos) expect((await pedir("tokenOwnerA", m)).status).toBe(400);
    expect(usuarios.size).toBe(1);
    expect(filas.length).toBe(6);
  });
  it("usuario repetido: 409 y no deja nada a medias", async () => {
    await pedir("tokenOwnerA", crearBase);
    const antes = { u: usuarios.size, f: filas.length };
    const r = await pedir("tokenOwnerA", crearBase);
    expect(r.status).toBe(409);
    expect({ u: usuarios.size, f: filas.length }).toEqual(antes);
  });
  it("si falla guardar la membresía, deshace el acceso creado (sin huérfanos)", async () => {
    fallarInsert = true;
    const r = await pedir("tokenOwnerA", crearBase);
    expect(r.status).toBe(500);
    expect(usuarios.size).toBe(1); // solo el barbero original
  });
});

describe("restablecer clave", () => {
  it("cambia la clave y la devuelve una vez", async () => {
    const r = await pedir("tokenOwnerA", { accion: "restablecer", business_id: BIZ_A, membership_id: "c0000000-0000-4000-8000-000000000004" });
    expect(r.status).toBe(200);
    const c = await cuerpoJson(r);
    expect(c.usuario).toBe("barbero.a");
    expect(usuarios.get(U_BARBER_A)!.password).toBe(c.clave);
    expect(c.clave).not.toBe("clave-vieja-1");
  });
  it("con clave elegida por el dueño", async () => {
    await pedir("tokenOwnerA", { accion: "restablecer", business_id: BIZ_A, membership_id: "c0000000-0000-4000-8000-000000000004", clave: "NuevaClave99" });
    expect(usuarios.get(U_BARBER_A)!.password).toBe("NuevaClave99");
  });
  it("no toca cuentas que no se crearon desde la app (409)", async () => {
    expect((await pedir("tokenOwnerA", { accion: "restablecer", business_id: BIZ_A, membership_id: "c0000000-0000-4000-8000-000000000005" })).status).toBe(409);
  });
  it("no toca personas de otro negocio (404) ni al dueño (403)", async () => {
    expect((await pedir("tokenOwnerA", { accion: "restablecer", business_id: BIZ_A, membership_id: "c0000000-0000-4000-8000-000000000006" })).status).toBe(404);
    expect((await pedir("tokenOwnerA", { accion: "restablecer", business_id: BIZ_A, membership_id: "c0000000-0000-4000-8000-000000000001" })).status).toBe(403);
    expect(usuarios.get(U_BARBER_A)!.password).toBe("clave-vieja-1");
  });
});

describe("desactivar y reactivar", () => {
  it("desactiva y reactiva a alguien del negocio", async () => {
    expect((await pedir("tokenOwnerA", { accion: "desactivar", business_id: BIZ_A, membership_id: "c0000000-0000-4000-8000-000000000004" })).status).toBe(200);
    expect(filas.find((f) => f.id === "c0000000-0000-4000-8000-000000000004")!.active).toBe(false);
    expect((await pedir("tokenOwnerA", { accion: "reactivar", business_id: BIZ_A, membership_id: "c0000000-0000-4000-8000-000000000004" })).status).toBe(200);
    expect(filas.find((f) => f.id === "c0000000-0000-4000-8000-000000000004")!.active).toBe(true);
  });
  it("no se puede desactivar al dueño ni a alguien de otro negocio", async () => {
    expect((await pedir("tokenOwnerA", { accion: "desactivar", business_id: BIZ_A, membership_id: "c0000000-0000-4000-8000-000000000001" })).status).toBe(403);
    expect((await pedir("tokenOwnerA", { accion: "desactivar", business_id: BIZ_A, membership_id: "c0000000-0000-4000-8000-000000000006" })).status).toBe(404);
    expect(filas.find((f) => f.id === "c0000000-0000-4000-8000-000000000006")!.active).toBe(true);
  });
  it("acción desconocida: 400", async () => {
    expect((await pedir("tokenOwnerA", { accion: "borrar_todo", business_id: BIZ_A })).status).toBe(400);
  });
});

describe("utilidades", () => {
  it("generarClave: largo, alfabeto sin caracteres confundibles y distinta cada vez", () => {
    const claves = new Set(Array.from({ length: 200 }, () => generarClave()));
    expect(claves.size).toBe(200);
    for (const c of claves) { expect(c).toMatch(/^[a-km-np-zA-HJ-NP-Z2-9]{10}$/); }
  });
  it("normalizarUsuario y emailInterno", () => {
    expect(normalizarUsuario(" Juan_P-1 ")).toBe("juan_p-1");
    expect(normalizarUsuario("ab")).toBeNull();
    expect(normalizarUsuario(5)).toBeNull();
    expect(emailInterno("juan", "equipo.invalid")).toBe("juan@equipo.invalid");
  });
});
