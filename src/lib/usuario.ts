// Los barberos y encargados entran con "usuario y clave". Por dentro, Supabase pide un email,
// así que el sistema usa uno interno: usuario@<dominio>. El dueño sigue entrando con su email.
// El dominio debe ser el mismo que usa la función del servidor (secreto EMAIL_DOMAIN).
export const DOMINIO_USUARIOS = process.env.NEXT_PUBLIC_DOMINIO_USUARIOS || "equipo.invalid";

const PATRON_USUARIO = /^[a-z0-9._-]{3,30}$/;

// Usuario válido en minúsculas (3 a 30 caracteres: letras, números, punto, guion, guion bajo).
export function normalizarUsuario(texto: string): string | null {
  const u = texto.trim().toLowerCase();
  return PATRON_USUARIO.test(u) ? u : null;
}

// Lo que escribe la persona en el login: un email completo o solo su usuario.
export function aEmailDeAcceso(texto: string, dominio: string = DOMINIO_USUARIOS): string {
  const t = texto.trim();
  return t.includes("@") ? t : `${t.toLowerCase()}@${dominio}`;
}
