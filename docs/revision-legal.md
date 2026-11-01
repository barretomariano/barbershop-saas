# Revisión legal (borrador de trabajo — no es asesoramiento legal)

Hecha el 1/11/2026 sobre lo que la app hace hoy. **Antes de publicar los textos, que los revise un abogado/a**: yo no soy abogado y varias decisiones dependen de cómo constituyas la empresa y de quiénes sean tus clientes.

## Qué datos maneja la app
- De los usuarios: email/usuario, nombre, rol.
- De cada barbería: nombre, logo, servicios, precios, comisiones, ventas, gastos, caja, turnos.
- **De los clientes de las barberías: nombre, teléfono, notas** (módulo Clientes) → son datos personales de terceros. No se guardan datos de tarjetas ni datos sensibles.

## Marco aplicable (Argentina)
- **Ley 25.326 de Protección de los Datos Personales** y la **AAIP** como autoridad de control.
- Obligación de **inscribir las bases de datos** en el Registro Nacional de Bases de Datos (art. 21), por Trámites a Distancia. La fiscalización es pausada, pero la obligación existe.
- **Transferencia internacional** (art. 12): Supabase y Cloudflare procesan datos fuera del país según la región elegida.
- Hay proyectos de reforma de la ley, pero en lo que pude ver no hay una ley nueva vigente: confirmalo con el abogado.

## Qué ya está hecho
- Aislamiento entre barberías y por rol (verificado con 356 pruebas automáticas): cada barbería ve lo suyo y cada barbero solo lo suyo.
- Registro de auditoría de acciones sensibles.
- Borradores de **Términos y condiciones** (`public/terminos.html`) y **Política de privacidad** (`public/privacidad.html`), con la pausa por falta de pago explicada.
- Contraseñas y conexiones cifradas (lo resuelve Supabase/Cloudflare).

## Qué falta (en orden de prioridad)
1. **Constituir la empresa y tener CUIT** (tu idea). Los textos legales y el cobro deberían salir a nombre de ella. Hablá con un contador: el cobro de $20.000/mes requiere estar inscripto (monotributo o sociedad) y emitir factura.
2. **Completar los datos entre [corchetes]** en ambos textos: razón social, CUIT, domicilio, email, WhatsApp, jurisdicción, plazo de conservación (propuse 90 días) y **región de Supabase** (Supabase → Project Settings → General).
3. **Inscribir la base de datos de usuarios** en el Registro Nacional de Bases de Datos de la AAIP (a nombre de la empresa). Preguntale al abogado si también conviene orientar a cada barbería sobre su propia base de clientes.
4. **Acuerdo de tratamiento por cuenta de terceros** (art. 25): las barberías son responsables de los datos de sus clientes y vos los tratás por su cuenta. Los términos ya lo reflejan; el abogado decide si hace falta algo más formal.
5. **Aceptación de los términos.** Hoy no hay una casilla de aceptación en la app. Como das de alta cada cuenta vos mismo, alcanza por ahora con que el dueño acepte por WhatsApp (guardá la captura). Si querés, después le agrego una pantalla de “Aceptar términos” al primer ingreso.
6. **Consumidor vs. empresa.** Preguntale al abogado si una barbería chica puede considerarse consumidora (Ley 24.240): eso cambiaría cosas como el derecho de arrepentimiento y el botón de baja.
7. **Procedimiento de baja y borrado** de datos (pedido del cliente o fin del plazo de pausa) y de **qué hacer ante un incidente de seguridad**. Hoy no hay una obligación legal de notificar incidentes, pero conviene tener el plan escrito.
8. **Marca:** verificar en el INPI que el nombre de la app/empresa esté disponible antes de invertir en logo y dominio.

## Cuando esté listo
Avisame y: (a) agrego los enlaces a Términos y Privacidad en el login y en Ajustes, y (b) si querés, la pantalla de aceptación.
