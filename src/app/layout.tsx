import type { Metadata, Viewport } from "next";
import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/bricolage-grotesque";
import "./globals.css";
import RegistrarSW from "@/components/RegistrarSW";
import { SCRIPT_INICIAL } from "@/lib/tema";

export const metadata: Metadata = {
  title: "Barbershop SaaS",
  description: "Ventas, comisiones y gastos de tu barbería, claros y al instante.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Barbería", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b0b0c",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" data-tema="oscuro" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_INICIAL }} />
      </head>
      <body>
        {children}
        <RegistrarSW />
      </body>
    </html>
  );
}
