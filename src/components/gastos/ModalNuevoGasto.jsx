import { useState } from "react";
import { saldoDeFuente, opcionesFuente, esFuenteTesoreria, medioInvalidoParaFuente, MEDIOS_POR_FUENTE } from "../../utils/tesoreria.js";
import { fmt, today, mesLabel, periodoCerrado } from "../../utils/helpers.js";
import { Modal } from "../ui/Modal.jsx";
import Icon from "../ui/Icon.jsx";
import { useToast } from "../ui/Toast.jsx";

const FORMAS_PAGO_GASTO = ["Efectivo", "Transferencia", "Cheque", "Tarjeta Débito", "Tarjeta Crédito"];

// Mensaje cuando la forma de pago no corresponde a la fuente elegida.
// Caja Salón solo sabe descontar Efectivo o Transferencia (ver PageGastos.jsx).
const MSG_MEDIO = {
  caja_salon:        (fp) => `Caja Salón solo puede descontar Efectivo o Transferencia. Un pago en ${fp} no sale de la plata de la caja.`,
  tesoreria:         (fp) => `El efectivo de Tesorería solo paga en Efectivo o Cheque. Para un pago en ${fp}, elegí la cuenta de donde sale.`,
  cta_transferencia: (fp) => `Desde la cuenta de transferencias solo se paga por Transferencia, no en ${fp}.`,
  banco:             ()   => `Si pagás en efectivo, elegí "Caja Salón" o "Efectivo de Tesorería".`,
};

export default function ModalNuevoGasto({ planCuentas, proveedores, gastos, periodosCerrados = [], cajaAbierta = false, saldosTesoreria = null, nombresCuentas = {}, onClose, onConfirm }) {
  const { toast } = useToast();
  const cuentasGasto = (planCuentas || []).filter(
    c => c.tipo === "egreso" && c.imputable && c.id !== "511" && c.id !== "528"
  );

  const [cuentaId, setCuentaId]       = useState(cuentasGasto[0]?.id || "");
  const [fecha, setFecha]             = useState(today());
  const [concepto, setConcepto]       = useState("");
  const [monto, setMonto]             = useState("");
  const [formaPago, setFormaPago]     = useState("Efectivo");
  const [fuente, setFuente]           = useState("caja_salon");
  const [proveedorId, setProveedorId] = useState("");
  const [referencia, setReferencia]   = useState("");
  const [recurrente, setRecurrente]   = useState(false);

  const montoNum   = parseFloat(monto) || 0;
  const canConfirm = !!cuentaId && !!concepto.trim() && montoNum > 0;
  const nroGasto   = `G-${String((gastos?.length || 0) + 1).padStart(4, "0")}`;
  const proveedor  = (proveedores || []).find(p => String(p.id) === String(proveedorId));

  const FUENTES     = opcionesFuente(nombresCuentas);
  const fuenteLabel = FUENTES.find(f => f.value === fuente)?.label || "";

  // Al cambiar de fuente, si la forma de pago no corresponde, se pasa a la
  // primera válida (ej. Cuenta Transferencia → Transferencia).
  const elegirFuente = (f) => {
    setFuente(f);
    if (medioInvalidoParaFuente(f, formaPago)) {
      setFormaPago(f === "banco" ? "Transferencia" : MEDIOS_POR_FUENTE[f][0]);
    }
  };

  // Advertencias contextuales
  const warnCajaCerrada      = fuente === "caja_salon" && !cajaAbierta;
  // Bloquea combinaciones fuente/medio que no tienen sentido (antes, p. ej.,
  // un cheque "desde Caja Salón" se registraba como retiro de efectivo).
  const warnMedio            = medioInvalidoParaFuente(fuente, formaPago);
  // El saldo a validar es el de la cuenta elegida.
  const usaTesoreria         = esFuenteTesoreria(fuente);
  const { disponible: saldoTesoreria, donde: dondeSaldo } = saldoDeFuente(saldosTesoreria, fuente, formaPago, nombresCuentas);
  const warnSaldoInsuficiente = usaTesoreria && montoNum > 0 && montoNum > saldoTesoreria;

  const confirmar = () => {
    if (!canConfirm) return;
    const cerrado = periodoCerrado(fecha, periodosCerrados);
    if (cerrado) { toast(`El período ${mesLabel(cerrado.mes)} está cerrado.`, "warning"); return; }
    if (warnCajaCerrada)       { toast("La caja está cerrada. No se puede registrar un retiro.", "error"); return; }
    if (warnMedio)             { toast(MSG_MEDIO[fuente](formaPago), "error"); return; }
    if (warnSaldoInsuficiente) { toast(`Saldo insuficiente en ${dondeSaldo}.`, "error"); return; }
    onConfirm({
      nro: nroGasto,
      fecha,
      cuentaId,
      concepto: concepto.trim(),
      monto: montoNum,
      formaPago,
      fuente,
      proveedorId: proveedor ? proveedor.id : null,
      proveedor: proveedor ? proveedor.nombre : null,
      referencia: referencia.trim(),
      recurrente,
      estado: "registrado",
    });
  };

  return (
    <Modal onClose={onClose} size="modal-sm">
      <div className="modal-header">
        <div className="modal-title">Nuevo gasto</div>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

        <div className="form-row form-row-2">
          <div className="form-group">
            <label className="form-label">Categoría *</label>
            <select className="form-select" value={cuentaId} onChange={e => setCuentaId(e.target.value)}>
              {cuentasGasto.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Fecha</label>
            <input className="form-input" type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Concepto *</label>
          <input
            className="form-input"
            value={concepto}
            onChange={e => setConcepto(e.target.value)}
            placeholder="Ej: Alquiler local junio, Factura de luz, Sueldo cajera..."
          />
        </div>

        <div className="form-row form-row-2">
          <div className="form-group">
            <label className="form-label">Monto *</label>
            <input
              className="form-input"
              type="number"
              value={monto}
              onChange={e => setMonto(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Forma de pago</label>
            <select className="form-select" value={formaPago} onChange={e => setFormaPago(e.target.value)}>
              {FORMAS_PAGO_GASTO.map(f => <option key={f}>{f}</option>)}
            </select>
          </div>
        </div>

        {/* ── Fuente de fondos ── */}
        <div className="form-group">
          <label className="form-label">¿De dónde sale el dinero?</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {FUENTES.map(f => (
              <label
                key={f.value}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 10,
                  padding: "9px 12px", borderRadius: 8, cursor: "pointer",
                  border: `1px solid ${fuente === f.value ? "var(--accent)" : "var(--border)"}`,
                  background: fuente === f.value ? "color-mix(in srgb, var(--accent) 8%, transparent)" : "var(--bg3)",
                }}
              >
                <input
                  type="radio"
                  name="fuente"
                  value={f.value}
                  checked={fuente === f.value}
                  onChange={() => elegirFuente(f.value)}
                  style={{ marginTop: 2, accentColor: "var(--accent)" }}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text1)" }}>{f.label}</div>
                  <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 1 }}>{f.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Advertencias contextuales */}
        {warnCajaCerrada && (
          <div style={{ padding:"8px 12px", borderRadius:6, background:"rgba(242,107,91,0.08)", border:"1px solid rgba(242,107,91,0.25)", fontSize:12, color:"var(--red)" }}>
            La caja está cerrada. Abrí la caja antes de registrar un gasto por Caja Salón, o elegí otra cuenta.
          </div>
        )}
        {warnMedio && (
          <div style={{ padding:"8px 12px", borderRadius:6, background:"rgba(242,107,91,0.08)", border:"1px solid rgba(242,107,91,0.25)", fontSize:12, color:"var(--red)" }}>
            {MSG_MEDIO[fuente](formaPago)}
          </div>
        )}
        {usaTesoreria && (
          <div style={{ padding:"8px 12px", borderRadius:6, background:"var(--bg3)", border:"1px solid var(--border)", fontSize:12, color:"var(--text2)", display:"flex", justifyContent:"space-between" }}>
            <span>Saldo disponible en {dondeSaldo}</span>
            <span style={{ fontWeight:700, color: warnSaldoInsuficiente ? "var(--red)" : "var(--green)" }}>
              {fmt(saldoTesoreria)}
            </span>
          </div>
        )}
        {warnSaldoInsuficiente && (
          <div style={{ padding:"8px 12px", borderRadius:6, background:"rgba(242,107,91,0.08)", border:"1px solid rgba(242,107,91,0.25)", fontSize:12, color:"var(--red)" }}>
            Saldo insuficiente. El gasto de {fmt(montoNum)} supera el disponible de {fmt(saldoTesoreria)} en {dondeSaldo}. Elegí otra cuenta.
          </div>
        )}

        {proveedores && proveedores.length > 0 && (
          <div className="form-group">
            <label className="form-label">Proveedor (opcional)</label>
            <select className="form-select" value={proveedorId} onChange={e => setProveedorId(e.target.value)}>
              <option value="">Sin proveedor asociado</option>
              {proveedores.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Referencia (opcional)</label>
          <input
            className="form-input"
            value={referencia}
            onChange={e => setReferencia(e.target.value)}
            placeholder={formaPago === "Cheque" ? "N° de cheque / banco" : "N° de comprobante / factura"}
          />
        </div>

        <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, color:"var(--text2)", cursor:"pointer" }}>
          <input
            type="checkbox"
            checked={recurrente}
            onChange={e => setRecurrente(e.target.checked)}
            style={{ width:16, height:16, accentColor:"var(--accent)" }}
          />
          Es un gasto recurrente (se repite todos los meses)
        </label>

        {monto && (
          <div style={{
            padding:"10px 14px", borderRadius:8,
            background:"rgba(242,107,91,0.08)", border:"1px solid rgba(242,107,91,0.2)",
            display:"flex", justifyContent:"space-between", alignItems:"center"
          }}>
            <span style={{ fontSize:12, color:"var(--text2)" }}>
              Impacta en Libro Diario
              {fuente !== "sin_impacto" && <> · <strong style={{ color: fuente === "caja_salon" ? "var(--amber)" : "var(--blue)" }}>{fuenteLabel}</strong></>}
            </span>
            <span style={{ fontSize:16, fontWeight:700, color:"var(--red)" }}>−{fmt(montoNum)}</span>
          </div>
        )}
      </div>

      <div className="modal-footer">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" disabled={!canConfirm || warnCajaCerrada || warnMedio || warnSaldoInsuficiente} onClick={confirmar}>
          <Icon name="check" size={14} /> Registrar gasto
        </button>
      </div>
    </Modal>
  );
}
