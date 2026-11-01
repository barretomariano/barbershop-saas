// Contacto de soporte por WhatsApp. El número se configura con la variable NEXT_PUBLIC_SOPORTE_WHATSAPP
// (solo dígitos con código de país, por ejemplo 5491112345678). Si no está, la app no muestra el botón.

export function numeroSoporte(valor: string | undefined = process.env.NEXT_PUBLIC_SOPORTE_WHATSAPP): string | null {
  const digitos = (valor ?? "").replace(/\D/g, "");
  return digitos.length >= 10 ? digitos : null;
}

export function urlSoporte(mensaje: string, numero: string | null = numeroSoporte()): string | null {
  return numero ? `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}` : null;
}
