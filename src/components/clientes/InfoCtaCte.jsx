import { fmt, calcularSaldoCtaCte } from "../../utils/helpers.js";

export default function InfoCtaCte({
  cliente,
  ventas,
  pagosCtaCte,
  cambiosArticulo,
  montoNuevaVenta = 0, // monto (o porción a cta. cte.) de la venta actual en curso
}) {
  if (!cliente) return null;

  const saldoUtilizado = calcularSaldoCtaCte(cliente.id, ventas, pagosCtaCte, cambiosArticulo);
  const limite          = cliente.limiteCtaCte ?? null;
  const saldoDisponible = limite !== null ? Math.max(0, limite - saldoUtilizado) : null;
  const totalConNueva   = saldoUtilizado + montoNuevaVenta;
  const superaLimite    = limite !== null && totalConNueva > limite;
  const pctUsado = limite === null ? null
    : limite === 0 ? (saldoUtilizado > 0 ? 100 : 0)
    : Math.min(100, Math.round((saldoUtilizado / limite) * 100));
  const pagadoTotal = (pagosCtaCte || []).filter(p => p.clienteId === cliente.id).reduce((a, p) => a + p.monto, 0);

  return (
    <div style={{
      padding: "12px 14px",
      borderRadius: 8,
      border: `1px solid ${superaLimite ? "rgba(242,107,91,0.35)" : "var(--border)"}`,
      background: superaLimite ? "rgba(242,107,91,0.07)" : "var(--bg3)",
      marginTop: 8,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: "var(--text3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>
          Cuenta corriente — {cliente.nombre}
        </span>
        {limite === null && (
          <span style={{ fontSize: 11, color: "var(--text3)" }}>Sin límite configurado</span>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: limite !== null ? 10 : 0 }}>
        <div style={{ textAlign: "center", padding: "8px 0", background: "var(--bg2)", borderRadius: 6 }}>
          <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 2 }}>Saldo utilizado</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: saldoUtilizado > 0 ? "var(--amber)" : "var(--text1)" }}>
            {fmt(saldoUtilizado)}
          </div>
        </div>
        <div style={{ textAlign: "center", padding: "8px 0", background: "var(--bg2)", borderRadius: 6 }}>
          <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 2 }}>
            {limite !== null ? "Disponible" : "Pagado total"}
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: limite !== null ? (saldoDisponible === 0 ? "var(--red)" : "var(--green)") : "var(--green)" }}>
            {limite !== null ? fmt(saldoDisponible) : fmt(pagadoTotal)}
          </div>
        </div>
      </div>

      {limite !== null && (
        <>
          <div style={{ height: 6, background: "var(--bg2)", borderRadius: 99, overflow: "hidden", marginBottom: 6 }}>
            <div style={{
              height: "100%",
              width: `${pctUsado}%`,
              background: pctUsado >= 100 ? "var(--red)" : pctUsado >= 80 ? "var(--amber)" : "var(--green)",
              borderRadius: 99,
              transition: "width .3s ease",
            }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text3)" }}>
            <span>{pctUsado}% utilizado</span>
            <span>Límite: {fmt(limite)}</span>
          </div>
        </>
      )}

      {superaLimite && montoNuevaVenta > 0 && (
        <div style={{
          marginTop: 10, padding: "8px 12px", borderRadius: 6,
          background: "rgba(242,107,91,0.12)", border: "1px solid rgba(242,107,91,0.3)",
          fontSize: 12, color: "var(--red)", fontWeight: 600,
        }}>
          ⚠ Esta venta de {fmt(montoNuevaVenta)} superaría el límite.
          Saldo resultante: {fmt(totalConNueva)} / {fmt(limite)}
        </div>
      )}

      {!superaLimite && limite !== null && pctUsado >= 80 && montoNuevaVenta === 0 && (
        <div style={{ marginTop: 8, fontSize: 11, color: "var(--amber)", textAlign: "center", fontWeight: 500 }}>
          El cliente está cerca de su límite ({pctUsado}% utilizado)
        </div>
      )}
    </div>
  );
}
