# Barbershop SaaS

Aplicación web (PWA) multi-tenant para gestionar **ventas y comisiones** de barberías en Argentina.
No es una app de turnos ni de captación de clientes.

## Estado actual: Etapa 4 (pantallas)
Ingreso, cargar ventas, resumen y ajustes. Requiere las variables de Supabase (ver `.env.example`). Sin ellas, la app muestra un aviso de que falta conectarla.

## Stack
Next.js + TypeScript (App Router), Tailwind, Zod, Vitest. Más adelante: Supabase (Postgres, Auth con Google, RLS) y Playwright.

## Cómo correrlo (requiere Node 20+)
```bash
npm install
npm run dev      # abre http://localhost:3000
npm run lint     # revisa el código
npm run test     # corre los tests
npm run build    # compila para producción
```

## Variables de entorno
Copiá `.env.example` como `.env.local` y completá los valores. Ese archivo nunca se sube al repositorio.

## Documentación
- `CLAUDE.md`: reglas del proyecto y etapa actual.
- `docs/architecture.md`: aislamiento entre negocios, roles y cálculo financiero (borrador).
