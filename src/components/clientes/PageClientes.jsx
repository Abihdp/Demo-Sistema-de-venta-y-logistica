import { useState, useMemo } from "react";
import Icon from "../ui/Icon.jsx";
import { Modal } from "../ui/Modal.jsx";
import Paginacion from "../ui/Paginacion.jsx";
import { usePaginacion } from "../../hooks/usePaginacion";
import { useToast } from "../ui/Toast.jsx";
import { useConfirm } from "../ui/Confirm.jsx";
import {
  fmt, today, uid, horaActual, montoCtaCte, calcularMoraCliente, detalleVentasCtaCte, calcularSaldoCtaCte, fmtFechaAR,
  clienteAtrasadoSinMora, agregarCargoMoraManual, quitarCargoMoraManual, moraManualPorVenta, sugerirMoraFactura,
} from "../../utils/helpers.js";
import { setCache } from "../../lib/offlineDb.js";
import ModalNuevoCliente from "./ModalNuevoCliente.jsx";
import ConfigMora from "./ConfigMora.jsx";
import ModalDetalleCtaCte from "./ModalDetalleCtaCte.jsx";
import TabReservas from "./TabReservas.jsx";

const FORMAS_PAGO_COBRO = ["Efectivo", "Transferencia", "Tarjeta Débito", "Tarjeta Crédito", "Cheque", "Mercado Pago"];
const CLIENTES_PAGE_SIZE = 15;

// ─── Helpers de exportación — tabla clientes ──────────────────────────────────
function exportCSV(rows, filename) {
  const headers = ["Nombre","DNI","Teléfono","Dirección","IVA","Días de mora","% recargo","Saldo original","Recargo mora","Total con recargo","Primera compra","Última compra","Total compras"];
  const lines = [headers.join(","), ...rows.map(r =>
    [r.nombre, r.dni, r.tel, `"${r.dir}"`, r.iva,
     r.diasMora ?? "-", r.pctAplicado || 0, r.saldoOriginal, r.recargo, r.saldoConRecargo, r.primeraCompra||"-", r.ultimaCompra||"-", r.totalCompras
    ].join(",")
  )];
  const blob = new Blob([lines.join("\n")], { type:"text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

function exportHTML(rows, filename) {
  const filas = rows.map(r => `
    <tr>
      <td>${r.nombre}</td><td>${r.dni}</td><td>${r.tel}</td>
      <td>${r.iva}</td>
      <td style="text-align:right">${r.diasMora ?? "-"}</td>
      <td style="text-align:right">${r.pctAplicado ? `+${r.pctAplicado}%` : "-"}</td>
      <td style="text-align:right">$${Math.round(r.saldoOriginal).toLocaleString("es-AR")}</td>
      <td style="text-align:right">$${Math.round(r.recargo).toLocaleString("es-AR")}</td>
      <td style="text-align:right;color:${r.saldoConRecargo>0?"#c0392b":"#27ae60"};font-weight:600">
        $${Math.round(r.saldoConRecargo).toLocaleString("es-AR")}
      </td>
      <td>${r.primeraCompra||"-"}</td>
      <td>${r.ultimaCompra||"-"}</td>
      <td style="text-align:right">$${r.totalCompras.toLocaleString("es-AR")}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Clientes - Cuenta Corriente</title>
  <style>
    body{font-family:Arial,sans-serif;padding:24px;color:#1a1a2e}
    h2{margin-bottom:4px}p{color:#666;font-size:13px;margin-bottom:20px}
    table{width:100%;border-collapse:collapse;font-size:13px}
    th{background:#2c2c54;color:#fff;padding:10px 12px;text-align:left}
    td{padding:9px 12px;border-bottom:1px solid #eee}
    tr:nth-child(even) td{background:#f9f9f9}
    .footer{margin-top:20px;font-size:11px;color:#999}
  </style></head><body>
  <h2>Reporte de Clientes — Cuenta Corriente</h2>
  <p>Generado el ${new Date().toLocaleDateString("es-AR",{day:"numeric",month:"long",year:"numeric"})}</p>
  <table>
    <thead><tr>
      <th>Nombre</th><th>DNI</th><th>Teléfono</th><th>IVA</th>
      <th>Días de mora</th><th>% recargo</th><th>Saldo</th><th>Primera compra</th><th>Última compra</th><th>Total compras</th>
    </tr></thead>
    <tbody>${filas}</tbody>
  </table>
  <div class="footer">PECO S. — Sistema de Gestión Comercial</div>
  </body></html>`;

  const blob = new Blob([html], { type:"text/html;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

// ─── Helpers de exportación — reporte por período ─────────────────────────────
const _estadoLabel = e =>
  e === "al_dia" ? "Al día" : e === "con_saldo" ? "Con saldo"
  : e === "vencido_30" ? "Vencido +30" : "Vencido +60";

function exportCSVReporte(rows, filename) {
  const headers = ["Cliente","DNI","Primera deuda período","Última deuda período",
    "Compras período","Pagos período","Saldo período","Saldo total","Días de mora","Estado"];
  const lines = [headers.join(","), ...rows.map(r =>
    [`"${r.nombre}"`, r.dni, fmtFechaAR(r.primeraDeuda)||"-", fmtFechaAR(r.ultimaDeuda)||"-",
     r.comprasPeriodo, r.pagosPeriodo, r.saldoPeriodo, r.saldoTotal,
     r.diasMora, _estadoLabel(r.estadoBadge)
    ].join(",")
  )];
  const blob = new Blob([lines.join("\n")], { type:"text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

function exportHTMLReporte(rows, metrics, desde, hasta, filename) {
  const periodoLabel = (desde || hasta) ? `${fmtFechaAR(desde) || "inicio"} al ${fmtFechaAR(hasta) || "hoy"}` : "Todo el historial";
  const estadoStyle = e =>
    e === "al_dia" ? "background:#d4edda;color:#155724"
    : e === "con_saldo" ? "background:#fff3cd;color:#856404"
    : e === "vencido_30" ? "background:#fde8e8;color:#c0392b"
    : "background:#7f1d1d;color:#fff";

  const filas = rows.map(r => `
    <tr${r.diasMora > 60 ? ' style="background:#fff5f5"' : ''}>
      <td>${r.nombre}</td><td>${r.dni}</td>
      <td>${fmtFechaAR(r.primeraDeuda)||"-"}</td><td>${fmtFechaAR(r.ultimaDeuda)||"-"}</td>
      <td style="text-align:right">$${Math.round(r.comprasPeriodo).toLocaleString("es-AR")}</td>
      <td style="text-align:right;color:#27ae60">$${Math.round(r.pagosPeriodo).toLocaleString("es-AR")}</td>
      <td style="text-align:right;color:${r.saldoPeriodo>0?"#e67e22":"#27ae60"}">$${Math.round(r.saldoPeriodo).toLocaleString("es-AR")}</td>
      <td style="text-align:right;font-weight:700;color:${r.saldoTotal>0?"#c0392b":"#27ae60"}">$${Math.round(r.saldoTotal).toLocaleString("es-AR")}</td>
      <td style="text-align:right">${r.diasMora}</td>
      <td><span style="padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600;${estadoStyle(r.estadoBadge)}">${_estadoLabel(r.estadoBadge)}</span></td>
    </tr>`).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Reporte Cta. Cte. — PECO S.</title>
<style>
  body{font-family:Arial,sans-serif;padding:24px;color:#1a1a2e}
  h2{margin-bottom:4px}
  p.sub{color:#666;font-size:13px;margin-bottom:16px}
  .metrics{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:20px}
  .metric{background:#f5f5f5;border-radius:6px;padding:12px 18px;min-width:150px}
  .metric label{display:block;font-size:10px;color:#666;text-transform:uppercase;letter-spacing:.04em;font-weight:600;margin-bottom:4px}
  .metric strong{font-size:17px;font-weight:700}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th{background:#2c2c54;color:#fff;padding:9px 10px;text-align:left;white-space:nowrap}
  td{padding:8px 10px;border-bottom:1px solid #eee}
  tr:nth-child(even) td{background:#f9f9f9}
  .footer{margin-top:20px;font-size:11px;color:#999}
</style></head><body>
<h2>Reporte de Cuenta Corriente por Período — PECO S.</h2>
<p class="sub">Período: ${periodoLabel} &nbsp;·&nbsp; Generado: ${new Date().toLocaleDateString("es-AR",{day:"numeric",month:"long",year:"numeric"})}</p>
<div class="metrics">
  <div class="metric"><label>Deuda generada en período</label><strong>$${Math.round(metrics.totalDeuda).toLocaleString("es-AR")}</strong></div>
  <div class="metric"><label>Pagado en período</label><strong style="color:#27ae60">$${Math.round(metrics.totalPagado).toLocaleString("es-AR")}</strong></div>
  <div class="metric"><label>Saldo neto período</label><strong style="color:${metrics.saldoNeto>0?"#c0392b":"#27ae60"}">$${Math.round(metrics.saldoNeto).toLocaleString("es-AR")}</strong></div>
  <div class="metric"><label>Clientes con saldo</label><strong>${metrics.conSaldo}</strong></div>
  <div class="metric"><label>Monto vencido (+30d)</label><strong style="color:#c0392b">$${Math.round(metrics.montoVencido).toLocaleString("es-AR")}</strong></div>
</div>
<table>
  <thead><tr>
    <th>Cliente</th><th>DNI</th><th>Primera deuda</th><th>Última deuda</th>
    <th>Compras período</th><th>Pagos período</th><th>Saldo período</th>
    <th>Saldo total</th><th>Días mora</th><th>Estado</th>
  </tr></thead>
  <tbody>${filas}</tbody>
</table>
<div class="footer">PECO S. — Sistema de Gestión Comercial</div>
</body></html>`;

  const blob = new Blob([html], { type:"text/html;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

// ─── Modal historial de cliente ────────────────────────────────────────────────
export function ModalHistorial({ cliente, ventas, pagos, cambiosArticulo, configMoraGlobal, onClose, onConfigMora, usuarioActivo, actualizarCliente, modificarConfigMora }) {
  const { toast } = useToast();
  const ventasCliente = ventas
    .filter(v => v.clienteId === cliente.id && v.estado !== "anulada")
    .sort((a,b) => b.fecha.localeCompare(a.fecha));

  const pagosCliente = (pagos || [])
    .filter(p => p.clienteId === cliente.id)
    .sort((a,b) => b.fecha.localeCompare(a.fecha));

  const totalComprado = ventasCliente.reduce((a,v) => a+v.total, 0);
  const totalCtaCte   = ventasCliente.reduce((a,v) => a+montoCtaCte(v), 0);
  const totalPagado   = pagosCliente.reduce((a,p) => a+p.monto, 0);
  const saldoActual   = calcularSaldoCtaCte(cliente.id, ventas, pagos, cambiosArticulo);

  const mora = calcularMoraCliente(cliente.id, ventas, pagos, configMoraGlobal, cliente.configMora, cambiosArticulo);
  // Historial completo del cliente: las compras con parte en cta. cte. traen
  // su saldo pendiente/mora (calculado en orden FIFO por detalleVentasCtaCte);
  // las que se pagaron enteras por otro medio se agregan con saldo $0, para
  // que "Compras" muestre TODO lo que compró, no solo lo que quedó a cuenta.
  const ventasDetalle = detalleVentasCtaCte(cliente.id, ventas, pagos, cambiosArticulo);
  const ventasSinCtaCte = ventasCliente
    .filter(v => montoCtaCte(v) === 0)
    .map(v => ({ ...v, saldoPendiente: 0, diasMora: 0 }));
  const historialCompras = [...ventasDetalle, ...ventasSinCtaCte]
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  const configLabel = cliente.configMora?.usarGlobal === false ? "Individual" : "Global";
  const configValues = mora.config || {};

  const [tab, setTab] = useState("compras");
  const [limiteInput, setLimiteInput] = useState(cliente.limiteCtaCte != null ? String(cliente.limiteCtaCte) : "");
  const [guardandoLimite, setGuardandoLimite] = useState(false);

  const guardarLimite = async () => {
    const valor = limiteInput.trim() === "" ? null : Number(limiteInput);
    if (valor !== null && (isNaN(valor) || valor < 0)) {
      toast("El límite debe ser un número mayor o igual a 0.", "error");
      return;
    }
    setGuardandoLimite(true);
    try {
      await actualizarCliente(cliente.id, { limiteCtaCte: valor });
      toast(valor === null ? "Límite de cuenta corriente quitado." : `Límite actualizado a ${fmt(valor)}.`, "success");
    } catch (e) {
      toast("Error al guardar el límite: " + e.message, "error");
    } finally {
      setGuardandoLimite(false);
    }
  };

  // ── Mora manual — solo admin la carga, pero cualquiera la ve (lista de
  // cargos activos + el aviso de "atrasado sin mora" si no hay ni % ni
  // manual). Reemplaza al % automático para este cliente (ver
  // calcularMoraCliente): no se suman los dos.
  const esAdmin = usuarioActivo?.rol === "admin";
  const atrasadoSinMora = clienteAtrasadoSinMora(mora);
  const cargosManuales = (cliente.configMora?.cargosManuales || []).filter(c => c.activo !== false);
  const moraPorVenta = moraManualPorVenta(cliente.configMora);

  // Facturas a cta. cte. (más vieja primero) para cargar mora por factura.
  // Las ya pagadas se muestran pero no se les puede cargar mora.
  const facturasMora = [...ventasDetalle]
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map(v => ({
      ...v,
      pendiente: v.saldoPendiente > 0.009,
      yaTiene: moraPorVenta[v.id] || 0,
      // Sugerido: el % configurado del cliente sobre el saldo de esta
      // factura según sus días de atraso, menos la mora que ya tiene.
      sugerido: Math.max(0, sugerirMoraFactura(v, mora.config) - (moraPorVenta[v.id] || 0)),
    }));

  const [moraModo, setMoraModo] = useState("factura"); // "factura" | "cuenta"
  const [moraMonto, setMoraMonto] = useState("");
  const [moraMotivo, setMoraMotivo] = useState("");
  // Ediciones por factura: { [ventaId]: { monto, motivo } } — sin edición se
  // muestra el sugerido.
  const [moraFilas, setMoraFilas] = useState({});
  const [guardandoMora, setGuardandoMora] = useState(false);
  const montoFila  = (v) => moraFilas[v.id]?.monto ?? (v.sugerido > 0 ? String(v.sugerido) : "");
  const motivoFila = (v) => moraFilas[v.id]?.motivo ?? "";
  const editarFila = (v, campo, valor) => setMoraFilas(prev => ({
    ...prev, [v.id]: { monto: montoFila(v), motivo: motivoFila(v), ...prev[v.id], [campo]: valor },
  }));
  const totalMoraFilas = facturasMora
    .filter(v => v.pendiente)
    .reduce((a, v) => a + (Number(montoFila(v)) || 0), 0);
  const [quitandoMoraId, setQuitandoMoraId] = useState(null);

  // Guarda sobre la config que hay HOY en la base (modificarConfigMora) en vez
  // de la copia que tenía el modal al abrirse — antes, cargar dos moras
  // seguidas hacía que la segunda pisara a la primera.
  const guardarConfigMora = (transformar) => modificarConfigMora
    ? modificarConfigMora(cliente.id, transformar)
    : actualizarCliente(cliente.id, { configMora: transformar(cliente.configMora) });

  const handleAgregarMoraManual = async () => {
    let cargos;
    if (moraModo === "cuenta") {
      const monto = Number(moraMonto);
      if (!moraMonto.toString().trim() || isNaN(monto) || monto <= 0) { toast("Ingresá un monto válido.", "error"); return; }
      if (!moraMotivo.trim()) { toast("Ingresá un motivo para esta mora manual.", "error"); return; }
      cargos = [{ monto, motivo: moraMotivo.trim(), ventaId: null }];
    } else {
      cargos = [];
      for (const v of facturasMora.filter(f => f.pendiente)) {
        const txt = montoFila(v).toString().trim();
        if (!txt) continue;
        const monto = Number(txt);
        if (isNaN(monto) || monto < 0) { toast(`Monto inválido en la factura del ${fmtFechaAR(v.fecha)}.`, "error"); return; }
        if (monto === 0) continue;
        if (!motivoFila(v).trim()) { toast(`Falta el motivo de la factura del ${fmtFechaAR(v.fecha)}.`, "error"); return; }
        cargos.push({ monto, motivo: motivoFila(v).trim(), ventaId: v.id });
      }
      if (cargos.length === 0) { toast("No hay ninguna factura con mora para cargar.", "error"); return; }
    }

    setGuardandoMora(true);
    try {
      const comunes = { fecha: today(), usuario: usuarioActivo?.nombre || "" };
      // Una sola escritura con todos los cargos, sobre la config actual en la base.
      await guardarConfigMora(cfg => cargos.reduce((c, cargo) => agregarCargoMoraManual(c, { ...cargo, ...comunes }), cfg));
      const total = cargos.reduce((a, c) => a + c.monto, 0);
      toast(cargos.length > 1
        ? `Mora manual cargada en ${cargos.length} facturas — total ${fmt(total)}.`
        : `Mora manual de ${fmt(total)} cargada.`, "success");
      setMoraMonto(""); setMoraMotivo(""); setMoraFilas({});
    } catch (e) {
      toast("Error al cargar la mora manual: " + e.message, "error");
    } finally {
      setGuardandoMora(false);
    }
  };

  const handleQuitarMoraManual = async (cargoId) => {
    setQuitandoMoraId(cargoId);
    try {
      await guardarConfigMora(cfg => quitarCargoMoraManual(cfg, cargoId));
      toast("Mora manual quitada.", "success");
    } catch (e) {
      toast("Error al quitar la mora manual: " + e.message, "error");
    } finally {
      setQuitandoMoraId(null);
    }
  };

  return (
    <Modal onClose={onClose} size="modal-lg">
      <div className="modal-header">
        <div>
          <div className="modal-title">{cliente.nombre}</div>
          <div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>
            {cliente.iva} · DNI {cliente.dni} · {cliente.tel}
          </div>
        </div>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      {atrasadoSinMora && (
        <div style={{display:"flex",alignItems:"flex-start",gap:8,padding:"10px 14px",marginBottom:14,background:"rgba(245,158,11,0.08)",border:"1px solid rgba(245,158,11,0.3)",borderRadius:"var(--radius)"}}>
          <Icon name="warning" size={15} color="var(--amber)" style={{marginTop:1,flexShrink:0}}/>
          <div style={{fontSize:12,color:"var(--amber)"}}>
            Este cliente está atrasado ({mora.diasMora} días, {mora.config.diasEnMora} más allá del período de gracia) y no tiene mora configurada — ni % automático ni mora manual.
            {esAdmin ? " Cargá una abajo si corresponde." : " Avisale a un admin si corresponde cargarle una."}
          </div>
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:18}}>
        {[
          { label:"Total comprado",    val:fmt(totalComprado),       color:"var(--text1)" },
          { label:"En cta. corriente", val:fmt(totalCtaCte),         color:"var(--amber)"  },
          { label:"Total pagado",      val:fmt(totalPagado),         color:"var(--green)"  },
          { label:"Saldo pendiente",   val: mora.saldoAFavor > 0 ? fmt(0) : fmt(mora.saldoConRecargo),
            sub: mora.recargo > 0 && mora.moraManual ? `Incluye ${fmt(mora.recargo)} de mora manual`
              : mora.recargo > 0 ? `Incluye +${mora.config.pctAplicado}% por mora (${mora.diasMora} días)`
              : mora.saldoAFavor > 0 ? `Tiene ${fmt(mora.saldoAFavor)} a favor — cubre próximas compras` : null,
            color: mora.saldoAFavor > 0 ? "var(--green)" : mora.saldoConRecargo>0?"var(--red)":"var(--green)" },
        ].map((m,i) => (
          <div key={i} style={{background:"var(--bg3)",border:"1px solid var(--border)",borderRadius:"var(--radius)",padding:"12px 14px"}}>
            <div style={{fontSize:11,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".04em",marginBottom:4,fontWeight:600}}>{m.label}</div>
            <div style={{fontSize:18,fontWeight:700,color:m.color}}>{m.val}</div>
            {m.sub && <div style={{fontSize:10,color:"var(--amber)",marginTop:3}}>{m.sub}</div>}
          </div>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10,marginBottom:18}}>
        <div style={{background:"var(--bg3)",border:"1px solid var(--border)",borderRadius:"var(--radius)",padding:14}}>
          <div className="form-label" style={{marginBottom:6}}>Estado de mora</div>
          <div style={{fontSize:14,fontWeight:700,color:"var(--text1)",marginBottom:8}}>{mora.estado.replace(/_/g, " ")}</div>
          <div style={{fontSize:12,color:"var(--text3)",marginBottom:4}}>Días de mora actuales</div>
          <div style={{fontSize:18,fontWeight:700}}>{mora.diasMora ?? "—"}</div>
        </div>
        <div style={{background:"var(--bg3)",border:"1px solid var(--border)",borderRadius:"var(--radius)",padding:14}}>
          <div className="form-label" style={{marginBottom:6}}>Configuración aplicada</div>
          <div style={{fontSize:13,color:"var(--text2)",marginBottom:10}}>
            {mora.moraManual
              ? <span><strong style={{color:"var(--accent2)"}}>Mora manual</strong> (pisa el % automático)</span>
              : `${configLabel} (${configValues.pctAplicado ?? configValues.pct}% ${configValues.tipo === "mensual" ? "/mes" : configValues.tipo === "diario" ? "/día" : ""})`}
          </div>
          <div style={{fontSize:12,color:"var(--text3)",marginBottom:4}}>Días de gracia</div>
          <div style={{fontSize:16,fontWeight:700}}>{configValues.diasGracia}</div>
          <div style={{fontSize:12,color:"var(--text3)",marginTop:8}}>Total original</div>
          <div style={{fontSize:16,fontWeight:700}}>{fmt(mora.saldoOriginal)}</div>
          <div style={{fontSize:12,color:"var(--text3)",marginTop:8}}>Recargo</div>
          <div style={{fontSize:16,fontWeight:700,color:"var(--amber)"}}>{fmt(mora.recargo)}</div>
        </div>
      </div>

      {/* Mora manual — la ve cualquiera, pero solo admin puede cargar/quitar.
          Se oculta si no hay nada cargado y quien mira no es admin (ej. este
          mismo modal se reutiliza desde Cambio de artículo en Ventas, sin
          pasarle actualizarCliente/usuarioActivo). */}
      {(cargosManuales.length > 0 || esAdmin) && (
      <div style={{background:"var(--bg3)",border:"1px solid var(--border)",borderRadius:"var(--radius)",padding:14,marginBottom:18}}>
        <div className="form-label" style={{marginBottom:6}}>Mora manual</div>
        <div style={{fontSize:11,color:"var(--text3)",marginBottom:10}}>
          Un monto cargado a mano para una factura puntual o para toda la cuenta — reemplaza al % automático mientras esté activo.
        </div>

        {cargosManuales.length === 0 ? (
          <div style={{fontSize:12,color:"var(--text3)",marginBottom:esAdmin?12:0}}>Sin mora manual cargada.</div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:esAdmin?12:0}}>
            {cargosManuales.map(c => {
              const factura = c.ventaId ? historialCompras.find(v => v.id === c.ventaId) : null;
              return (
                <div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,padding:"8px 10px",background:"var(--bg4)",borderRadius:8}}>
                  <div style={{fontSize:12}}>
                    <strong style={{color:"var(--amber)"}}>{fmt(c.monto)}</strong>
                    <span style={{color:"var(--text3)"}}> — {c.motivo}</span>
                    <div style={{color:"var(--text3)",marginTop:2}}>
                      {c.ventaId ? `Factura del ${fmtFechaAR(factura?.fecha || "")}` : "Toda la cuenta"} · {fmtFechaAR(c.fecha)} · {c.usuario || "—"}
                    </div>
                  </div>
                  {esAdmin && (
                    <button className="btn btn-sm btn-ghost" style={{flexShrink:0,color:"var(--red)"}} disabled={quitandoMoraId === c.id} onClick={() => handleQuitarMoraManual(c.id)}>
                      {quitandoMoraId === c.id ? "Quitando..." : "Quitar"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {esAdmin && (
          <div>
            <div className="segmented-control" style={{marginBottom:10}}>
              <button type="button" className={`segmented-btn${moraModo === "factura" ? " active" : ""}`} onClick={() => setMoraModo("factura")}>Por factura</button>
              <button type="button" className={`segmented-btn${moraModo === "cuenta" ? " active" : ""}`} onClick={() => setMoraModo("cuenta")}>Toda la cuenta</button>
            </div>

            {moraModo === "cuenta" ? (
              <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end"}}>
                <div className="form-group" style={{marginBottom:0,width:120}}>
                  <label className="form-label">Monto</label>
                  <input className="form-input" type="number" min="0" placeholder="0" value={moraMonto} onChange={e => setMoraMonto(e.target.value)} />
                </div>
                <div className="form-group" style={{marginBottom:0,flex:1,minWidth:160}}>
                  <label className="form-label">Motivo</label>
                  <input className="form-input" placeholder="Ej: acordado por teléfono" value={moraMotivo} onChange={e => setMoraMotivo(e.target.value)} />
                </div>
                <button className="btn btn-sm btn-primary" onClick={handleAgregarMoraManual} disabled={guardandoMora}>
                  {guardandoMora ? "Cargando..." : "Cargar mora manual"}
                </button>
              </div>
            ) : facturasMora.length === 0 ? (
              <div style={{fontSize:12,color:"var(--text3)"}}>Este cliente no tiene facturas en cuenta corriente.</div>
            ) : (
              <>
                <div style={{fontSize:11,color:"var(--text3)",marginBottom:8}}>
                  El monto viene sugerido con el {mora.config.pct}% {mora.config.tipo === "diario" ? "diario" : "mensual"} sobre el saldo de cada factura según sus días de atraso (después de {mora.config.diasGracia} días de gracia). Podés cambiarlo; en 0 o vacío no se carga.
                </div>
                <div style={{border:"1px solid var(--border)",borderRadius:8,overflowX:"auto",marginBottom:10}}>
                  <table style={{width:"100%",borderCollapse:"collapse",minWidth:620}}>
                    <thead>
                      <tr style={{background:"var(--bg4)"}}>
                        {["Fecha","Total cta. cte.","Saldo","Sin pagar","Ya tiene","Mora","Motivo"].map((h, i) => (
                          <th key={h} style={{padding:"7px 10px",fontSize:10,fontWeight:600,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".04em",textAlign: i >= 1 && i <= 4 ? "right" : "left"}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {facturasMora.map(v => {
                        const vencida = v.pendiente && v.diasMora > (mora.config.diasGracia ?? 0);
                        return (
                          <tr key={v.id} style={{borderTop:"1px solid var(--border)",opacity: v.pendiente ? 1 : 0.5}}>
                            <td style={{padding:"7px 10px",fontSize:12,color:"var(--text2)",whiteSpace:"nowrap"}}>{fmtFechaAR(v.fecha)}</td>
                            <td style={{padding:"7px 10px",fontSize:12,textAlign:"right"}}>{fmt(montoCtaCte(v))}</td>
                            <td style={{padding:"7px 10px",fontSize:12,textAlign:"right",fontWeight:600,color: v.pendiente ? "var(--amber)" : "var(--text3)"}}>{fmt(v.saldoPendiente)}</td>
                            <td style={{padding:"7px 10px",fontSize:12,textAlign:"right",whiteSpace:"nowrap"}}>
                              {v.pendiente
                                ? <span style={{color: vencida ? "var(--red)" : "var(--text2)",fontWeight: vencida ? 600 : 400}}>{v.diasMora} días</span>
                                : <span style={{color:"var(--green)"}}>Pagada</span>}
                            </td>
                            <td style={{padding:"7px 10px",fontSize:12,textAlign:"right",color: v.yaTiene ? "var(--amber)" : "var(--text3)"}}>{v.yaTiene ? fmt(v.yaTiene) : "—"}</td>
                            <td style={{padding:"5px 10px"}}>
                              <input className="form-input" type="number" min="0" style={{width:100,padding:"5px 8px"}}
                                disabled={!v.pendiente} placeholder={v.pendiente ? "0" : ""}
                                value={v.pendiente ? montoFila(v) : ""}
                                onChange={e => editarFila(v, "monto", e.target.value)} />
                            </td>
                            <td style={{padding:"5px 10px"}}>
                              <input className="form-input" style={{minWidth:140,padding:"5px 8px"}}
                                disabled={!v.pendiente} placeholder={v.pendiente ? "Motivo" : ""}
                                value={v.pendiente ? motivoFila(v) : ""}
                                onChange={e => editarFila(v, "motivo", e.target.value)} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{display:"flex",justifyContent:"flex-end",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                  <span style={{fontSize:12,color:"var(--text3)"}}>Total a cargar: <strong style={{color:"var(--amber)",fontSize:14}}>{fmt(totalMoraFilas)}</strong></span>
                  <button className="btn btn-sm btn-ghost" onClick={() => setMoraFilas({})} disabled={guardandoMora}>Volver a sugeridos</button>
                  <button className="btn btn-sm btn-primary" onClick={handleAgregarMoraManual} disabled={guardandoMora || totalMoraFilas <= 0}>
                    {guardandoMora ? "Cargando..." : "Cargar mora"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      )}

      {usuarioActivo?.rol === "admin" && (
        <div style={{background:"var(--bg3)",border:"1px solid var(--border)",borderRadius:"var(--radius)",padding:14,marginBottom:18}}>
          <div className="form-label" style={{marginBottom:6}}>Límite de cuenta corriente</div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <input
              className="form-input" type="number" min="0" style={{maxWidth:180}}
              placeholder="Sin límite"
              value={limiteInput}
              onChange={e => setLimiteInput(e.target.value)}
            />
            <button className="btn btn-sm btn-primary" onClick={guardarLimite} disabled={guardandoLimite}>
              {guardandoLimite ? "Guardando..." : "Guardar"}
            </button>
            {limiteInput !== "" && (
              <button className="btn btn-sm btn-ghost" onClick={() => setLimiteInput("")} title="Quitar límite">
                Sin límite
              </button>
            )}
          </div>
          {limiteInput !== "" && Number(limiteInput) === 0 && (
            <div style={{fontSize:11,color:"var(--amber)",marginTop:6}}>
              ⚠ Límite $0: no se le podrá vender nada a cuenta corriente a este cliente.
            </div>
          )}
          <div style={{fontSize:11,color:"var(--text3)",marginTop:6}}>
            Saldo utilizado actual: <strong style={{color:"var(--text2)"}}>{fmt(saldoActual)}</strong>. Dejá vacío para no aplicar límite.
          </div>
        </div>
      )}

      <div style={{display:"flex",background:"var(--bg3)",border:"1px solid var(--border)",borderRadius:8,overflow:"hidden",marginBottom:16,width:"fit-content"}}>
        {[["compras","Compras"],["pagos","Pagos cta. cte."]].map(([k,l]) => (
          <button key={k} onClick={()=>setTab(k)} style={{
            padding:"7px 18px",fontSize:13,fontWeight:500,border:"none",cursor:"pointer",
            background: tab===k ? "var(--accent)" : "transparent",
            color: tab===k ? "#fff" : "var(--text2)"
          }}>{l}</button>
        ))}
      </div>

      {tab==="compras" && (
        <div style={{background:"var(--bg3)",border:"1px solid var(--border)",borderRadius:"var(--radius)",overflow:"hidden"}}>
          {historialCompras.length === 0 ? (
            <div style={{padding:30,textAlign:"center",color:"var(--text3)",fontSize:13}}>Sin compras registradas</div>
          ) : (
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead>
                <tr style={{borderBottom:"1px solid var(--border)"}}>
                  {["Fecha","Items","Forma de pago","Saldo pendiente","Mora","Total"].map(h=>(
                    <th key={h} style={{padding:"8px 12px",fontSize:11,fontWeight:600,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".04em",textAlign:"left"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {historialCompras.map(v => {
                  const ctaCte = montoCtaCte(v);
                  return (
                  <tr key={v.id} style={{borderBottom:"1px solid var(--border)"}}>
                    <td style={{padding:"9px 12px",fontSize:13,color:"var(--text2)"}}>{fmtFechaAR(v.fecha)}</td>
                    <td style={{padding:"9px 12px",fontSize:12,color:"var(--text3)"}}>{v.items.map(i=>`${i.qty}x ${i.nombre}`).join(", ")}</td>
                    <td style={{padding:"9px 12px",fontSize:12}}>
                      {ctaCte === 0 ? (
                        <span style={{color:"var(--text3)"}}>{v.formaPago || "—"}</span>
                      ) : ctaCte < v.total ? (
                        <>{fmt(ctaCte)} <span style={{fontSize:10,color:"var(--text3)"}}>cta. cte. (parcial)</span></>
                      ) : (
                        <span style={{color:"var(--amber)"}}>{fmt(ctaCte)}</span>
                      )}
                    </td>
                    <td style={{padding:"9px 12px",fontSize:12}}>
                      {fmt(v.saldoPendiente)}
                      {moraPorVenta[v.id] > 0 && (
                        <div style={{fontSize:10,color:"var(--amber)",marginTop:2}}>+ {fmt(moraPorVenta[v.id])} de mora</div>
                      )}
                    </td>
                    <td style={{padding:"9px 12px"}}>
                      {v.saldoPendiente > 0 && v.diasMora > configValues.diasGracia ? (
                        <span className="badge badge-danger">{v.diasMora} días</span>
                      ) : v.saldoPendiente > 0 ? (
                        <span style={{fontSize:11,color:"var(--text3)"}}>{v.diasMora} días</span>
                      ) : (
                        <span style={{fontSize:11,color:"var(--text3)"}}>Pagado</span>
                      )}
                    </td>
                    <td style={{padding:"9px 12px",fontWeight:600,color:"var(--accent2)",textAlign:"right"}}>{fmt(v.total)}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab==="pagos" && (
        <div style={{background:"var(--bg3)",border:"1px solid var(--border)",borderRadius:"var(--radius)",overflow:"hidden"}}>
          {pagosCliente.length === 0 ? (
            <div style={{padding:30,textAlign:"center",color:"var(--text3)",fontSize:13}}>Sin pagos registrados</div>
          ) : (
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead>
                <tr style={{borderBottom:"1px solid var(--border)"}}>
                  {["Fecha","Observación","Monto"].map(h=>(
                    <th key={h} style={{padding:"8px 12px",fontSize:11,fontWeight:600,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".04em",textAlign:"left"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagosCliente.map(p => (
                  <tr key={p.id} style={{borderBottom:"1px solid var(--border)"}}>
                    <td style={{padding:"9px 12px",fontSize:13,color:"var(--text2)"}}>{fmtFechaAR(p.fecha)}</td>
                    <td style={{padding:"9px 12px",fontSize:13,color:"var(--text3)"}}>{p.observacion}</td>
                    <td style={{padding:"9px 12px",fontWeight:600,color:"var(--green)",textAlign:"right"}}>
                      +{fmt(p.monto)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div style={{marginTop:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        {usuarioActivo?.rol === "admin" && (
          <button className="btn btn-ghost" onClick={() => onConfigMora?.()}>Configurar mora individual</button>
        )}
        <button className="btn" onClick={onClose}>Cerrar</button>
      </div>
    </Modal>
  );
}

// ─── Page principal ────────────────────────────────────────────────────────────
export default function PageClientes({
  clientes, setClientes, ventas, pagosCtaCte, setPagosCtaCte, cambiosArticulo, configMora, setConfigMora,
  recibos, setRecibos, caja, usuarioActivo, permisos, agregarCliente, actualizarCliente, modificarConfigMora, agregarPagoCtaCte, agregarRecibo, emitirRecibo,
  productos, depositos, stockDepositos, listas, configPrecios, rubros, proveedores,
  agregarVenta, cargarVentas, actualizarStock, actualizarStockDepositoMultiple, aplicarDeltaStockMultiple, aplicarDeltaStockProductoMultiple,
  reservas, crearReserva, agregarSeña, editarPreciosReserva, registrarRetiroReserva, cancelarReserva,
  editarVenta, editarVentaConItems, anularVenta, registrarRetiroSeña, registrarPagoSeña, periodosCerrados,
  tarjetas = [],
}) {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [sincronizando, setSincronizando] = useState(false);
  const [cambiandoEstadoId, setCambiandoEstadoId] = useState(null);

  const handleToggleActivo = async (c) => {
    const activar = c.activo === false;
    if (!activar) {
      const ok = await confirm(
        `¿Inhabilitar a ${c.nombre}? No se borra nada — su historial de ventas y cuenta corriente queda intacto, y se puede volver a habilitar cuando quieras.`,
        { confirmLabel: "Inhabilitar" }
      );
      if (!ok) return;
    }
    setCambiandoEstadoId(c.id);
    try {
      await actualizarCliente(c.id, { activo: activar });
      toast(activar ? `${c.nombre} habilitado.` : `${c.nombre} inhabilitado.`, "success");
    } catch (err) {
      toast(err.message || "Error al cambiar el estado del cliente.", "error");
    } finally {
      setCambiandoEstadoId(null);
    }
  };

  const handleSincronizarVentas = async () => {
    setSincronizando(true);
    try {
      await setCache("ventas", null);
      await cargarVentas?.();
      toast("Datos sincronizados", "success");
    } finally {
      setSincronizando(false);
    }
  };
  const [showModal, setShowModal] = useState(false);
  const [editCliente, setEditCliente] = useState(null);
  const [historialCliente, setHistorialCliente] = useState(null);
  const [tab, setTab] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const [vencidosFiltro, setVencidosFiltro] = useState("todos");
  const [diasCustom, setDiasCustom] = useState(30);
  const [ordenVencidos, setOrdenVencidos] = useState("mayor_deuda");
  const [paginaClientes, setPaginaClientes] = useState(1);
  const [verTodosClientes, setVerTodosClientes] = useState(false);
  const [editConfigGlobal, setEditConfigGlobal] = useState(false);
  const [editConfigCliente, setEditConfigCliente] = useState(null);
  const [pagoCliente, setPagoCliente] = useState(null);
  const [pagoMonto, setPagoMonto] = useState(0);
  const [pagoObservacion, setPagoObservacion] = useState("");
  const [pagoFormaPago, setPagoFormaPago] = useState("Efectivo");
  const [guardandoPago, setGuardandoPago] = useState(false);
  const [pagoIncluyeMora, setPagoIncluyeMora] = useState(true);
  // Mora del cliente al momento de cobrar, recalculada con su ficha actual
  // (la fila de la lista puede venir del reporte, sin todos los datos).
  const pagoClienteActual = pagoCliente ? (clientes.find(c => c.id === pagoCliente.id) || pagoCliente) : null;
  const moraPago = pagoClienteActual
    ? calcularMoraCliente(pagoClienteActual.id, ventas, pagosCtaCte, configMora, pagoClienteActual.configMora, cambiosArticulo)
    : null;

  // Estado para el reporte por período
  const [reporteDesde, setReporteDesde] = useState("");
  const [reporteHasta, setReporteHasta] = useState("");
  const [reporteClienteId, setReporteClienteId] = useState("");
  const [reporteEstado, setReporteEstado] = useState("todos");
  const [reporteDiasMin, setReporteDiasMin] = useState(0);
  const [reporteDetalleCliente, setReporteDetalleCliente] = useState(null);

  const reservasPendientes = (reservas || []).filter(r => r.estado === "pendiente").length
    + (ventas || []).filter(v => v.esSeña && v.estado === "pendiente").length;

  const clientesConSaldo = useMemo(() => {
    return clientes.map(c => {
      const mora = calcularMoraCliente(c.id, ventas, pagosCtaCte, configMora, c.configMora, cambiosArticulo);
      const ventasCliente = ventas.filter(v => v.clienteId===c.id && v.estado !== "anulada");
      const todasVentas = [...ventasCliente].sort((a,b)=>a.fecha.localeCompare(b.fecha));
      const primeraCompra = todasVentas[0]?.fecha || null;
      const ultimaCompra = todasVentas[todasVentas.length-1]?.fecha || null;
      const totalCompras = todasVentas.reduce((a,v)=>a+v.total,0);
      return { ...c, ...mora, primeraCompra, ultimaCompra, totalCompras, atrasadoSinMora: clienteAtrasadoSinMora(mora) };
    });
  }, [clientes, ventas, pagosCtaCte, configMora]);

  const filtrados = useMemo(() => {
    let lista = clientesConSaldo;
    if (tab === "ctacte") {
      lista = lista.filter(c => c.saldoOriginal > 0 || c.saldoAFavor > 0);
    }
    if (tab === "vencidos") {
      lista = lista.filter(c => c.estado === "vencido_leve" || c.estado === "vencido_grave");
      const threshold = vencidosFiltro === "todos" ? 0 : vencidosFiltro === "custom" ? Number(diasCustom) : Number(vencidosFiltro);
      if (threshold > 0) lista = lista.filter(c => c.diasMora > threshold);
      if (ordenVencidos === "mayor_mora") lista = lista.sort((a,b) => (b.diasMora || 0) - (a.diasMora || 0));
      if (ordenVencidos === "mayor_deuda") lista = lista.sort((a,b) => b.saldoOriginal - a.saldoOriginal);
      if (ordenVencidos === "nombre") lista = lista.sort((a,b) => a.nombre.localeCompare(b.nombre));
    }
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      lista = lista.filter(c =>
        c.nombre.toLowerCase().includes(q) ||
        c.dni.includes(q) ||
        c.tel.includes(q)
      );
    }
    return lista;
  }, [clientesConSaldo, tab, busqueda, vencidosFiltro, diasCustom, ordenVencidos]);

  // La tabla solo se muestra (paginada de a 15) una vez que se busca algo;
  // antes de eso queda vacía para no listar los 524 clientes de una.
  // En Cuenta corriente y Vencidos (listas ya acotadas por su propio filtro)
  // se puede además optar por "Ver todos" sin necesidad de buscar.
  const hayFiltroClientes = busqueda.trim() !== "" || (verTodosClientes && tab !== "todos");
  const totalPaginasClientes = Math.max(1, Math.ceil(filtrados.length / CLIENTES_PAGE_SIZE));
  const paginaClientesActual = Math.min(paginaClientes, totalPaginasClientes);
  const clientesPagina = useMemo(
    () => hayFiltroClientes
      ? filtrados.slice((paginaClientesActual - 1) * CLIENTES_PAGE_SIZE, paginaClientesActual * CLIENTES_PAGE_SIZE)
      : [],
    [filtrados, paginaClientesActual, hayFiltroClientes]
  );

  const setBusquedaClientes = (v) => { setBusqueda(v); setPaginaClientes(1); };
  const setTabClientes = (v) => { setTab(v); setPaginaClientes(1); setVerTodosClientes(false); };
  const setVencidosFiltroClientes = (v) => { setVencidosFiltro(v); setPaginaClientes(1); };
  const setOrdenVencidosClientes = (v) => { setOrdenVencidos(v); setPaginaClientes(1); };

  const rowsExport = clientesConSaldo.filter(c=>c.saldoOriginal>0);

  const vencidosMetrics = useMemo(() => {
    const vencidosAll = clientesConSaldo.filter(c => c.estado === "vencido_leve" || c.estado === "vencido_grave");
    return {
      totalOriginal: vencidosAll.reduce((a,c)=>a+c.saldoOriginal,0),
      totalRecargo: vencidosAll.reduce((a,c)=>a+c.recargo,0),
      totalConRecargo: vencidosAll.reduce((a,c)=>a+c.saldoConRecargo,0),
      clientesVencidos: vencidosAll.length,
      clientesEnGracia: clientesConSaldo.filter(c => c.estado === "en_gracia").length,
    };
  }, [clientesConSaldo]);

  // ─── Datos del reporte por período ───────────────────────────────────────────
  const reporteData = useMemo(() => {
    if (tab !== "reporte") return [];
    return clientes
      .filter(c => !reporteClienteId || String(c.id) === String(reporteClienteId))
      .map(c => {
        const allVentasCtaCte = (ventas || []).filter(v => v.clienteId === c.id && montoCtaCte(v) > 0);

        const ventasPeriodo = allVentasCtaCte
          .filter(v => (!reporteDesde || v.fecha >= reporteDesde) && (!reporteHasta || v.fecha <= reporteHasta))
          .sort((a, b) => a.fecha.localeCompare(b.fecha));

        const pagosPeriodoArr = (pagosCtaCte || []).filter(p =>
          p.clienteId === c.id &&
          (!reporteDesde || p.fecha >= reporteDesde) &&
          (!reporteHasta || p.fecha <= reporteHasta)
        );

        const comprasPeriodo = ventasPeriodo.reduce((a, v) => a + montoCtaCte(v), 0);
        const pagosPeriodo = pagosPeriodoArr.reduce((a, p) => a + p.monto, 0);
        const saldoPeriodo = comprasPeriodo - pagosPeriodo;
        const primeraDeuda = ventasPeriodo[0]?.fecha || null;
        const ultimaDeuda = ventasPeriodo[ventasPeriodo.length - 1]?.fecha || null;

        const mora = calcularMoraCliente(c.id, ventas, pagosCtaCte, configMora, c.configMora, cambiosArticulo);
        const diasMora = mora.diasMora ?? 0;

        // Incluir si tuvo actividad en el período, o (sin filtro de fecha) si tiene historial ctacte
        const hasPeriodActivity = comprasPeriodo > 0 || pagosPeriodo > 0;
        const hasHistoricalActivity = !reporteDesde && !reporteHasta && allVentasCtaCte.length > 0;
        if (!hasPeriodActivity && !hasHistoricalActivity) return null;

        let estadoBadge;
        if (mora.saldoOriginal <= 0) estadoBadge = "al_dia";
        else if (diasMora > 60) estadoBadge = "vencido_60";
        else if (diasMora > 30) estadoBadge = "vencido_30";
        else estadoBadge = "con_saldo";

        return { ...c, comprasPeriodo, pagosPeriodo, saldoPeriodo, saldoTotal: mora.saldoOriginal, saldoConRecargo: mora.saldoConRecargo, recargo: mora.recargo, diasMora, estadoBadge, primeraDeuda, ultimaDeuda };
      })
      .filter(Boolean)
      .filter(c => {
        if (reporteEstado === "pendiente" && c.saldoTotal <= 0) return false;
        if (reporteEstado === "al_dia" && c.saldoTotal > 0) return false;
        if (reporteEstado === "vencido" && c.diasMora <= 30) return false;
        if (Number(reporteDiasMin) > 0 && c.diasMora < Number(reporteDiasMin)) return false;
        return true;
      });
  }, [tab, clientes, ventas, pagosCtaCte, configMora, reporteDesde, reporteHasta, reporteClienteId, reporteEstado, reporteDiasMin]);

  const reporteMetrics = useMemo(() => ({
    totalDeuda: reporteData.reduce((a, c) => a + c.comprasPeriodo, 0),
    totalPagado: reporteData.reduce((a, c) => a + c.pagosPeriodo, 0),
    saldoNeto: reporteData.reduce((a, c) => a + c.saldoPeriodo, 0),
    conSaldo: reporteData.filter(c => c.saldoTotal > 0).length,
    montoVencido: reporteData.filter(c => c.diasMora > 30).reduce((a, c) => a + c.saldoTotal, 0),
  }), [reporteData]);

  const { pagina: paginaReporte, setPagina: setPaginaReporte, totalPaginas: totalPaginasReporte, itemsPagina: reporteDataPagina, pageSize: pageSizeReporte } = usePaginacion(reporteData);

  return (
    <div>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,flexWrap:"wrap"}}>

        <div style={{display:"flex",background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:8,overflow:"hidden"}}>
          {[ ["todos","Todos los clientes"], ["ctacte","Cuenta corriente"], ["vencidos","Vencidos"], ["reporte","Reporte Cta. Cte."],
             ["reservas", `Reservas${reservasPendientes > 0 ? ` (${reservasPendientes})` : ""}`] ].map(([k,l])=> (
            <button key={k} onClick={()=>setTabClientes(k)} style={{
              padding:"7px 16px",fontSize:13,fontWeight:500,border:"none",cursor:"pointer",
              background: tab===k ? "var(--accent)" : "transparent",
              color: tab===k ? "#fff" : "var(--text2)"
            }}>{l}</button>
          ))}
        </div>

        {tab !== "reporte" && tab !== "reservas" && (
          <div style={{position:"relative"}}>
            <div style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:"var(--text3)",pointerEvents:"none"}}>
              <Icon name="search" size={14}/>
            </div>
            <input
              style={{paddingLeft:32,padding:"7px 12px 7px 32px",fontSize:13,background:"var(--bg2)",border:"1px solid var(--border2)",borderRadius:"var(--radius-sm)",color:"var(--text1)",fontFamily:"inherit",outline:"none",width:200}}
              placeholder="Buscar cliente..."
              value={busqueda}
              onChange={e=>setBusquedaClientes(e.target.value)}
            />
          </div>
        )}

        {(tab === "ctacte" || tab === "vencidos") && (
          <button
            className={`btn btn-sm ${verTodosClientes ? "btn-primary" : "btn-ghost"}`}
            onClick={() => { setVerTodosClientes(v => !v); setPaginaClientes(1); }}
          >
            <Icon name="eye" size={13}/> Ver todos
          </button>
        )}

        <div style={{marginLeft:"auto",display:"flex",gap:8,flexWrap:"wrap"}}>
          {usuarioActivo?.rol === "admin" && (
            <button className="btn" onClick={()=>setEditConfigGlobal(true)}>
              <Icon name="settings" size={14}/> Configurar mora
            </button>
          )}
          {tab === "ctacte" && (
            <>
              <button className="btn" onClick={()=>exportCSV(rowsExport,"clientes-ctacte.csv")}><Icon name="chart" size={14}/> Exportar CSV</button>
              <button className="btn" onClick={()=>exportHTML(rowsExport,"clientes-ctacte.html")}><Icon name="printer" size={14}/> Exportar PDF/HTML</button>
            </>
          )}
          {tab === "reporte" && (
            <>
              <button className="btn" onClick={()=>exportCSVReporte(reporteData,`reporte-ctacte${reporteDesde?"-"+reporteDesde:""}.csv`)}>
                <Icon name="chart" size={14}/> Exportar CSV
              </button>
              <button className="btn" onClick={()=>exportHTMLReporte(reporteData,reporteMetrics,reporteDesde,reporteHasta,`reporte-ctacte${reporteDesde?"-"+reporteDesde:""}.html`)}>
                <Icon name="printer" size={14}/> Exportar PDF/HTML
              </button>
            </>
          )}
          <button className="btn btn-primary" onClick={()=>setShowModal(true)}><Icon name="plus" size={15}/> Nuevo cliente</button>
        </div>
      </div>

      {/* Métricas vencidos */}
      {tab === "vencidos" && (
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,marginBottom:16}}>
          {[
            { label:"Saldo original vencido", val:fmt(vencidosMetrics.totalOriginal), color:"var(--text1)" },
            { label:"Total recargos", val:fmt(vencidosMetrics.totalRecargo), color:"var(--amber)" },
            { label:"Total con recargo", val:fmt(vencidosMetrics.totalConRecargo), color:"var(--red)" },
            { label:"Clientes vencidos", val:vencidosMetrics.clientesVencidos, color:"var(--text1)" },
            { label:"Clientes en gracia", val:vencidosMetrics.clientesEnGracia, color:"var(--green)" },
          ].map((m,i) => (
            <div key={i} style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"var(--radius)",padding:"14px 16px"}}>
              <div style={{fontSize:11,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".04em",marginBottom:4,fontWeight:600}}>{m.label}</div>
              <div style={{fontSize:22,fontWeight:700,color:m.color}}>{m.val}</div>
            </div>
          ))}
        </div>
      )}

      {/* Controles vencidos */}
      {tab === "vencidos" && (
        <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",marginBottom:16}}>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <span style={{fontSize:12,color:"var(--text3)"}}>Umbral de días de mora:</span>
            {["todos","30","60","90","custom"].map(v => (
              <button key={v} onClick={()=>setVencidosFiltroClientes(v)} className={`btn btn-sm ${vencidosFiltro===v?"btn-primary":"btn-ghost"}`}>
                {v==="todos"?"Todos con mora":v==="custom"?"Personalizado":"+"+v+" días"}
              </button>
            ))}
          </div>
          {vencidosFiltro === "custom" && (
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <input type="number" className="form-input" style={{width:90}} min={1} value={diasCustom} onChange={e=>setDiasCustom(Number(e.target.value) || 0)} />
              <span style={{fontSize:12,color:"var(--text3)"}}>días</span>
            </div>
          )}
          <div style={{display:"flex",gap:6,alignItems:"center",marginLeft:"auto"}}>
            <span style={{fontSize:12,color:"var(--text3)"}}>Ordenar por:</span>
            {[["mayor_deuda","Mayor deuda"],["mayor_mora","Mayor mora"],["nombre","Nombre"]].map(([val,label]) => (
              <button key={val} onClick={()=>setOrdenVencidosClientes(val)} className={`btn btn-sm ${ordenVencidos===val?"btn-primary":"btn-ghost"}`}>{label}</button>
            ))}
          </div>
        </div>
      )}

      {/* Tabla clientes (todos / ctacte / vencidos) */}
      {tab !== "reporte" && tab !== "reservas" && (
        <div className="card">
          <div className="card-title">
            {tab === "todos" && "Clientes registrados"}
            {tab === "ctacte" && "Clientes con cuenta corriente"}
            {tab === "vencidos" && "Clientes vencidos"}
            {tab === "ctacte" && (
              <button
                onClick={handleSincronizarVentas}
                disabled={sincronizando}
                className="btn btn-sm btn-ghost"
                style={{marginLeft:8, fontWeight:400, textTransform:"none", letterSpacing:"normal"}}
                title="Recargar ventas desde Supabase"
              >
                {sincronizando ? "Sincronizando…" : "↻ Sincronizar"}
              </button>
            )}
            {hayFiltroClientes && (
              <span style={{marginLeft:8,fontWeight:400,color:"var(--text3)",fontSize:11}}>{filtrados.length} resultado{filtrados.length!==1?"s":""}</span>
            )}
          </div>
          {!hayFiltroClientes ? (
            <div style={{textAlign:"center", padding:"48px 20px", color:"var(--text3)"}}>
              <Icon name="search" size={28}/>
              <div style={{marginTop:10, fontSize:13}}>
                {tab === "todos"
                  ? "Buscá por nombre, DNI o teléfono para ver los clientes"
                  : "Buscá por nombre, DNI o teléfono, o tocá \"Ver todos\" para ver la lista completa"}
              </div>
            </div>
          ) : (
          <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>DNI</th>
                  <th>Teléfono</th>
                  <th>IVA</th>
                  {tab === "todos" && <th>Cta. Cte.</th>}
                  {tab === "ctacte" && <th>Primera compra</th>}
                  {tab === "ctacte" && <th>Última compra</th>}
                  <th>Total compras</th>
                  {tab === "ctacte" && <th>Saldo original</th>}
                  {tab === "ctacte" && <th>Recargo mora</th>}
                  {tab === "ctacte" && <th>Total con recargo</th>}
                  {tab === "vencidos" && <th>Días de mora</th>}
                  {tab === "vencidos" && <th>Configuración</th>}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.length===0 && (
                  <tr><td colSpan={12} style={{textAlign:"center",padding:30,color:"var(--text3)"}}>Sin resultados</td></tr>
                )}
                {clientesPagina.map(c => {
                  const configLabel = c.config?.usarGlobal === false ? "Individual" : "Global";
                  const configText = c.config?.usarEscala
                    ? `${configLabel} (${c.config.pctAplicado ?? c.config.pct}% según escala)`
                    : `${configLabel} (${c.config.pctAplicado ?? c.config.pct}%/${c.config.tipo === "diario" ? "día" : "mes"})`;
                  const moraStyle = c.diasMora > 90 ? { background:"#7f1d1d", color:"#fff" }
                    : c.diasMora > 60 ? { background:"#d97706", color:"#fff" }
                    : c.diasMora > 30 ? { background:"#f59e0b", color:"#1a1a1a" }
                    : { background:"#facc15", color:"#1a1a1a" };
                  return (
                    <tr key={c.id} style={{ opacity: c.activo === false ? 0.5 : 1 }}>
                      <td style={{color:"var(--text1)",fontWeight:500}}>
                        {c.nombre}
                        {c.activo === false && (
                          <span className="badge" style={{marginLeft:6,fontSize:9,background:"var(--bg4)",color:"var(--text3)"}}>Inactivo</span>
                        )}
                        {c.atrasadoSinMora && (
                          <span
                            className="badge"
                            title={`Atrasado ${c.diasMora} días, sin mora configurada (ni % ni manual)`}
                            style={{marginLeft:6,fontSize:9,background:"rgba(245,158,11,0.14)",color:"var(--amber)",border:"1px solid rgba(245,158,11,0.3)"}}
                          >
                            <Icon name="warning" size={9} style={{marginRight:3,verticalAlign:"-1px"}}/>Sin mora
                          </span>
                        )}
                      </td>
                      <td className="mono">{c.dni}</td>
                      <td style={{color:"var(--text3)"}}>{c.tel}</td>
                      <td><span className="badge badge-accent">{c.iva}</span></td>
                      {tab === "todos" && (
                        <td>
                          {c.saldoOriginal > 0 ? (
                            <div>
                              <span style={{
                                fontWeight: 600, fontSize: 13,
                                color: c.limiteCtaCte ? (Math.round((c.saldoOriginal / c.limiteCtaCte) * 100) >= 100 ? "var(--red)" : Math.round((c.saldoOriginal / c.limiteCtaCte) * 100) >= 80 ? "var(--amber)" : "var(--text1)") : "var(--text1)",
                              }}>
                                {fmt(c.saldoOriginal)}
                              </span>
                              {c.limiteCtaCte != null && (
                                <span style={{ fontSize: 11, color: "var(--text3)", marginLeft: 4 }}>/ {fmt(c.limiteCtaCte)}</span>
                              )}
                            </div>
                          ) : c.saldoAFavor > 0 ? (
                            <span style={{ color: "var(--green)", fontSize: 12, fontWeight: 600 }} title="El cliente pagó de más y ese excedente cubre automáticamente sus próximas compras en cuenta corriente">
                              +{fmt(c.saldoAFavor)} a favor
                            </span>
                          ) : (
                            <span style={{ color: "var(--text3)", fontSize: 12 }}>Al día</span>
                          )}
                        </td>
                      )}
                      {tab === "ctacte" && <td style={{fontSize:12,color:"var(--text3)"}}>{c.primeraCompra||"—"}</td>}
                      {tab === "ctacte" && <td style={{fontSize:12,color:"var(--text3)"}}>{c.ultimaCompra||"—"}</td>}
                      <td style={{color:"var(--text2)"}}>{fmt(c.totalCompras)}</td>
                      {tab === "ctacte" && (
                        <td>
                          {c.saldoOriginal > 0 ? fmt(c.saldoOriginal) : c.saldoAFavor > 0 ? (
                            <span style={{ color: "var(--green)", fontSize: 12, fontWeight: 600 }} title="El cliente pagó de más y ese excedente cubre automáticamente sus próximas compras en cuenta corriente">
                              +{fmt(c.saldoAFavor)} a favor
                            </span>
                          ) : fmt(0)}
                        </td>
                      )}
                      {tab === "ctacte" && <td>{fmt(c.recargo)}</td>}
                      {tab === "ctacte" && (
                        <td>
                          {c.saldoOriginal > 0 ? (
                            <span style={{fontWeight:700,color:c.saldoConRecargo>0?"var(--red)":"var(--green)"}}>{fmt(c.saldoConRecargo)}</span>
                          ) : c.saldoAFavor > 0 ? (
                            <span style={{fontWeight:700,color:"var(--green)"}}>+{fmt(c.saldoAFavor)}</span>
                          ) : (
                            <span style={{fontWeight:700,color:"var(--green)"}}>{fmt(0)}</span>
                          )}
                        </td>
                      )}
                      {tab === "vencidos" && (
                        <td>
                          {c.diasMora != null ? (
                            <span className="badge" style={{padding:"3px 8px",borderRadius:99,fontSize:11,...moraStyle}}>{c.diasMora} días</span>
                          ) : "—"}
                        </td>
                      )}
                      {tab === "vencidos" && <td style={{fontSize:12,color:"var(--text3)"}}>{configText}</td>}
                      <td style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                        <button className="btn btn-sm" onClick={()=>setHistorialCliente(c)}><Icon name="chart" size={13}/> Historial</button>
                        {c.saldoOriginal > 0 && (
                          <button className="btn btn-ghost btn-sm" onClick={() => { setPagoCliente(c); setPagoMonto(c.saldoConRecargo); setPagoObservacion(""); setPagoFormaPago("Efectivo"); setPagoIncluyeMora(true); }}>
                            <Icon name="plus" size={13}/> Pago
                          </button>
                        )}
                        <button className="btn btn-ghost btn-sm" title="Editar cliente" onClick={() => setEditCliente(c)}>
                          <Icon name="edit" size={13}/>
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          title={c.activo === false ? "Habilitar" : "Inhabilitar"}
                          disabled={cambiandoEstadoId === c.id}
                          style={{color: c.activo === false ? "var(--green)" : "var(--red)"}}
                          onClick={() => handleToggleActivo(c)}
                        >
                          <Icon name={c.activo === false ? "unlock" : "lock"} size={13}/>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtrados.length > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
              <span style={{ fontSize: 12, color: "var(--text3)" }}>
                Mostrando {(paginaClientesActual - 1) * CLIENTES_PAGE_SIZE + 1}–{Math.min(paginaClientesActual * CLIENTES_PAGE_SIZE, filtrados.length)} de {filtrados.length}
              </span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button className="btn btn-sm btn-ghost" disabled={paginaClientesActual <= 1} onClick={() => setPaginaClientes(p => p - 1)}>
                  ‹ Anterior
                </button>
                <span style={{ fontSize: 12, color: "var(--text3)" }}>Página {paginaClientesActual} de {totalPaginasClientes}</span>
                <button className="btn btn-sm btn-ghost" disabled={paginaClientesActual >= totalPaginasClientes} onClick={() => setPaginaClientes(p => p + 1)}>
                  Siguiente ›
                </button>
              </div>
            </div>
          )}
          </>
          )}
        </div>
      )}

      {/* ─── Panel Reporte Cta. Cte. por período ─────────────────────────────── */}
      {tab === "reporte" && (
        <>
          {/* Filtros */}
          <div className="card" style={{marginBottom:14}}>
            <div className="card-title">Filtros del reporte</div>
            <div className="form-row form-row-3" style={{gap:12,alignItems:"flex-end"}}>
              <div className="form-group">
                <label className="form-label">Desde</label>
                <input type="date" className="form-input" value={reporteDesde} onChange={e=>setReporteDesde(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Hasta</label>
                <input type="date" className="form-input" value={reporteHasta} onChange={e=>setReporteHasta(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Cliente</label>
                <select className="form-select" value={reporteClienteId} onChange={e=>setReporteClienteId(e.target.value)}>
                  <option value="">Todos los clientes</option>
                  {clientes.slice().sort((a,b)=>a.nombre.localeCompare(b.nombre)).map(c=>(
                    <option key={c.id} value={String(c.id)}>{c.nombre}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-row form-row-2" style={{gap:12,marginTop:10,alignItems:"flex-end"}}>
              <div className="form-group">
                <label className="form-label">Estado</label>
                <select className="form-select" value={reporteEstado} onChange={e=>setReporteEstado(e.target.value)}>
                  <option value="todos">Todos</option>
                  <option value="pendiente">Solo con saldo pendiente</option>
                  <option value="al_dia">Solo al día</option>
                  <option value="vencido">Solo vencidos (+30 días)</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Días de mora mínimos</label>
                <input type="number" className="form-input" min={0} value={reporteDiasMin}
                  onChange={e=>setReporteDiasMin(e.target.value)} placeholder="0 = sin filtro" />
              </div>
            </div>
          </div>

          {/* Métricas */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,marginBottom:14}}>
            {[
              { label:"Deuda generada en período", val:fmt(reporteMetrics.totalDeuda), color:"var(--text1)" },
              { label:"Pagado en período", val:fmt(reporteMetrics.totalPagado), color:"var(--green)" },
              { label:"Saldo neto período", val:fmt(reporteMetrics.saldoNeto), color:reporteMetrics.saldoNeto>0?"var(--amber)":"var(--green)" },
              { label:"Clientes con saldo", val:reporteMetrics.conSaldo, color:"var(--text1)" },
              { label:"Monto vencido (+30d)", val:fmt(reporteMetrics.montoVencido), color:"var(--red)" },
            ].map((m,i)=>(
              <div key={i} style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"var(--radius)",padding:"14px 16px"}}>
                <div style={{fontSize:11,color:"var(--text3)",textTransform:"uppercase",letterSpacing:".04em",marginBottom:4,fontWeight:600}}>{m.label}</div>
                <div style={{fontSize:20,fontWeight:700,color:m.color}}>{m.val}</div>
              </div>
            ))}
          </div>

          {/* Tabla */}
          <div className="card">
            <div className="card-title">
              Cuenta corriente por período
              <span style={{marginLeft:8,fontWeight:400,color:"var(--text3)",fontSize:11}}>
                {reporteData.length} cliente{reporteData.length!==1?"s":""}
                {(reporteDesde||reporteHasta) && ` · ${reporteDesde||"inicio"} → ${reporteHasta||"hoy"}`}
              </span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>DNI</th>
                    <th>Primera deuda</th>
                    <th>Última deuda</th>
                    <th>Compras período</th>
                    <th>Pagos período</th>
                    <th>Saldo período</th>
                    <th>Saldo total</th>
                    <th>Días mora</th>
                    <th>Estado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {reporteData.length === 0 && (
                    <tr><td colSpan={11} style={{textAlign:"center",padding:30,color:"var(--text3)"}}>
                      {(reporteDesde || reporteHasta) ? "Sin actividad en el período seleccionado" : "Sin clientes con cuenta corriente"}
                    </td></tr>
                  )}
                  {reporteDataPagina.map(c => {
                    const rowStyle = c.diasMora > 60
                      ? {background:"rgba(239,68,68,0.06)"}
                      : {};
                    const badgeClass = c.estadoBadge === "al_dia" ? "badge badge-ok"
                      : c.estadoBadge === "con_saldo" ? "badge badge-warn"
                      : "badge badge-danger";
                    const badgeLabel = _estadoLabel(c.estadoBadge);
                    const badgeStyle = c.estadoBadge === "vencido_60"
                      ? {background:"#7f1d1d",color:"#fff",borderColor:"transparent"}
                      : {};
                    return (
                      <tr key={c.id} style={{...rowStyle,cursor:"pointer"}}
                        onClick={()=>setReporteDetalleCliente(c)}>
                        <td style={{fontWeight:500,color:"var(--text1)"}}>{c.nombre}</td>
                        <td className="mono">{c.dni}</td>
                        <td style={{fontSize:12,color:"var(--text3)"}}>{fmtFechaAR(c.primeraDeuda)||"—"}</td>
                        <td style={{fontSize:12,color:"var(--text3)"}}>{fmtFechaAR(c.ultimaDeuda)||"—"}</td>
                        <td style={{textAlign:"right"}}>{fmt(c.comprasPeriodo)}</td>
                        <td style={{textAlign:"right",color:"var(--green)"}}>{fmt(c.pagosPeriodo)}</td>
                        <td style={{textAlign:"right",color:c.saldoPeriodo>0?"var(--amber)":"var(--green)",fontWeight:600}}>{fmt(c.saldoPeriodo)}</td>
                        <td style={{textAlign:"right",fontWeight:700,color:c.saldoTotal>0?"var(--red)":"var(--green)"}}>{fmt(c.saldoTotal)}</td>
                        <td style={{textAlign:"right"}}>
                          {c.diasMora > 0 ? (
                            <span style={{fontSize:12,color:c.diasMora>60?"var(--red)":c.diasMora>30?"var(--amber)":"var(--text2)"}}>{c.diasMora}d</span>
                          ) : "—"}
                        </td>
                        <td>
                          <span className={badgeClass} style={badgeStyle}>{badgeLabel}</span>
                        </td>
                        <td onClick={e=>e.stopPropagation()} style={{whiteSpace:"nowrap"}}>
                          {c.saldoTotal > 0 && (
                            <button className="btn btn-ghost btn-sm" onClick={() => { setPagoCliente(c); setPagoMonto(c.saldoConRecargo); setPagoObservacion(""); setPagoFormaPago("Efectivo"); setPagoIncluyeMora(true); }}>
                              <Icon name="plus" size={13}/> Pago
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{padding:"0 16px"}}>
              <Paginacion pagina={paginaReporte} totalPaginas={totalPaginasReporte} onCambiar={setPaginaReporte} totalItems={reporteData.length} pageSize={pageSizeReporte} etiqueta="clientes" />
            </div>

            {reporteData.length > 0 && (
              <div style={{padding:"10px 16px",borderTop:"1px solid var(--border)",fontSize:12,color:"var(--text3)"}}>
                Hacé clic en una fila para ver el movimiento cronológico del cliente en el período.
              </div>
            )}
          </div>
        </>
      )}

      {/* ─── Tab Reservas ──────────────────────────────────────────────────── */}
      {tab === "reservas" && (
        <TabReservas
          reservas={reservas}
          clientes={clientes}
          productos={productos}
          depositos={depositos}
          stockDepositos={stockDepositos}
          listas={listas}
          configPrecios={configPrecios}
          rubros={rubros}
          proveedores={proveedores}
          caja={caja}
          usuarioActivo={usuarioActivo}
          crearReserva={crearReserva}
          agregarSeña={agregarSeña}
          editarPreciosReserva={editarPreciosReserva}
          registrarRetiroReserva={registrarRetiroReserva}
          cancelarReserva={cancelarReserva}
          agregarVenta={agregarVenta}
          actualizarStock={actualizarStock}
          actualizarStockDepositoMultiple={actualizarStockDepositoMultiple}
          aplicarDeltaStockMultiple={aplicarDeltaStockMultiple}
          aplicarDeltaStockProductoMultiple={aplicarDeltaStockProductoMultiple}
          ventas={ventas}
          editarVenta={editarVenta}
          editarVentaConItems={editarVentaConItems}
          anularVenta={anularVenta}
          registrarRetiroSeña={registrarRetiroSeña}
          registrarPagoSeña={registrarPagoSeña}
          periodosCerrados={periodosCerrados}
          permisos={permisos}
          agregarPagoCtaCte={agregarPagoCtaCte}
          cambiosArticulo={cambiosArticulo}
          tarjetas={tarjetas}
          recibos={recibos}
          agregarRecibo={agregarRecibo}
        />
      )}

      {/* Modales existentes */}
      {(showModal || editCliente) && (
        <ModalNuevoCliente
          usuarioActivo={usuarioActivo}
          cliente={editCliente}
          onClose={()=>{ setShowModal(false); setEditCliente(null); }}
          onGuardar={async (c)=>{
            if (editCliente) {
              await actualizarCliente(editCliente.id, c);
              setEditCliente(null);
            } else {
              await agregarCliente(c);
              setShowModal(false);
            }
          }}
        />
      )}

      {historialCliente && (
        <ModalHistorial
          // Siempre la versión actual del cliente (no la copia del momento en
          // que se abrió), así lo recién guardado se ve sin cerrar el modal.
          cliente={clientes.find(c => c.id === historialCliente.id) || historialCliente}
          ventas={ventas}
          pagos={pagosCtaCte}
          cambiosArticulo={cambiosArticulo}
          configMoraGlobal={configMora}
          usuarioActivo={usuarioActivo}
          actualizarCliente={actualizarCliente}
          modificarConfigMora={modificarConfigMora}
          onConfigMora={() => setEditConfigCliente(historialCliente)}
          onClose={()=>setHistorialCliente(null)}
        />
      )}

      {editConfigGlobal && (
        <ConfigMora
          globalConfig={configMora}
          setGlobalConfig={setConfigMora}
          onClose={()=>setEditConfigGlobal(false)}
          usuarioActivo={usuarioActivo}
        />
      )}

      {editConfigCliente && (
        <ConfigMora
          cliente={clientes.find(c => c.id === editConfigCliente.id) || editConfigCliente}
          globalConfig={configMora}
          onGuardarClienteConfig={async (config) => {
            try {
              // Solo se pisan los campos de configuración: los cargos de mora
              // manual y la mora cobrada se conservan tal como están en la base.
              const campos = { ...config };
              delete campos.cargosManuales; delete campos.moraCobrada;
              if (modificarConfigMora) {
                await modificarConfigMora(editConfigCliente.id, actual => ({ ...actual, ...campos }));
              } else {
                await actualizarCliente(editConfigCliente.id, { configMora: config });
              }
              toast("Configuración de mora del cliente guardada.", "success");
              setEditConfigCliente(null);
            } catch (err) {
              toast(err.message, "error");
            }
          }}
          onClose={()=>setEditConfigCliente(null)}
          usuarioActivo={usuarioActivo}
        />
      )}

      {pagoCliente && (
        <Modal onClose={()=>setPagoCliente(null)} size="modal-sm">
          <div className="modal-header">
            <div>
              <div className="modal-title">Registrar pago — Cta. Cte.</div>
              <div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>{pagoCliente.nombre}</div>
            </div>
            <button className="close-btn" onClick={()=>setPagoCliente(null)}>×</button>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {moraPago?.recargo > 0 && (
              <div style={{background:"rgba(245,158,11,0.08)",border:"1px solid rgba(245,158,11,0.25)",borderRadius:"var(--radius)",padding:"10px 14px",fontSize:12}}>
                <div style={{display:"flex",justifyContent:"space-between",color:"var(--text2)",marginBottom:3}}>
                  <span>Saldo original</span>
                  <span>{fmt(moraPago.saldoOriginal)}</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",color:"var(--amber)",marginBottom:3}}>
                  <span>{moraPago.moraManual ? "Mora manual" : "Recargo por mora"}</span>
                  <span>+{fmt(moraPago.recargo)}</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontWeight:700,color:"var(--red)",borderTop:"1px solid rgba(245,158,11,0.25)",paddingTop:4,marginTop:4}}>
                  <span>Total con mora</span>
                  <span>{fmt(moraPago.saldoConRecargo)}</span>
                </div>
                <label style={{display:"flex",alignItems:"center",gap:8,marginTop:8,cursor:"pointer",color:"var(--text2)"}}>
                  <input type="checkbox" checked={pagoIncluyeMora} style={{accentColor:"var(--accent)"}}
                    onChange={e => {
                      const incluye = e.target.checked;
                      setPagoIncluyeMora(incluye);
                      // Ajusta el monto sugerido sumando/restando la mora
                      setPagoMonto(m => Math.max(0, m + (incluye ? moraPago.recargo : -moraPago.recargo)));
                    }} />
                  Este pago incluye la mora ({fmt(moraPago.recargo)})
                </label>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Medio de pago</label>
              <select className="form-select" value={pagoFormaPago} onChange={e=>setPagoFormaPago(e.target.value)}>
                {FORMAS_PAGO_COBRO.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Monto cobrado</label>
              <input className="form-input" type="number" min={0} value={pagoMonto} onChange={e=>setPagoMonto(Number(e.target.value) || 0)} />
            </div>
            <div className="form-group">
              <label className="form-label">Observación</label>
              <input className="form-input" value={pagoObservacion} onChange={e=>setPagoObservacion(e.target.value)} placeholder="Ej: Pago parcial" />
            </div>
            {!caja?.abierta && (
              <div style={{fontSize:11,color:"var(--amber)",padding:"6px 10px",background:"rgba(245,158,11,0.08)",borderRadius:"var(--radius)",border:"1px solid rgba(245,158,11,0.2)"}}>
                La caja no está abierta. El pago se registrará en cuenta corriente pero aparecerá en caja al abrirla hoy.
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button className="btn" onClick={()=>setPagoCliente(null)} disabled={guardandoPago}>Cancelar</button>
            <button className="btn btn-primary" disabled={guardandoPago} onClick={async () => {
              if (guardandoPago) return; // evita doble registro por doble click
              if (pagoMonto <= 0) return;
              // La parte de mora se registra aparte (no como pago de la deuda),
              // igual que en Caja — si no, quedaba como saldo a favor.
              const moraIncluida = pagoIncluyeMora && moraPago?.recargo > 0 ? moraPago.recargo : 0;
              if (moraIncluida > 0 && pagoMonto < moraIncluida) {
                toast(`El monto no alcanza a cubrir la mora (${fmt(moraIncluida)}). Destildá "incluye la mora" o aumentá el monto.`, "error");
                return;
              }
              setGuardandoPago(true);
              const concepto = pagoObservacion || "Pago cta. cte.";
              try {
                // `emitirRecibo` (mismo camino que usa Caja) hace en una sola
                // operación idempotente: pedir el número real, insertar el
                // recibo y acreditar la cta. cte. Si se corta la conexión a
                // mitad de camino, en vez de quedar el recibo guardado sin su
                // acreditación (o arriesgar un doble registro al reintentar a
                // mano), la operación completa queda en la cola de
                // sincronización — visible en el módulo "Sincronización" — y
                // se termina sola apenas vuelve internet.
                const reciboGuardado = await emitirRecibo({
                  tipo: "Recibo",
                  fecha: today(),
                  hora: horaActual(),
                  clienteId: pagoCliente.id,
                  cliente: pagoCliente.nombre,
                  monto: pagoMonto,
                  formaPago: pagoFormaPago,
                  concepto,
                  usuario: usuarioActivo?.nombre || "",
                  ...(moraIncluida > 0 ? { moraIncluida, moraDeudaDesde: moraPago.fechaDeuda } : {}),
                });
                if (String(reciboGuardado.id).startsWith("local-")) {
                  toast("Sin conexión: el pago se guardó localmente y se va a sincronizar solo cuando vuelva internet.", "warning");
                }
                setPagoCliente(null);
              } catch (err) {
                toast(err.message, "error");
              } finally {
                setGuardandoPago(false);
              }
            }}>
              {guardandoPago ? "Registrando..." : "Registrar pago"}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal detalle cronológico por cliente (reporte) */}
      {reporteDetalleCliente && (
        <ModalDetalleCtaCte
          cliente={reporteDetalleCliente}
          ventas={ventas}
          pagos={pagosCtaCte}
          cambiosArticulo={cambiosArticulo}
          fechaDesde={reporteDesde || undefined}
          fechaHasta={reporteHasta || undefined}
          onClose={() => setReporteDetalleCliente(null)}
        />
      )}
    </div>
  );
}
