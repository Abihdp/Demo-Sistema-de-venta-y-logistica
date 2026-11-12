import { useMemo } from "react";
import { Modal } from "../ui/Modal.jsx";
import Paginacion from "../ui/Paginacion.jsx";
import { usePaginacion } from "../../hooks/usePaginacion";
import { fmt, montoCtaCte, cargosCambioCtaCte, fmtFechaAR } from "../../utils/helpers.js";

function buildDetalleHTML(cliente, movimientos, saldoInicial, saldoFinal, fechaDesde, fechaHasta) {
  const filas = movimientos.map(m => `
    <tr>
      <td>${fmtFechaAR(m.fecha)}</td>
      <td>${m.tipo}</td>
      <td>${m.concepto}</td>
      <td style="text-align:right;color:${m.tipo === "Pago" ? "#27ae60" : "#e67e22"}">
        ${m.tipo === "Pago" ? "-" : "+"}$${Math.round(m.monto).toLocaleString("es-AR")}
      </td>
      <td style="text-align:right;font-weight:600;color:${m.saldoAcum > 0 ? "#c0392b" : "#27ae60"}">
        $${Math.round(m.saldoAcum).toLocaleString("es-AR")}
      </td>
    </tr>`).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Detalle Cta. Cte. — ${cliente.nombre}</title>
<style>
  body { font-family: Arial, sans-serif; padding: 24px; color: #1a1a2e; }
  h2 { margin-bottom: 4px; }
  p.sub { color: #666; font-size: 13px; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { background: #2c2c54; color: #fff; padding: 10px 12px; text-align: left; }
  td { padding: 9px 12px; border-bottom: 1px solid #eee; }
  tr:nth-child(even) td { background: #f9f9f9; }
  .totales { margin-top: 16px; padding: 14px 18px; background: #f5f5f5; border-radius: 6px;
    display: flex; gap: 32px; flex-wrap: wrap; }
  .total-item label { display: block; font-size: 11px; color: #666; text-transform: uppercase;
    letter-spacing: .04em; font-weight: 600; margin-bottom: 4px; }
  .total-item strong { font-size: 18px; font-weight: 700; }
  .footer { margin-top: 20px; font-size: 11px; color: #999; }
</style></head><body>
<h2>Cuenta Corriente — ${cliente.nombre}</h2>
<p class="sub">DNI: ${cliente.dni || "—"} &nbsp;·&nbsp; Período: ${fmtFechaAR(fechaDesde) || "inicio"} al ${fmtFechaAR(fechaHasta) || "hoy"} &nbsp;·&nbsp; Generado: ${new Date().toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" })}</p>
<table>
  <thead><tr>
    <th>Fecha</th><th>Tipo</th><th>Concepto</th><th>Monto</th><th>Saldo acumulado</th>
  </tr></thead>
  <tbody>${filas}</tbody>
</table>
<div class="totales">
  <div class="total-item">
    <label>Saldo inicial (antes del período)</label>
    <strong style="color:${saldoInicial > 0 ? "#c0392b" : "#27ae60"}">$${Math.round(saldoInicial).toLocaleString("es-AR")}</strong>
  </div>
  <div class="total-item">
    <label>Movimientos en el período</label>
    <strong>${movimientos.length}</strong>
  </div>
  <div class="total-item">
    <label>Saldo final del período</label>
    <strong style="color:${saldoFinal > 0 ? "#c0392b" : "#27ae60"}">$${Math.round(saldoFinal).toLocaleString("es-AR")}</strong>
  </div>
</div>
<div class="footer">PECO S. — Sistema de Gestión Comercial</div>
</body></html>`;
}

export default function ModalDetalleCtaCte({ cliente, ventas, pagos, cambiosArticulo, fechaDesde, fechaHasta, onClose }) {
  const { movimientos, saldoInicial, saldoFinal } = useMemo(() => {
    const enPeriodo      = f => (!fechaDesde || f >= fechaDesde) && (!fechaHasta || f <= fechaHasta);
    const antesDelPeriodo = f => !!fechaDesde && f < fechaDesde;

    const ventasCliente = (ventas || []).filter(v => v.clienteId === cliente.id && montoCtaCte(v) > 0);
    const cambiosCliente = cargosCambioCtaCte(cliente.id, cambiosArticulo);
    const pagosCliente  = (pagos  || []).filter(p => p.clienteId === cliente.id);

    const deudaAntesVentas  = ventasCliente.filter(v => antesDelPeriodo(v.fecha)).reduce((a, v) => a + montoCtaCte(v), 0);
    const deudaAntesCambios = cambiosCliente.filter(g => antesDelPeriodo(g.fecha)).reduce((a, g) => a + g.diferencia, 0);
    const pagosAntes = pagosCliente .filter(p => antesDelPeriodo(p.fecha)).reduce((a, p) => a + p.monto,      0);
    const saldoInicial = deudaAntesVentas + deudaAntesCambios - pagosAntes;

    const movs = [
      ...ventasCliente.filter(v => enPeriodo(v.fecha)).map(v => ({
        fecha: v.fecha, tipo: "Venta",
        concepto: v.items?.map(i => `${i.qty}x ${i.nombre}`).join(", ") || "Venta cta. cte.",
        monto: montoCtaCte(v),
        _k: v.fecha + "A" + String(v.id ?? ""),
      })),
      ...cambiosCliente.filter(g => enPeriodo(g.fecha)).map(g => ({
        fecha: g.fecha, tipo: "Venta",
        concepto: `Cambio de artículo ${g.nro}${g.motivo ? " — " + g.motivo : ""}`,
        monto: g.diferencia,
        _k: g.fecha + "C" + String(g.nro ?? ""),
      })),
      ...pagosCliente.filter(p => enPeriodo(p.fecha)).map(p => ({
        fecha: p.fecha, tipo: "Pago",
        concepto: p.observacion || "Pago cta. cte.",
        monto: p.monto,
        _k: p.fecha + "B" + String(p.id ?? ""),
      })),
    ].sort((a, b) => a._k.localeCompare(b._k));

    let acum = saldoInicial;
    const movimientos = movs.map(m => {
      acum = m.tipo === "Pago" ? acum - m.monto : acum + m.monto;
      return { ...m, saldoAcum: acum };
    });

    return { movimientos, saldoInicial, saldoFinal: acum };
  }, [cliente, ventas, pagos, cambiosArticulo, fechaDesde, fechaHasta]);

  const { pagina, setPagina, totalPaginas, itemsPagina: movimientosPagina, pageSize } = usePaginacion(movimientos);

  const periodoLabel = (fechaDesde || fechaHasta)
    ? `${fmtFechaAR(fechaDesde) || "inicio"} al ${fmtFechaAR(fechaHasta) || "hoy"}`
    : "Todo el historial";

  function handleExport() {
    const html = buildDetalleHTML(cliente, movimientos, saldoInicial, saldoFinal, fechaDesde, fechaHasta);
    const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ctacte-${cliente.nombre.replace(/\s+/g, "-")}.html`;
    a.click();
  }

  function handlePrint() {
    const html = buildDetalleHTML(cliente, movimientos, saldoInicial, saldoFinal, fechaDesde, fechaHasta);
    const htmlPrint = html.replace("</body>", "<script>window.onload=function(){window.print();}<\/script></body>");
    const blob = new Blob([htmlPrint], { type: "text/html;charset=utf-8;" });
    window.open(URL.createObjectURL(blob), "_blank");
  }

  return (
    <Modal onClose={onClose} size="modal-lg">
      <div className="modal-header">
        <div>
          <div className="modal-title">{cliente.nombre} — Cta. Cte. por período</div>
          <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
            DNI {cliente.dni} · {periodoLabel}
          </div>
        </div>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 16 }}>
        {[
          { label: "Saldo inicial", val: fmt(saldoInicial), color: saldoInicial > 0 ? "var(--amber)" : "var(--green)" },
          { label: "Movimientos en el período", val: `${movimientos.length} registros`, color: "var(--text1)" },
          { label: "Saldo final", val: fmt(saldoFinal), color: saldoFinal > 0 ? "var(--red)" : "var(--green)" },
        ].map((m, i) => (
          <div key={i} style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "12px 14px" }}>
            <div style={{ fontSize: 11, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 4, fontWeight: 600 }}>{m.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: m.color }}>{m.val}</div>
          </div>
        ))}
      </div>

      <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
        {movimientos.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: "var(--text3)", fontSize: 13 }}>
            Sin movimientos en el período seleccionado
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["Fecha", "Tipo", "Concepto", "Monto", "Saldo acum."].map(h => (
                  <th key={h} style={{ padding: "8px 12px", fontSize: 11, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".04em", textAlign: "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {movimientosPagina.map((m, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "9px 12px", fontSize: 13, color: "var(--text2)" }}>{fmtFechaAR(m.fecha)}</td>
                  <td style={{ padding: "9px 12px" }}>
                    <span style={{
                      display: "inline-block", padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 600,
                      background: m.tipo === "Pago" ? "rgba(34,197,94,0.12)" : "rgba(245,158,11,0.12)",
                      color: m.tipo === "Pago" ? "var(--green)" : "var(--amber)",
                    }}>{m.tipo}</span>
                  </td>
                  <td style={{ padding: "9px 12px", fontSize: 12, color: "var(--text3)" }}>{m.concepto}</td>
                  <td style={{ padding: "9px 12px", fontWeight: 600, textAlign: "right", color: m.tipo === "Pago" ? "var(--green)" : "var(--text1)" }}>
                    {m.tipo === "Pago" ? "-" : "+"}{fmt(m.monto)}
                  </td>
                  <td style={{ padding: "9px 12px", fontWeight: 700, textAlign: "right", color: m.saldoAcum > 0 ? "var(--red)" : "var(--green)" }}>
                    {fmt(m.saldoAcum)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Paginacion pagina={pagina} totalPaginas={totalPaginas} onCambiar={setPagina} totalItems={movimientos.length} pageSize={pageSize} etiqueta="movimientos" />

      <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={handlePrint}>Imprimir</button>
          <button className="btn" onClick={handleExport}>Exportar PDF/HTML</button>
        </div>
        <button className="btn" onClick={onClose}>Cerrar</button>
      </div>
    </Modal>
  );
}
