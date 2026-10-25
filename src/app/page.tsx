export default function Inicio() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Barbershop SaaS</h1>
      <p style={{ color: "var(--suave)" }}>
        La aplicación está funcionando. Todavía no hay inicio de sesión ni datos: esta es la base
        del proyecto (Etapa 1).
      </p>
      <p className="text-sm font-medium" style={{ color: "var(--acento)" }}>
        Estado: entorno listo, sin funciones de negocio.
      </p>
    </main>
  );
}
