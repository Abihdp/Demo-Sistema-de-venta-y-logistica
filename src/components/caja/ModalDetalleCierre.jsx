import Modal from "../ui/Modal";
import Icon from "../ui/Icon";
import { fmt, fmtFechaAR } from "../../utils/helpers";

const BADGE_FORMA = {
  "Efectivo":         { bg: "rgba(62,207,142,0.12)",  color: "var(--green)" },
  "Tarjeta Débito":   { bg: "rgba(96,165,250,0.12)",  color: "var(--blue)"  },
  "Tarjeta Crédito":  { bg: "rgba(96,165,250,0.12)",  color: "var(--blue)"  },
  "Transferencia":    { bg: "rgba(96,165,250,0.12)",  color: "var(--blue)"  },
  "Mercado Pago":     { bg: "rgba(96,165,250,0.12)",  color: "var(--blue)"  },
  "Cheque":           { bg: "rgba(245,158,11,0.12)",  color: "var(--amber)" },
  "Cuenta Corriente": { bg: "rgba(245,158,11,0.12)",  color: "var(--amber)" },
};

function Row({ label, val, color, bold, sub }) {
  return (
    <tr style={{ borderTop: "1px solid var(--border)", background: sub ? "var(--bg4)" : undefined }}>
      <td style={{ padding: "7px 12px", fontSize: 12, color: color || "var(--text2)", fontWeight: bold ? 700 : 500 }}>
        {label}
      </td>
      <td style={{ padding: "7px 12px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: bold ? 700 : 600, color: color || "var(--text1)" }}>
        {fmt(val || 0)}
      </td>
    </tr>
  );
}

function SectionHeader({ label, color }) {
  return (
    <tr style={{ background: "var(--bg4)" }}>
      <td colSpan={2} style={{ padding: "5px 12px 3px", fontSize: 9, fontWeight: 700, color: color || "var(--text3)", textTransform: "uppercase", letterSpacing: ".07em" }}>
        {label}
      </td>
    </tr>
  );
}

export default function ModalDetalleCierre({ cierre, ventas, onClose }) {
  const d = cierre.detalle || cierre;

  // Ventas que entraron en este cierre — reconstruidas en vivo a partir de
  // `ventas` (que la app ya tiene cargado completo, sin límite de fecha) por
  // fecha/hora de creación dentro de la ventana [aperturaTs, cierreTs] de esta
  // sesión de caja. Solo disponible para cierres nuevos que guardaron esa
  // ventana (aperturaTs) — los cierres viejos simplemente no muestran esta
  // sección.
  const aperturaTs = cierre.aperturaTs || d.aperturaTs;
  const cierreTs   = cierre.cierreTs   || d.cierreTs;
  const ventasIncluidas = aperturaTs
    ? (ventas || [])
        .filter(v => v.estado !== "anulada" && v.createdAt >= aperturaTs && (!cierreTs || v.createdAt <= cierreTs))
        .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""))
    : [];
  // "CP-" (Cierre Parcial) vs "C-" (Final): filas que vienen del historial
  // persistido no tienen columna `tipo`, así que el prefijo del número es
  // la fuente confiable — d.tipo/cierre.tipo solo existe en cierres "en vivo".
  const esParcial = d.tipo === "parcial" || cierre.tipo === "parcial"
    || (cierre.numero || d.numero || "").startsWith("CP-");

  const difColor = (d.diferencia || 0) === 0 ? "var(--green)" : (d.diferencia || 0) > 0 ? "var(--blue)" : "var(--red)";
  const difLabel = (d.diferencia || 0) > 0 ? "Sobrante" : (d.diferencia || 0) < 0 ? "Faltante" : "Sin diferencia";

  // Ventas: preferir campos separados TD/TC; backward compat con totalTarjeta
  const ventaRows = [
    { label: "Efectivo",       val: d.ventasEfectivo || d.totalEfectivo },
    { label: "Tarjeta Débito", val: d.ventasTarjetaD ?? (d.ventasTarjeta ? d.ventasTarjeta * 0 : undefined) },
    { label: "Tarjeta Créd.",  val: d.ventasTarjetaC },
    { label: "Tarjeta",        val: d.ventasTarjetaD == null ? (d.ventasTarjeta || d.totalTarjeta) : undefined },
    { label: "Transferencia",  val: d.ventasTransf   || d.totalTransf   },
    { label: "Cheque",         val: d.ventasCheque   || d.totalCheque   },
    { label: "Cta. Corriente", val: d.totalCtaCte,   ctacte: true       },
  ].filter(r => (r.val || 0) > 0);

  const cobrosRows = [
    { label: "Efectivo",       val: d.cobrosEfectivo },
    { label: "Tarjeta Débito", val: d.cobrosTarjetaD },
    { label: "Tarjeta Créd.",  val: d.cobrosTarjetaC },
    { label: "Tarjeta",        val: d.cobrosTarjetaD == null ? d.cobrosTarjeta : undefined },
    { label: "Transferencia",  val: d.cobrosTransf   },
    { label: "Cheque",         val: d.cobrosCheque   },
  ].filter(r => (r.val || 0) > 0);

  const totalCobros = cobrosRows.reduce((a, r) => a + (r.val || 0), 0);
  const totalVentasCaja = ventaRows.filter(r => !r.ctacte).reduce((a, r) => a + (r.val || 0), 0);

  // Período: si hay campos periodoXxx usar esos; si no, los totales del día
  const usaPeriodo = d.periodoEfectivo != null;
  const efPeriodo    = usaPeriodo ? (d.periodoEfectivo || 0) : (d.totalEfectivo || 0);
  const retirosPer   = usaPeriodo ? (d.periodoRetiros  || 0) : (d.totalRetiros  || 0);
  // totalRefuerzos ya se guarda siempre acotado al período (no hay una versión
  // "de todo el día" vieja para este campo, es nuevo), no hace falta el mismo
  // fallback usaPeriodo que usan retiros/efectivo.
  const refuerzosPer = d.totalRefuerzos || 0;
  const inicioPer    = d.inicioEfectivo ?? d.inicio ?? 0;

  // No-efectivo a Tesorería: preferir campos separados de distribución
  const noEfRows = [
    { label: "Tarjeta Débito",  val: d.retiroTarjetaD ?? d.totalTarjetaD ?? (d.totalTarjeta ? null : undefined) },
    { label: "Tarjeta Crédito", val: d.retiroTarjetaC ?? d.totalTarjetaC },
    { label: "Tarjeta",         val: (d.retiroTarjetaD == null && d.totalTarjetaD == null) ? (d.totalTarjeta || 0) : undefined },
    { label: "Transferencia",   val: d.retiroTransf ?? d.totalTransf  },
    { label: "Cheque",          val: d.retiroCheque ?? d.totalCheque  },
  ].filter(r => (r.val || 0) > 0);

  const totalNoEf = noEfRows.reduce((a, r) => a + (r.val || 0), 0);

  return (
    <Modal onClose={onClose} size="modal-lg">
      <div className="modal-header">
        <div>
          <div className="modal-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: "var(--accent2)" }}>{cierre.numero || "Cierre"}</span>
            {esParcial ? (
              <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, background: "rgba(139,92,246,0.15)", color: "var(--accent2)", fontWeight: 700, border: "1px solid rgba(139,92,246,0.25)" }}>CONTROL</span>
            ) : (
              <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, background: "rgba(242,107,91,0.12)", color: "var(--red)", fontWeight: 700, border: "1px solid rgba(242,107,91,0.25)" }}>FINAL</span>
            )}
            <span style={{ fontSize: 12, color: "var(--text3)", fontWeight: 400 }}>{fmtFechaAR(cierre.fecha || d.fecha)}</span>
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 4, fontSize: 11, color: "var(--text3)" }}>
            {cierre.usuario && cierre.usuario !== "—" && <span>👤 {cierre.usuario}</span>}
            {cierre.horaApertura && cierre.horaApertura !== "—" && <span>Apertura: {cierre.horaApertura}</span>}
            <span>Cierre: {cierre.horaCierre || d.hora || "—"}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <button className="btn btn-sm btn-ghost" onClick={() => window.print()} title="Imprimir">
            <Icon name="receipt" size={14} /> Imprimir
          </button>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
      </div>

      <div style={{ padding: "20px 24px", maxHeight: "72vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* ── Métricas rápidas ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {[
            { label: "Total vendido",  val: fmt(cierre.totalVendido || totalVentasCaja + (d.totalCtaCte || 0)), color: "var(--accent2)" },
            { label: "Esperado caja",  val: fmt(d.esperado || 0),  color: "var(--text1)" },
            { label: "Real contado",   val: fmt(d.real || 0),      color: "var(--text1)" },
            { label: difLabel,         val: fmt(Math.abs(d.diferencia || 0)), color: difColor },
          ].map((m, i) => (
            <div key={i} className="metric-card" style={{ textAlign: "center", padding: "10px 12px" }}>
              <div className="metric-label">{m.label}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: m.color, marginTop: 4 }}>
                {m.val}
              </div>
            </div>
          ))}
        </div>

        {/* ── Ventas + cobros / Cuadre ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

          {/* Ventas */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>
              {esParcial ? "Período — por medio de pago" : "Ventas por medio de pago"}
            </div>
            <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  <SectionHeader label={esParcial ? "Ingresos del período" : "Ventas del día"} />
                  {ventaRows.length > 0 ? ventaRows.map((r, i) => (
                    <Row key={i} label={r.label} val={r.val} color={r.ctacte ? "var(--amber)" : undefined} />
                  )) : (
                    <tr><td colSpan={2} style={{ padding: "10px 12px", fontSize: 12, color: "var(--text3)" }}>Sin ventas registradas</td></tr>
                  )}
                  <Row label="Subtotal cobrado" val={totalVentasCaja} bold sub />
                  {(d.totalCtaCte || 0) > 0 && (
                    <Row label="+ Cta. cte. (pendiente)" val={d.totalCtaCte} color="var(--amber)" sub />
                  )}
                  {cobrosRows.length > 0 && (
                    <>
                      <SectionHeader label="Cobros de Cta. Cte." color="var(--blue)" />
                      {cobrosRows.map((r, i) => (
                        <Row key={i} label={r.label} val={r.val} color="var(--blue)" />
                      ))}
                      <Row label="Subtotal cobros" val={totalCobros} bold sub />
                    </>
                  )}
                  {(d.totalCambiosIngreso || 0) > 0 && (
                    <>
                      <SectionHeader label="Notas de Débito" color="var(--accent2)" />
                      <Row label="Diferencias cobradas" val={d.totalCambiosIngreso} color="var(--green)" />
                    </>
                  )}
                  {(d.totalCambiosEgreso || 0) > 0 && (
                    <>
                      <SectionHeader label="Notas de Crédito" color="var(--amber)" />
                      <Row label="Devuelto al cliente" val={d.totalCambiosEgreso} color="var(--red)" />
                    </>
                  )}
                  {(d.totalAnulaciones || 0) > 0 && (
                    <>
                      <SectionHeader label="Anulaciones" color="var(--red)" />
                      <Row label="Reintegros totales" val={d.totalAnulaciones} color="var(--red)" />
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cuadre de efectivo */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>
              Cuadre de efectivo
            </div>
            <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  <Row label={usaPeriodo ? "Inicio período (ef. contado)" : "Saldo inicial"} val={inicioPer} />
                  <Row label="+ Efectivo cobrado" val={efPeriodo} color="var(--green)" />
                  {refuerzosPer > 0 && <Row label="+ Refuerzos" val={refuerzosPer} color="var(--green)" />}
                  {retirosPer > 0 && <Row label="− Retiros" val={-retirosPer} color="var(--red)" />}
                  <Row label="= Esperado en caja" val={d.esperado || 0} bold sub />
                  <Row label="Real contado" val={d.real || 0} bold />
                  <Row label="Diferencia" val={d.diferencia || 0} bold color={difColor} />
                  {(d.retiroFinalEfectivo || 0) > 0 && (
                    <>
                      <tr style={{ borderTop: "2px solid var(--border2)", background: "var(--bg4)" }}>
                        <td colSpan={2} style={{ padding: "5px 12px 3px", fontSize: 9, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".07em" }}>
                          Distribución del cierre
                        </td>
                      </tr>
                      <Row label="Efectivo a Tesorería" val={d.retiroFinalEfectivo} />
                      <Row label="Saldo que queda en caja" val={d.saldoInicial || 0} color="var(--green)" bold />
                    </>
                  )}
                </tbody>
              </table>
            </div>

            {/* Resumen no-efectivo a Tesorería */}
            {totalNoEf > 0 && (
              <div style={{ marginTop: 12, background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                <div style={{ padding: "5px 12px 3px", background: "var(--bg4)", fontSize: 9, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".07em" }}>
                  No efectivo — {esParcial ? "confirmado" : "a Tesorería"}
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <tbody>
                    {noEfRows.map((r, i) => <Row key={i} label={r.label} val={r.val} />)}
                    {noEfRows.length > 1 && (
                      <Row label="Total no efectivo" val={totalNoEf} bold sub />
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ── Cierres de control incluidos (solo en cierre final) ── */}
        {!esParcial && (d.cierresParciales || []).length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>
              Cierres de control del día ({d.cierresParciales.length})
            </div>
            <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              {d.cierresParciales.map((cp, i) => (
                <div key={cp.id || i} style={{ display: "flex", alignItems: "center", padding: "7px 12px", borderBottom: "1px solid var(--border)", gap: 10, fontSize: 12 }}>
                  <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 3, background: "rgba(139,92,246,0.12)", color: "var(--accent2)", fontWeight: 700, border: "1px solid rgba(139,92,246,0.25)" }}>
                    {cp.numero}
                  </span>
                  <span style={{ color: "var(--text3)", minWidth: 55 }}>{cp.hora}</span>
                  <span style={{ color: "var(--text2)", flex: 1 }}>{cp.usuario}</span>
                  <span style={{ color: "var(--text3)" }}>Ef. esperado: <strong>{fmt(cp.esperado)}</strong></span>
                  <span style={{ color: "var(--green)", fontFamily: "var(--font-mono)", fontWeight: 600 }}>{fmt(cp.real)}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 13, color: cp.diferencia === 0 ? "var(--green)" : cp.diferencia > 0 ? "var(--blue)" : "var(--red)" }}>
                    {cp.diferencia >= 0 ? "+" : ""}{fmt(cp.diferencia)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Retiros del día ── */}
        {(d.retiros || []).length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>
              Retiros registrados
            </div>
            <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              {d.retiros.map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", padding: "8px 12px", borderBottom: "1px solid var(--border)", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--text3)", minWidth: 55 }}>{r.hora}</span>
                  {(r.medio ?? "Efectivo") === "Efectivo" ? (
                    <span className="badge badge-ok" style={{ fontSize: 10 }}>Efectivo</span>
                  ) : (
                    <span className="badge badge-blue" style={{ fontSize: 10 }}>Transferencia</span>
                  )}
                  {r.cuentaId === "retiro_dueno" ? (
                    <span className="badge badge-blue" style={{ fontSize: 10 }}>Retiro dueño</span>
                  ) : r.cuentaNombre ? (
                    <span className="badge badge-ok" style={{ fontSize: 10 }}>{r.cuentaNombre}</span>
                  ) : (
                    <span style={{ fontSize: 11, color: "var(--text3)" }}>—</span>
                  )}
                  <span style={{ flex: 1, fontSize: 13, color: "var(--text2)" }}>{r.motivo}</span>
                  <span style={{ color: "var(--red)", fontWeight: 600, fontSize: 13, fontFamily: "var(--font-mono)" }}>−{fmt(r.monto)}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 12px", background: "var(--bg4)", borderTop: "2px solid var(--border2)" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text1)" }}>Total retiros</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--red)" }}>−{fmt(d.totalRetiros || 0)}</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Refuerzos del período ── */}
        {(d.refuerzos || []).length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>
              Refuerzos registrados
            </div>
            <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              {d.refuerzos.map((r, i) => (
                <div key={r.id || i} style={{ display: "flex", alignItems: "center", padding: "8px 12px", borderBottom: "1px solid var(--border)", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--text3)", minWidth: 55 }}>{r.hora}</span>
                  {r.origen === "tesoreria" ? (
                    <span className="badge badge-blue" style={{ fontSize: 10 }}>Tesorería</span>
                  ) : (
                    <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 4, background: "rgba(245,158,11,0.12)", color: "var(--amber)", border: "1px solid rgba(245,158,11,0.25)", fontWeight: 700 }}>Externo</span>
                  )}
                  <span style={{ flex: 1, fontSize: 13, color: "var(--text2)" }}>{r.motivo}</span>
                  <span style={{ color: "var(--green)", fontWeight: 600, fontSize: 13, fontFamily: "var(--font-mono)" }}>+{fmt(r.monto)}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 12px", background: "var(--bg4)", borderTop: "2px solid var(--border2)" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text1)" }}>Total refuerzos</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--green)" }}>+{fmt(refuerzosPer)}</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Ventas anuladas ── */}
        {(d.anulacionesDia || []).length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--red)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>
              Ventas anuladas ({d.anulacionesDia.length})
            </div>
            <div style={{ background: "var(--bg3)", border: "1px solid rgba(242,107,91,0.25)", borderRadius: 8, overflow: "hidden" }}>
              {d.anulacionesDia.map((a, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", padding: "8px 12px", borderBottom: "1px solid var(--border)", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--text3)", minWidth: 55, flexShrink: 0 }}>{a.hora}</span>
                  <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 4, background: "rgba(242,107,91,0.1)", color: "var(--red)", border: "1px solid rgba(242,107,91,0.2)", flexShrink: 0 }}>
                    #{a.ventaId}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: "var(--text2)" }}>{a.cliente}</div>
                    <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>{a.motivo}</div>
                  </div>
                  <span style={{ color: "var(--red)", fontWeight: 600, fontSize: 13, fontFamily: "var(--font-mono)", flexShrink: 0 }}>−{fmt(a.total)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Ventas incluidas en este cierre ── */}
        {ventasIncluidas.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>
              Ventas incluidas ({ventasIncluidas.length})
            </div>
            <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              {ventasIncluidas.map(v => {
                const badge = BADGE_FORMA[v.formaPago] || { bg: "var(--bg4)", color: "var(--text3)" };
                return (
                  <div key={v.id} style={{ display: "flex", alignItems: "center", padding: "8px 12px", borderBottom: "1px solid var(--border)", gap: 8, fontSize: 12 }}>
                    <span style={{ color: "var(--text3)", minWidth: 55, flexShrink: 0 }}>
                      {v.fecha !== (cierre.fecha || d.fecha) ? `${fmtFechaAR(v.fecha)} ` : ""}{v.hora || (v.createdAt ? new Date(v.createdAt).toLocaleTimeString() : "—")}
                    </span>
                    <span style={{ padding: "1px 7px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: badge.bg, color: badge.color, flexShrink: 0 }}>
                      {v.formaPago || "—"}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, color: "var(--text2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {v.cliente || "Consumidor Final"}
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text1)", flexShrink: 0 }}>{fmt(v.total)}</span>
                  </div>
                );
              })}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 12px", background: "var(--bg4)", borderTop: "2px solid var(--border2)" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text1)" }}>Total vendido</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--text1)" }}>
                  {fmt(ventasIncluidas.reduce((a, v) => a + (v.total || 0), 0))}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── Comprobantes emitidos ── */}
        {(d.comprobantes || []).length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>
              Comprobantes emitidos ({d.comprobantes.length})
            </div>
            <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              {d.comprobantes.map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", padding: "8px 12px", borderBottom: "1px solid var(--border)", gap: 8, fontSize: 12 }}>
                  <span style={{ color: "var(--text3)", minWidth: 55 }}>{r.hora}</span>
                  <span style={{ padding: "1px 7px", borderRadius: 4, fontSize: 10, fontWeight: 700,
                    background: r.tipo === "Recibo" ? "rgba(62,207,142,0.12)" : r.tipo === "Nota de Crédito" ? "rgba(96,165,250,0.12)" : "rgba(245,158,11,0.12)",
                    color: r.tipo === "Recibo" ? "var(--green)" : r.tipo === "Nota de Crédito" ? "var(--blue)" : "var(--amber)",
                  }}>
                    {r.tipo}
                  </span>
                  <span style={{ color: "var(--text3)", fontFamily: "var(--font-mono)", minWidth: 65 }}>{r.numero}</span>
                  <span style={{ flex: 1, color: "var(--text2)" }}>{r.cliente}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text1)" }}>{fmt(r.monto)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      <div className="modal-footer">
        <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
        <button className="btn btn-sm" onClick={() => window.print()}>
          <Icon name="receipt" size={14} /> Imprimir
        </button>
      </div>
    </Modal>
  );
}
