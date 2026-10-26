import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let cliente: SupabaseClient | null = null;

export function supabaseConfigurado(): boolean {
  return Boolean(url && clave);
}

// Solo usa la clave pública (anon). La seguridad real la ponen las reglas RLS de la base.
export function getSupabase(): SupabaseClient {
  if (!url || !clave) throw new Error("Faltan las variables de entorno de Supabase.");
  if (!cliente) cliente = createClient(url, clave);
  return cliente;
}
