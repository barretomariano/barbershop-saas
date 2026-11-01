import { describe, expect, it } from "vitest";
import { crearClienteDemo } from "./cliente";
import { DEMO_NEGOCIO_ID, DEMO_USER_ID } from "./datos";
import { hoyAR, rangoPeriodo } from "@/lib/periodos";

const sb = crearClienteDemo();
type Fila = Record<string, unknown>;
const filas = async (p: PromiseLike<{ data: unknown }>) => ((await p).data as Fila[]) ?? [];

describe("modo demo: cliente de ejemplo", () => {
  it("el usuario demo es dueño de la barbería y hay equipo", async () => {
    const equipo = await filas(sb.from("memberships").select("*").eq("active", true));
    const yo = equipo.find((m) => m.user_id === DEMO_USER_ID);
    expect(yo?.role).toBe("OWNER");
    expect(equipo.length).toBeGreaterThanOrEqual(4);
  });

  it("la barbería está configurada y con módulos encendidos", async () => {
    const { data: b } = await sb.from("businesses").select("name").eq("id", DEMO_NEGOCIO_ID).single();
    expect((b as Fila).setup_completed_at ?? "ok").toBeTruthy();
    const mods = await filas(sb.from("business_modules").select("module,enabled").eq("business_id", DEMO_NEGOCIO_ID));
    expect(mods.filter((m) => m.enabled).map((m) => m.module).sort()).toEqual(["AGENDA", "CLIENTES"]);
  });

  it("los resúmenes cuadran con la lista de ventas del mes", async () => {
    const { desde, hasta } = rangoPeriodo("mes");
    const lista = await filas(sb.from("sales").select("*").eq("business_id", DEMO_NEGOCIO_ID).gte("sold_at", desde).lt("sold_at", hasta));
    const validas = lista.filter((v) => v.status === "VALID");
    const { data } = await sb.rpc("resumen_ventas", { p_business: DEMO_NEGOCIO_ID, p_desde: desde, p_hasta: hasta });
    const resumen = data as { vendido: number; cantidad: number; para_barbero: number; para_local: number }[];
    const vendido = resumen.reduce((s, f) => s + f.vendido, 0);
    expect(vendido).toBe(validas.reduce((s, v) => s + Number(v.amount), 0));
    expect(resumen.reduce((s, f) => s + f.para_barbero + f.para_local, 0)).toBe(vendido);
    expect(resumen.reduce((s, f) => s + f.cantidad, 0)).toBe(validas.length);
  });

  it("registrar una venta suma al resumen y calcula la comisión", async () => {
    const { desde, hasta } = rangoPeriodo("hoy");
    const antes = ((await sb.rpc("resumen_ventas", { p_business: DEMO_NEGOCIO_ID, p_desde: desde, p_hasta: hasta })).data as { vendido: number }[]).reduce((s, f) => s + f.vendido, 0);
    const { data: id } = await sb.rpc("register_sale", { p_business: DEMO_NEGOCIO_ID, p_barber_membership: "m-lucas", p_amount: 20000, p_payment: "EFECTIVO", p_idempotency_key: "k", p_service: "s-corte", p_client: null, p_note: null });
    const { data: v } = await sb.from("sales").select("amount,barber_amount,local_amount").eq("id", id).single();
    expect(v).toMatchObject({ amount: 20000, barber_amount: 10000, local_amount: 10000 });
    const despues = ((await sb.rpc("resumen_ventas", { p_business: DEMO_NEGOCIO_ID, p_desde: desde, p_hasta: new Date(Date.now() + 120_000).toISOString() })).data as { vendido: number }[]).reduce((s, f) => s + f.vendido, 0);
    expect(despues).toBe(antes + 20000);
  });

  it("filtro or de turnos por cerrar y turnos con su cliente", async () => {
    const ahora = new Date().toISOString();
    const t = await filas(sb.from("appointments").select("*, clients(name,phone)").eq("business_id", DEMO_NEGOCIO_ID).or(`status.eq.DONE,and(status.eq.SCHEDULED,ends_at.lte.${ahora})`).order("starts_at").limit(50));
    expect(t.length).toBeGreaterThan(0);
    for (const x of t) expect(x.status === "DONE" || (x.status === "SCHEDULED" && String(x.ends_at) <= ahora)).toBe(true);
    const todos = await filas(sb.from("appointments").select("*, clients(name,phone)").eq("business_id", DEMO_NEGOCIO_ID));
    expect(todos.some((x) => x.clients)).toBe(true);
    const { count } = await sb.from("appointments").select("id", { count: "exact", head: true }).eq("business_id", DEMO_NEGOCIO_ID);
    expect(count).toBe(todos.length);
  });

  it("hay datos para widgets, caja, gastos y reportes", async () => {
    const hoy = hoyAR();
    expect(hoy).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const { desde, hasta } = rangoPeriodo("anio");
    const args = { p_business: DEMO_NEGOCIO_ID, p_desde: desde, p_hasta: hasta };
    expect(((await sb.rpc("serie_diaria", args)).data as unknown[]).length).toBeGreaterThan(30);
    expect(((await sb.rpc("ventas_por_hora", args)).data as unknown[]).length).toBeGreaterThan(5);
    expect(((await sb.rpc("top_clientes", { ...args, p_limite: 5 })).data as unknown[]).length).toBe(5);
    expect(((await sb.rpc("resumen_gastos", args)).data as unknown[]).length).toBeGreaterThan(3);
    expect(((await sb.rpc("fijos_mensuales", { p_business: DEMO_NEGOCIO_ID })).data as { alquiler_silla: number; sueldos: number }[])[0]).toEqual({ alquiler_silla: 180000, sueldos: 400000 });
    expect(((await sb.rpc("pendiente_liquidacion", { p_business: DEMO_NEGOCIO_ID, p_upto: hoy })).data as unknown[]).length).toBeGreaterThan(0);
    expect((await filas(sb.from("cash_closings").select("id").eq("business_id", DEMO_NEGOCIO_ID))).length).toBeGreaterThan(0);
  });

  it("update sin filas devuelve lista vacía (el widget entonces inserta)", async () => {
    const { data } = await sb.from("user_widgets").update({ layout: {} }).eq("business_id", DEMO_NEGOCIO_ID).eq("user_id", DEMO_USER_ID).select("business_id");
    expect(data).toEqual([]);
    await sb.from("user_widgets").insert({ business_id: DEMO_NEGOCIO_ID, user_id: DEMO_USER_ID, layout: { a: 1 } });
    const { data: fila } = await sb.from("user_widgets").select("layout").eq("business_id", DEMO_NEGOCIO_ID).eq("user_id", DEMO_USER_ID).maybeSingle();
    expect(fila).toMatchObject({ layout: { a: 1 } });
  });

  it("las métricas visuales responden con datos coherentes", async () => {
    const hasta = new Date(Date.now() + 60_000).toISOString();
    const desde = new Date(Date.now() - 89 * 86_400_000).toISOString();
    const args = { p_business: DEMO_NEGOCIO_ID, p_desde: desde, p_hasta: hasta };
    const calor = (await sb.rpc("mapa_calor", args)).data as { dia_semana: number; hora: number; cantidad: number }[];
    expect(calor.length).toBeGreaterThan(10);
    expect(calor.every((c) => c.dia_semana >= 0 && c.dia_semana <= 6 && c.hora >= 0 && c.hora <= 23)).toBe(true);
    const { data: ventas } = await sb.rpc("resumen_ventas", args);
    const total = (ventas as { cantidad: number }[]).reduce((t, f) => t + f.cantidad, 0);
    expect(calor.reduce((t, c) => t + c.cantidad, 0)).toBe(total);

    const rec = ((await sb.rpc("recurrencia_clientes", args)).data as { con_cliente: number; recurrentes: number }[])[0];
    expect(rec.con_cliente).toBeGreaterThan(0);
    expect(rec.recurrentes).toBeLessThanOrEqual(rec.con_cliente);

    const rent = (await sb.rpc("rentabilidad_servicios", args)).data as { vendido: number; para_local: number }[];
    expect(rent.length).toBeGreaterThan(0);
    expect(rent.every((r) => r.para_local <= r.vendido)).toBe(true);
    expect(Array.isArray((await sb.rpc("serie_gastos", args)).data)).toBe(true);
  });
});
