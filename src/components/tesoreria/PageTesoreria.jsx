import { useState, useMemo, useEffect } from "react";
import Icon from "../ui/Icon";
import Modal from "../ui/Modal";
import Paginacion from "../ui/Paginacion";
import { usePaginacion } from "../../hooks/usePaginacion";
import { fmt, today, uid, horaActual, mesLabel, pagosDeVenta, fmtFechaAR, calcularSaldoCtaCte, totalPorFormaPago } from "../../utils/helpers";
import { FORMAS_PAGO } from "../../constants/index.js";
import { abrirReporteImpresion, descargarReporteHTML, descargarExcel, arMoney, generadoEl, REPORTE_ESTILOS } from "../../utils/reportes";
import { useConfirm } from "../ui/Confirm.jsx";
import { useToast } from "../ui/Toast";
import TabCheques from "./TabCheques.jsx";
import TabTarjetas from "./TabTarjetas.jsx";
import { CTA_BANCO, CTA_TRANSF, nombresCuentas, ingresoBancoDeCierre, ingresoTransfDeCierre, calcularSaldosTesoreria, esFuenteTesoreria, lugarDeEgreso } from "../../utils/tesoreria.js";

// ─── Mapeo de medios de pago → cuentas contables ──────────────────────────────
const PAGO_CTAS = {
  "Efectivo":                  "111",
  "Transferencia":             "112",
  "Cheque":                    "112",
  "Tarjeta Débito":            "113",
  "Tarjeta Crédito":           "113",
  "Mercado Pago":              "113",
  "Cuenta Corriente":          "114",
};
const PAGO_CTAS_COMPRA = {
  "Efectivo":                   "111",
  "Transferencia":              "112",
  "Cheque":                     "112",
  "Cuenta Corriente Proveedor": "211",
};
const TIPO_COLOR = { activo:"var(--blue)", pasivo:"var(--red)", patrimonio:"var(--amber)", ingreso:"var(--green)", egreso:"var(--text2)" };
const TIPO_LABEL = { activo:"Activo", pasivo:"Pasivo", patrimonio:"Patrimonio", ingreso:"Ingreso", egreso:"Egreso" };
const ORIGEN_COLOR = { venta:"var(--green)", compra:"var(--amber)", recibo:"var(--blue)", orden_pago:"var(--red)", gasto:"var(--red)", manual:"var(--accent2)", tesoreria:"var(--green)", retiro_tesoreria:"var(--red)" };

// "CP-" = cierre parcial (control), sin prefijo = cierre final. Los cierres
// más viejos no tienen `detalle.tipoCierre` (se agregó después), así que el
// prefijo del número queda como respaldo.
function tipoCierreDeMovimiento(t) {
  if (t.detalle?.tipoCierre === "parcial") return "parcial";
  if (t.detalle?.tipoCierre === "final") return "final";
  return (t.detalle?.numero || "").startsWith("CP-") ? "parcial" : "final";
}

// ─── Desglose de un movimiento "Cierre de Caja" (parcial o final) por medio
// de pago + cuadre de efectivo. Se reutiliza en Pendientes de revisión y en
// Caja Mayor para que ambas vistas muestren el mismo nivel de detalle. ────────
function DetalleCierreCaja({ t }) {
  // El cuadre de efectivo es por PERÍODO (desde el último cierre de control,
  // no desde la apertura del día) — igual que en ModalDetalleCierre.jsx. Los
  // cierres viejos sin campos `periodo*` caen al total del día completo.
  const d = t.detalle || {};
  const usaPeriodo   = d.periodoEfectivo != null;
  const inicioMostrado    = usaPeriodo ? (d.inicioEfectivo ?? d.inicio ?? 0) : (d.inicio || 0);
  const efectivoMostrado  = usaPeriodo ? (d.periodoEfectivo || 0) : (d.totalEfectivo || 0);
  const retirosMostrado   = usaPeriodo ? (d.periodoRetiros  || 0) : (d.totalRetiros  || 0);

  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginTop:12 }}>
      <div>
        <div style={{ fontSize:10, fontWeight:700, color:"var(--text3)", textTransform:"uppercase", letterSpacing:".05em", marginBottom:6 }}>Entregado a Tesorería</div>
        {[{label:"Efectivo",val:t.montoEfectivo||0,color:"var(--green)"},{label:"Tarjeta",val:t.montoTarjeta||0},{label:"Transferencia",val:t.montoTransf||0},{label:"Cheque",val:t.montoCheque||0},{label:"Mercado Pago",val:t.montoMpago||0}].filter(r=>r.val>0).map((r,i)=>(
          <div key={i} className="total-line sub"><span style={{ color:r.color }}>{r.label}</span><span style={{ color:r.color||"var(--text1)", fontFamily:"var(--font-mono)" }}>{fmt(r.val)}</span></div>
        ))}
        <div style={{ height:1, background:"var(--border)", margin:"6px 0" }}/>
        <div className="total-line sub" style={{ fontWeight:700 }}><span>Total</span><span style={{ fontFamily:"var(--font-mono)", color:"var(--accent2)" }}>{fmt(t.monto||0)}</span></div>
        <div className="total-line sub" style={{ marginTop:8 }}><span style={{ color:"var(--text3)" }}>Saldo en caja</span><span style={{ fontFamily:"var(--font-mono)", color:"var(--green)" }}>{fmt(t.saldoInicial??t.detalle?.real??0)}</span></div>
      </div>
      <div>
        <div style={{ fontSize:10, fontWeight:700, color:"var(--text3)", textTransform:"uppercase", letterSpacing:".05em", marginBottom:6 }}>Cuadre de efectivo</div>
        <div className="total-line sub"><span>Inicio</span><span style={{ fontFamily:"var(--font-mono)" }}>{fmt(inicioMostrado)}</span></div>
        <div className="total-line sub"><span>+ Efectivo</span><span style={{ color:"var(--green)", fontFamily:"var(--font-mono)" }}>+{fmt(efectivoMostrado)}</span></div>
        <div className="total-line sub"><span>− Retiros</span><span style={{ color:"var(--red)", fontFamily:"var(--font-mono)" }}>−{fmt(retirosMostrado)}</span></div>
        <div style={{ height:1, background:"var(--border)", margin:"6px 0" }}/>
        <div className="total-line sub"><span>Esperado</span><span style={{ fontFamily:"var(--font-mono)" }}>{fmt(t.detalle?.esperado||0)}</span></div>
        <div className="total-line sub"><span>Real</span><span style={{ fontFamily:"var(--font-mono)", color:"var(--green)" }}>{fmt(t.detalle?.real||0)}</span></div>
      </div>
    </div>
  );
}

function TipoCierreBadge({ tipo }) {
  return tipo === "parcial" ? (
    <span style={{ fontSize:9, padding:"1px 6px", borderRadius:3, background:"rgba(139,92,246,0.15)", color:"var(--accent2)", fontWeight:700, border:"1px solid rgba(139,92,246,0.25)" }}>PARCIAL</span>
  ) : (
    <span style={{ fontSize:9, padding:"1px 6px", borderRadius:3, background:"rgba(242,107,91,0.12)", color:"var(--red)", fontWeight:700, border:"1px solid rgba(242,107,91,0.25)" }}>FINAL</span>
  );
}

// ─── Genera asientos automáticos desde las operaciones ────────────────────────
function generarAsientosAuto(ventas, compras, recibos, ordenesPago, gastos, planCuentas, tesoreria) {
  const ctaMap = {};
  (planCuentas || []).forEach(c => { ctaMap[c.id] = c; });
  const mkL = (id, debe, haber) => {
    const c = ctaMap[id] || { codigo: id, nombre: `Cta. ${id}` };
    return { cuentaId: id, cuentaCodigo: c.codigo, cuentaNombre: c.nombre, debe, haber };
  };
  const items = [];
  (ventas || []).filter(v => v.estado !== "anulada").forEach(v => {
    // Pago dividido: una línea de débito por cada medio de pago usado en la venta.
    const lineasPago = pagosDeVenta(v).map(p => mkL(PAGO_CTAS[p.formaPago] || "111", p.monto, 0));
    items.push({
      id: `v${v.id}`, fecha: v.fecha, hora: v.hora || "00:00",
      descripcion: `Venta · ${v.cliente}`, origen: "venta", origenId: v.id,
      lineas: [...lineasPago, mkL("411", 0, v.total)],
    });
  });
  // Cuenta acreedora de un pago: si se eligió una cuenta (Cuenta Transferencia
  // o banco) se usa esa; si no, la que corresponde a la forma de pago.
  const ctaPago = (fuente, formaPago) =>
    fuente === "banco" ? CTA_BANCO : fuente === "cta_transferencia" ? CTA_TRANSF : (PAGO_CTAS_COMPRA[formaPago] || "111");
  (compras || []).filter(c => c.estado !== "anulada").forEach(c => {
    const h = ctaPago(c.fuente, c.formaPago);
    items.push({
      id: `c${c.id}`, fecha: c.fecha, hora: "00:00",
      descripcion: `Compra · ${c.proveedor} · ${c.nro || c.tipo}`, origen: "compra", origenId: c.id,
      lineas: [mkL("115", c.total, 0), mkL(h, 0, c.total)],
    });
  });
  (recibos || []).filter(r => r.tipo === "Recibo" && r.estado !== "anulada").forEach(r => {
    const d = PAGO_CTAS[r.formaPago] || "111";
    items.push({
      id: `r${r.id}`, fecha: r.fecha, hora: r.hora || "00:00",
      descripcion: `${r.numero} · ${r.cliente} · Cobro cta. cte.`, origen: "recibo", origenId: r.id,
      lineas: [mkL(d, r.monto, 0), mkL("114", 0, r.monto)],
    });
  });
  (ordenesPago || []).filter(op => op.estado !== "anulada").forEach(op => {
    const h = PAGO_CTAS_COMPRA[op.formaPago] || "111";
    items.push({
      id: `op${op.id}`, fecha: op.fecha, hora: op.hora || "00:00",
      descripcion: `${op.nro} · ${op.proveedor} · Pago a proveedor`, origen: "orden_pago", origenId: op.id,
      lineas: [mkL("211", op.monto, 0), mkL(h, 0, op.monto)],
    });
  });
  (gastos || []).filter(g => g.estado !== "anulado").forEach(g => {
    const h = ctaPago(g.fuente, g.formaPago);
    items.push({
      id: `g${g.id}`, fecha: g.fecha, hora: g.hora || "00:00",
      descripcion: `${g.nro} · ${g.concepto}`, origen: "gasto", origenId: g.id,
      lineas: [mkL(g.cuentaId, g.monto, 0), mkL(h, 0, g.monto)],
    });
  });
  // Cierres de caja ingresados a Caja Mayor → el efectivo/cheques entran a
  // Tesorería (cta 116); lo cobrado por transferencia queda en la Cuenta
  // Transferencia (CTA_TRANSF) y lo cobrado con tarjeta/MP en el banco
  // (CTA_BANCO) — ver utils/tesoreria.js.
  (tesoreria || []).filter(t => t.estado === "en_caja_mayor" && t.tipo !== "Retiro").forEach(t => {
    const haberLineas = [];
    if ((t.montoEfectivo || 0) > 0) haberLineas.push(mkL("111", 0, t.montoEfectivo));
    if ((t.montoTransf   || 0) > 0) haberLineas.push(mkL("112", 0, t.montoTransf));
    if ((t.montoCheque   || 0) > 0) haberLineas.push(mkL("112", 0, t.montoCheque));
    if ((t.montoTarjeta  || 0) > 0) haberLineas.push(mkL("113", 0, t.montoTarjeta));
    if ((t.montoMpago    || 0) > 0) haberLineas.push(mkL("113", 0, t.montoMpago));
    if (haberLineas.length === 0)    haberLineas.push(mkL("111", 0, t.monto));
    const aBanco     = Math.min(ingresoBancoDeCierre(t), t.monto);
    const aTransf    = Math.min(ingresoTransfDeCierre(t), t.monto - aBanco);
    const aTesoreria = t.monto - aBanco - aTransf;
    const debeLineas = [];
    if (aTesoreria > 0) debeLineas.push(mkL("116", aTesoreria, 0));
    if (aTransf    > 0) debeLineas.push(mkL(CTA_TRANSF, aTransf, 0));
    if (aBanco     > 0) debeLineas.push(mkL(CTA_BANCO, aBanco, 0));
    if (debeLineas.length === 0) debeLineas.push(mkL("116", t.monto, 0));
    items.push({
      id: `tm${t.id}`, fecha: t.fecha, hora: t.hora || "00:00",
      descripcion: `Cierre de Caja · Ingreso a Tesorería · ${t.fecha}`,
      origen: "tesoreria", origenId: t.id,
      lineas: [...debeLineas, ...haberLineas],
    });
  });

  // Retiros de Tesorería → fondos salen de cta 116
  (tesoreria || []).filter(t => t.tipo === "Retiro").forEach(t => {
    const haber = t.formaPago === "Transferencia" ? "112" : "116";
    items.push({
      id: `tr${t.id}`, fecha: t.fecha, hora: t.hora || "00:00",
      descripcion: `Retiro de Tesorería · ${t.concepto}`,
      origen: "retiro_tesoreria", origenId: t.id,
      lineas: [mkL("311", t.monto, 0), mkL(haber, 0, t.monto)],
    });
  });

  items.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora));
  return items;
}

// ─── DiffBadge ────────────────────────────────────────────────────────────────
const DiffBadge = ({ dif }) => {
  if (dif == null) return null;
  const color = dif === 0 ? "var(--green)" : dif > 0 ? "var(--blue)" : "var(--red)";
  const label = dif === 0 ? "Sin diferencia" : dif > 0 ? `Sobrante ${fmt(dif)}` : `Faltante ${fmt(Math.abs(dif))}`;
  return <span style={{ fontSize:11, padding:"2px 8px", borderRadius:4, background:`color-mix(in srgb, ${color} 12%, transparent)`, color, border:`1px solid color-mix(in srgb, ${color} 30%, transparent)`, whiteSpace:"nowrap" }}>{label}</span>;
};

// ─── Fila de asiento (expandible) ─────────────────────────────────────────────
function AsientoCard({ asiento: a }) {
  const [open, setOpen] = useState(false);
  const totalDebe  = a.lineas.reduce((s, l) => s + l.debe,  0);
  const totalHaber = a.lineas.reduce((s, l) => s + l.haber, 0);
  const oc = ORIGEN_COLOR[a.origen] || "var(--text3)";
  return (
    <div style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", cursor:"pointer" }} onClick={() => setOpen(o => !o)}>
        <div style={{ minWidth:36, textAlign:"center", fontFamily:"var(--font-mono)", fontSize:11, fontWeight:700, color:"var(--text3)", padding:"3px 6px", background:"var(--bg4)", borderRadius:5 }}>{a.numero}</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:500, color:"var(--text1)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{a.descripcion}</div>
          <div style={{ fontSize:11, color:"var(--text3)", marginTop:1 }}>{fmtFechaAR(a.fecha)} · {a.hora?.slice(0,5)}</div>
        </div>
        <span style={{ fontSize:10, padding:"2px 7px", borderRadius:3, background:`color-mix(in srgb, ${oc} 10%, transparent)`, color:oc, border:`1px solid color-mix(in srgb, ${oc} 25%, transparent)`, textTransform:"uppercase", whiteSpace:"nowrap" }}>{a.origen}</span>
        <span style={{ fontFamily:"var(--font-mono)", fontSize:13, fontWeight:600, color:"var(--text1)", minWidth:80, textAlign:"right" }}>{fmt(totalDebe)}</span>
        <Icon name={open ? "minus" : "plus"} size={12} />
      </div>
      {open && (
        <div style={{ borderTop:"1px solid var(--border)", background:"var(--bg3)" }}>
          <table style={{ width:"100%" }}>
            <thead>
              <tr style={{ background:"var(--bg4)", borderBottom:"1px solid var(--border)" }}>
                {["Cuenta","Debe","Haber"].map((h,i) => (
                  <th key={i} style={{ padding:"5px 12px", fontSize:10, fontWeight:600, color:"var(--text3)", textTransform:"uppercase", letterSpacing:".05em", textAlign:i>0?"right":"left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {a.lineas.map((l, i) => (
                <tr key={i} style={{ borderBottom:"1px solid var(--border)" }}>
                  <td style={{ padding:"7px 12px", fontSize:12, color:"var(--text2)" }}>
                    <span style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"var(--text3)", marginRight:8 }}>{l.cuentaCodigo}</span>{l.cuentaNombre}
                  </td>
                  <td style={{ padding:"7px 12px", textAlign:"right", fontFamily:"var(--font-mono)", fontSize:12, color:l.debe>0?"var(--text1)":"var(--text3)" }}>{l.debe>0?fmt(l.debe):"—"}</td>
                  <td style={{ padding:"7px 12px", textAlign:"right", fontFamily:"var(--font-mono)", fontSize:12, color:l.haber>0?"var(--text1)":"var(--text3)" }}>{l.haber>0?fmt(l.haber):"—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop:"2px solid var(--border2)", background:"var(--bg4)" }}>
                <td style={{ padding:"6px 12px", fontSize:12, fontWeight:600, color:"var(--text1)" }}>Total</td>
                <td style={{ padding:"6px 12px", textAlign:"right", fontFamily:"var(--font-mono)", fontSize:12, fontWeight:700, color:"var(--green)" }}>{fmt(totalDebe)}</td>
                <td style={{ padding:"6px 12px", textAlign:"right", fontFamily:"var(--font-mono)", fontSize:12, fontWeight:700, color:"var(--green)" }}>{fmt(totalHaber)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Modal: Retiro de Tesorería ──────────────────────────────────────────────
function ModalRetiro({ onClose, onConfirm }) {
  const [fecha,        setFecha]        = useState(today());
  const [monto,        setMonto]        = useState("");
  const [concepto,     setConcepto]     = useState("");
  const [destinatario, setDestinatario] = useState("");
  const [formaPago,    setFormaPago]    = useState("Efectivo");
  const [error,        setError]        = useState("");

  const confirmar = () => {
    const m = parseFloat(monto);
    if (!m || m <= 0) { setError("El monto debe ser mayor a cero."); return; }
    if (!concepto.trim()) { setError("El concepto es obligatorio."); return; }
    const now = new Date();
    const hora = String(now.getHours()).padStart(2,"0")+":"+String(now.getMinutes()).padStart(2,"0");
    onConfirm({ tipo:"Retiro", fecha, hora, monto:m, concepto:concepto.trim(), destinatario:destinatario.trim(), formaPago, estado:"retiro" });
  };

  return (
    <div style={{ position:"fixed", inset:0, zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.65)", backdropFilter:"blur(4px)" }} onClick={onClose}>
      <div className="card" style={{ width:440, maxWidth:"95vw", margin:0 }} onClick={e=>e.stopPropagation()}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
          <div className="card-title" style={{ margin:0 }}>Retiro de Tesorería</div>
          <button className="btn btn-sm btn-ghost" onClick={onClose}><Icon name="x" size={14}/></button>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <div className="form-group">
              <label className="form-label">Fecha</label>
              <input className="form-input" type="date" value={fecha} onChange={e=>setFecha(e.target.value)}/>
            </div>
            <div className="form-group">
              <label className="form-label">Forma de entrega</label>
              <select className="form-select" value={formaPago} onChange={e=>setFormaPago(e.target.value)}>
                <option>Efectivo</option>
                <option>Transferencia</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Monto *</label>
            <input className="form-input" type="number" min={0} placeholder="0.00"
              value={monto} onChange={e=>setMonto(e.target.value)}/>
          </div>
          <div className="form-group">
            <label className="form-label">Concepto *</label>
            <input className="form-input" placeholder="Motivo del retiro..."
              value={concepto} onChange={e=>setConcepto(e.target.value)}/>
          </div>
          <div className="form-group">
            <label className="form-label">
              Destinatario
              <span style={{ color:"var(--text3)", fontWeight:400, marginLeft:5, textTransform:"none", letterSpacing:0 }}>(opcional)</span>
            </label>
            <input className="form-input" placeholder="Nombre de quien retira"
              value={destinatario} onChange={e=>setDestinatario(e.target.value)}/>
          </div>
          {error && (
            <div style={{ padding:"8px 12px", background:"rgba(242,107,91,0.08)", border:"1px solid rgba(242,107,91,0.25)", borderRadius:8, fontSize:13, color:"var(--red)" }}>
              {error}
            </div>
          )}
        </div>
        <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop:16 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-sm" style={{ background:"var(--red)", color:"#fff", display:"flex", alignItems:"center", gap:6 }} onClick={confirmar}>
            <Icon name="minus" size={13}/> Registrar retiro
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Caja Mayor ──────────────────────────────────────────────────────────
function TabCajaMayor({ tesoreria, agregarMovimientoTesoreria, actualizarMovimientoTesoreria, gastos = [], compras = [], nombres = { banco: "Banco", transferencia: "Cuenta Transferencia" } }) {
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState(null);
  const [showRetiro, setShowRetiro] = useState(false);

  // ── Filtro de período — solo acota qué movimientos/listas se ven. El saldo
  // real de Tesorería siempre se calcula con TODO el historial (no tendría
  // sentido "un saldo de un rango de fechas"), así que se guarda aparte y
  // nunca se filtra — ver saldoActual más abajo.
  const primerDia = today().slice(0, 7) + "-01";
  const [modo, setModo]   = useState("todo"); // "todo" | "mes" | "rango"
  const [mes, setMes]     = useState(today().slice(0, 7));
  const [desde, setDesde] = useState(primerDia);
  const [hasta, setHasta] = useState(today());

  const fechaDesde = modo === "mes" ? `${mes}-01` : desde;
  const fechaHasta = useMemo(() => {
    if (modo !== "mes") return hasta;
    const [y, m] = mes.split("-").map(Number);
    return `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
  }, [modo, mes, hasta]);

  const enRango = (f) => modo === "todo" || (f >= fechaDesde && f <= fechaHasta);
  const periodoLabel = modo === "todo" ? "Todo el historial" : modo === "mes" ? mesLabel(mes) : `${fmtFechaAR(fechaDesde)} al ${fmtFechaAR(fechaHasta)}`;

  // ── Datos completos (sin filtrar) — de acá sale el saldo real ──────────────
  const pendientes      = (tesoreria||[]).filter(t=>t.estado==="pendiente").sort((a,b)=>b.fecha.localeCompare(a.fecha)||b.hora.localeCompare(a.hora));
  const cajaMayorAll    = (tesoreria||[]).filter(t=>t.estado==="en_caja_mayor");
  const retirosAll      = (tesoreria||[]).filter(t=>t.tipo==="Retiro");
  const ingresosACajaAll = (tesoreria||[]).filter(t=>t.tipo==="Ingreso a Caja");
  const gastosTesorAll  = (gastos||[]).filter(g => esFuenteTesoreria(g.fuente) && g.estado !== "anulado");
  const comprasTesorAll = (compras||[]).filter(c => esFuenteTesoreria(c.fuente) && c.estado !== "anulada");

  const totalPendiente = pendientes.reduce((s,t)=>s+t.monto,0);

  // Saldo a hoy, separado en efectivo y banco (Efectivo + Banco = total).
  const { total: saldoActual, banco: saldoBanco, transferencia: saldoCtaTransf, efectivo: saldoEfectivoTesor } = calcularSaldosTesoreria(tesoreria, gastos, compras);

  // ── Datos filtrados por el período elegido — para las listas y el desglose ──
  const cajaMayor     = useMemo(() => cajaMayorAll.filter(t=>enRango(t.fecha)).sort((a,b)=>b.fecha.localeCompare(a.fecha)||b.hora.localeCompare(a.hora)), [cajaMayorAll, fechaDesde, fechaHasta, modo]);
  const retiros       = useMemo(() => retirosAll.filter(t=>enRango(t.fecha)).sort((a,b)=>b.fecha.localeCompare(a.fecha)||b.hora.localeCompare(a.hora)), [retirosAll, fechaDesde, fechaHasta, modo]);
  const ingresosACaja = useMemo(() => ingresosACajaAll.filter(t=>enRango(t.fecha)).sort((a,b)=>b.fecha.localeCompare(a.fecha)||b.hora.localeCompare(a.hora)), [ingresosACajaAll, fechaDesde, fechaHasta, modo]);
  const gastosTesor   = useMemo(() => gastosTesorAll.filter(g=>enRango(g.fecha)), [gastosTesorAll, fechaDesde, fechaHasta, modo]);
  const comprasTesor  = useMemo(() => comprasTesorAll.filter(c=>enRango(c.fecha)), [comprasTesorAll, fechaDesde, fechaHasta, modo]);

  const totalMayor         = cajaMayor.reduce((s,t)=>s+t.monto,0);
  const totalRetiros       = retiros.reduce((s,t)=>s+t.monto,0);
  const totalIngresosACaja = ingresosACaja.reduce((s,t)=>s+t.monto,0);

  // ── Desglose por tipo de fondo (del período filtrado) ──────────────────────
  // Para tarjeta: si existen campos separados (D/C) se usan esos; si no, montoTarjeta (formato viejo).
  // Nunca se suman ambos para evitar doble conteo.
  const ingEfectivo = cajaMayor.reduce((s,t) => s + (t.montoEfectivo || 0), 0);
  const ingTransf   = cajaMayor.reduce((s,t) => s + (t.montoTransf   || 0), 0);
  const ingTarjeta  = cajaMayor.reduce((s,t) => {
    const hasSplit = t.montoTarjetaD != null || t.montoTarjetaC != null;
    return s + (hasSplit
      ? (t.montoTarjetaD || 0) + (t.montoTarjetaC || 0)
      : (t.montoTarjeta  || 0)
    ) + (t.montoMpago || 0);
  }, 0);
  const ingCheque   = cajaMayor.reduce((s,t) => s + (t.montoCheque || 0), 0);

  // Egresos: retiros por forma de pago. Los envíos a Caja Salón son efectivo.
  const retEfectivo = retiros.filter(r => lugarDeEgreso(null, r.formaPago) === "efectivo").reduce((s,r) => s + r.monto, 0)
    + totalIngresosACaja;
  const retTransf   = retiros.filter(r => lugarDeEgreso(null, r.formaPago) === "transferencia").reduce((s,r) => s + r.monto, 0);
  const retBanco    = retiros.filter(r => lugarDeEgreso(null, r.formaPago) === "banco").reduce((s,r) => s + r.monto, 0);

  // Egresos: gastos y compras (facturas) pagados desde Tesorería, ubicados
  // según la cuenta de la que salieron (fuente) — ver utils/tesoreria.js.
  const egresoDe = (pred) =>
      gastosTesor.filter(g => pred(lugarDeEgreso(g.fuente, g.formaPago), g.formaPago)).reduce((s,g) => s + g.monto, 0)
    + comprasTesor.filter(c => pred(lugarDeEgreso(c.fuente, c.formaPago), c.formaPago)).reduce((s,c) => s + c.total, 0);
  const gastEfectivo = egresoDe((l, fp) => l === "efectivo" && fp !== "Cheque");
  const gastCheque   = egresoDe((l, fp) => l === "efectivo" && fp === "Cheque");
  const gastTransf   = egresoDe(l => l === "transferencia");
  const gastTarjeta  = egresoDe(l => l === "banco") + retBanco;
  const totalGastosTesor = gastosTesor.reduce((s,g) => s + g.monto, 0) + comprasTesor.reduce((s,c) => s + c.total, 0);

  // Movimiento neto del período elegido (no confundir con el saldo real de arriba)
  const movimientoNeto = totalMayor - totalRetiros - totalIngresosACaja - totalGastosTesor;

  // Saldos por tipo
  const saldoEf     = ingEfectivo - retEfectivo - gastEfectivo;
  const saldoTransf = ingTransf   - retTransf   - gastTransf;
  const saldoTarj   = ingTarjeta  - gastTarjeta;
  const saldoCheque = ingCheque   - gastCheque;

  const totalEgr      = retEfectivo + retTransf + gastEfectivo + gastTransf + gastTarjeta + gastCheque;
  const tieneDesglose = (ingEfectivo + ingTransf + ingTarjeta + ingCheque) > 0;

  // ── Paginación de cada lista (evita listas infinitas con "Todo el historial") ──
  const pendientesPag      = usePaginacion(pendientes);
  const cajaMayorPag       = usePaginacion(cajaMayor);
  const retirosPag         = usePaginacion(retiros);
  const ingresosACajaPag   = usePaginacion(ingresosACaja);

  const pasarACajaMayor = async (id) => {
    try {
      await actualizarMovimientoTesoreria(id, { estado:"en_caja_mayor", horaCierre:horaActual() });
      setSelectedId(null);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const registrarRetiro = async (data) => {
    try {
      await agregarMovimientoTesoreria(data);
      setShowRetiro(false);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  return (
    <div>
      {showRetiro && <ModalRetiro onClose={()=>setShowRetiro(false)} onConfirm={registrarRetiro}/>}

      {/* ── Filtro de período ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
            {[["todo", "Todo"], ["mes", "Por mes"], ["rango", "Rango de fechas"]].map(([v, l]) => (
              <button key={v} onClick={() => setModo(v)} style={{
                padding: "7px 14px", fontSize: 12, fontWeight: 500, border: "none", cursor: "pointer",
                background: modo === v ? "var(--accent)" : "transparent",
                color: modo === v ? "#fff" : "var(--text2)",
              }}>{l}</button>
            ))}
          </div>
          {modo === "mes" && (
            <input type="month" className="form-input" style={{ width: 160 }} value={mes} onChange={e => setMes(e.target.value)} />
          )}
          {modo === "rango" && (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase" }}>Desde</span>
                <input type="date" className="form-input" style={{ width: 140 }} value={desde} onChange={e => setDesde(e.target.value)} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase" }}>Hasta</span>
                <input type="date" className="form-input" style={{ width: 140 }} value={hasta} onChange={e => setHasta(e.target.value)} />
              </div>
            </>
          )}
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text3)" }}>
            Mostrando: <strong style={{ color: "var(--text2)" }}>{periodoLabel}</strong>
          </span>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(170px, 1fr))", gap:14, marginBottom:20 }}>
        <div className="metric-card"><div className="metric-label">Cajas pendientes</div><div className="metric-value">{pendientes.length}</div></div>
        <div className="metric-card"><div className="metric-label">Efectivo pendiente</div><div className="metric-value" style={{ color:pendientes.length>0?"var(--amber)":"var(--text1)" }}>{fmt(totalPendiente)}</div></div>
        <div className="metric-card" title="Total ingresado a Caja Mayor en el período elegido arriba">
          <div className="metric-label">{modo === "todo" ? "Total ingresado" : "Ingresado en el período"}</div>
          <div className="metric-value" style={{ color:"var(--green)" }}>{fmt(totalMayor)}</div>
        </div>
        <div className="metric-card" title="Efectivo y cheques en Tesorería en este momento — no cambia con el filtro de período">
          <div className="metric-label">Efectivo en Tesorería (a hoy)</div>
          <div className="metric-value" style={{ color:saldoEfectivoTesor>=0?"var(--accent2)":"var(--red)" }}>{fmt(saldoEfectivoTesor)}</div>
        </div>
        <div className="metric-card" title={`Cobros por transferencia, menos lo pagado por transferencia. El nombre se cambia en Plan de Cuentas (cuenta 1.1.2).`}>
          <div className="metric-label">{nombres.transferencia} (a hoy)</div>
          <div className="metric-value" style={{ color:saldoCtaTransf>=0?"var(--blue)":"var(--red)" }}>{fmt(saldoCtaTransf)}</div>
        </div>
        <div className="metric-card" title={`Cobros con tarjeta de débito, crédito y Mercado Pago, menos lo pagado con tarjeta. El nombre se cambia en Plan de Cuentas (cuenta 1.1.3).`}>
          <div className="metric-label">{nombres.banco} (a hoy)</div>
          <div className="metric-value" style={{ color:saldoBanco>=0?"var(--blue)":"var(--red)" }}>{fmt(saldoBanco)}</div>
          <div style={{ fontSize:11, color:"var(--text3)", marginTop:4 }}>Total Tesorería: {fmt(saldoActual)}</div>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, alignItems:"start" }}>

        {/* ── Izquierda: Pendientes ── */}
        <div className="card" style={{ margin:0 }}>
          <div className="card-title" style={{ marginBottom:12 }}>Pendientes de revisión</div>
          {pendientes.length===0 ? (
            <div style={{ padding:"28px 0", textAlign:"center", fontSize:13, color:"var(--text3)" }}>No hay cajas pendientes</div>
          ) : (
            <div style={{ background:"var(--bg3)", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden" }}>
              {pendientesPag.itemsPagina.map(t=>(
                <div key={t.id} onClick={()=>setSelectedId(selectedId===t.id?null:t.id)}
                  style={{ borderBottom:"1px solid var(--border)", cursor:"pointer", background:selectedId===t.id?"color-mix(in srgb, var(--accent) 7%, transparent)":"transparent" }}>
                  <div style={{ display:"flex", alignItems:"center", padding:"10px 14px", gap:10 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:"var(--text1)" }}>{fmtFechaAR(t.fecha)} · {t.hora}</div>
                      <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:2 }}>
                        <span style={{ fontSize:11, color:"var(--text3)" }}>Cierre de Caja{t.detalle?.numero ? ` · ${t.detalle.numero}` : ""}</span>
                        <TipoCierreBadge tipo={tipoCierreDeMovimiento(t)}/>
                      </div>
                    </div>
                    <DiffBadge dif={t.diferencia}/>
                    <div style={{ fontFamily:"var(--font-mono)", fontSize:14, fontWeight:700, color:"var(--green)" }}>{fmt(t.monto)}</div>
                    <span style={{ fontSize:10, padding:"2px 7px", borderRadius:4, background:"rgba(245,158,11,0.12)", color:"var(--amber)", border:"1px solid rgba(245,158,11,0.3)" }}>Pendiente</span>
                  </div>
                  {selectedId===t.id&&t.detalle&&(
                    <div style={{ padding:"0 14px 14px", borderTop:"1px solid var(--border)" }}>
                      <DetalleCierreCaja t={t}/>
                      <button className="btn btn-primary btn-sm" style={{ marginTop:12, width:"100%", justifyContent:"center" }}
                        onClick={e=>{e.stopPropagation();pasarACajaMayor(t.id);}}>
                        <Icon name="check" size={13}/> Revisar y pasar a Caja Mayor
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {pendientes.length > 0 && (
            <Paginacion pagina={pendientesPag.pagina} totalPaginas={pendientesPag.totalPaginas} onCambiar={pendientesPag.setPagina} totalItems={pendientes.length} pageSize={pendientesPag.pageSize} etiqueta="pendientes" />
          )}
        </div>

        {/* ── Derecha: Desglose + Caja Mayor + Retiros ── */}
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

          {/* ── Desglose del saldo por tipo ── */}
          {tieneDesglose && (
            <div className="card" style={{ margin:0 }}>
              <div className="card-title" style={{ marginBottom:12 }}>{modo === "todo" ? "Desglose del saldo en Tesorería" : `Desglose del período (${periodoLabel})`}</div>
              <div style={{ background:"var(--bg3)", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden" }}>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead>
                    <tr style={{ background:"var(--bg4)" }}>
                      {["Tipo","Ingresó","Egresó", modo === "todo" ? "Saldo disponible" : "Movimiento neto"].map((h,i) => (
                        <th key={i} style={{ padding:"6px 12px", fontSize:10, fontWeight:700, color:"var(--text3)", textTransform:"uppercase", letterSpacing:".05em", textAlign: i===0 ? "left" : "right" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label:"Efectivo",      ing: ingEfectivo, egr: retEfectivo + gastEfectivo, saldo: saldoEf,     color:"var(--green)" },
                      { label:`Transferencia → ${nombres.transferencia}`, ing: ingTransf,   egr: retTransf   + gastTransf,   saldo: saldoTransf, color:"var(--blue)"  },
                      { label:`Tarjeta → ${nombres.banco}`,               ing: ingTarjeta,  egr: gastTarjeta,                 saldo: saldoTarj,   color:"var(--accent2)" },
                      { label:"Cheque",        ing: ingCheque,   egr: gastCheque,                  saldo: saldoCheque, color:"var(--amber)" },
                    ].filter(r => r.ing > 0 || r.saldo !== 0).map((r,i) => (
                      <tr key={i} style={{ borderTop:"1px solid var(--border)" }}>
                        <td style={{ padding:"9px 12px", fontSize:12, color:r.color, fontWeight:600, display:"flex", alignItems:"center", gap:6 }}>
                          <span style={{ width:8, height:8, borderRadius:"50%", background:r.color, display:"inline-block", flexShrink:0 }}/>
                          {r.label}
                        </td>
                        <td style={{ padding:"9px 12px", textAlign:"right", fontFamily:"var(--font-mono)", fontSize:12, color:"var(--text2)" }}>{fmt(r.ing)}</td>
                        <td style={{ padding:"9px 12px", textAlign:"right", fontFamily:"var(--font-mono)", fontSize:12, color: r.egr > 0 ? "var(--red)" : "var(--text3)" }}>
                          {r.egr > 0 ? `−${fmt(r.egr)}` : "—"}
                        </td>
                        <td style={{ padding:"9px 12px", textAlign:"right", fontFamily:"var(--font-mono)", fontSize:13, fontWeight:700, color: r.saldo < 0 ? "var(--red)" : r.saldo === 0 ? "var(--text3)" : r.color }}>
                          {fmt(r.saldo)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop:"2px solid var(--border2)", background:"var(--bg4)" }}>
                      <td style={{ padding:"9px 12px", fontSize:12, fontWeight:700, color:"var(--text1)" }}>Total</td>
                      <td style={{ padding:"9px 12px", textAlign:"right", fontFamily:"var(--font-mono)", fontSize:12, fontWeight:700, color:"var(--text2)" }}>{fmt(totalMayor)}</td>
                      <td style={{ padding:"9px 12px", textAlign:"right", fontFamily:"var(--font-mono)", fontSize:12, fontWeight:700, color:"var(--red)" }}>
                        {totalEgr > 0 ? `−${fmt(totalEgr)}` : "—"}
                      </td>
                      <td style={{ padding:"9px 12px", textAlign:"right", fontFamily:"var(--font-mono)", fontSize:14, fontWeight:700, color: (modo === "todo" ? saldoActual : movimientoNeto) < 0 ? "var(--red)" : "var(--accent2)" }}>
                        {fmt(modo === "todo" ? saldoActual : movimientoNeto)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {(gastosTesor.length > 0 || comprasTesor.length > 0) && (
                <div style={{ marginTop:10, padding:"8px 12px", background:"rgba(242,107,91,0.06)", border:"1px solid rgba(242,107,91,0.18)", borderRadius:6, fontSize:11, color:"var(--text3)" }}>
                  {gastosTesor.length > 0 && <>{gastosTesor.length} gasto{gastosTesor.length !== 1 ? "s" : ""}</>}
                  {gastosTesor.length > 0 && comprasTesor.length > 0 && " y "}
                  {comprasTesor.length > 0 && <>{comprasTesor.length} factura{comprasTesor.length !== 1 ? "s" : ""}</>}
                  {" "}descontado{(gastosTesor.length + comprasTesor.length) !== 1 ? "s" : ""} de Tesorería · Total: <strong style={{ color:"var(--red)" }}>−{fmt(totalGastosTesor)}</strong>
                </div>
              )}
            </div>
          )}

          <div className="card" style={{ margin:0 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
              <div className="card-title" style={{ margin:0 }}>Caja Mayor</div>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                {cajaMayor.length>0 && (
                  <span style={{ fontFamily:"var(--font-mono)", fontSize:14, fontWeight:700, color:"var(--green)" }}>{fmt(totalMayor)}</span>
                )}
                <button
                  className="btn btn-sm"
                  style={{ background:"var(--red)", color:"#fff", display:"flex", alignItems:"center", gap:5 }}
                  onClick={()=>setShowRetiro(true)}
                >
                  <Icon name="minus" size={13}/> Retirar
                </button>
              </div>
            </div>
            {cajaMayor.length===0 ? (
              <div style={{ padding:"28px 0", textAlign:"center", fontSize:13, color:"var(--text3)" }}>Sin movimientos en Caja Mayor</div>
            ) : (
              <div style={{ background:"var(--bg3)", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden" }}>
                {cajaMayorPag.itemsPagina.map(t=>(
                  <div key={t.id} onClick={()=>setSelectedId(selectedId===t.id?null:t.id)}
                    style={{ borderBottom:"1px solid var(--border)", cursor:"pointer", background:selectedId===t.id?"color-mix(in srgb, var(--accent) 7%, transparent)":"transparent" }}>
                    <div style={{ display:"flex", alignItems:"center", padding:"10px 14px", gap:10 }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, color:"var(--text1)" }}>{fmtFechaAR(t.fecha)} · {t.hora}</div>
                        <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:1 }}>
                          <span style={{ fontSize:11, color:"var(--text3)" }}>Cerrado {t.horaCierre}{t.detalle?.numero ? ` · ${t.detalle.numero}` : ""}</span>
                          <TipoCierreBadge tipo={tipoCierreDeMovimiento(t)}/>
                        </div>
                      </div>
                      <DiffBadge dif={t.diferencia}/>
                      <div style={{ fontFamily:"var(--font-mono)", fontSize:13, fontWeight:700, color:"var(--green)" }}>{fmt(t.monto)}</div>
                      <span style={{ fontSize:10, padding:"2px 7px", borderRadius:4, background:"rgba(62,207,142,0.1)", color:"var(--green)", border:"1px solid rgba(62,207,142,0.25)" }}>En Caja Mayor</span>
                    </div>
                    {selectedId===t.id&&t.detalle&&(
                      <div style={{ padding:"0 14px 14px", borderTop:"1px solid var(--border)" }}>
                        <DetalleCierreCaja t={t}/>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {cajaMayor.length > 0 && (
              <Paginacion pagina={cajaMayorPag.pagina} totalPaginas={cajaMayorPag.totalPaginas} onCambiar={cajaMayorPag.setPagina} totalItems={cajaMayor.length} pageSize={cajaMayorPag.pageSize} etiqueta="movimientos" />
            )}
          </div>

          {/* Lista de retiros registrados */}
          {retiros.length > 0 && (
            <div className="card" style={{ margin:0 }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                <div className="card-title" style={{ margin:0 }}>Retiros</div>
                <span style={{ fontFamily:"var(--font-mono)", fontSize:14, fontWeight:700, color:"var(--red)" }}>− {fmt(totalRetiros)}</span>
              </div>
              <div style={{ background:"var(--bg3)", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden" }}>
                {retirosPag.itemsPagina.map(r=>(
                  <div key={r.id} style={{ display:"flex", alignItems:"center", padding:"10px 14px", borderBottom:"1px solid var(--border)", gap:10 }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:500, color:"var(--text1)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{r.concepto}</div>
                      <div style={{ fontSize:11, color:"var(--text3)", marginTop:1 }}>
                        {fmtFechaAR(r.fecha)}{r.hora ? ` · ${r.hora}` : ""}{r.destinatario ? ` · ${r.destinatario}` : ""} · {r.formaPago}
                      </div>
                    </div>
                    <div style={{ fontFamily:"var(--font-mono)", fontSize:13, fontWeight:700, color:"var(--red)", flexShrink:0 }}>− {fmt(r.monto)}</div>
                    <span style={{ fontSize:10, padding:"2px 7px", borderRadius:4, background:"rgba(242,107,91,0.1)", color:"var(--red)", border:"1px solid rgba(242,107,91,0.25)", flexShrink:0 }}>Retiro</span>
                  </div>
                ))}
              </div>
              <Paginacion pagina={retirosPag.pagina} totalPaginas={retirosPag.totalPaginas} onCambiar={retirosPag.setPagina} totalItems={retiros.length} pageSize={retirosPag.pageSize} etiqueta="retiros" />
            </div>
          )}

          {/* Ingresos enviados a Caja Salón */}
          {ingresosACaja.length > 0 && (
            <div className="card" style={{ margin:0 }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                <div className="card-title" style={{ margin:0 }}>Ingresos a Caja Salón</div>
                <span style={{ fontFamily:"var(--font-mono)", fontSize:14, fontWeight:700, color:"var(--amber)" }}>− {fmt(totalIngresosACaja)}</span>
              </div>
              <div style={{ background:"var(--bg3)", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden" }}>
                {ingresosACajaPag.itemsPagina.map(r=>(
                  <div key={r.id} style={{ display:"flex", alignItems:"center", padding:"10px 14px", borderBottom:"1px solid var(--border)", gap:10 }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:500, color:"var(--text1)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{r.concepto}</div>
                      <div style={{ fontSize:11, color:"var(--text3)", marginTop:1 }}>
                        {fmtFechaAR(r.fecha)}{r.hora ? ` · ${r.hora}` : ""}
                      </div>
                    </div>
                    <div style={{ fontFamily:"var(--font-mono)", fontSize:13, fontWeight:700, color:"var(--amber)", flexShrink:0 }}>− {fmt(r.monto)}</div>
                    <span style={{ fontSize:10, padding:"2px 7px", borderRadius:4, background:"rgba(245,158,11,0.1)", color:"var(--amber)", border:"1px solid rgba(245,158,11,0.25)", flexShrink:0 }}>→ Caja</span>
                  </div>
                ))}
              </div>
              <Paginacion pagina={ingresosACajaPag.pagina} totalPaginas={ingresosACajaPag.totalPaginas} onCambiar={ingresosACajaPag.setPagina} totalItems={ingresosACaja.length} pageSize={ingresosACajaPag.pageSize} etiqueta="ingresos" />
            </div>
          )}

          {/* Saldo final */}
          {(retiros.length > 0 || ingresosACaja.length > 0 || totalGastosTesor > 0) && (
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", padding:"10px 14px", borderTop:"2px solid var(--border2)" }}>
              <span style={{ fontSize:13, fontWeight:600, color:"var(--text2)" }}>{modo === "todo" ? "Saldo en Tesorería" : `Movimiento neto (${periodoLabel})`}</span>
              <span style={{ fontFamily:"var(--font-mono)", fontSize:16, fontWeight:700, color:(modo === "todo" ? saldoActual : movimientoNeto)>=0?"var(--accent2)":"var(--red)" }}>{fmt(modo === "todo" ? saldoActual : movimientoNeto)}</span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ─── Modal: Cuenta (agregar / editar) ────────────────────────────────────────
function ModalCuenta({ cuenta, planCuentas, onClose, onConfirm }) {
  const editando = !!cuenta;
  const [codigo,    setCodigo]    = useState(cuenta?.codigo    || "");
  const [nombre,    setNombre]    = useState(cuenta?.nombre    || "");
  const [tipo,      setTipo]      = useState(cuenta?.tipo      || "activo");
  const [nivel,     setNivel]     = useState(cuenta?.nivel     || 3);
  const [imputable, setImputable] = useState(cuenta?.imputable ?? true);
  const [error,     setError]     = useState("");

  const confirmar = () => {
    setError("");
    const cod = codigo.trim();
    const nom = nombre.trim();
    if (!cod) { setError("El código es obligatorio."); return; }
    if (!nom) { setError("El nombre es obligatorio."); return; }
    const existe = (planCuentas||[]).some(c=>c.codigo===cod && c.id!==cuenta?.id);
    if (existe) { setError(`Ya existe una cuenta con código ${cod}.`); return; }
    onConfirm({ id: cuenta?.id || uid(), codigo:cod, nombre:nom, tipo, nivel:Number(nivel), imputable });
  };

  return (
    <div style={{ position:"fixed", inset:0, zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.65)", backdropFilter:"blur(4px)" }} onClick={onClose}>
      <div className="card" style={{ width:460, maxWidth:"95vw", margin:0 }} onClick={e=>e.stopPropagation()}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:18 }}>
          <div className="card-title" style={{ margin:0 }}>{editando ? "Editar cuenta" : "Nueva cuenta"}</div>
          <button className="btn btn-sm btn-ghost" onClick={onClose}><Icon name="x" size={14}/></button>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
          <div className="form-group">
            <label className="form-label">Código</label>
            <input className="form-input" placeholder="Ej: 1.1.3" value={codigo} onChange={e=>setCodigo(e.target.value)}/>
            <div style={{ fontSize:10, color:"var(--text3)", marginTop:3 }}>Jerarquía: 1 → 1.1 → 1.1.1</div>
          </div>
          <div className="form-group">
            <label className="form-label">Nivel</label>
            <select className="form-select" value={nivel} onChange={e=>setNivel(e.target.value)}>
              <option value={1}>1 — Rubro principal</option>
              <option value={2}>2 — Grupo</option>
              <option value={3}>3 — Cuenta imputable</option>
            </select>
          </div>
        </div>

        <div className="form-group" style={{ marginBottom:10 }}>
          <label className="form-label">Nombre</label>
          <input className="form-input" placeholder="Nombre de la cuenta..." value={nombre} onChange={e=>setNombre(e.target.value)}/>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
          <div className="form-group">
            <label className="form-label">Tipo</label>
            <select className="form-select" value={tipo} onChange={e=>setTipo(e.target.value)}>
              {Object.entries(TIPO_LABEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">¿Imputable?</label>
            <div style={{ display:"flex", alignItems:"center", gap:10, height:36 }}>
              <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer", fontSize:13 }}>
                <input type="checkbox" checked={imputable} onChange={e=>setImputable(e.target.checked)} style={{ width:15, height:15 }}/>
                Acepta movimientos
              </label>
            </div>
          </div>
        </div>

        {error && <div style={{ padding:"8px 12px", background:"rgba(242,107,91,0.08)", border:"1px solid rgba(242,107,91,0.25)", borderRadius:8, fontSize:13, color:"var(--red)", marginBottom:12 }}>{error}</div>}

        <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={confirmar}>
            <Icon name="check" size={13}/> {editando ? "Guardar cambios" : "Agregar cuenta"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Plan de Cuentas ─────────────────────────────────────────────────────
function TabPlanCuentas({ planCuentas, setPlanCuentas, agregarCuenta, actualizarCuenta }) {
  const [modal,   setModal]   = useState(null); // null | "nueva" | cuenta
  const [confirm, setConfirm] = useState(null); // cuenta a eliminar

  const sorted = [...(planCuentas||[])].sort((a,b)=>a.codigo.localeCompare(b.codigo));
  const grupos = ["1","2","3","4","5"];

  const guardarCuenta = async (data) => {
    const existe = (planCuentas||[]).find(c=>c.id===data.id);
    try {
      if (existe) {
        await actualizarCuenta(data.id, { nombre: data.nombre, imputable: data.imputable });
      } else {
        await agregarCuenta(data);
      }
    } catch { /* state update already handled by hook on success */ }
    setModal(null);
  };

  const eliminarCuenta = (c) => {
    setPlanCuentas(prev => prev.filter(x=>x.id!==c.id));
    setConfirm(null);
  };

  return (
    <div>
      {modal && (
        <ModalCuenta
          cuenta={modal==="nueva" ? null : modal}
          planCuentas={planCuentas||[]}
          onClose={()=>setModal(null)}
          onConfirm={guardarCuenta}
        />
      )}
      {confirm && (
        <div style={{ position:"fixed", inset:0, zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.65)", backdropFilter:"blur(4px)" }} onClick={()=>setConfirm(null)}>
          <div className="card" style={{ width:380, maxWidth:"95vw", margin:0 }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:"flex", gap:12, alignItems:"flex-start", marginBottom:16 }}>
              <Icon name="warning" size={22} color="var(--red)"/>
              <div>
                <div style={{ fontSize:14, fontWeight:700, color:"var(--text1)", marginBottom:4 }}>Eliminar cuenta</div>
                <div style={{ fontSize:13, color:"var(--text2)" }}>
                  ¿Eliminás <strong>{confirm.codigo} — {confirm.nombre}</strong>? Esta acción no se puede deshacer y puede afectar asientos existentes.
                </div>
              </div>
            </div>
            <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
              <button className="btn btn-ghost" onClick={()=>setConfirm(null)}>Cancelar</button>
              <button className="btn btn-sm" style={{ background:"var(--red)", color:"#fff" }} onClick={()=>eliminarCuenta(confirm)}>
                <Icon name="trash" size={13}/> Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
          <div className="card-title" style={{ margin:0 }}>Plan de Cuentas</div>
          <button className="btn btn-primary btn-sm" onClick={()=>setModal("nueva")}>
            <Icon name="plus" size={13}/> Nueva cuenta
          </button>
        </div>

        {grupos.map(g => {
          const rows = sorted.filter(c => c.codigo.startsWith(g));
          if (!rows.length) return null;
          return (
            <div key={g} style={{ marginBottom:14 }}>
              <div style={{ background:"var(--bg3)", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden" }}>
                {rows.map((c) => {
                  const col = TIPO_COLOR[c.tipo]||"var(--text2)";
                  const ind = (c.nivel-1)*20;
                  return (
                    <div key={c.id} style={{ display:"flex", alignItems:"center", padding:"7px 14px", paddingLeft:14+ind, borderBottom:"1px solid var(--border)", background:c.nivel===1?"var(--bg4)":c.nivel===2?"rgba(0,0,0,0.08)":"transparent", gap:8 }}>
                      <span style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"var(--text3)", minWidth:60, flexShrink:0 }}>{c.codigo}</span>
                      <span style={{ flex:1, fontSize:c.nivel<3?13:12, fontWeight:c.nivel<3?700:400, color:c.nivel===3?"var(--text1)":col }}>{c.nombre}</span>
                      <span style={{ fontSize:10, padding:"1px 7px", borderRadius:3, background:`color-mix(in srgb, ${col} 10%, transparent)`, color:col, border:`1px solid color-mix(in srgb, ${col} 25%, transparent)`, flexShrink:0 }}>
                        {TIPO_LABEL[c.tipo]}
                      </span>
                      {c.imputable && <span style={{ fontSize:10, color:"var(--text3)", flexShrink:0 }}>imputable</span>}
                      <button className="btn btn-ghost btn-sm" style={{ padding:"3px 6px", flexShrink:0 }} onClick={()=>setModal(c)} title="Editar">
                        <Icon name="edit" size={12}/>
                      </button>
                      <button className="btn btn-ghost btn-sm" style={{ padding:"3px 6px", flexShrink:0 }} onClick={()=>setConfirm(c)} title="Eliminar">
                        <Icon name="trash" size={12} color="var(--red)"/>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Modal: Nuevo Asiento Manual ──────────────────────────────────────────────
function ModalNuevoAsiento({ planCuentas, onClose, onConfirm }) {
  const [fecha,      setFecha]      = useState(today());
  const [descripcion,setDescripcion]= useState("");
  const [lineas,     setLineas]     = useState([
    { id:1, cuentaId:"", debe:"", haber:"" },
    { id:2, cuentaId:"", debe:"", haber:"" },
  ]);
  const [error, setError] = useState("");

  const imputables = (planCuentas||[]).filter(c=>c.imputable).sort((a,b)=>a.codigo.localeCompare(b.codigo));
  const totalDebe  = lineas.reduce((s,l)=>s+(parseFloat(l.debe)||0),0);
  const totalHaber = lineas.reduce((s,l)=>s+(parseFloat(l.haber)||0),0);
  const balanceado = totalDebe>0 && Math.abs(totalDebe-totalHaber)<0.01;

  const addLinea    = () => setLineas(prev=>[...prev,{id:Date.now(),cuentaId:"",debe:"",haber:""}]);
  const removeLinea = (id)=> setLineas(prev=>prev.filter(l=>l.id!==id));
  const updLinea    = (id,f,v)=> setLineas(prev=>prev.map(l=>l.id===id?{...l,[f]:v}:l));

  const confirmar = () => {
    setError("");
    if (!descripcion.trim()) { setError("Ingresá una descripción."); return; }
    const validas = lineas.filter(l=>l.cuentaId&&(parseFloat(l.debe)>0||parseFloat(l.haber)>0));
    if (validas.length<2) { setError("Se necesitan al menos 2 líneas con cuenta y monto."); return; }
    if (!balanceado) { setError(`El asiento no está balanceado. Debe: ${fmt(totalDebe)} / Haber: ${fmt(totalHaber)}`); return; }
    const ctaMap = {};
    (planCuentas||[]).forEach(c=>{ctaMap[c.id]=c;});
    const now = new Date();
    const hora = String(now.getHours()).padStart(2,"0")+":"+String(now.getMinutes()).padStart(2,"0");
    onConfirm({
      id:uid(), fecha, hora,
      descripcion:descripcion.trim(), origen:"manual",
      lineas: validas.map(l=>{
        const c=ctaMap[l.cuentaId]||{codigo:l.cuentaId,nombre:l.cuentaId};
        return { cuentaId:l.cuentaId, cuentaCodigo:c.codigo, cuentaNombre:c.nombre, debe:parseFloat(l.debe)||0, haber:parseFloat(l.haber)||0 };
      }),
    });
  };

  return (
    <div style={{ position:"fixed", inset:0, zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.65)", backdropFilter:"blur(4px)" }} onClick={onClose}>
      <div className="card" style={{ width:680, maxWidth:"95vw", maxHeight:"85vh", overflowY:"auto", margin:0 }} onClick={e=>e.stopPropagation()}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
          <div className="card-title" style={{ margin:0 }}>Nuevo Asiento Manual</div>
          <button className="btn btn-sm btn-ghost" onClick={onClose}><Icon name="x" size={14}/></button>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr", gap:10, marginBottom:14 }}>
          <div className="form-group">
            <label className="form-label">Fecha</label>
            <input className="form-input" type="date" value={fecha} onChange={e=>setFecha(e.target.value)}/>
          </div>
          <div className="form-group">
            <label className="form-label">Descripción</label>
            <input className="form-input" placeholder="Concepto del asiento..." value={descripcion} onChange={e=>setDescripcion(e.target.value)}/>
          </div>
        </div>

        <div style={{ background:"var(--bg3)", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden", marginBottom:10 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 120px 120px 32px", gap:0, padding:"5px 10px", background:"var(--bg4)", borderBottom:"1px solid var(--border)" }}>
            {["Cuenta","Debe","Haber",""].map((h,i)=>(
              <div key={i} style={{ fontSize:10, fontWeight:600, color:"var(--text3)", textTransform:"uppercase", letterSpacing:".05em", textAlign:i>0?"right":"left" }}>{h}</div>
            ))}
          </div>
          {lineas.map(l=>(
            <div key={l.id} style={{ display:"grid", gridTemplateColumns:"1fr 120px 120px 32px", gap:6, padding:"6px 10px", borderTop:"1px solid var(--border)", alignItems:"center" }}>
              <select className="form-select" style={{ fontSize:12 }} value={l.cuentaId} onChange={e=>updLinea(l.id,"cuentaId",e.target.value)}>
                <option value="">— Cuenta —</option>
                {imputables.map(c=><option key={c.id} value={c.id}>{c.codigo} · {c.nombre}</option>)}
              </select>
              <input type="number" className="form-input" style={{ textAlign:"right", fontSize:12 }} placeholder="0" value={l.debe} onChange={e=>updLinea(l.id,"debe",e.target.value)}/>
              <input type="number" className="form-input" style={{ textAlign:"right", fontSize:12 }} placeholder="0" value={l.haber} onChange={e=>updLinea(l.id,"haber",e.target.value)}/>
              <button className="btn btn-sm btn-ghost" style={{ padding:"3px 6px" }} onClick={()=>removeLinea(l.id)} disabled={lineas.length<=2}>
                <Icon name="x" size={11} color="var(--red)"/>
              </button>
            </div>
          ))}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 120px 120px 32px", padding:"6px 10px", borderTop:"2px solid var(--border2)", background:"var(--bg4)" }}>
            <div style={{ fontSize:12, fontWeight:600, color:"var(--text2)" }}>Total</div>
            <div style={{ textAlign:"right", fontFamily:"var(--font-mono)", fontSize:12, fontWeight:700, color:balanceado?"var(--green)":totalDebe>0?"var(--amber)":"var(--text3)" }}>{fmt(totalDebe)}</div>
            <div style={{ textAlign:"right", fontFamily:"var(--font-mono)", fontSize:12, fontWeight:700, color:balanceado?"var(--green)":totalHaber>0?"var(--amber)":"var(--text3)" }}>{fmt(totalHaber)}</div>
            <div/>
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={addLinea} style={{ marginBottom:12 }}>
          <Icon name="plus" size={13}/> Agregar línea
        </button>
        {!balanceado && totalDebe>0 && (
          <div style={{ fontSize:12, color:"var(--amber)", marginBottom:8, display:"flex", alignItems:"center", gap:6 }}>
            <Icon name="warning" size={13}/> Debe ({fmt(totalDebe)}) ≠ Haber ({fmt(totalHaber)}) — el asiento debe balancear para registrarse
          </div>
        )}
        {error&&<div style={{ padding:"9px 12px", background:"rgba(242,107,91,0.08)", border:"1px solid rgba(242,107,91,0.25)", borderRadius:8, fontSize:13, color:"var(--red)", marginBottom:12 }}>{error}</div>}
        <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={confirmar}>
            <Icon name="check" size={13}/> Registrar asiento
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Libro Diario ────────────────────────────────────────────────────────
function TabLibroDiario({ allAsientos, planCuentas, onNuevoAsiento }) {
  const primerDia = today().slice(0,7)+"-01";
  const [desde, setDesde] = useState(primerDia);
  const [hasta, setHasta] = useState(today());

  const filtered  = allAsientos.filter(a=>a.fecha>=desde&&a.fecha<=hasta);
  const totalDebe  = filtered.reduce((s,a)=>s+a.lineas.reduce((ls,l)=>ls+l.debe,0),0);
  const totalHaber = filtered.reduce((s,a)=>s+a.lineas.reduce((ls,l)=>ls+l.haber,0),0);

  return (
    <div>
      <div className="card" style={{ marginBottom:16 }}>
        <div style={{ display:"flex", alignItems:"flex-end", gap:10, flexWrap:"wrap", marginBottom:14 }}>
          <div className="form-group" style={{ flex:"0 0 160px" }}>
            <label className="form-label">Desde</label>
            <input className="form-input" type="date" value={desde} onChange={e=>setDesde(e.target.value)}/>
          </div>
          <div className="form-group" style={{ flex:"0 0 160px" }}>
            <label className="form-label">Hasta</label>
            <input className="form-input" type="date" value={hasta} onChange={e=>setHasta(e.target.value)}/>
          </div>
          <div style={{ marginLeft:"auto" }}>
            <button className="btn btn-primary btn-sm" onClick={onNuevoAsiento}>
              <Icon name="plus" size={13}/> Nuevo Asiento
            </button>
          </div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
          <div className="metric-card"><div className="metric-label">Asientos en el período</div><div className="metric-value">{filtered.length}</div></div>
          <div className="metric-card"><div className="metric-label">Total Debe</div><div className="metric-value" style={{ fontSize:16 }}>{fmt(totalDebe)}</div></div>
          <div className="metric-card"><div className="metric-label">Total Haber</div><div className="metric-value" style={{ fontSize:16 }}>{fmt(totalHaber)}</div></div>
        </div>
      </div>
      {filtered.length===0 ? (
        <div className="card" style={{ textAlign:"center", padding:"40px 0", color:"var(--text3)", fontSize:13 }}>
          No hay asientos en el período seleccionado
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {filtered.map(a=><AsientoCard key={a.id} asiento={a}/>)}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Libro Mayor ─────────────────────────────────────────────────────────
function TabLibroMayor({ allAsientos, planCuentas }) {
  const primerDia = today().slice(0,7)+"-01";
  const [desde,    setDesde]    = useState(primerDia);
  const [hasta,    setHasta]    = useState(today());
  const [cuentaId, setCuentaId] = useState("");

  const imputables = (planCuentas||[]).filter(c=>c.imputable).sort((a,b)=>a.codigo.localeCompare(b.codigo));
  const ctaSelec   = (planCuentas||[]).find(c=>c.id===cuentaId);
  const normalDebe = ctaSelec&&["activo","egreso"].includes(ctaSelec.tipo);

  const movAntes = useMemo(()=> !cuentaId ? [] :
    allAsientos.filter(a=>a.fecha<desde).flatMap(a=>a.lineas.filter(l=>l.cuentaId===cuentaId).map(l=>({...l,fecha:a.fecha,descripcion:a.descripcion,asientoNum:a.numero}))),
  [allAsientos, cuentaId, desde]);

  const saldoAntDebe  = movAntes.reduce((s,l)=>s+l.debe,0);
  const saldoAntHaber = movAntes.reduce((s,l)=>s+l.haber,0);
  const saldoAnt      = normalDebe ? saldoAntDebe-saldoAntHaber : saldoAntHaber-saldoAntDebe;

  const movs = useMemo(()=> !cuentaId ? [] :
    allAsientos.filter(a=>a.fecha>=desde&&a.fecha<=hasta)
      .flatMap(a=>a.lineas.filter(l=>l.cuentaId===cuentaId).map(l=>({...l,fecha:a.fecha,hora:a.hora,descripcion:a.descripcion,asientoNum:a.numero})))
      .sort((a,b)=>a.fecha.localeCompare(b.fecha)||a.hora.localeCompare(b.hora)),
  [allAsientos, cuentaId, desde, hasta]);

  let runSaldo = saldoAnt;
  const movsConSaldo = movs.map(m=>{
    runSaldo += normalDebe ? m.debe-m.haber : m.haber-m.debe;
    return {...m, saldo:runSaldo};
  });

  const totalDebe   = movs.reduce((s,m)=>s+m.debe,0);
  const totalHaber  = movs.reduce((s,m)=>s+m.haber,0);
  const saldoFinal  = movsConSaldo.length>0 ? movsConSaldo[movsConSaldo.length-1].saldo : saldoAnt;

  const { pagina: paginaMovs, setPagina: setPaginaMovs, totalPaginas: totalPaginasMovs, itemsPagina: movsPagina, pageSize: pageSizeMovs } = usePaginacion(movsConSaldo);

  const SaldoLabel = ({v}) => {
    if (v===0) return <span style={{ fontFamily:"var(--font-mono)", fontSize:12, fontWeight:600, color:"var(--text3)" }}>0</span>;
    return <span style={{ fontFamily:"var(--font-mono)", fontSize:12, fontWeight:600, color:v>0?"var(--text1)":"var(--red)" }}>{v>0?"+":""}{fmt(v)}</span>;
  };

  return (
    <div>
      <div className="card">
        <div style={{ display:"flex", alignItems:"flex-end", gap:10, flexWrap:"wrap", marginBottom:14 }}>
          <div className="form-group" style={{ flex:"0 0 260px" }}>
            <label className="form-label">Cuenta</label>
            <select className="form-select" value={cuentaId} onChange={e=>setCuentaId(e.target.value)}>
              <option value="">— Seleccionar cuenta —</option>
              {imputables.map(c=><option key={c.id} value={c.id}>{c.codigo} · {c.nombre}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex:"0 0 150px" }}>
            <label className="form-label">Desde</label>
            <input className="form-input" type="date" value={desde} onChange={e=>setDesde(e.target.value)}/>
          </div>
          <div className="form-group" style={{ flex:"0 0 150px" }}>
            <label className="form-label">Hasta</label>
            <input className="form-input" type="date" value={hasta} onChange={e=>setHasta(e.target.value)}/>
          </div>
          {cuentaId&&(
            <div className="metric-card" style={{ marginLeft:"auto", padding:"8px 16px", flexShrink:0 }}>
              <div className="metric-label">Saldo Final</div>
              <div style={{ fontFamily:"var(--font-mono)", fontWeight:700, fontSize:16, marginTop:2, color:saldoFinal>=0?"var(--green)":"var(--red)" }}>
                {saldoFinal>=0?"+":""}{fmt(saldoFinal)}
              </div>
            </div>
          )}
        </div>

        {!cuentaId ? (
          <div style={{ padding:"36px 0", textAlign:"center", fontSize:13, color:"var(--text3)" }}>
            Seleccioná una cuenta para ver su Libro Mayor
          </div>
        ) : (
          <>
            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:14, fontWeight:700, color:"var(--text1)" }}>{ctaSelec?.codigo} — {ctaSelec?.nombre}</div>
              <div style={{ fontSize:11, color:"var(--text3)", marginTop:2 }}>Período: {desde} al {hasta}</div>
            </div>
            <div style={{ background:"var(--bg3)", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden" }}>
              <table style={{ width:"100%" }}>
                <thead>
                  <tr style={{ background:"var(--bg4)", borderBottom:"1px solid var(--border)" }}>
                    {["N°","Fecha","Descripción","Debe","Haber","Saldo"].map((h,i)=>(
                      <th key={i} style={{ padding:"7px 10px", fontSize:10, fontWeight:600, color:"var(--text3)", textTransform:"uppercase", letterSpacing:".05em", textAlign:i>2?"right":"left" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ background:"rgba(0,0,0,0.12)", borderBottom:"1px solid var(--border)" }}>
                    <td style={{ padding:"7px 10px", fontSize:11, color:"var(--text3)" }}>—</td>
                    <td style={{ padding:"7px 10px", fontSize:11, color:"var(--text3)" }}>&lt; {desde}</td>
                    <td style={{ padding:"7px 10px", fontSize:12, color:"var(--text3)", fontStyle:"italic" }}>Saldo anterior</td>
                    <td style={{ padding:"7px 10px", textAlign:"right", fontFamily:"var(--font-mono)", fontSize:11, color:"var(--text3)" }}>{saldoAntDebe>0?fmt(saldoAntDebe):"—"}</td>
                    <td style={{ padding:"7px 10px", textAlign:"right", fontFamily:"var(--font-mono)", fontSize:11, color:"var(--text3)" }}>{saldoAntHaber>0?fmt(saldoAntHaber):"—"}</td>
                    <td style={{ padding:"7px 10px", textAlign:"right" }}><SaldoLabel v={saldoAnt}/></td>
                  </tr>
                  {movs.length===0&&(
                    <tr style={{ borderBottom:"1px solid var(--border)" }}>
                      <td colSpan={6} style={{ padding:"16px 10px", textAlign:"center", fontSize:12, color:"var(--text3)" }}>Sin movimientos en el período</td>
                    </tr>
                  )}
                  {movsPagina.map((m,i)=>(
                    <tr key={i} style={{ borderBottom:"1px solid var(--border)" }}>
                      <td style={{ padding:"7px 10px", fontSize:11, color:"var(--text3)", fontFamily:"var(--font-mono)" }}>{m.asientoNum}</td>
                      <td style={{ padding:"7px 10px", fontSize:12, color:"var(--text3)", whiteSpace:"nowrap" }}>{fmtFechaAR(m.fecha)}</td>
                      <td style={{ padding:"7px 10px", fontSize:12, color:"var(--text2)", maxWidth:240, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{m.descripcion}</td>
                      <td style={{ padding:"7px 10px", textAlign:"right", fontFamily:"var(--font-mono)", fontSize:12, color:m.debe>0?"var(--text1)":"var(--text3)" }}>{m.debe>0?fmt(m.debe):"—"}</td>
                      <td style={{ padding:"7px 10px", textAlign:"right", fontFamily:"var(--font-mono)", fontSize:12, color:m.haber>0?"var(--text1)":"var(--text3)" }}>{m.haber>0?fmt(m.haber):"—"}</td>
                      <td style={{ padding:"7px 10px", textAlign:"right" }}><SaldoLabel v={m.saldo}/></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop:"2px solid var(--border2)", background:"var(--bg4)" }}>
                    <td colSpan={3} style={{ padding:"8px 10px", fontSize:12, fontWeight:600, color:"var(--text1)" }}>Subtotal período</td>
                    <td style={{ padding:"8px 10px", textAlign:"right", fontFamily:"var(--font-mono)", fontSize:13, fontWeight:700, color:"var(--green)" }}>{fmt(totalDebe)}</td>
                    <td style={{ padding:"8px 10px", textAlign:"right", fontFamily:"var(--font-mono)", fontSize:13, fontWeight:700, color:"var(--green)" }}>{fmt(totalHaber)}</td>
                    <td style={{ padding:"8px 10px", textAlign:"right" }}><SaldoLabel v={saldoFinal}/></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <Paginacion pagina={paginaMovs} totalPaginas={totalPaginasMovs} onCambiar={setPaginaMovs} totalItems={movsConSaldo.length} pageSize={pageSizeMovs} etiqueta="movimientos" />
          </>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Balance / Estado de Resultados ──────────────────────────────────────
function TabBalance({ allAsientos, planCuentas }) {
  const primerDia = today().slice(0,7)+"-01";
  const [desde, setDesde] = useState(primerDia);
  const [hasta, setHasta] = useState(today());
  const [vista, setVista] = useState("sumas");

  const imputables = (planCuentas||[]).filter(c=>c.imputable);

  const saldosCuentas = useMemo(()=>{
    const filtered = allAsientos.filter(a=>a.fecha>=desde&&a.fecha<=hasta);
    const r = {};
    filtered.forEach(a=>a.lineas.forEach(l=>{
      if (!r[l.cuentaId]) r[l.cuentaId]={totalDebe:0,totalHaber:0};
      r[l.cuentaId].totalDebe  += l.debe;
      r[l.cuentaId].totalHaber += l.haber;
    }));
    return r;
  },[allAsientos,desde,hasta]);

  const rows = imputables
    .filter(c=>saldosCuentas[c.id])
    .map(c=>{
      const {totalDebe=0,totalHaber=0}=saldosCuentas[c.id]||{};
      const saldo = totalDebe - totalHaber;
      return { ...c, totalDebe, totalHaber, saldoDeudor:saldo>0?saldo:0, saldoAcreedor:saldo<0?Math.abs(saldo):0 };
    })
    .sort((a,b)=>a.codigo.localeCompare(b.codigo));

  const grand = {
    debe:rows.reduce((s,r)=>s+r.totalDebe,0),
    haber:rows.reduce((s,r)=>s+r.totalHaber,0),
    deudor:rows.reduce((s,r)=>s+r.saldoDeudor,0),
    acreedor:rows.reduce((s,r)=>s+r.saldoAcreedor,0),
  };

  const ingrRows = rows.filter(r=>r.tipo==="ingreso");
  const egrRows  = rows.filter(r=>r.tipo==="egreso");
  const totalIngresos = ingrRows.reduce((s,r)=>s+(r.totalHaber-r.totalDebe),0);
  const totalEgresos  = egrRows.reduce((s,r)=>s+(r.totalDebe-r.totalHaber),0);
  const resultado     = totalIngresos - totalEgresos;

  const Th = ({children,right}) => <th style={{ padding:"7px 10px", fontSize:10, fontWeight:600, color:"var(--text3)", textTransform:"uppercase", letterSpacing:".05em", textAlign:right?"right":"left" }}>{children}</th>;
  const Td = ({children,right,bold,color}) => <td style={{ padding:"7px 10px", fontSize:12, textAlign:right?"right":"left", fontWeight:bold?700:400, color:color||"var(--text2)", fontFamily:right?"var(--font-mono)":undefined }}>{children}</td>;

  return (
    <div>
      <div className="card" style={{ marginBottom:16 }}>
        <div style={{ display:"flex", alignItems:"flex-end", gap:10, flexWrap:"wrap" }}>
          <div className="form-group" style={{ flex:"0 0 160px" }}>
            <label className="form-label">Desde</label>
            <input className="form-input" type="date" value={desde} onChange={e=>setDesde(e.target.value)}/>
          </div>
          <div className="form-group" style={{ flex:"0 0 160px" }}>
            <label className="form-label">Hasta</label>
            <input className="form-input" type="date" value={hasta} onChange={e=>setHasta(e.target.value)}/>
          </div>
          <div style={{ marginLeft:"auto", display:"flex", gap:4, background:"var(--bg2)", padding:4, borderRadius:8 }}>
            {[{id:"sumas",label:"Sumas y Saldos"},{id:"resultados",label:"Estado de Resultados"}].map(v=>(
              <button key={v.id} className={`btn btn-sm ${vista===v.id?"btn-primary":"btn-ghost"}`}
                style={{ borderRadius:6 }} onClick={()=>setVista(v.id)}>{v.label}</button>
            ))}
          </div>
        </div>
      </div>

      {vista==="sumas" ? (
        <div className="card">
          <div className="card-title" style={{ marginBottom:12 }}>Balance de Sumas y Saldos · {desde} al {hasta}</div>
          {rows.length===0 ? (
            <div style={{ padding:"28px 0", textAlign:"center", fontSize:13, color:"var(--text3)" }}>Sin movimientos en el período</div>
          ) : (
            <div style={{ background:"var(--bg3)", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden" }}>
              <table style={{ width:"100%" }}>
                <thead>
                  <tr style={{ background:"var(--bg4)", borderBottom:"1px solid var(--border)" }}>
                    <Th>Cuenta</Th><Th right>Debe</Th><Th right>Haber</Th><Th right>Saldo Deudor</Th><Th right>Saldo Acreedor</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r,i)=>{
                    const col = TIPO_COLOR[r.tipo]||"var(--text2)";
                    return (
                      <tr key={i} style={{ borderBottom:"1px solid var(--border)" }}>
                        <td style={{ padding:"7px 10px" }}>
                          <span style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"var(--text3)", marginRight:8 }}>{r.codigo}</span>
                          <span style={{ fontSize:12, color:"var(--text1)" }}>{r.nombre}</span>
                          <span style={{ marginLeft:8, fontSize:10, padding:"1px 5px", borderRadius:3, background:`color-mix(in srgb, ${col} 10%, transparent)`, color:col }}>{TIPO_LABEL[r.tipo]}</span>
                        </td>
                        <Td right color="var(--text1)">{fmt(r.totalDebe)}</Td>
                        <Td right color="var(--text1)">{fmt(r.totalHaber)}</Td>
                        <Td right color={r.saldoDeudor>0?"var(--blue)":"var(--text3)"}>{r.saldoDeudor>0?fmt(r.saldoDeudor):"—"}</Td>
                        <Td right color={r.saldoAcreedor>0?"var(--red)":"var(--text3)"}>{r.saldoAcreedor>0?fmt(r.saldoAcreedor):"—"}</Td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop:"2px solid var(--border2)", background:"var(--bg4)" }}>
                    <td style={{ padding:"8px 10px", fontSize:12, fontWeight:700, color:"var(--text1)" }}>TOTALES</td>
                    <td style={{ padding:"8px 10px", textAlign:"right", fontFamily:"var(--font-mono)", fontSize:13, fontWeight:700, color:"var(--text1)" }}>{fmt(grand.debe)}</td>
                    <td style={{ padding:"8px 10px", textAlign:"right", fontFamily:"var(--font-mono)", fontSize:13, fontWeight:700, color:"var(--text1)" }}>{fmt(grand.haber)}</td>
                    <td style={{ padding:"8px 10px", textAlign:"right", fontFamily:"var(--font-mono)", fontSize:13, fontWeight:700, color:"var(--blue)" }}>{fmt(grand.deudor)}</td>
                    <td style={{ padding:"8px 10px", textAlign:"right", fontFamily:"var(--font-mono)", fontSize:13, fontWeight:700, color:"var(--red)" }}>{fmt(grand.acreedor)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="card">
          <div className="card-title" style={{ marginBottom:12 }}>Estado de Resultados · {desde} al {hasta}</div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:16 }}>
            <div className="metric-card"><div className="metric-label">Total Ingresos</div><div className="metric-value" style={{ color:"var(--green)" }}>{fmt(totalIngresos)}</div></div>
            <div className="metric-card"><div className="metric-label">Total Egresos</div><div className="metric-value" style={{ color:"var(--red)" }}>{fmt(totalEgresos)}</div></div>
            <div className="metric-card"><div className="metric-label">Resultado Neto</div>
              <div className="metric-value" style={{ color:resultado>=0?"var(--green)":"var(--red)" }}>
                {resultado>=0?"GANANCIA":"PÉRDIDA"} {fmt(Math.abs(resultado))}
              </div>
            </div>
          </div>

          {[{tipo:"ingreso",titulo:"INGRESOS",rows:ingrRows,total:totalIngresos,color:"var(--green)"},{tipo:"egreso",titulo:"EGRESOS",rows:egrRows,total:totalEgresos,color:"var(--red)"}].map(sec=>(
            <div key={sec.tipo} style={{ background:"var(--bg3)", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden", marginBottom:14 }}>
              <div style={{ padding:"7px 12px", background:"var(--bg4)", borderBottom:"1px solid var(--border)", fontSize:11, fontWeight:700, color:sec.color, textTransform:"uppercase", letterSpacing:".05em", display:"flex", justifyContent:"space-between" }}>
                <span>{sec.titulo}</span>
                <span style={{ fontFamily:"var(--font-mono)" }}>{fmt(sec.total)}</span>
              </div>
              {sec.rows.length===0 ? (
                <div style={{ padding:"12px", fontSize:12, color:"var(--text3)" }}>Sin movimientos</div>
              ) : (
                sec.rows.map((r,i)=>{
                  const netResult = sec.tipo==="ingreso" ? r.totalHaber-r.totalDebe : r.totalDebe-r.totalHaber;
                  return (
                    <div key={i} style={{ display:"flex", alignItems:"center", padding:"8px 12px", borderBottom:"1px solid var(--border)" }}>
                      <span style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"var(--text3)", minWidth:60 }}>{r.codigo}</span>
                      <span style={{ flex:1, fontSize:12, color:"var(--text1)" }}>{r.nombre}</span>
                      <span style={{ fontFamily:"var(--font-mono)", fontSize:13, fontWeight:600, color:sec.color }}>{fmt(netResult)}</span>
                    </div>
                  );
                })
              )}
            </div>
          ))}

          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 16px", background:resultado>=0?"rgba(62,207,142,0.08)":"rgba(242,107,91,0.08)", border:`1px solid ${resultado>=0?"rgba(62,207,142,0.3)":"rgba(242,107,91,0.3)"}`, borderRadius:8 }}>
            <span style={{ fontSize:14, fontWeight:700, color:"var(--text1)" }}>{resultado>=0?"RESULTADO DEL PERÍODO (GANANCIA)":"RESULTADO DEL PERÍODO (PÉRDIDA)"}</span>
            <span style={{ fontFamily:"var(--font-mono)", fontSize:20, fontWeight:700, color:resultado>=0?"var(--green)":"var(--red)" }}>{fmt(Math.abs(resultado))}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Cierre de Período ───────────────────────────────────────────────────
function TabCierrePeriodo({ ventas, compras, gastos, periodosCerrados, cerrarPeriodo, reabrirPeriodo, cargarRetirosRango, usuarioActivo, permisos }) {
  const [mes, setMes] = useState(today().slice(0, 7));
  const [guardando, setGuardando] = useState(false);
  const [mesDetalle, setMesDetalle] = useState(null);
  const { toast } = useToast();
  const { confirm } = useConfirm();

  const periodoActual = (periodosCerrados || []).find(p => p.mes === mes) || null;
  const cerrado = !!periodoActual?.cerrado;

  const ventasMes  = (ventas  || []).filter(v => v.fecha.slice(0, 7) === mes && v.estado !== "anulada");
  const comprasMes = (compras || []).filter(c => c.fecha.slice(0, 7) === mes && c.estado !== "anulada");
  const gastosMes  = (gastos  || []).filter(g => g.fecha.slice(0, 7) === mes && g.estado !== "anulado");

  const totalVentas  = ventasMes.reduce((s, v) => s + v.total, 0);
  const totalCompras = comprasMes.reduce((s, c) => s + c.total, 0);
  const totalGastos  = gastosMes.reduce((s, g) => s + g.monto, 0);

  const ivaDebito  = ventasMes.reduce((s, v) => s + (v.iva || 0), 0);
  const ivaCredito = comprasMes.reduce((s, c) => s + (c.iva || 0), 0);
  const saldoIva    = ivaDebito - ivaCredito;

  const resultadoBruto = totalVentas - totalCompras - totalGastos;

  const handleCerrarPeriodo = async () => {
    if (!await confirm(`¿Cerrar el período ${mesLabel(mes)}? Una vez cerrado, no se podrán cargar ni editar ventas, compras o gastos de ese mes.`, { title: "Cerrar período", confirmLabel: "Cerrar período", danger: true })) return;
    setGuardando(true);
    try {
      await cerrarPeriodo({
        mes, cerrado: true,
        cerradoPor: usuarioActivo?.nombre || "—",
        fechaCierre: today(),
        reabiertoPor: null, fechaReapertura: null,
        resumen: { totalVentas, totalCompras, totalGastos, ivaDebito, ivaCredito, saldoIva, resultadoBruto },
      });
      toast(`Período ${mesLabel(mes)} cerrado.`, "success");
    } catch (err) {
      toast(`No se pudo cerrar el período: ${err.message}`, "error");
    } finally {
      setGuardando(false);
    }
  };

  const handleReabrirPeriodo = async () => {
    if (!await confirm(`¿Reabrir el período ${mesLabel(mes)}? Se volverán a permitir cargas y ediciones de ese mes.`, { title: "Reabrir período", confirmLabel: "Reabrir" })) return;
    setGuardando(true);
    try {
      await reabrirPeriodo(mes, { reabiertoPor: usuarioActivo?.nombre || "—", fechaReapertura: today() });
      toast(`Período ${mesLabel(mes)} reabierto.`, "success");
    } catch (err) {
      toast(`No se pudo reabrir el período: ${err.message}`, "error");
    } finally {
      setGuardando(false);
    }
  };

  const historial = [...(periodosCerrados || [])].sort((a, b) => b.mes.localeCompare(a.mes));

  return (
    <div>
      <div className="card" style={{ marginBottom:16 }}>
        <div style={{ display:"flex", alignItems:"flex-end", gap:14, flexWrap:"wrap" }}>
          <div className="form-group" style={{ flex:"0 0 200px" }}>
            <label className="form-label">Período</label>
            <input className="form-input" type="month" value={mes} onChange={e=>setMes(e.target.value)}/>
          </div>
          <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:10 }}>
            <button className="btn btn-sm btn-ghost" onClick={() => setMesDetalle(mes)}>
              <Icon name="search" size={13}/> Ver detalle completo
            </button>
            {cerrado ? (
              <>
                <span style={{ display:"inline-flex", alignItems:"center", gap:6, fontSize:12, padding:"5px 12px", borderRadius:6, background:"rgba(62,207,142,0.1)", color:"var(--green)", border:"1px solid rgba(62,207,142,0.25)" }}>
                  <Icon name="lock" size={13}/> Cerrado por {periodoActual.cerradoPor} · {fmtFechaAR(periodoActual.fechaCierre)}
                </span>
                {permisos?.[usuarioActivo?.id]?.reabrirPeriodo && (
                  <button className="btn btn-sm" disabled={guardando} onClick={handleReabrirPeriodo}>
                    <Icon name="unlock" size={13}/> Reabrir período
                  </button>
                )}
              </>
            ) : (
              <button className="btn btn-danger btn-sm" disabled={guardando} onClick={handleCerrarPeriodo}>
                <Icon name="lock" size={13}/> Cerrar {mesLabel(mes)}
              </button>
            )}
          </div>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14, marginBottom:16 }}>
        <div className="metric-card"><div className="metric-label">Ventas del período</div><div className="metric-value" style={{ color:"var(--green)" }}>{fmt(totalVentas)}</div></div>
        <div className="metric-card"><div className="metric-label">Compras del período</div><div className="metric-value" style={{ color:"var(--amber)" }}>{fmt(totalCompras)}</div></div>
        <div className="metric-card"><div className="metric-label">Gastos del período</div><div className="metric-value" style={{ color:"var(--red)" }}>{fmt(totalGastos)}</div></div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16, alignItems:"start" }}>
        <div className="card" style={{ margin:0 }}>
          <div className="card-title" style={{ marginBottom:12 }}>IVA discriminado</div>
          <div className="total-line sub"><span>IVA Débito (ventas)</span><span style={{ color:"var(--blue)" }}>{fmt(ivaDebito)}</span></div>
          <div className="total-line sub"><span>IVA Crédito (compras)</span><span style={{ color:"var(--green)" }}>{fmt(ivaCredito)}</span></div>
          <div style={{ height:1, background:"var(--border)", margin:"8px 0" }}/>
          <div className="total-line" style={{ fontWeight:700 }}>
            <span>{saldoIva >= 0 ? "Saldo a pagar" : "Saldo a favor"}</span>
            <span style={{ color: saldoIva >= 0 ? "var(--red)" : "var(--green)" }}>{fmt(Math.abs(saldoIva))}</span>
          </div>
        </div>
        <div className="card" style={{ margin:0 }}>
          <div className="card-title" style={{ marginBottom:12 }}>Resultado bruto</div>
          <div className="total-line sub"><span>Ventas</span><span style={{ color:"var(--green)" }}>+{fmt(totalVentas)}</span></div>
          <div className="total-line sub"><span>Compras</span><span style={{ color:"var(--red)" }}>−{fmt(totalCompras)}</span></div>
          <div className="total-line sub"><span>Gastos</span><span style={{ color:"var(--red)" }}>−{fmt(totalGastos)}</span></div>
          <div style={{ height:1, background:"var(--border)", margin:"8px 0" }}/>
          <div className="total-line" style={{ fontWeight:700 }}>
            <span>{resultadoBruto >= 0 ? "Ganancia" : "Pérdida"}</span>
            <span style={{ color: resultadoBruto >= 0 ? "var(--green)" : "var(--red)" }}>{fmt(Math.abs(resultadoBruto))}</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom:12 }}>Historial de cierres</div>
        {historial.length === 0 ? (
          <div style={{ padding:"28px 0", textAlign:"center", fontSize:13, color:"var(--text3)" }}>Sin períodos cerrados todavía</div>
        ) : (
          <div style={{ background:"var(--bg3)", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden" }}>
            {historial.map(p => (
              <div key={p.mes} style={{ display:"flex", alignItems:"center", padding:"10px 14px", borderBottom:"1px solid var(--border)", gap:10 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:"var(--text1)" }}>{mesLabel(p.mes)}</div>
                  <div style={{ fontSize:11, color:"var(--text3)", marginTop:2 }}>
                    Cerrado por {p.cerradoPor} · {fmtFechaAR(p.fechaCierre)}
                    {p.reabiertoPor && <> · Reabierto por {p.reabiertoPor} · {fmtFechaAR(p.fechaReapertura)}</>}
                  </div>
                </div>
                <span style={{ fontSize:10, padding:"2px 8px", borderRadius:4, background: p.cerrado ? "rgba(62,207,142,0.1)" : "rgba(245,158,11,0.12)", color: p.cerrado ? "var(--green)" : "var(--amber)", border:`1px solid ${p.cerrado ? "rgba(62,207,142,0.25)" : "rgba(245,158,11,0.3)"}` }}>
                  {p.cerrado ? "Cerrado" : "Reabierto"}
                </span>
                <button className="btn btn-sm btn-ghost" onClick={() => setMesDetalle(p.mes)} title="Ver detalle del período">
                  <Icon name="search" size={13}/>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {mesDetalle && (
        <ModalDetallePeriodo
          mes={mesDetalle}
          ventas={ventas}
          compras={compras}
          gastos={gastos}
          cargarRetirosRango={cargarRetirosRango}
          onClose={() => setMesDetalle(null)}
        />
      )}
    </div>
  );
}

function BloqueFormaPago({ titulo, filas, vacio }) {
  return (
    <div>
      <div className="card-title" style={{ marginBottom:8, fontSize:12 }}>{titulo}</div>
      <div style={{ background:"var(--bg3)", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden" }}>
        {filas.length > 0 ? filas.map((r, i) => (
          <div key={i} className="total-line sub" style={{ padding:"7px 12px" }}>
            <span>{r.forma}</span><span style={{ fontFamily:"var(--font-mono)" }}>{fmt(r.monto)}</span>
          </div>
        )) : <div style={{ padding:"12px", fontSize:12, color:"var(--text3)" }}>{vacio}</div>}
      </div>
    </div>
  );
}

// ─── Modal: detalle completo de un período (ventas/compras/gastos por forma
// de pago + desglose de retiros) — se usa tanto para el mes seleccionado
// (antes de cerrarlo) como para cualquier mes ya cerrado del historial.
function ModalDetallePeriodo({ mes, ventas, compras, gastos, cargarRetirosRango, onClose }) {
  const { toast } = useToast();
  const [retiros, setRetiros] = useState([]);
  const [loadingRetiros, setLoadingRetiros] = useState(true);

  const desde = `${mes}-01`;
  const hasta = useMemo(() => {
    const [y, m] = mes.split("-").map(Number);
    return `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
  }, [mes]);

  useEffect(() => {
    let cancelado = false;
    setLoadingRetiros(true);
    cargarRetirosRango(desde, hasta)
      .then(r => { if (!cancelado) setRetiros(r); })
      .catch(err => { if (!cancelado) toast(err.message || "No se pudieron cargar los retiros del período", "error"); })
      .finally(() => { if (!cancelado) setLoadingRetiros(false); });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta]);

  const ventasMes  = (ventas  || []).filter(v => v.fecha.slice(0, 7) === mes && v.estado !== "anulada");
  const comprasMes = (compras || []).filter(c => c.fecha.slice(0, 7) === mes && c.estado !== "anulada");
  const gastosMes  = (gastos  || []).filter(g => g.fecha.slice(0, 7) === mes && g.estado !== "anulado");

  const ventasPorForma = FORMAS_PAGO
    .map(f => ({ forma: f, monto: totalPorFormaPago(ventasMes, f) }))
    .filter(r => r.monto > 0);
  const totalVentas = ventasPorForma.reduce((a, r) => a + r.monto, 0);

  const agruparPorFormaPago = (lista, campoMonto) => {
    const grupos = {};
    lista.forEach(item => { grupos[item.formaPago] = (grupos[item.formaPago] || 0) + (item[campoMonto] || 0); });
    return Object.entries(grupos).map(([forma, monto]) => ({ forma, monto })).filter(r => r.monto > 0);
  };
  const comprasPorForma = agruparPorFormaPago(comprasMes, "total");
  const totalCompras = comprasPorForma.reduce((a, r) => a + r.monto, 0);
  const gastosPorForma = agruparPorFormaPago(gastosMes, "monto");
  const totalGastos = gastosPorForma.reduce((a, r) => a + r.monto, 0);

  const totalRetiros = retiros.reduce((a, r) => a + (r.monto || 0), 0);
  const retirosPorMedio = useMemo(() => {
    const grupos = {};
    retiros.forEach(r => {
      const medio = r.medio || "Efectivo";
      grupos[medio] = (grupos[medio] || 0) + (r.monto || 0);
    });
    return Object.entries(grupos).map(([medio, monto]) => ({ medio, monto }));
  }, [retiros]);

  return (
    <Modal onClose={onClose} size="modal-lg">
      <div className="modal-header">
        <div className="modal-title">Detalle del período — {mesLabel(mes)}</div>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      <div style={{ padding:"20px 24px", maxHeight:"72vh", overflowY:"auto", display:"flex", flexDirection:"column", gap:16 }}>

        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
          <div className="metric-card"><div className="metric-label">Ventas</div><div className="metric-value" style={{ color:"var(--green)" }}>{fmt(totalVentas)}</div></div>
          <div className="metric-card"><div className="metric-label">Compras</div><div className="metric-value" style={{ color:"var(--amber)" }}>{fmt(totalCompras)}</div></div>
          <div className="metric-card"><div className="metric-label">Gastos</div><div className="metric-value" style={{ color:"var(--red)" }}>{fmt(totalGastos)}</div></div>
          <div className="metric-card"><div className="metric-label">Retiros</div><div className="metric-value" style={{ color:"var(--red)" }}>{fmt(totalRetiros)}</div></div>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
          <BloqueFormaPago titulo="Ventas por forma de pago" filas={ventasPorForma} vacio="Sin ventas en el período" />
          <BloqueFormaPago titulo="Compras por forma de pago" filas={comprasPorForma} vacio="Sin compras en el período" />
        </div>

        <BloqueFormaPago titulo="Gastos por forma de pago" filas={gastosPorForma} vacio="Sin gastos en el período" />

        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            <div className="card-title" style={{ margin:0, fontSize:12 }}>Retiros del período ({retiros.length})</div>
            {retirosPorMedio.length > 0 && (
              <div style={{ display:"flex", gap:10, fontSize:11, color:"var(--text3)" }}>
                {retirosPorMedio.map((r, i) => (
                  <span key={i}>{r.medio}: <strong style={{ color:"var(--text1)" }}>{fmt(r.monto)}</strong></span>
                ))}
              </div>
            )}
          </div>
          <div style={{ background:"var(--bg3)", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden" }}>
            {loadingRetiros ? (
              <div style={{ padding:"16px", textAlign:"center", fontSize:12, color:"var(--text3)" }}>Cargando retiros...</div>
            ) : retiros.length === 0 ? (
              <div style={{ padding:"16px", textAlign:"center", fontSize:12, color:"var(--text3)" }}>Sin retiros en este período</div>
            ) : (
              <>
                {retiros.map(r => (
                  <div key={r.id} style={{ display:"flex", alignItems:"center", padding:"8px 12px", borderBottom:"1px solid var(--border)", gap:8, fontSize:12 }}>
                    <span style={{ color:"var(--text3)", minWidth:70, flexShrink:0 }}>{fmtFechaAR(r.fecha)}</span>
                    <span style={{ padding:"1px 7px", borderRadius:4, fontSize:10, fontWeight:700, flexShrink:0,
                      background: r.medio === "Transferencia" ? "rgba(96,165,250,0.12)" : "rgba(62,207,142,0.12)",
                      color: r.medio === "Transferencia" ? "var(--blue)" : "var(--green)" }}>
                      {r.medio}
                    </span>
                    <span style={{ flex:1, minWidth:0, color:"var(--text2)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.motivo}</span>
                    <span style={{ color:"var(--text3)", fontSize:11, flexShrink:0 }}>{r.usuario}</span>
                    <span style={{ fontFamily:"var(--font-mono)", fontWeight:600, color:"var(--red)", flexShrink:0 }}>−{fmt(r.monto)}</span>
                  </div>
                ))}
                <div style={{ display:"flex", justifyContent:"space-between", padding:"8px 12px", background:"var(--bg4)", borderTop:"2px solid var(--border2)" }}>
                  <span style={{ fontSize:12, fontWeight:700, color:"var(--text1)" }}>Total retiros</span>
                  <span style={{ fontFamily:"var(--font-mono)", fontWeight:700, color:"var(--red)" }}>−{fmt(totalRetiros)}</span>
                </div>
              </>
            )}
          </div>
        </div>

      </div>

      <div className="modal-footer">
        <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
      </div>
    </Modal>
  );
}

// ─── Reportes: HTML imprimible ────────────────────────────────────────────────
function buildEstadoResultadosHTML({ periodoLabel, ventasNetas, montoAnulado, cantAnuladas, cmvPorRubro, cmvTotal, resultadoBruto, margenBruto, gastosPorCuenta, totalGastos, resultadoNeto, margenNeto }) {
  const filasRubro = cmvPorRubro.map(r => {
    const mg = r.ingresos > 0 ? ((r.ingresos - r.cmv) / r.ingresos * 100) : 0;
    return `<tr><td>${r.rubro}</td><td class="num">${r.qty}</td><td class="num">${arMoney(r.ingresos)}</td><td class="num">${arMoney(r.cmv)}</td><td class="num">${mg.toFixed(1)}%</td></tr>`;
  }).join("") || `<tr><td colspan="5">Sin datos de ventas en el período</td></tr>`;
  const filasGastos = gastosPorCuenta.map(g => `<tr><td>${g.nombre}</td><td class="num">${arMoney(g.total)}</td></tr>`).join("")
    || `<tr><td colspan="2">Sin gastos registrados en el período</td></tr>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Estado de Resultados — ${periodoLabel}</title>
<style>${REPORTE_ESTILOS}</style></head><body>
<h2>Estado de Resultados</h2>
<p class="sub">Período: ${periodoLabel} &nbsp;·&nbsp; Generado: ${generadoEl()}</p>

<h3>Ingresos y CMV por rubro</h3>
<table>
  <thead><tr><th>Rubro</th><th class="num">Cant.</th><th class="num">Ingresos</th><th class="num">CMV</th><th class="num">Margen</th></tr></thead>
  <tbody>${filasRubro}</tbody>
</table>

<h3>Gastos por cuenta</h3>
<table>
  <thead><tr><th>Cuenta</th><th class="num">Total</th></tr></thead>
  <tbody>${filasGastos}<tr class="total"><td>Total gastos</td><td class="num">${arMoney(totalGastos)}</td></tr></tbody>
</table>

<h3>Resumen</h3>
<table>
  <tbody>
    <tr><td>Ventas netas${montoAnulado > 0 ? ` (${cantAnuladas} anuladas, ${arMoney(montoAnulado)}, excluidas)` : ""}</td><td class="num pos">${arMoney(ventasNetas)}</td></tr>
    <tr><td>− CMV</td><td class="num neg">${arMoney(cmvTotal)}</td></tr>
    <tr class="total"><td>= Resultado bruto (margen ${margenBruto.toFixed(1)}%)</td><td class="num">${arMoney(resultadoBruto)}</td></tr>
    <tr><td>− Gastos</td><td class="num neg">${arMoney(totalGastos)}</td></tr>
    <tr class="total"><td>= Resultado neto (margen ${margenNeto.toFixed(1)}%)</td><td class="num ${resultadoNeto >= 0 ? "pos" : "neg"}">${arMoney(resultadoNeto)}</td></tr>
  </tbody>
</table>
<div class="footer">PECO S. — Sistema de Gestión Comercial</div>
</body></html>`;
}

function buildBalanceGeneralHTML({ activoItems, totalActivo, pasivoItems, totalPasivo, patrimonioNeto }) {
  const filasActivo  = activoItems.map(i => `<tr><td>${i.label}</td><td class="num">${arMoney(i.valor)}</td></tr>`).join("");
  const filasPasivo  = pasivoItems.map(i => `<tr><td>${i.label}</td><td class="num">${arMoney(i.valor)}</td></tr>`).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Balance General</title>
<style>${REPORTE_ESTILOS}</style></head><body>
<h2>Balance General</h2>
<p class="sub">Al día de la fecha &nbsp;·&nbsp; Generado: ${generadoEl()}</p>

<h3>Activo</h3>
<table>
  <tbody>${filasActivo}<tr class="total"><td>Total Activo</td><td class="num">${arMoney(totalActivo)}</td></tr></tbody>
</table>

<h3>Pasivo</h3>
<table>
  <tbody>${filasPasivo}<tr class="total"><td>Total Pasivo</td><td class="num">${arMoney(totalPasivo)}</td></tr></tbody>
</table>

<h3>Patrimonio Neto</h3>
<table>
  <tbody><tr class="total"><td>Patrimonio Neto (Activo − Pasivo)</td><td class="num ${patrimonioNeto >= 0 ? "pos" : "neg"}">${arMoney(patrimonioNeto)}</td></tr></tbody>
</table>
<div class="footer">PECO S. — Sistema de Gestión Comercial</div>
</body></html>`;
}

// ─── Resumen General ───────────────────────────────────────────────────────────
// Vista de un vistazo para quien no maneja contabilidad: cuánto entró (y por qué
// medio), cuánto se gastó/retiró, y qué se compró en el período — sin libros
// diarios ni plan de cuentas de por medio.
function TabResumenGeneral({ ventas = [], gastos = [], compras = [], tesoreria = [], recibos = [], planCuentas = [] }) {
  const primerDia = today().slice(0, 7) + "-01";
  const [modo, setModo] = useState("mes");
  const [mes, setMes]   = useState(today().slice(0, 7));
  const [desde, setDesde] = useState(primerDia);
  const [hasta, setHasta] = useState(today());

  const fechaDesde = modo === "mes" ? `${mes}-01` : desde;
  const fechaHasta = useMemo(() => {
    if (modo !== "mes") return hasta;
    const [y, m] = mes.split("-").map(Number);
    return `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
  }, [modo, mes, hasta]);

  const enRango = (f) => f >= fechaDesde && f <= fechaHasta;

  const ctaMap = useMemo(() => {
    const m = {};
    (planCuentas || []).forEach(c => { m[c.id] = c; });
    return m;
  }, [planCuentas]);

  // ── Ingresos: ventas cobradas (todo menos cta. cte.) + cobros de cta. cte. ──
  const ventasPeriodo  = useMemo(() => (ventas || []).filter(v => v.estado !== "anulada" && enRango(v.fecha)), [ventas, fechaDesde, fechaHasta]);
  const recibosPeriodo = useMemo(() => (recibos || []).filter(r => r.tipo === "Recibo" && r.estado !== "anulada" && enRango(r.fecha)), [recibos, fechaDesde, fechaHasta]);

  const medios = FORMAS_PAGO.filter(f => f !== "Cuenta Corriente");
  const ingresosPorMedio = useMemo(() => {
    return medios
      .map(medio => ({
        medio,
        monto: totalPorFormaPago(ventasPeriodo, medio) + recibosPeriodo.filter(r => r.formaPago === medio).reduce((a, r) => a + r.monto, 0),
      }))
      .filter(m => m.monto > 0)
      .sort((a, b) => b.monto - a.monto);
  }, [ventasPeriodo, recibosPeriodo]);

  const totalIngresos     = ingresosPorMedio.reduce((a, m) => a + m.monto, 0);
  const totalVentasCtaCte = totalPorFormaPago(ventasPeriodo, "Cuenta Corriente");

  // ── Gastos ──
  const gastosPeriodo = useMemo(() => (gastos || []).filter(g => g.estado !== "anulado" && enRango(g.fecha)), [gastos, fechaDesde, fechaHasta]);
  const totalGastos   = gastosPeriodo.reduce((a, g) => a + g.monto, 0);
  const gastosPorCuenta = useMemo(() => {
    const filas = {};
    gastosPeriodo.forEach(g => {
      const key = g.cuentaId || "sin_cuenta";
      const cta = ctaMap[key] || { nombre: "Sin clasificar" };
      if (!filas[key]) filas[key] = { nombre: cta.nombre, total: 0, cant: 0 };
      filas[key].total += g.monto || 0;
      filas[key].cant  += 1;
    });
    return Object.values(filas).sort((a, b) => b.total - a.total);
  }, [gastosPeriodo, ctaMap]);

  // ── Retiros de Tesorería (mover plata, no gasto) ──
  const retirosPeriodo = useMemo(() => (tesoreria || []).filter(t => t.tipo === "Retiro" && enRango(t.fecha)), [tesoreria, fechaDesde, fechaHasta]);
  const totalRetiros   = retirosPeriodo.reduce((a, t) => a + t.monto, 0);

  // ── Compras a proveedores ──
  const comprasPeriodo = useMemo(() => (compras || []).filter(c => c.estado !== "anulada" && enRango(c.fecha)), [compras, fechaDesde, fechaHasta]);
  const totalCompras   = comprasPeriodo.reduce((a, c) => a + c.total, 0);

  const proveedoresTop = useMemo(() => {
    const m = {};
    comprasPeriodo.forEach(c => {
      const key = c.proveedor || "Sin proveedor";
      if (!m[key]) m[key] = { proveedor: key, total: 0, cant: 0 };
      m[key].total += c.total || 0;
      m[key].cant  += 1;
    });
    return Object.values(m).sort((a, b) => b.total - a.total).slice(0, 6);
  }, [comprasPeriodo]);

  const productosTop = useMemo(() => {
    const m = {};
    comprasPeriodo.forEach(c => (c.items || []).forEach(it => {
      if (!m[it.nombre]) m[it.nombre] = { nombre: it.nombre, qty: 0, monto: 0 };
      m[it.nombre].qty   += it.qty || 0;
      m[it.nombre].monto += (it.costo || 0) * (it.qty || 0);
    }));
    return Object.values(m).sort((a, b) => b.monto - a.monto).slice(0, 6);
  }, [comprasPeriodo]);

  const resultado = totalIngresos - totalGastos;
  const colorRes  = v => v >= 0 ? "var(--green)" : "var(--red)";
  const periodoLabel = modo === "mes" ? mesLabel(mes) : `${fmtFechaAR(fechaDesde)} al ${fmtFechaAR(fechaHasta)}`;

  const handleExportExcel = () => {
    descargarExcel([
      { nombre: "Resumen", filas: [
        { Concepto: "Total ingresado",   Monto: Math.round(totalIngresos) },
        { Concepto: "Total gastado",     Monto: -Math.round(totalGastos) },
        { Concepto: "Retiros de caja",   Monto: -Math.round(totalRetiros) },
        { Concepto: "Resultado (ingresado - gastado)", Monto: Math.round(resultado) },
        { Concepto: "Total comprado a proveedores",    Monto: Math.round(totalCompras) },
        { Concepto: "Ventas a cta. cte. sin cobrar todavía", Monto: Math.round(totalVentasCtaCte) },
      ] },
      { nombre: "Ingresos por medio de pago", filas: ingresosPorMedio.map(m => ({ Medio: m.medio, Monto: Math.round(m.monto) })) },
      { nombre: "Gastos por categoría",       filas: gastosPorCuenta.map(g => ({ Categoría: g.nombre, Cantidad: g.cant, Monto: Math.round(g.total) })) },
      { nombre: "Compras por proveedor",      filas: proveedoresTop.map(p => ({ Proveedor: p.proveedor, Cantidad: p.cant, Monto: Math.round(p.total) })) },
      { nombre: "Compras por producto",       filas: productosTop.map(p => ({ Producto: p.nombre, Cantidad: p.qty, Monto: Math.round(p.monto) })) },
    ], `resumen-tesoreria_${today()}.xlsx`);
  };

  return (
    <div>
      {/* ── Selector de período ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
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
          <button className="btn btn-sm btn-ghost" style={{ marginLeft: "auto" }} onClick={handleExportExcel} title="Exportar a Excel">
            <Icon name="download" size={13}/> Excel
          </button>
        </div>
      </div>

      <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 12 }}>
        Período: <strong style={{ color: "var(--text2)" }}>{periodoLabel}</strong>
      </div>

      {/* ── KPIs ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
        {[
          { label: "Total ingresado",   valor: totalIngresos, color: "var(--green)",      desc: "Ventas cobradas (todos los medios) + cobros de cta. cte.",
            detalle: "Suma lo cobrado en el momento de cada venta (Efectivo, Transferencia, Tarjetas, Cheque) más los recibos de cuenta corriente cobrados en el período. No incluye ventas anuladas ni la parte de ventas dejada a cuenta corriente sin cobrar todavía." },
          { label: "Total gastado",     valor: totalGastos,   color: "var(--red)",        desc: `${gastosPeriodo.length} gasto${gastosPeriodo.length !== 1 ? "s" : ""} registrado${gastosPeriodo.length !== 1 ? "s" : ""} en Gastos`,
            detalle: "Suma los gastos cargados en el módulo Gastos con fecha dentro del período, sin contar los anulados. No incluye retiros de Tesorería ni compras a proveedores." },
          { label: "Retiros de caja",   valor: totalRetiros,  color: "var(--amber)",      desc: `${retirosPeriodo.length} retiro${retirosPeriodo.length !== 1 ? "s" : ""} de Tesorería`,
            detalle: "Plata que salió de Tesorería como retiro (por ejemplo, para el dueño o para depositar). No es un gasto: el dinero no se consumió, solo cambió de lugar." },
          { label: "Resultado",         valor: resultado,     color: colorRes(resultado), desc: "Total ingresado menos total gastado",
            detalle: "Total ingresado − Total gastado. Los retiros de caja no se restan acá porque no son un gasto." },
        ].map(({ label, valor, color, desc, detalle }) => (
          <div key={label} title={detalle} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "14px 16px", cursor: "help" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>{label}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color }}>{fmt(Math.abs(valor))}</div>
            <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 3 }}>{desc}</div>
          </div>
        ))}
      </div>

      {totalVentasCtaCte > 0 && (
        <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "var(--text2)" }}>
          Además se vendió {fmt(totalVentasCtaCte)} a cuenta corriente en este período — no está en "Total ingresado" porque todavía no se cobró.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* Ingresos por medio de pago */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 2 }}>Ingresos por medio de pago</div>
          <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 14 }}>
            Lo cobrado en ventas de contado + los recibos de cta. cte. cobrados en el período, agrupado por cómo pagó el cliente.
          </div>
          {ingresosPorMedio.length === 0 ? (
            <div style={{ padding: "20px 0", textAlign: "center", fontSize: 13, color: "var(--text3)" }}>Sin ingresos en el período</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {ingresosPorMedio.map(m => {
                const pct = totalIngresos > 0 ? (m.monto / totalIngresos * 100) : 0;
                return (
                  <div key={m.medio}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                      <span style={{ color: "var(--text2)" }}>{m.medio}</span>
                      <span style={{ fontWeight: 600, color: "var(--text1)", fontFamily: "var(--font-mono)" }}>
                        {fmt(m.monto)} <span style={{ color: "var(--text3)", fontWeight: 400 }}>({pct.toFixed(0)}%)</span>
                      </span>
                    </div>
                    <div style={{ height: 6, background: "var(--bg3)", borderRadius: 99, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: "var(--green)", borderRadius: 99 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Gastos por categoría */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 2 }}>Gastos por categoría</div>
          <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 14 }}>
            Gastos cargados en el módulo Gastos durante el período, agrupados por categoría. No incluye anulados ni retiros.
          </div>
          {gastosPorCuenta.length === 0 ? (
            <div style={{ padding: "20px 0", textAlign: "center", fontSize: 13, color: "var(--text3)" }}>Sin gastos en el período</div>
          ) : (
            <div style={{ background: "var(--bg3)", borderRadius: 8, overflow: "hidden" }}>
              {gastosPorCuenta.map((g, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderBottom: i < gastosPorCuenta.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <div>
                    <div style={{ fontSize: 13, color: "var(--text1)" }}>{g.nombre}</div>
                    <div style={{ fontSize: 11, color: "var(--text3)" }}>{g.cant} gasto{g.cant !== 1 ? "s" : ""}</div>
                  </div>
                  <span style={{ fontWeight: 600, color: "var(--red)", fontFamily: "var(--font-mono)" }}>{fmt(g.total)}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "var(--bg4)", fontWeight: 700 }}>
                <span style={{ fontSize: 12, color: "var(--text2)" }}>Total</span>
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--red)" }}>{fmt(totalGastos)}</span>
              </div>
            </div>
          )}
          {retirosPeriodo.length > 0 && (
            <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "rgba(245,158,11,0.08)", borderRadius: 6, fontSize: 11, color: "var(--text3)" }}>
              <span>+ {retirosPeriodo.length} retiro{retirosPeriodo.length !== 1 ? "s" : ""} de Tesorería (no es gasto, es dinero retirado)</span>
              <strong style={{ color: "var(--amber)" }}>{fmt(totalRetiros)}</strong>
            </div>
          )}
        </div>
      </div>

      {/* Compras */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 2 }}>Compras a proveedores</div>
        <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 14 }}>
          Mercadería comprada en el período (no incluye anuladas). Es stock que entra al negocio, no un gasto — se paga aparte según la forma de pago de cada compra.
        </div>
        <div style={{ display: "flex", gap: 24, marginBottom: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 10, color: "var(--text3)", textTransform: "uppercase", fontWeight: 600 }}>Total comprado</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text1)", fontFamily: "var(--font-mono)" }}>{fmt(totalCompras)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "var(--text3)", textTransform: "uppercase", fontWeight: 600 }}>Cantidad de compras</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text1)" }}>{comprasPeriodo.length}</div>
          </div>
        </div>

        {comprasPeriodo.length === 0 ? (
          <div style={{ padding: "20px 0", textAlign: "center", fontSize: 13, color: "var(--text3)" }}>Sin compras en el período</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>Por proveedor</div>
              <div style={{ background: "var(--bg3)", borderRadius: 8, overflow: "hidden" }}>
                {proveedoresTop.map((p, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 12px", borderBottom: i < proveedoresTop.length - 1 ? "1px solid var(--border)" : "none", fontSize: 12 }}>
                    <span style={{ color: "var(--text2)" }}>{p.proveedor} <span style={{ color: "var(--text3)" }}>({p.cant})</span></span>
                    <span style={{ fontWeight: 600, fontFamily: "var(--font-mono)" }}>{fmt(p.total)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>Qué se compró (top productos)</div>
              <div style={{ background: "var(--bg3)", borderRadius: 8, overflow: "hidden" }}>
                {productosTop.length === 0 ? (
                  <div style={{ padding: 12, fontSize: 12, color: "var(--text3)" }}>Sin detalle de productos</div>
                ) : productosTop.map((p, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 12px", borderBottom: i < productosTop.length - 1 ? "1px solid var(--border)" : "none", fontSize: 12 }}>
                    <span style={{ color: "var(--text2)" }}>{p.nombre} <span style={{ color: "var(--text3)" }}>x{p.qty}</span></span>
                    <span style={{ fontWeight: 600, fontFamily: "var(--font-mono)" }}>{fmt(p.monto)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Estado de Resultados Operativo ──────────────────────────────────────────
function TabEstadoResultados({ ventas = [], gastos = [], productos = [], planCuentas = [] }) {
  const primerDia = today().slice(0, 7) + "-01";
  const [modo, setModo]         = useState("mes");
  const [mes, setMes]           = useState(today().slice(0, 7));
  const [desde, setDesde]       = useState(primerDia);
  const [hasta, setHasta]       = useState(today());
  const [showTrend, setShowTrend] = useState(false);

  const fechaDesde = modo === "mes" ? `${mes}-01` : desde;
  const fechaHasta = useMemo(() => {
    if (modo !== "mes") return hasta;
    const [y, m] = mes.split("-").map(Number);
    return `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
  }, [modo, mes, hasta]);

  const costoMap = useMemo(() => {
    const m = {};
    productos.forEach(p => { if (p.nombre) m[p.nombre] = p; });
    return m;
  }, [productos]);

  const ctaMap = useMemo(() => {
    const m = {};
    planCuentas.forEach(c => { m[c.id] = c; });
    return m;
  }, [planCuentas]);

  const ventasEnRango = useMemo(() =>
    ventas.filter(v => v.estado !== "anulada" && v.fecha >= fechaDesde && v.fecha <= fechaHasta),
    [ventas, fechaDesde, fechaHasta]
  );
  const anulacionesEnRango = useMemo(() =>
    ventas.filter(v => v.estado === "anulada" && v.fecha >= fechaDesde && v.fecha <= fechaHasta),
    [ventas, fechaDesde, fechaHasta]
  );
  const ventasNetas  = ventasEnRango.reduce((s, v) => s + (v.total || 0), 0);
  const montoAnulado = anulacionesEnRango.reduce((s, v) => s + (v.total || 0), 0);

  const { cmvPorRubro, cmvTotal } = useMemo(() => {
    const byRubro = {};
    ventasEnRango.forEach(v => {
      (v.items || []).forEach(item => {
        const prod  = costoMap[item.nombre];
        const rubro = prod?.rubro || prod?.categoria || "Sin clasificar";
        if (!byRubro[rubro]) byRubro[rubro] = { rubro, cmv: 0, ingresos: 0, qty: 0 };
        byRubro[rubro].cmv      += (prod?.costo || 0) * (item.qty || 0);
        byRubro[rubro].ingresos += (item.precio || 0) * (item.qty || 0);
        byRubro[rubro].qty      += item.qty || 0;
      });
    });
    const filas = Object.values(byRubro).sort((a, b) => b.ingresos - a.ingresos);
    return { cmvPorRubro: filas, cmvTotal: filas.reduce((s, r) => s + r.cmv, 0) };
  }, [ventasEnRango, costoMap]);

  const resultadoBruto = ventasNetas - cmvTotal;
  const margenBruto    = ventasNetas > 0 ? (resultadoBruto / ventasNetas * 100) : 0;

  const { gastosPorCuenta, totalGastos } = useMemo(() => {
    const filas = {};
    gastos
      .filter(g => g.estado !== "anulado" && g.fecha >= fechaDesde && g.fecha <= fechaHasta)
      .forEach(g => {
        const key = g.cuentaId || "sin_cuenta";
        const cta = ctaMap[key] || { nombre: "Sin clasificar" };
        if (!filas[key]) filas[key] = { cuentaId: key, nombre: cta.nombre, total: 0 };
        filas[key].total += g.monto || 0;
      });
    const arr = Object.values(filas).sort((a, b) => b.total - a.total);
    return { gastosPorCuenta: arr, totalGastos: arr.reduce((s, r) => s + r.total, 0) };
  }, [gastos, fechaDesde, fechaHasta, ctaMap]);

  const resultadoNeto = resultadoBruto - totalGastos;
  const margenNeto    = ventasNetas > 0 ? (resultadoNeto / ventasNetas * 100) : 0;

  const trend = useMemo(() => {
    const hoy = today();
    const [y0, m0] = hoy.slice(0, 7).split("-").map(Number);
    return Array.from({ length: 6 }, (_, i) => {
      let m = m0 - (5 - i), y = y0;
      while (m <= 0) { m += 12; y--; }
      const mesStr = `${y}-${String(m).padStart(2, "0")}`;
      const ultimo = new Date(y, m, 0).getDate();
      const d = `${mesStr}-01`;
      const h = `${mesStr}-${String(ultimo).padStart(2, "0")}`;
      const vs = ventas.filter(v => v.estado !== "anulada" && v.fecha >= d && v.fecha <= h);
      const vn = vs.reduce((s, v) => s + (v.total || 0), 0);
      let cmv = 0;
      vs.forEach(v => (v.items || []).forEach(item => {
        cmv += (costoMap[item.nombre]?.costo || 0) * (item.qty || 0);
      }));
      const tg = gastos
        .filter(g => g.estado !== "anulado" && g.fecha >= d && g.fecha <= h)
        .reduce((s, g) => s + (g.monto || 0), 0);
      const rb = vn - cmv;
      return { mes: mesStr, ventas: vn, cmv, gastos: tg, rb, resultado: rb - tg };
    });
  }, [ventas, gastos, costoMap]);

  const colorRes = v => v >= 0 ? "var(--green)" : "var(--red)";

  const periodoLabel = modo === "mes" ? mesLabel(mes) : `${fmtFechaAR(fechaDesde)} al ${fmtFechaAR(fechaHasta)}`;

  const datosReporte = () => ({
    periodoLabel, ventasNetas, montoAnulado, cantAnuladas: anulacionesEnRango.length,
    cmvPorRubro, cmvTotal, resultadoBruto, margenBruto, gastosPorCuenta, totalGastos, resultadoNeto, margenNeto,
  });
  const handlePrint = () => abrirReporteImpresion(buildEstadoResultadosHTML(datosReporte()));
  const handleExportHTML = () => descargarReporteHTML(buildEstadoResultadosHTML(datosReporte()), `estado-resultados_${today()}.html`);
  const handleExportExcel = () => {
    descargarExcel([
      { nombre: "Resumen", filas: [
        { Concepto: "Ventas netas", Monto: Math.round(ventasNetas) },
        { Concepto: "CMV", Monto: -Math.round(cmvTotal) },
        { Concepto: "Resultado bruto", Monto: Math.round(resultadoBruto) },
        { Concepto: "Gastos", Monto: -Math.round(totalGastos) },
        { Concepto: "Resultado neto", Monto: Math.round(resultadoNeto) },
      ] },
      { nombre: "CMV por rubro", filas: cmvPorRubro.map(r => ({ Rubro: r.rubro, Cantidad: r.qty, Ingresos: Math.round(r.ingresos), CMV: Math.round(r.cmv) })) },
      { nombre: "Gastos por cuenta", filas: gastosPorCuenta.map(g => ({ Cuenta: g.nombre, Total: Math.round(g.total) })) },
    ], `estado-resultados_${today()}.xlsx`);
  };

  return (
    <div>
      {/* ── Selector de período ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
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
          <button className={`btn btn-sm ${showTrend ? "btn-primary" : "btn-ghost"}`}
            style={{ marginLeft: "auto" }} onClick={() => setShowTrend(t => !t)}>
            Tendencia 6 meses
          </button>
          <button className="btn btn-sm btn-ghost" onClick={handleExportExcel} title="Exportar a Excel">
            <Icon name="download" size={13}/> Excel
          </button>
          <button className="btn btn-sm btn-ghost" onClick={handlePrint} title="Imprimir reporte">
            <Icon name="printer" size={13}/> Imprimir
          </button>
        </div>
      </div>

      {/* ── Métricas resumen ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
        {[
          { label: "Ventas netas",    valor: ventasNetas,    color: "var(--green)",           desc: `${ventasEnRango.length} venta${ventasEnRango.length !== 1 ? "s" : ""}` },
          { label: "CMV estimado",    valor: cmvTotal,       color: "var(--amber)",           desc: cmvTotal === 0 ? "Sin costos cargados" : `Mg. bruto ${margenBruto.toFixed(1)}%` },
          { label: "Resultado bruto", valor: resultadoBruto, color: colorRes(resultadoBruto), desc: `Margen ${margenBruto.toFixed(1)}%` },
          { label: "Resultado neto",  valor: resultadoNeto,  color: colorRes(resultadoNeto),  desc: `Margen ${margenNeto.toFixed(1)}%` },
        ].map(({ label, valor, color, desc }) => (
          <div key={label} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "14px 16px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>{label}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color }}>{fmt(Math.abs(valor))}</div>
            <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 3 }}>{desc}</div>
          </div>
        ))}
      </div>

      {/* ── Detalle ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* Ingresos y CMV */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 14 }}>Ingresos y CMV</div>
          <div style={{ background: "rgba(72,199,116,0.06)", border: "1px solid rgba(72,199,116,0.2)", borderRadius: 8, padding: "10px 14px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text1)" }}>Ventas netas</div>
              {montoAnulado > 0 && <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>{anulacionesEnRango.length} anuladas ({fmt(montoAnulado)}) excluidas</div>}
            </div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 700, color: "var(--green)" }}>{fmt(ventasNetas)}</span>
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>CMV por rubro</div>
          <div style={{ background: "var(--bg3)", borderRadius: 8, overflow: "hidden", marginBottom: 14 }}>
            {cmvPorRubro.length === 0 ? (
              <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--text3)" }}>Sin datos de ventas en el período</div>
            ) : (
              <>
                {cmvPorRubro.map(r => {
                  const mg = r.ingresos > 0 ? ((r.ingresos - r.cmv) / r.ingresos * 100) : 0;
                  return (
                    <div key={r.rubro} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px", borderBottom: "1px solid var(--border)" }}>
                      <div>
                        <span style={{ fontSize: 13, color: "var(--text2)", fontWeight: 500 }}>{r.rubro}</span>
                        <span style={{ marginLeft: 8, fontSize: 11, color: "var(--text3)" }}>{r.qty} u. · mg {mg.toFixed(0)}%</span>
                      </div>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--amber)" }}>−{fmt(r.cmv)}</span>
                    </div>
                  );
                })}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 14px", background: "var(--bg4)" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text1)" }}>CMV Total</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--amber)" }}>−{fmt(cmvTotal)}</span>
                </div>
              </>
            )}
          </div>
          <div style={{ background: resultadoBruto >= 0 ? "rgba(72,199,116,0.08)" : "rgba(242,107,91,0.08)", border: `1px solid ${resultadoBruto >= 0 ? "rgba(72,199,116,0.25)" : "rgba(242,107,91,0.25)"}`, borderRadius: 8, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Resultado bruto</div>
              <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>Margen bruto {margenBruto.toFixed(1)}%</div>
            </div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: colorRes(resultadoBruto) }}>{fmt(resultadoBruto)}</span>
          </div>
        </div>

        {/* Gastos y resultado neto */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 14 }}>Gastos y Resultado</div>
          <div style={{ background: "var(--bg3)", borderRadius: 8, overflow: "hidden", marginBottom: 14 }}>
            {gastosPorCuenta.length === 0 ? (
              <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--text3)" }}>Sin gastos registrados en el período</div>
            ) : (
              <>
                {gastosPorCuenta.map(r => (
                  <div key={r.cuentaId} style={{ display: "flex", justifyContent: "space-between", padding: "8px 14px", borderBottom: "1px solid var(--border)" }}>
                    <span style={{ fontSize: 13, color: "var(--text2)" }}>{r.nombre}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--red)" }}>−{fmt(r.total)}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 14px", background: "var(--bg4)" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text1)" }}>Total gastos</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--red)" }}>−{fmt(totalGastos)}</span>
                </div>
              </>
            )}
          </div>
          <div style={{ background: resultadoNeto >= 0 ? "rgba(72,199,116,0.08)" : "rgba(242,107,91,0.08)", border: `1px solid ${resultadoNeto >= 0 ? "rgba(72,199,116,0.25)" : "rgba(242,107,91,0.25)"}`, borderRadius: 8, padding: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text1)" }}>Resultado neto del período</div>
              <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>Margen {margenNeto.toFixed(1)}% · {resultadoNeto >= 0 ? "Ganancia" : "Pérdida"}</div>
            </div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, color: colorRes(resultadoNeto) }}>{fmt(resultadoNeto)}</span>
          </div>
          {/* Resumen waterfall */}
          <div style={{ background: "var(--bg3)", borderRadius: 8, padding: "12px 14px" }}>
            {[
              { label: "Ventas netas",      v: ventasNetas,    c: "var(--green)",           neg: false },
              { label: "− CMV",             v: cmvTotal,       c: "var(--amber)",           neg: true  },
              { label: "= Resultado bruto", v: resultadoBruto, c: colorRes(resultadoBruto), neg: resultadoBruto < 0, bold: true },
              { label: "− Gastos",          v: totalGastos,    c: "var(--red)",             neg: true  },
              { label: "= Resultado neto",  v: resultadoNeto,  c: colorRes(resultadoNeto),  neg: resultadoNeto < 0, bold: true },
            ].map(({ label, v, c, neg, bold }) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: `${bold ? 8 : 5}px 0`, borderTop: bold ? "1px solid var(--border2)" : undefined }}>
                <span style={{ fontSize: bold ? 13 : 12, fontWeight: bold ? 700 : 400, color: bold ? "var(--text1)" : "var(--text3)" }}>{label}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: bold ? 13 : 12, fontWeight: bold ? 700 : 400, color: c }}>{neg ? "−" : ""}{fmt(Math.abs(v))}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tendencia 6 meses ── */}
      {showTrend && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title" style={{ marginBottom: 14 }}>Tendencia — últimos 6 meses</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border2)" }}>
                  {["Mes", "Ventas netas", "CMV", "Resultado bruto", "Gastos", "Resultado neto"].map((h, i) => (
                    <th key={h} style={{ padding: "8px 12px", fontSize: 11, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".04em", textAlign: i > 0 ? "right" : "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trend.map(t => (
                  <tr key={t.mes} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "9px 12px", fontWeight: 600, color: "var(--text1)" }}>{mesLabel(t.mes)}</td>
                    <td style={{ padding: "9px 12px", textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--green)" }}>{fmt(t.ventas)}</td>
                    <td style={{ padding: "9px 12px", textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--amber)" }}>−{fmt(t.cmv)}</td>
                    <td style={{ padding: "9px 12px", textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 600, color: colorRes(t.rb) }}>{fmt(t.rb)}</td>
                    <td style={{ padding: "9px 12px", textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--red)" }}>−{fmt(t.gastos)}</td>
                    <td style={{ padding: "9px 12px", textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700, color: colorRes(t.resultado) }}>{fmt(t.resultado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ fontSize: 11, color: "var(--text3)", lineHeight: 1.6 }}>
        * CMV calculado usando el costo de carga vigente de cada producto. Si el costo fue modificado luego de la venta, el valor puede diferir del histórico real.
      </div>
    </div>
  );
}

// ─── Balance General ──────────────────────────────────────────────────────────
function TabBalanceGeneral({ tesoreria = [], gastos = [], cheques = [], clientes = [], proveedores = [], compras = [], ordenesPago = [], ventas = [], pagosCtaCte = [], cambiosArticulo = [], productos = [], nombres = { banco: "Banco", transferencia: "Cuenta Transferencia" } }) {
  // Mismo cálculo que TabCajaMayor.
  const { saldoCajaTesoreria, saldoBanco, saldoCtaTransf } = useMemo(() => {
    const s = calcularSaldosTesoreria(tesoreria, gastos, compras);
    return { saldoCajaTesoreria: s.efectivo, saldoBanco: s.banco, saldoCtaTransf: s.transferencia };
  }, [tesoreria, gastos, compras]);

  const cuentasPorCobrar = useMemo(() =>
    clientes.reduce((s, c) => s + calcularSaldoCtaCte(c.id, ventas, pagosCtaCte, cambiosArticulo), 0),
    [clientes, ventas, pagosCtaCte, cambiosArticulo]
  );

  const { chequesACobrar, chequesAPagar } = useMemo(() => {
    const enCartera = cheques.filter(c => c.estado === "en_cartera");
    return {
      chequesACobrar: enCartera.filter(c => c.tipo === "recibido").reduce((a, c) => a + c.monto, 0),
      chequesAPagar:  enCartera.filter(c => c.tipo === "emitido").reduce((a, c) => a + c.monto, 0),
    };
  }, [cheques]);

  const mercaderiaValorizada = useMemo(() =>
    productos
      .filter(p => p.activo !== false && (p.tipo || "simple") !== "madre")
      .reduce((s, p) => s + (p.costo || 0) * (p.stock || 0), 0),
    [productos]
  );

  const cuentasPorPagar = useMemo(() =>
    proveedores.reduce((s, prov) => {
      const facturas = compras.filter(c =>
        (c.proveedorId === prov.id || (!c.proveedorId && c.proveedor === prov.nombre)) &&
        c.formaPago === "Cuenta Corriente Proveedor" &&
        c.tipo === "Factura" &&
        c.estado !== "anulada"
      );
      const totalDeuda  = facturas.reduce((s, c) => s + c.total, 0);
      const totalPagado = ordenesPago.filter(op => op.proveedorId === prov.id && op.estado !== "anulada").reduce((s, op) => s + op.monto, 0);
      return s + Math.max(0, totalDeuda - totalPagado);
    }, 0),
    [proveedores, compras, ordenesPago]
  );

  const activoItems = [
    { label: "Caja y Tesorería (efectivo)",     valor: saldoCajaTesoreria },
    { label: nombres.transferencia,              valor: saldoCtaTransf },
    { label: nombres.banco,                      valor: saldoBanco },
    { label: "Cuentas por cobrar (clientes)",    valor: cuentasPorCobrar },
    { label: "Cheques a cobrar (en cartera)",    valor: chequesACobrar },
    { label: "Mercadería (valorizada a costo)",  valor: mercaderiaValorizada },
  ];
  const totalActivo = activoItems.reduce((s, i) => s + i.valor, 0);

  const pasivoItems = [
    { label: "Cuentas por pagar (proveedores)", valor: cuentasPorPagar },
    { label: "Cheques a pagar (en cartera)",    valor: chequesAPagar },
  ];
  const totalPasivo = pasivoItems.reduce((s, i) => s + i.valor, 0);

  const patrimonioNeto = totalActivo - totalPasivo;
  const colorRes = v => v >= 0 ? "var(--green)" : "var(--red)";

  const datosReporte = () => ({ activoItems, totalActivo, pasivoItems, totalPasivo, patrimonioNeto });
  const handlePrint = () => abrirReporteImpresion(buildBalanceGeneralHTML(datosReporte()));
  const handleExportExcel = () => {
    descargarExcel([
      { nombre: "Activo", filas: [...activoItems.map(i => ({ Concepto: i.label, Monto: Math.round(i.valor) })), { Concepto: "Total Activo", Monto: Math.round(totalActivo) }] },
      { nombre: "Pasivo", filas: [...pasivoItems.map(i => ({ Concepto: i.label, Monto: Math.round(i.valor) })), { Concepto: "Total Pasivo", Monto: Math.round(totalPasivo) }] },
      { nombre: "Patrimonio Neto", filas: [{ Concepto: "Patrimonio Neto (Activo − Pasivo)", Monto: Math.round(patrimonioNeto) }] },
    ], `balance-general_${today()}.xlsx`);
  };

  const Bloque = ({ titulo, items, total, color }) => (
    <div className="card">
      <div className="card-title" style={{ marginBottom: 14 }}>{titulo}</div>
      <div style={{ background: "var(--bg3)", borderRadius: 8, overflow: "hidden", marginBottom: 14 }}>
        {items.map(i => (
          <div key={i.label} style={{ display: "flex", justifyContent: "space-between", padding: "9px 14px", borderBottom: "1px solid var(--border)" }}>
            <span style={{ fontSize: 13, color: "var(--text2)" }}>{i.label}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text1)" }}>{fmt(i.valor)}</span>
          </div>
        ))}
      </div>
      <div style={{ background: "var(--bg4)", borderRadius: 8, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text1)" }}>Total {titulo}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color }}>{fmt(total)}</span>
      </div>
    </div>
  );

  return (
    <div>
      <div className="card" style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 12, color: "var(--text3)" }}>
          Balance al día de la fecha ({fmtFechaAR(today())})
        </div>
        <button className="btn btn-sm btn-ghost" style={{ marginLeft: "auto" }} onClick={handleExportExcel} title="Exportar a Excel">
          <Icon name="download" size={13}/> Excel
        </button>
        <button className="btn btn-sm btn-ghost" onClick={handlePrint} title="Imprimir reporte">
          <Icon name="receipt" size={13}/> Imprimir
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <Bloque titulo="Activo" items={activoItems} total={totalActivo} color="var(--blue)" />
        <Bloque titulo="Pasivo" items={pasivoItems} total={totalPasivo} color="var(--red)" />
      </div>

      <div style={{ background: patrimonioNeto >= 0 ? "rgba(72,199,116,0.08)" : "rgba(242,107,91,0.08)", border: `1px solid ${patrimonioNeto >= 0 ? "rgba(72,199,116,0.25)" : "rgba(242,107,91,0.25)"}`, borderRadius: 8, padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text1)" }}>Patrimonio Neto</div>
          <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>Activo − Pasivo</div>
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, color: colorRes(patrimonioNeto) }}>{fmt(patrimonioNeto)}</span>
      </div>

      <div style={{ fontSize: 11, color: "var(--text3)", lineHeight: 1.6, marginTop: 16 }}>
        * Mercadería valorizada al costo de carga vigente de cada producto. Cuentas por cobrar/pagar en cuenta corriente, cheques en cartera (no depositados ni rechazados/entregados) y saldo de Caja y Tesorería según los movimientos registrados.
      </div>
    </div>
  );
}

// ─── PAGE TESORERÍA ───────────────────────────────────────────────────────────
export default function PageTesoreria({ tesoreria, agregarMovimientoTesoreria, actualizarMovimientoTesoreria, ventas, compras, recibos, ordenesPago, gastos, cheques, setCheques, clientes, proveedores, planCuentas, setPlanCuentas, asientosManuales, periodosCerrados, cerrarPeriodo, reabrirPeriodo, cargarRetirosRango, usuarioActivo, permisos, productos = [], agregarCheque, cambiarEstadoCheque, agregarCuenta, actualizarCuenta, agregarAsiento: agregarAsientoDB, eliminarAsiento, tarjetas = [], agregarTarjeta, editarTarjeta, desactivarTarjeta, agregarCuota, editarCuota, eliminarCuota, pagosCtaCte = [], cambiosArticulo = [] }) {
  const { confirm } = useConfirm();
  const [activeTab,        setActiveTab]        = useState("resumen");
  const [showNuevoAsiento, setShowNuevoAsiento] = useState(false);
  const [menuAbierto,      setMenuAbierto]      = useState(true);

  const asientosAuto = useMemo(()=>generarAsientosAuto(ventas, compras, recibos, ordenesPago, gastos, planCuentas, tesoreria),[ventas,compras,recibos,ordenesPago,gastos,planCuentas,tesoreria]);

  const allAsientos = useMemo(()=>{
    const merged = [
      ...asientosAuto,
      ...(asientosManuales||[]).map(a=>({...a,origen:a.origen||"manual"})),
    ];
    merged.sort((a,b)=>a.fecha.localeCompare(b.fecha)||(a.hora||"").localeCompare(b.hora||""));
    return merged.map((a,i)=>({...a,numero:i+1}));
  },[asientosAuto,asientosManuales]);

  const handleNuevoAsiento = async (data) => {
    try { await agregarAsientoDB(data); } catch { /* state already updated optimistically on success */ }
    setShowNuevoAsiento(false);
  };

  const TABS = [
    { id:"resumen",    label:"Resumen General",        icon:"dashboard" },
    { id:"caja",       label:"Caja Mayor",             icon:"cash"    },
    { id:"cheques",    label:"Cheques",                icon:"receipt" },
    { id:"tarjetas",   label:"Tarjetas",               icon:"card"    },
    { id:"diario",     label:"Libro Diario",           icon:"receipt" },
    { id:"mayor",      label:"Libro Mayor",            icon:"chart"   },
    { id:"resultados", label:"Estado de Resultados",   icon:"chart"   },
    { id:"balancegeneral", label:"Balance General",    icon:"box"     },
    { id:"balance",    label:"Balance (Libro Mayor)",  icon:"tag"     },
    { id:"cierre",     label:"Cierre de Período",      icon:"lock"    },
    { id:"cuentas",    label:"Plan de Cuentas",        icon:"lock"    },
  ];

  return (
    <div style={{ maxWidth:1400, display:"flex", alignItems:"flex-start", gap:20 }}>
      {showNuevoAsiento&&(
        <ModalNuevoAsiento
          planCuentas={planCuentas||[]}
          onClose={()=>setShowNuevoAsiento(false)}
          onConfirm={handleNuevoAsiento}
        />
      )}

      {/* Menú lateral desplegable */}
      <div style={{ width: menuAbierto ? 220 : 48, flexShrink:0, transition:"width .15s ease", position:"sticky", top:0 }}>
        <div className="card" style={{ margin:0, padding:6 }}>
          <button
            className="btn btn-sm btn-ghost"
            style={{ width:"100%", justifyContent: menuAbierto ? "space-between" : "center", marginBottom:6 }}
            onClick={()=>setMenuAbierto(o=>!o)}
            title={menuAbierto ? "Contraer menú" : "Expandir menú"}>
            {menuAbierto && <span style={{ fontSize:12, fontWeight:600, color:"var(--text2)" }}>Secciones</span>}
            <span style={{ fontSize:14, lineHeight:1 }}>{menuAbierto ? "‹" : "☰"}</span>
          </button>
          <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
            {TABS.map(tab=>(
              <button key={tab.id}
                className={`btn btn-sm ${activeTab===tab.id?"btn-primary":"btn-ghost"}`}
                style={{ justifyContent: menuAbierto ? "flex-start" : "center", borderRadius:7, whiteSpace:"nowrap", overflow:"hidden" }}
                onClick={()=>setActiveTab(tab.id)}
                title={tab.label}>
                <Icon name={tab.icon} size={13}/> {menuAbierto && tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Contenido de la sección activa */}
      <div style={{ flex:1, minWidth:0 }}>
        {activeTab==="resumen" && <TabResumenGeneral ventas={ventas} gastos={gastos} compras={compras} tesoreria={tesoreria} recibos={recibos} planCuentas={planCuentas||[]}/>}
        {activeTab==="caja"    && <TabCajaMayor    tesoreria={tesoreria} agregarMovimientoTesoreria={agregarMovimientoTesoreria} actualizarMovimientoTesoreria={actualizarMovimientoTesoreria} gastos={gastos} compras={compras} nombres={nombresCuentas(planCuentas)}/>}
        {activeTab==="cheques" && <TabCheques     cheques={cheques} setCheques={setCheques} clientes={clientes} proveedores={proveedores} agregarCheque={agregarCheque} cambiarEstadoCheque={cambiarEstadoCheque}/>}
        {activeTab==="tarjetas" && <TabTarjetas   tarjetas={tarjetas} agregarTarjeta={agregarTarjeta} editarTarjeta={editarTarjeta} desactivarTarjeta={desactivarTarjeta} agregarCuota={agregarCuota} editarCuota={editarCuota} eliminarCuota={eliminarCuota}/>}
        {activeTab==="diario"  && <TabLibroDiario  allAsientos={allAsientos} planCuentas={planCuentas||[]} onNuevoAsiento={()=>setShowNuevoAsiento(true)}/>}
        {activeTab==="mayor"   && <TabLibroMayor   allAsientos={allAsientos} planCuentas={planCuentas||[]}/>}
        {activeTab==="resultados" && <TabEstadoResultados ventas={ventas} gastos={gastos} productos={productos} planCuentas={planCuentas||[]}/>}
        {activeTab==="balancegeneral" && <TabBalanceGeneral tesoreria={tesoreria} gastos={gastos} cheques={cheques} clientes={clientes} proveedores={proveedores} compras={compras} ordenesPago={ordenesPago} ventas={ventas} pagosCtaCte={pagosCtaCte} cambiosArticulo={cambiosArticulo} productos={productos} nombres={nombresCuentas(planCuentas)}/>}
        {activeTab==="balance" && <TabBalance       allAsientos={allAsientos} planCuentas={planCuentas||[]}/>}
        {activeTab==="cierre"  && <TabCierrePeriodo ventas={ventas} compras={compras} gastos={gastos} periodosCerrados={periodosCerrados} cerrarPeriodo={cerrarPeriodo} reabrirPeriodo={reabrirPeriodo} cargarRetirosRango={cargarRetirosRango} usuarioActivo={usuarioActivo} permisos={permisos}/>}
        {activeTab==="cuentas" && <TabPlanCuentas  planCuentas={planCuentas||[]} setPlanCuentas={setPlanCuentas} agregarCuenta={agregarCuenta} actualizarCuenta={actualizarCuenta}/>}
      </div>
    </div>
  );
}
