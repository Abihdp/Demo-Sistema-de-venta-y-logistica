import { useState, useMemo, useEffect } from "react";
import Icon from "../ui/Icon";
import Paginacion from "../ui/Paginacion";
import { usePaginacion } from "../../hooks/usePaginacion";
import { today, mesLabel, fmtFechaAR, fmt, pagosDeVenta, montoCtaCte, coincideBusqueda } from "../../utils/helpers";
import { abrirReporteImpresion, descargarExcel, arMoney, generadoEl, REPORTE_ESTILOS } from "../../utils/reportes";
import { FORMAS_PAGO } from "../../constants";
import { useToast } from "../ui/Toast";

function buildVentasRetirosHTML({ periodoLabel, ventas, montoAnulado, cantAnuladas, totalVentas, retiros, totalRetiros, neto }) {
  const filasVentas = ventas.map(v => `
    <tr><td>${fmtFechaAR(v.fecha)}</td><td>${v.nroComprobante || "—"}</td><td>${v.cliente}</td><td>${v.formaPago || ""}</td><td class="num">${arMoney(v.total)}</td></tr>
  `).join("") || `<tr><td colspan="5">Sin ventas en el período</td></tr>`;
  const filasRetiros = retiros.map(r => `
    <tr><td>${fmtFechaAR(r.fecha)}</td><td>${r.hora || ""}</td><td>${r.motivo || ""}</td><td>${r.medio || ""}</td><td>${r.usuario || ""}</td><td class="num">${arMoney(r.monto)}</td></tr>
  `).join("") || `<tr><td colspan="6">Sin retiros en el período</td></tr>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Ventas y Retiros — ${periodoLabel}</title>
<style>${REPORTE_ESTILOS}</style></head><body>
<h2>Ventas y Retiros</h2>
<p class="sub">Período: ${periodoLabel} &nbsp;·&nbsp; Generado: ${generadoEl()}</p>

<h3>Ventas (${ventas.length})</h3>
<table>
  <thead><tr><th>Fecha</th><th>Comprobante</th><th>Cliente</th><th>Forma de pago</th><th class="num">Total</th></tr></thead>
  <tbody>${filasVentas}<tr class="total"><td colspan="4">Total ventas${montoAnulado > 0 ? ` (${cantAnuladas} anuladas, ${arMoney(montoAnulado)}, excluidas)` : ""}</td><td class="num">${arMoney(totalVentas)}</td></tr></tbody>
</table>

<h3>Retiros (${retiros.length})</h3>
<table>
  <thead><tr><th>Fecha</th><th>Hora</th><th>Motivo</th><th>Medio</th><th>Usuario</th><th class="num">Monto</th></tr></thead>
  <tbody>${filasRetiros}<tr class="total"><td colspan="5">Total retiros</td><td class="num">${arMoney(totalRetiros)}</td></tr></tbody>
</table>

<h3>Resumen</h3>
<table>
  <tbody>
    <tr><td>Total ventas</td><td class="num pos">${arMoney(totalVentas)}</td></tr>
    <tr><td>− Total retiros</td><td class="num neg">${arMoney(totalRetiros)}</td></tr>
    <tr class="total"><td>= Neto</td><td class="num ${neto >= 0 ? "pos" : "neg"}">${arMoney(neto)}</td></tr>
  </tbody>
</table>
<div class="footer">PECO S. — Sistema de Gestión Comercial</div>
</body></html>`;
}

// ─── Balance Mensual — reporte a caja: qué entró de verdad (por forma de pago
// y rubro), qué salió (gastos) y qué queda, dejando aparte lo que se vendió
// a cuenta corriente pero todavía no se cobró. ─────────────────────────────
function buildBalanceMensualHTML({
  periodoLabel, filasRubro, formas, totalesPorForma, totalCobrado,
  gastosPorCuenta, totalGastos, ventasCtaCte, totalCtaCteSinPagar,
  recibosCtaCte, totalRecibos, totalVentaPeriodo, totalEfectivoIngresado, totalNetoGanancia,
}) {
  const filasMatriz = filasRubro.map(r => `
    <tr><td>${r.rubro}</td>${formas.map(f => `<td class="num">${arMoney(r.porForma[f] || 0)}</td>`).join("")}<td class="num">${arMoney(r.total)}</td></tr>
  `).join("") || `<tr><td colspan="${formas.length + 2}">Sin ventas cobradas en el período</td></tr>`;

  const filasGastos = gastosPorCuenta.map(g => `
    <tr><td>${g.nombre}</td><td class="num">${arMoney(g.total)}</td></tr>
  `).join("") || `<tr><td colspan="2">Sin gastos en el período</td></tr>`;

  const filasCtaCte = ventasCtaCte.map(v => `
    <tr><td>${fmtFechaAR(v.fecha)}</td><td>#${v.id}</td><td>${v.cliente}</td><td class="num">${arMoney(v.monto)}</td></tr>
  `).join("") || `<tr><td colspan="4">Sin ventas a cuenta corriente en el período</td></tr>`;

  const filasRecibos = recibosCtaCte.map(r => `
    <tr><td>${fmtFechaAR(r.fecha)}</td><td>${r.cliente}</td><td>${r.formaPago}</td><td class="num">${arMoney(r.monto)}</td></tr>
  `).join("") || `<tr><td colspan="4">Sin recibos de cuenta corriente cobrados en el período</td></tr>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Balance Mensual — ${periodoLabel}</title>
<style>${REPORTE_ESTILOS}</style></head><body>
<h2>Balance Mensual</h2>
<p class="sub">Período: ${periodoLabel} &nbsp;·&nbsp; Generado: ${generadoEl()}</p>

<h3>Ventas cobradas por rubro y forma de pago</h3>
<table>
  <thead><tr><th>Rubro</th>${formas.map(f => `<th class="num">${f}</th>`).join("")}<th class="num">Total</th></tr></thead>
  <tbody>${filasMatriz}<tr class="total"><td>Total</td>${formas.map(f => `<td class="num">${arMoney(totalesPorForma[f] || 0)}</td>`).join("")}<td class="num">${arMoney(totalCobrado)}</td></tr></tbody>
</table>

<h3>Gastos</h3>
<table>
  <thead><tr><th>Cuenta</th><th class="num">Monto</th></tr></thead>
  <tbody>${filasGastos}<tr class="total"><td>Total gastos</td><td class="num">${arMoney(totalGastos)}</td></tr></tbody>
</table>

<h3>Ventas a cuenta corriente sin cobrar (informativo — no entra en los totales)</h3>
<table>
  <thead><tr><th>Fecha</th><th>Venta</th><th>Cliente</th><th class="num">Monto</th></tr></thead>
  <tbody>${filasCtaCte}<tr class="total"><td colspan="3">Total sin cobrar</td><td class="num">${arMoney(totalCtaCteSinPagar)}</td></tr></tbody>
</table>

<h3>Recibos de cuenta corriente cobrados</h3>
<table>
  <thead><tr><th>Fecha</th><th>Cliente</th><th>Forma de pago</th><th class="num">Monto</th></tr></thead>
  <tbody>${filasRecibos}<tr class="total"><td colspan="3">Total recibos</td><td class="num">${arMoney(totalRecibos)}</td></tr></tbody>
</table>

<h3>Resumen</h3>
<table>
  <tbody>
    <tr><td>Total de venta (todo lo vendido, incluida cta. cte. sin cobrar)</td><td class="num">${arMoney(totalVentaPeriodo)}</td></tr>
    <tr><td>Total de efectivo ingresado (ventas cobradas + recibos de cta. cte.)</td><td class="num pos">${arMoney(totalEfectivoIngresado)}</td></tr>
    <tr><td>− Total gastos</td><td class="num neg">${arMoney(totalGastos)}</td></tr>
    <tr class="total"><td>= Total neto de ganancia</td><td class="num ${totalNetoGanancia >= 0 ? "pos" : "neg"}">${arMoney(totalNetoGanancia)}</td></tr>
  </tbody>
</table>
<div class="footer">PECO S. — Sistema de Gestión Comercial</div>
</body></html>`;
}

export default function PageReportes({ ventas = [], productos = [], gastos = [], planCuentas = [], recibos = [], cargarRetirosRango }) {
  const primerDia = today().slice(0, 7) + "-01";
  const [tab, setTab] = useState("balance"); // "balance" | "ventasRetiros"
  const [modo, setModo] = useState("mes");
  const [mes, setMes]   = useState(today().slice(0, 7));
  const [desde, setDesde] = useState(primerDia);
  const [hasta, setHasta] = useState(today());
  const { toast } = useToast();

  const fechaDesde = modo === "mes" ? `${mes}-01` : desde;
  const fechaHasta = useMemo(() => {
    if (modo !== "mes") return hasta;
    const [y, m] = mes.split("-").map(Number);
    return `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
  }, [modo, mes, hasta]);

  const [retiros, setRetiros]         = useState([]);
  const [loadingRetiros, setLoadingRetiros] = useState(false);

  // ── Filtros de las tablas (además del período, que ya recorta arriba) ──
  const [fVentasBusqueda, setFVentasBusqueda] = useState("");
  const [fVentasPago, setFVentasPago]         = useState("");
  const [fRetirosBusqueda, setFRetirosBusqueda] = useState("");
  const [fRubroBusqueda, setFRubroBusqueda]   = useState("");
  const [fGastosBusqueda, setFGastosBusqueda] = useState("");
  const [fCtaCteBusqueda, setFCtaCteBusqueda] = useState("");
  const [fRecibosBusqueda, setFRecibosBusqueda] = useState("");
  const [fRecibosPago, setFRecibosPago]       = useState("");

  useEffect(() => {
    let cancelado = false;
    setLoadingRetiros(true);
    cargarRetirosRango(fechaDesde, fechaHasta)
      .then(r => { if (!cancelado) setRetiros(r); })
      .catch(err => { if (!cancelado) toast(err.message || "No se pudieron cargar los retiros del período", "error"); })
      .finally(() => { if (!cancelado) setLoadingRetiros(false); });
    return () => { cancelado = true; };
  }, [fechaDesde, fechaHasta, cargarRetirosRango]); // eslint-disable-line react-hooks/exhaustive-deps

  const ventasEnRango = useMemo(() =>
    ventas
      .filter(v => v.estado !== "anulada" && v.fecha >= fechaDesde && v.fecha <= fechaHasta)
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || String(a.id).localeCompare(String(b.id))),
    [ventas, fechaDesde, fechaHasta]
  );
  const anuladasEnRango = useMemo(() =>
    ventas.filter(v => v.estado === "anulada" && v.fecha >= fechaDesde && v.fecha <= fechaHasta),
    [ventas, fechaDesde, fechaHasta]
  );
  const montoAnulado = anuladasEnRango.reduce((s, v) => s + (v.total || 0), 0);
  const totalVentas  = ventasEnRango.reduce((s, v) => s + (v.total || 0), 0);
  const totalRetiros = retiros.reduce((s, r) => s + (r.monto || 0), 0);
  const neto          = totalVentas - totalRetiros;

  // Los totales y las exportaciones siempre usan el período completo
  // (ventasEnRango/retiros) — los filtros de texto de acá solo recortan lo
  // que se ve en pantalla.
  const ventasFiltradas = useMemo(() =>
    ventasEnRango.filter(v =>
      (!fVentasBusqueda || coincideBusqueda(`${v.cliente} ${v.nroComprobante || ""}`, fVentasBusqueda)) &&
      (!fVentasPago || v.formaPago === fVentasPago)
    ),
    [ventasEnRango, fVentasBusqueda, fVentasPago]
  );
  const retirosFiltrados = useMemo(() =>
    retiros.filter(r => !fRetirosBusqueda || coincideBusqueda(`${r.motivo || ""} ${r.medio || ""} ${r.usuario || ""}`, fRetirosBusqueda)),
    [retiros, fRetirosBusqueda]
  );

  const { pagina: pagVentas, setPagina: setPagVentas, totalPaginas: totalPagVentas, itemsPagina: ventasPagina, pageSize: pageSizeVentas } = usePaginacion(ventasFiltradas, 20);
  const { pagina: pagRetiros, setPagina: setPagRetiros, totalPaginas: totalPagRetiros, itemsPagina: retirosPagina, pageSize: pageSizeRetiros } = usePaginacion(retirosFiltrados, 20);

  const periodoLabel = modo === "mes" ? mesLabel(mes) : `${fmtFechaAR(fechaDesde)} al ${fmtFechaAR(fechaHasta)}`;

  const datosReporte = () => ({ periodoLabel, ventas: ventasEnRango, montoAnulado, cantAnuladas: anuladasEnRango.length, totalVentas, retiros, totalRetiros, neto });
  const handlePrint = () => abrirReporteImpresion(buildVentasRetirosHTML(datosReporte()));
  const handleExportExcel = () => {
    descargarExcel([
      { nombre: "Ventas", filas: ventasEnRango.map(v => ({ Fecha: v.fecha, Comprobante: v.nroComprobante || "", Cliente: v.cliente, "Forma de pago": v.formaPago || "", Total: Math.round(v.total || 0) })) },
      { nombre: "Retiros", filas: retiros.map(r => ({ Fecha: r.fecha, Hora: r.hora || "", Motivo: r.motivo || "", Medio: r.medio || "", Usuario: r.usuario || "", Monto: Math.round(r.monto || 0) })) },
      { nombre: "Resumen", filas: [
        { Concepto: "Total ventas",  Monto: Math.round(totalVentas) },
        { Concepto: "Total retiros", Monto: -Math.round(totalRetiros) },
        { Concepto: "Neto",          Monto: Math.round(neto) },
      ] },
    ], `ventas-retiros_${today()}.xlsx`);
  };

  // ── Balance Mensual: plata realmente cobrada por rubro y forma de pago,
  // gastos, y lo que quedó pendiente en cuenta corriente. Cuando una venta
  // tiene pago dividido (parte efectivo, parte cta. cte., por ej.), cada
  // ítem se reparte proporcionalmente entre las formas de pago no-cta.cte.
  // según cuánto pesa cada una sobre el total de la venta — la parte a
  // cuenta corriente nunca entra acá, se contabiliza aparte como pendiente.
  const productoPorNombre = useMemo(() => {
    const m = {};
    productos.forEach(p => { if (p.nombre) m[p.nombre] = p; });
    return m;
  }, [productos]);

  const balance = useMemo(() => {
    const porRubro = {};
    const formasUsadas = new Set();
    let totalCtaCteSinPagar = 0;
    const ventasCtaCte = [];

    ventasEnRango.forEach(v => {
      const totalVenta = v.total || 0;
      if (totalVenta <= 0) return;

      const montoCC = montoCtaCte(v);
      if (montoCC > 0) {
        totalCtaCteSinPagar += montoCC;
        ventasCtaCte.push({ id: v.id, fecha: v.fecha, cliente: v.cliente, monto: montoCC });
      }

      const pagosNoCC = pagosDeVenta(v).filter(p => p.formaPago !== "Cuenta Corriente");
      const totalNoCC = pagosNoCC.reduce((s, p) => s + p.monto, 0);
      if (totalNoCC <= 0) return;

      (v.items || []).forEach(item => {
        const prod = productoPorNombre[item.nombre];
        const rubro = prod?.rubro || prod?.categoria || "Sin clasificar";
        const itemRevenueNoCC = (item.precio || 0) * (item.qty || 0) * (totalNoCC / totalVenta);
        if (!porRubro[rubro]) porRubro[rubro] = { rubro, porForma: {}, total: 0 };
        pagosNoCC.forEach(p => {
          const monto = itemRevenueNoCC * (p.monto / totalNoCC);
          formasUsadas.add(p.formaPago);
          porRubro[rubro].porForma[p.formaPago] = (porRubro[rubro].porForma[p.formaPago] || 0) + monto;
          porRubro[rubro].total += monto;
        });
      });
    });

    const filasRubro = Object.values(porRubro).sort((a, b) => b.total - a.total);
    const formas = FORMAS_PAGO.filter(f => f !== "Cuenta Corriente" && formasUsadas.has(f));
    const totalesPorForma = {};
    formas.forEach(f => { totalesPorForma[f] = filasRubro.reduce((s, r) => s + (r.porForma[f] || 0), 0); });
    const totalCobrado = filasRubro.reduce((s, r) => s + r.total, 0);

    return {
      filasRubro, formas, totalesPorForma, totalCobrado,
      totalCtaCteSinPagar,
      ventasCtaCte: ventasCtaCte.sort((a, b) => a.fecha.localeCompare(b.fecha)),
    };
  }, [ventasEnRango, productoPorNombre]);

  const ctaMap = useMemo(() => {
    const m = {};
    (planCuentas || []).forEach(c => { m[c.id] = c; });
    return m;
  }, [planCuentas]);

  const gastosEnRango = useMemo(() =>
    (gastos || []).filter(g => g.estado !== "anulado" && g.fecha >= fechaDesde && g.fecha <= fechaHasta),
    [gastos, fechaDesde, fechaHasta]
  );
  const gastosPorCuenta = useMemo(() => {
    const filas = {};
    gastosEnRango.forEach(g => {
      const key = g.cuentaId || "sin_cuenta";
      const cta = ctaMap[key] || { nombre: "Sin clasificar" };
      if (!filas[key]) filas[key] = { cuentaId: key, nombre: cta.nombre, total: 0 };
      filas[key].total += g.monto || 0;
    });
    return Object.values(filas).sort((a, b) => b.total - a.total);
  }, [gastosEnRango, ctaMap]);
  const totalGastos = gastosPorCuenta.reduce((s, r) => s + r.total, 0);

  const recibosCtaCte = useMemo(() =>
    (recibos || [])
      .filter(r => r.tipo === "Recibo" && r.estado !== "anulada" && r.fecha >= fechaDesde && r.fecha <= fechaHasta)
      .sort((a, b) => a.fecha.localeCompare(b.fecha)),
    [recibos, fechaDesde, fechaHasta]
  );
  const totalRecibos = recibosCtaCte.reduce((s, r) => s + (r.monto || 0), 0);

  const totalVentaPeriodo       = totalVentas; // reutiliza el mismo cálculo que la otra pestaña
  const totalEfectivoIngresado  = balance.totalCobrado + totalRecibos;
  const totalNetoGanancia       = totalEfectivoIngresado - totalGastos;

  // Igual que en la otra pestaña: los filtros de texto solo recortan lo que
  // se ve en pantalla — totales, resumen, impresión y Excel siempre usan el
  // período completo.
  const filasRubroFiltradas = useMemo(() =>
    balance.filasRubro.filter(r => !fRubroBusqueda || coincideBusqueda(r.rubro, fRubroBusqueda)),
    [balance.filasRubro, fRubroBusqueda]
  );
  const gastosFiltrados = useMemo(() =>
    gastosPorCuenta.filter(g => !fGastosBusqueda || coincideBusqueda(g.nombre, fGastosBusqueda)),
    [gastosPorCuenta, fGastosBusqueda]
  );
  const ventasCtaCteFiltradas = useMemo(() =>
    balance.ventasCtaCte.filter(v => !fCtaCteBusqueda || coincideBusqueda(`${v.cliente} ${v.id}`, fCtaCteBusqueda)),
    [balance.ventasCtaCte, fCtaCteBusqueda]
  );
  const recibosCtaCteFiltrados = useMemo(() =>
    recibosCtaCte.filter(r =>
      (!fRecibosBusqueda || coincideBusqueda(r.cliente, fRecibosBusqueda)) &&
      (!fRecibosPago || r.formaPago === fRecibosPago)
    ),
    [recibosCtaCte, fRecibosBusqueda, fRecibosPago]
  );

  const { pagina: pagRubro, setPagina: setPagRubro, totalPaginas: totalPagRubro, itemsPagina: rubroPagina } = usePaginacion(filasRubroFiltradas, 20);
  const { pagina: pagGastos, setPagina: setPagGastos, totalPaginas: totalPagGastos, itemsPagina: gastosPagina } = usePaginacion(gastosFiltrados, 20);
  const { pagina: pagCtaCte, setPagina: setPagCtaCte, totalPaginas: totalPagCtaCte, itemsPagina: ctaCtePagina } = usePaginacion(ventasCtaCteFiltradas, 20);
  const { pagina: pagRecibos, setPagina: setPagRecibos, totalPaginas: totalPagRecibos, itemsPagina: recibosPagina } = usePaginacion(recibosCtaCteFiltrados, 20);

  const datosBalance = () => ({
    periodoLabel, ...balance, gastosPorCuenta, totalGastos,
    recibosCtaCte, totalRecibos, totalVentaPeriodo, totalEfectivoIngresado, totalNetoGanancia,
  });
  const handlePrintBalance = () => abrirReporteImpresion(buildBalanceMensualHTML(datosBalance()));
  const handleExportBalanceExcel = () => {
    descargarExcel([
      { nombre: "Rubro x Forma de pago", filas: balance.filasRubro.map(r => ({
        Rubro: r.rubro,
        ...Object.fromEntries(balance.formas.map(f => [f, Math.round(r.porForma[f] || 0)])),
        Total: Math.round(r.total),
      })) },
      { nombre: "Gastos", filas: gastosPorCuenta.map(g => ({ Cuenta: g.nombre, Monto: Math.round(g.total) })) },
      { nombre: "Cta cte sin cobrar", filas: balance.ventasCtaCte.map(v => ({ Fecha: v.fecha, Venta: v.id, Cliente: v.cliente, Monto: Math.round(v.monto) })) },
      { nombre: "Recibos cta cte", filas: recibosCtaCte.map(r => ({ Fecha: r.fecha, Cliente: r.cliente, "Forma de pago": r.formaPago, Monto: Math.round(r.monto) })) },
      { nombre: "Resumen", filas: [
        { Concepto: "Total de venta",              Monto: Math.round(totalVentaPeriodo) },
        { Concepto: "Total de efectivo ingresado",  Monto: Math.round(totalEfectivoIngresado) },
        { Concepto: "Total gastos",                 Monto: -Math.round(totalGastos) },
        { Concepto: "Total neto de ganancia",       Monto: Math.round(totalNetoGanancia) },
      ] },
    ], `balance-mensual_${today()}.xlsx`);
  };

  return (
    <div>
      {/* ── Pestañas + período ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
            {[["balance", "Balance Mensual"], ["ventasRetiros", "Ventas y Retiros"]].map(([v, l]) => (
              <button key={v} onClick={() => setTab(v)} style={{
                padding: "7px 14px", fontSize: 12, fontWeight: 500, border: "none", cursor: "pointer",
                background: tab === v ? "var(--accent)" : "transparent",
                color: tab === v ? "#fff" : "var(--text2)",
              }}>{l}</button>
            ))}
          </div>
          <div style={{ width: 1, height: 22, background: "var(--border)" }} />
          <div style={{ display: "flex", background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
            {[["mes", "Por mes"], ["rango", "Rango de fechas"]].map(([v, l]) => (
              <button key={v} onClick={() => setModo(v)} style={{
                padding: "7px 14px", fontSize: 12, fontWeight: 500, border: "none", cursor: "pointer",
                background: modo === v ? "var(--accent)" : "transparent",
                color: modo === v ? "#fff" : "var(--text2)",
              }}>{l}</button>
            ))}
          </div>
          {modo === "mes" ? (
            <input type="month" className="form-input" style={{ width: 160 }}
              value={mes} onChange={e => setMes(e.target.value)} />
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase" }}>Desde</span>
                <input type="date" className="form-input" style={{ width: 140 }}
                  value={desde} onChange={e => setDesde(e.target.value)} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase" }}>Hasta</span>
                <input type="date" className="form-input" style={{ width: 140 }}
                  value={hasta} onChange={e => setHasta(e.target.value)} />
              </div>
            </>
          )}
          <button className="btn btn-sm btn-ghost" style={{ marginLeft: "auto" }} onClick={tab === "balance" ? handleExportBalanceExcel : handleExportExcel} title="Exportar a Excel">
            <Icon name="download" size={13}/> Excel
          </button>
          <button className="btn btn-sm btn-ghost" onClick={tab === "balance" ? handlePrintBalance : handlePrint} title="Imprimir reporte">
            <Icon name="printer" size={13}/> Imprimir
          </button>
        </div>
      </div>

      {tab === "balance" ? (
        <>
          {/* ── Totales ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
            {[
              { label: "Total de venta",             valor: totalVentaPeriodo,      color: "var(--text1)", desc: "Todo lo vendido, incluida cta. cte. sin cobrar" },
              { label: "Total de efectivo ingresado", valor: totalEfectivoIngresado, color: "var(--green)", desc: "Ventas cobradas + recibos de cta. cte." },
              { label: "Total neto de ganancia",      valor: totalNetoGanancia,      color: totalNetoGanancia >= 0 ? "var(--green)" : "var(--red)", desc: "Efectivo ingresado − gastos" },
            ].map(({ label, valor, color, desc }) => (
              <div key={label} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "14px 16px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>{label}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color }}>{fmt(Math.abs(valor))}</div>
                <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 3 }}>{desc}</div>
              </div>
            ))}
          </div>

          {/* ── Ventas cobradas por rubro y forma de pago ── */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title" style={{ marginBottom: 14 }}>Ventas cobradas por rubro y forma de pago</div>
            <div style={{ position: "relative", maxWidth: 260, marginBottom: 12 }}>
              <Icon name="search" size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text3)" }}/>
              <input className="form-input" style={{ paddingLeft: 32 }} placeholder="Buscar rubro..." value={fRubroBusqueda} onChange={e => setFRubroBusqueda(e.target.value)} />
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--border2)" }}>
                    <th style={{ padding: "8px 12px", fontSize: 11, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".04em", textAlign: "left" }}>Rubro</th>
                    {balance.formas.map(f => (
                      <th key={f} style={{ padding: "8px 12px", fontSize: 11, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".04em", textAlign: "right" }}>{f}</th>
                    ))}
                    <th style={{ padding: "8px 12px", fontSize: 11, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".04em", textAlign: "right" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rubroPagina.length === 0 ? (
                    <tr><td colSpan={balance.formas.length + 2} style={{ padding: "14px 12px", color: "var(--text3)", fontSize: 13 }}>{balance.filasRubro.length === 0 ? "Sin ventas cobradas en el período" : "Sin resultados para el filtro"}</td></tr>
                  ) : rubroPagina.map(r => (
                    <tr key={r.rubro} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "8px 12px", fontSize: 13 }}>{r.rubro}</td>
                      {balance.formas.map(f => (
                        <td key={f} style={{ padding: "8px 12px", fontSize: 13, textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--text2)" }}>{fmt(r.porForma[f] || 0)}</td>
                      ))}
                      <td style={{ padding: "8px 12px", fontSize: 13, textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700 }}>{fmt(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
                {balance.filasRubro.length > 0 && (
                  <tfoot>
                    <tr style={{ borderTop: "2px solid var(--border2)" }}>
                      <td style={{ padding: "8px 12px", fontSize: 13, fontWeight: 700 }}>Total</td>
                      {balance.formas.map(f => (
                        <td key={f} style={{ padding: "8px 12px", fontSize: 13, textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700 }}>{fmt(balance.totalesPorForma[f] || 0)}</td>
                      ))}
                      <td style={{ padding: "8px 12px", fontSize: 13, textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--green)" }}>{fmt(balance.totalCobrado)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {filasRubroFiltradas.length > 0 && (
              <Paginacion pagina={pagRubro} totalPaginas={totalPagRubro} onCambiar={setPagRubro} totalItems={filasRubroFiltradas.length} pageSize={20} etiqueta="rubros"/>
            )}
          </div>

          {/* ── Gastos ── */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title" style={{ marginBottom: 14 }}>Gastos del período</div>
            <div style={{ position: "relative", maxWidth: 260, marginBottom: 12 }}>
              <Icon name="search" size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text3)" }}/>
              <input className="form-input" style={{ paddingLeft: 32 }} placeholder="Buscar cuenta..." value={fGastosBusqueda} onChange={e => setFGastosBusqueda(e.target.value)} />
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--border2)" }}>
                    <th style={{ padding: "8px 12px", fontSize: 11, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".04em", textAlign: "left" }}>Cuenta</th>
                    <th style={{ padding: "8px 12px", fontSize: 11, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".04em", textAlign: "right" }}>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {gastosPagina.length === 0 ? (
                    <tr><td colSpan={2} style={{ padding: "14px 12px", color: "var(--text3)", fontSize: 13 }}>{gastosPorCuenta.length === 0 ? "Sin gastos en el período" : "Sin resultados para el filtro"}</td></tr>
                  ) : gastosPagina.map(g => (
                    <tr key={g.cuentaId} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "8px 12px", fontSize: 13 }}>{g.nombre}</td>
                      <td style={{ padding: "8px 12px", fontSize: 13, textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--red)" }}>−{fmt(g.total)}</td>
                    </tr>
                  ))}
                </tbody>
                {gastosPorCuenta.length > 0 && (
                  <tfoot>
                    <tr style={{ borderTop: "2px solid var(--border2)" }}>
                      <td style={{ padding: "8px 12px", fontSize: 13, fontWeight: 700 }}>Total gastos</td>
                      <td style={{ padding: "8px 12px", fontSize: 13, textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--red)" }}>−{fmt(totalGastos)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {gastosFiltrados.length > 0 && (
              <Paginacion pagina={pagGastos} totalPaginas={totalPagGastos} onCambiar={setPagGastos} totalItems={gastosFiltrados.length} pageSize={20} etiqueta="cuentas"/>
            )}
          </div>

          {/* ── Ventas a cta cte sin cobrar (informativo) ── */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title" style={{ marginBottom: 4 }}>Ventas a cuenta corriente sin cobrar</div>
            <div style={{ fontSize: 11.5, color: "var(--text3)", marginBottom: 14 }}>
              Informativo — no está sumado en los totales de arriba, porque esa plata todavía no entró.
            </div>
            <div style={{ position: "relative", maxWidth: 260, marginBottom: 12 }}>
              <Icon name="search" size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text3)" }}/>
              <input className="form-input" style={{ paddingLeft: 32 }} placeholder="Buscar cliente o N° de venta..." value={fCtaCteBusqueda} onChange={e => setFCtaCteBusqueda(e.target.value)} />
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--border2)" }}>
                    {["Fecha", "Venta", "Cliente", "Monto"].map((h, i) => (
                      <th key={h} style={{ padding: "8px 12px", fontSize: 11, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".04em", textAlign: i === 3 ? "right" : "left" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ctaCtePagina.length === 0 ? (
                    <tr><td colSpan={4} style={{ padding: "14px 12px", color: "var(--text3)", fontSize: 13 }}>{balance.ventasCtaCte.length === 0 ? "Sin ventas a cuenta corriente en el período" : "Sin resultados para el filtro"}</td></tr>
                  ) : ctaCtePagina.map(v => (
                    <tr key={v.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "8px 12px", fontSize: 13 }}>{fmtFechaAR(v.fecha)}</td>
                      <td style={{ padding: "8px 12px", fontSize: 13, color: "var(--text3)" }}>#{v.id}</td>
                      <td style={{ padding: "8px 12px", fontSize: 13 }}>{v.cliente}</td>
                      <td style={{ padding: "8px 12px", fontSize: 13, textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--amber)" }}>{fmt(v.monto)}</td>
                    </tr>
                  ))}
                </tbody>
                {balance.ventasCtaCte.length > 0 && (
                  <tfoot>
                    <tr style={{ borderTop: "2px solid var(--border2)" }}>
                      <td colSpan={3} style={{ padding: "8px 12px", fontSize: 13, fontWeight: 700 }}>Total sin cobrar</td>
                      <td style={{ padding: "8px 12px", fontSize: 13, textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--amber)" }}>{fmt(balance.totalCtaCteSinPagar)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {ventasCtaCteFiltradas.length > 0 && (
              <Paginacion pagina={pagCtaCte} totalPaginas={totalPagCtaCte} onCambiar={setPagCtaCte} totalItems={ventasCtaCteFiltradas.length} pageSize={20} etiqueta="ventas"/>
            )}
          </div>

          {/* ── Recibos de cta cte cobrados ── */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 14 }}>Recibos de cuenta corriente cobrados</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
              <div style={{ position: "relative", maxWidth: 260, flex: 1 }}>
                <Icon name="search" size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text3)" }}/>
                <input className="form-input" style={{ paddingLeft: 32 }} placeholder="Buscar cliente..." value={fRecibosBusqueda} onChange={e => setFRecibosBusqueda(e.target.value)} />
              </div>
              <select className="form-select" style={{ width: 180 }} value={fRecibosPago} onChange={e => setFRecibosPago(e.target.value)}>
                <option value="">Todas las formas de pago</option>
                {FORMAS_PAGO.filter(f => f !== "Cuenta Corriente").map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--border2)" }}>
                    {["Fecha", "Cliente", "Forma de pago", "Monto"].map((h, i) => (
                      <th key={h} style={{ padding: "8px 12px", fontSize: 11, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".04em", textAlign: i === 3 ? "right" : "left" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recibosPagina.length === 0 ? (
                    <tr><td colSpan={4} style={{ padding: "14px 12px", color: "var(--text3)", fontSize: 13 }}>{recibosCtaCte.length === 0 ? "Sin recibos de cuenta corriente cobrados en el período" : "Sin resultados para el filtro"}</td></tr>
                  ) : recibosPagina.map(r => (
                    <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "8px 12px", fontSize: 13 }}>{fmtFechaAR(r.fecha)}</td>
                      <td style={{ padding: "8px 12px", fontSize: 13 }}>{r.cliente}</td>
                      <td style={{ padding: "8px 12px", fontSize: 13, color: "var(--text3)" }}>{r.formaPago}</td>
                      <td style={{ padding: "8px 12px", fontSize: 13, textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--green)" }}>+{fmt(r.monto)}</td>
                    </tr>
                  ))}
                </tbody>
                {recibosCtaCte.length > 0 && (
                  <tfoot>
                    <tr style={{ borderTop: "2px solid var(--border2)" }}>
                      <td colSpan={3} style={{ padding: "8px 12px", fontSize: 13, fontWeight: 700 }}>Total recibos</td>
                      <td style={{ padding: "8px 12px", fontSize: 13, textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--green)" }}>+{fmt(totalRecibos)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {recibosCtaCteFiltrados.length > 0 && (
              <Paginacion pagina={pagRecibos} totalPaginas={totalPagRecibos} onCambiar={setPagRecibos} totalItems={recibosCtaCteFiltrados.length} pageSize={20} etiqueta="recibos"/>
            )}
          </div>
        </>
      ) : (
        <>
          {/* ── Métricas resumen ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
            {[
              { label: "Total ventas",  valor: totalVentas,  color: "var(--green)", desc: `${ventasEnRango.length} venta${ventasEnRango.length !== 1 ? "s" : ""}${montoAnulado > 0 ? ` · ${anuladasEnRango.length} anuladas excluidas` : ""}` },
              { label: "Total retiros", valor: totalRetiros, color: "var(--red)",   desc: `${retiros.length} retiro${retiros.length !== 1 ? "s" : ""}${loadingRetiros ? " · cargando…" : ""}` },
              { label: "Neto",          valor: neto,          color: neto >= 0 ? "var(--green)" : "var(--red)", desc: "Ventas − retiros" },
            ].map(({ label, valor, color, desc }) => (
              <div key={label} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "14px 16px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>{label}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color }}>{fmt(Math.abs(valor))}</div>
                <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 3 }}>{desc}</div>
              </div>
            ))}
          </div>

          {/* ── Ventas del período ── */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title" style={{ marginBottom: 14 }}>Ventas del período</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
              <div style={{ position: "relative", maxWidth: 260, flex: 1 }}>
                <Icon name="search" size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text3)" }}/>
                <input className="form-input" style={{ paddingLeft: 32 }} placeholder="Buscar cliente o comprobante..." value={fVentasBusqueda} onChange={e => setFVentasBusqueda(e.target.value)} />
              </div>
              <select className="form-select" style={{ width: 180 }} value={fVentasPago} onChange={e => setFVentasPago(e.target.value)}>
                <option value="">Todas las formas de pago</option>
                {FORMAS_PAGO.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--border2)" }}>
                    {["Fecha", "Comprobante", "Cliente", "Forma de pago", "Total"].map((h, i) => (
                      <th key={h} style={{ padding: "8px 12px", fontSize: 11, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".04em", textAlign: i === 4 ? "right" : "left" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ventasPagina.length === 0 ? (
                    <tr><td colSpan={5} style={{ padding: "14px 12px", color: "var(--text3)", fontSize: 13 }}>{ventasEnRango.length === 0 ? "Sin ventas en el período" : "Sin resultados para el filtro"}</td></tr>
                  ) : ventasPagina.map(v => (
                    <tr key={v.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "8px 12px", fontSize: 13 }}>{fmtFechaAR(v.fecha)}</td>
                      <td style={{ padding: "8px 12px", fontSize: 13, color: "var(--text3)" }}>{v.nroComprobante || "—"}</td>
                      <td style={{ padding: "8px 12px", fontSize: 13 }}>{v.cliente}</td>
                      <td style={{ padding: "8px 12px", fontSize: 13, color: "var(--text3)" }}>{v.formaPago}</td>
                      <td style={{ padding: "8px 12px", fontSize: 13, textAlign: "right", fontFamily: "var(--font-mono)" }}>{fmt(v.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {ventasFiltradas.length > 0 && (
              <Paginacion pagina={pagVentas} totalPaginas={totalPagVentas} onCambiar={setPagVentas} totalItems={ventasFiltradas.length} pageSize={pageSizeVentas} etiqueta="ventas"/>
            )}
          </div>

          {/* ── Retiros del período ── */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 14 }}>Retiros del período</div>
            <div style={{ position: "relative", maxWidth: 260, marginBottom: 12 }}>
              <Icon name="search" size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text3)" }}/>
              <input className="form-input" style={{ paddingLeft: 32 }} placeholder="Buscar motivo, medio o usuario..." value={fRetirosBusqueda} onChange={e => setFRetirosBusqueda(e.target.value)} />
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--border2)" }}>
                    {["Fecha", "Hora", "Motivo", "Medio", "Usuario", "Monto"].map((h, i) => (
                      <th key={h} style={{ padding: "8px 12px", fontSize: 11, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".04em", textAlign: i === 5 ? "right" : "left" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loadingRetiros ? (
                    <tr><td colSpan={6} style={{ padding: "14px 12px", color: "var(--text3)", fontSize: 13 }}>Cargando retiros…</td></tr>
                  ) : retirosPagina.length === 0 ? (
                    <tr><td colSpan={6} style={{ padding: "14px 12px", color: "var(--text3)", fontSize: 13 }}>{retiros.length === 0 ? "Sin retiros en el período" : "Sin resultados para el filtro"}</td></tr>
                  ) : retirosPagina.map(r => (
                    <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "8px 12px", fontSize: 13 }}>{fmtFechaAR(r.fecha)}</td>
                      <td style={{ padding: "8px 12px", fontSize: 13, color: "var(--text3)" }}>{r.hora}</td>
                      <td style={{ padding: "8px 12px", fontSize: 13 }}>{r.motivo}</td>
                      <td style={{ padding: "8px 12px", fontSize: 13, color: "var(--text3)" }}>{r.medio}</td>
                      <td style={{ padding: "8px 12px", fontSize: 13, color: "var(--text3)" }}>{r.usuario || "—"}</td>
                      <td style={{ padding: "8px 12px", fontSize: 13, textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--red)" }}>−{fmt(r.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {retirosFiltrados.length > 0 && (
              <Paginacion pagina={pagRetiros} totalPaginas={totalPagRetiros} onCambiar={setPagRetiros} totalItems={retirosFiltrados.length} pageSize={pageSizeRetiros} etiqueta="retiros"/>
            )}
          </div>
        </>
      )}
    </div>
  );
}
