import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { crearClienteDemo } from "@/lib/demo/cliente";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let cliente: SupabaseClient | null = null;

// MODO DEMO: si faltan las variables de Supabase, la app se abre con una barbería inventada y datos de ejemplo
// (sin base de datos ni login). Sirve para diseñar y mostrar la interfaz, por ejemplo en Modeinspect.
// Solo se activa fuera de producción, o en producción si se pide expresamente con NEXT_PUBLIC_MODO_DEMO=1.
// Con las variables cargadas (producción real) nunca se activa.
export function modoDemo(): boolean {
  if (url && clave) return false;
  return process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_MODO_DEMO === "1";
}

export function supabaseConfigurado(): boolean {
  return Boolean(url && clave) || modoDemo();
}

// Solo usa la clave pública (anon). La seguridad real la ponen las reglas RLS de la base.
export function getSupabase(): SupabaseClient {
  if (modoDemo()) {
    if (!cliente) cliente = crearClienteDemo() as unknown as SupabaseClient;
    return cliente;
  }
  if (!url || !clave) throw new Error("Faltan las variables de entorno de Supabase.");
  if (!cliente) cliente = createClient(url, clave);
  return cliente;
}
