# Instrucciones para agentes (Codex, Claude, etc.)

Este repo es un SaaS para barberías en Argentina. **Antes de tocar nada, leé en este orden:**
1. `CLAUDE.md`: reglas duras del proyecto (valen para cualquier agente, no solo Claude).
2. `docs/handoff-codex.md`: estado actual, lo que falta, trampas conocidas y cómo trabajar.
3. `docs/planes.md` y `docs/architecture.md`: producto y arquitectura.

Resumen de lo no negociable:
- Interfaz en español argentino. Montos en ARS como enteros.
- Aislamiento por `business_id` con RLS en la base. Cálculos de dinero y permisos en la base, nunca en el navegador.
- Nunca editar una migración ya existente: los cambios de esquema van en una migración nueva con el siguiente número.
- Ningún secreto en el repo (ni tokens de GitHub ni la clave `service_role`).
- No declarar algo terminado sin ejecutarlo: `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` deben pasar.
- Respuestas y mensajes de commit en español.
