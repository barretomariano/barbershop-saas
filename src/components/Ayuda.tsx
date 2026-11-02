"use client";

import { mensajeAyuda, urlSoporte } from "@/lib/soporte";
import type { Membresia } from "@/lib/tipos";
import { Icono } from "@/components/ui";

// Ajustes → Ayuda: un solo botón que abre WhatsApp con el soporte, con el mensaje ya escrito.
export default function Ayuda({ yo, negocio }: { yo: Membresia; negocio: string }) {
  const enlace = urlSoporte(mensajeAyuda(yo.display_name, negocio));
  return (
    <section className="flex flex-col gap-5">
      <div className="tarjeta flex flex-col gap-3">
        <p className="titulo text-xl">¿Necesitás ayuda?</p>
        <p className="texto-suave text-sm">
          Escribinos por WhatsApp y te respondemos. Contanos qué estabas haciendo y qué pasó; si podés, mandanos una captura de pantalla.
        </p>
        {enlace ? (
          <a className="boton boton-whatsapp" href={enlace} target="_blank" rel="noopener noreferrer">
            <Icono nombre="chat" tam={20} /> Contactar a soporte por WhatsApp
          </a>
        ) : (
          <p className="texto-suave text-sm">Por ahora no hay un contacto de soporte disponible en la app.</p>
        )}
      </div>
    </section>
  );
}
