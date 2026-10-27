"use client";

import { useEffect } from "react";

// Registra el service worker (solo en producción) para que la app se pueda instalar en el celular.
export default function RegistrarSW() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
