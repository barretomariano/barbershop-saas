"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { formatearARS } from "@/lib/dinero";
import { explicarMontoInvalido, parsearMonto } from "@/lib/validacion";
import { MEDIOS_PAGO, type MedioPago, type Membresia, type Servicio } from "@/lib/tipos";

interface Props { yo: Membresia; barberos: Membresia[] }
interface Resultado { amount: number; barber_amount: number; local_amount: number }

export default function Vender({ yo, barberos }: Props) {
  const esBarbero = yo.role === "BARBER";
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [barbero, setBarbero] = useState<string>(esBarbero ? yo.id : (barberos[0]?.id ?? ""));
  const [servicio, setServicio] = useState<string | null>(null);
  const [monto, setMonto] = useState("");
  const [medio, setMedio] = useState<MedioPago>("EFECTIVO");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  // Misma clave hasta que la venta se guarde: si se toca dos veces, no se duplica.
  const clave = useRef<string>(crypto.randomUUID());

  useEffect(() => {
    getSupabase()
      .from("services").select("id,business_id,name,default_price,active")
      .eq("business_id", yo.business_id).eq("active", true).order("name")
      .then(({ data }) => setServicios((data as Servicio[]) ?? []));
  }, [yo.business_id]);

  const montoNum = parsearMonto(monto);

  function elegirServicio(s: Servicio) {
    setServicio(s.id);
    setMonto(String(s.default_price));
    setResultado(null);
  }

  async function guardar() {
    if (!montoNum || !barbero) return;
    setEnviando(true);
    setError(null);
    const sb = getSupabase();
    const { data: id, error: e } = await sb.rpc("register_sale", {
      p_business: yo.business_id,
      p_barber_membership: barbero,
      p_amount: montoNum,
      p_payment: medio,
      p_idempotency_key: clave.current,
      p_service: servicio,
    });
    if (e) {
      setError(e.message);
      setEnviando(false);
      return;
    }
    const { data: venta } = await sb.from("sales").select("amount,barber_amount,local_amount").eq("id", id).single();
    setResultado(venta as Resultado);
    setMonto("");
    setServicio(null);
    clave.current = crypto.randomUUID();
    setEnviando(false);
  }

  return (
    <section className="flex flex-col gap-5">
      {!esBarbero && (
        <label className="flex flex-col gap-1 text-sm">
          Barbero
          <select className="campo" value={barbero} onChange={(e) => setBarbero(e.target.value)}>
            {barberos.map((b) => <option key={b.id} value={b.id}>{b.display_name}</option>)}
          </select>
        </label>
      )}

      <div>
        <p className="mb-2 text-sm">Servicio</p>
        {servicios.length === 0 ? (
          <p className="text-sm texto-suave">Todavía no hay servicios. Podés cargar el monto a mano.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {servicios.map((s) => (
              <button key={s.id} onClick={() => elegirServicio(s)}
                className={`chip ${servicio === s.id ? "chip-activo" : ""}`}>
                {s.name} · {formatearARS(s.default_price)}
              </button>
            ))}
          </div>
        )}
      </div>

      <label className="flex flex-col gap-1 text-sm">
        Monto cobrado
        <input className="campo text-2xl" inputMode="numeric" placeholder="$ 0" value={monto}
          onChange={(e) => { setMonto(e.target.value); setServicio(null); setResultado(null); }} />
        {montoNum && <span className="texto-suave">{formatearARS(montoNum)}</span>}
        {explicarMontoInvalido(monto) && <span role="alert" className="text-sm text-red-600">{explicarMontoInvalido(monto)}</span>}
      </label>

      <div>
        <p className="mb-2 text-sm">Medio de pago</p>
        <div className="flex flex-wrap gap-2">
          {MEDIOS_PAGO.map((m) => (
            <button key={m.valor} onClick={() => setMedio(m.valor)}
              className={`chip ${medio === m.valor ? "chip-activo" : ""}`}>{m.etiqueta}</button>
          ))}
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button className="boton" onClick={guardar} disabled={enviando || !montoNum || !barbero}>
        {enviando ? "Guardando…" : "Guardar venta"}
      </button>

      {resultado && (
        <div role="status" className="rounded-xl border p-4 text-sm" style={{ borderColor: "var(--acento)" }}>
          <p className="font-medium">Venta guardada: {formatearARS(resultado.amount)}</p>
          <p className="texto-suave">Barbero {formatearARS(resultado.barber_amount)} · Local {formatearARS(resultado.local_amount)}</p>
        </div>
      )}
    </section>
  );
}
