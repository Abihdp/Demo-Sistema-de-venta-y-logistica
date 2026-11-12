import { useState, useMemo, useEffect } from "react";
import { fmt, today, fmtFechaAR } from "../../utils/helpers.js";
import { Modal } from "../ui/Modal.jsx";
import Icon from "../ui/Icon.jsx";

const FORMAS_PAGO_OP   = ["Transferencia", "Efectivo", "Cheque"];
const FUENTES_EFECTIVO = ["Tesorería", "Caja de Salón"];
const BANCOS_COMUNES   = ["Banco Nación", "Banco Galicia", "BBVA", "Santander", "Macro", "HSBC", "Bancor", "Ciudad", "Credicoop", "Brubank"];

export default function ModalNuevaOrdenPago({ proveedores, compras, ordenesPago, proveedorIdInicial, onClose, onConfirm }) {
  const [proveedorId, setProveedorId] = useState(proveedorIdInicial ? String(proveedorIdInicial) : "");
  const [fecha, setFecha]             = useState(today());
  const [monto, setMonto]             = useState("");
  const [formaPago, setFormaPago]     = useState("Transferencia");
  const [fuentePago, setFuentePago]   = useState("");
  const [referencia, setReferencia]   = useState("");
  const [concepto, setConcepto]       = useState("");

  useEffect(() => {
    setFuentePago(formaPago === "Efectivo" ? "Tesorería" : "");
  }, [formaPago]);

  const proveedor = proveedores.find(p => String(p.id) === String(proveedorId));

  // Facturas en cuenta corriente de este proveedor (no canceladas)
  const facturasCta = useMemo(() => {
    if (!proveedorId) return [];
    return compras.filter(c =>
      (c.proveedorId === Number(proveedorId) || (!c.proveedorId && c.proveedor === proveedor?.nombre)) &&
      c.formaPago === "Cuenta Corriente Proveedor" &&
      c.tipo === "Factura" &&
      c.estado !== "anulada"
    );
  }, [compras, proveedorId, proveedor]);

  const totalDeuda = facturasCta.reduce((s, c) => s + c.total, 0);

  const totalPagadoOP = useMemo(() => {
    if (!proveedorId) return 0;
    return ordenesPago
      .filter(op => String(op.proveedorId) === String(proveedorId) && op.estado !== "anulada")
      .reduce((s, op) => s + op.monto, 0);
  }, [ordenesPago, proveedorId]);

  const saldoPendiente = Math.max(0, totalDeuda - totalPagadoOP);
  const nroOP = `OP-${String(ordenesPago.length + 1).padStart(4, "0")}`;
  const montoNum = parseFloat(monto) || 0;
  const canConfirm = !!proveedor && montoNum > 0 && !!fuentePago;

  const confirmar = () => {
    if (!canConfirm) return;
    onConfirm({
      nro: nroOP,
      fecha,
      proveedorId: proveedor.id,
      proveedor: proveedor.nombre,
      concepto: concepto.trim() || `Pago a ${proveedor.nombre}`,
      monto: montoNum,
      formaPago,
      fuentePago,
      referencia: referencia.trim(),
      estado: "emitida",
    });
  };

  return (
    <Modal onClose={onClose} size="modal-sm">
      <div className="modal-header">
        <div className="modal-title">Nueva Orden de Pago</div>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      <div style={{display:"flex", flexDirection:"column", gap:12}}>
        <div className="form-row form-row-2">
          <div className="form-group">
            <label className="form-label">N° Orden</label>
            <input className="form-input" value={nroOP} readOnly style={{opacity:.55}}/>
          </div>
          <div className="form-group">
            <label className="form-label">Fecha</label>
            <input type="date" className="form-input" value={fecha} onChange={e=>setFecha(e.target.value)}/>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Proveedor *</label>
          <select className="form-select" value={proveedorId}
            onChange={e=>{ setProveedorId(e.target.value); setMonto(""); }}>
            <option value="">— Seleccioná un proveedor —</option>
            {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>

        {proveedorId && (
          <div style={{background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:8, padding:"10px 14px"}}>
            <div style={{fontSize:11, color:"var(--text3)", fontWeight:600, textTransform:"uppercase", letterSpacing:".04em", marginBottom:8}}>
              Cuenta corriente
            </div>
            <div style={{display:"flex", justifyContent:"space-between", fontSize:12, color:"var(--text3)", marginBottom:5}}>
              <span>Total facturado en cta. cte.</span>
              <span style={{color:"var(--text1)"}}>{fmt(totalDeuda)}</span>
            </div>
            <div style={{display:"flex", justifyContent:"space-between", fontSize:12, color:"var(--text3)", marginBottom:5}}>
              <span>Órdenes de pago emitidas</span>
              <span style={{color:"var(--green)"}}>− {fmt(totalPagadoOP)}</span>
            </div>
            <div style={{height:1, background:"var(--border)", margin:"8px 0"}}/>
            <div style={{display:"flex", justifyContent:"space-between", fontSize:14, fontWeight:700}}>
              <span style={{color:"var(--text2)"}}>Saldo pendiente</span>
              <span style={{color: saldoPendiente > 0 ? "var(--red)" : "var(--green)"}}>{fmt(saldoPendiente)}</span>
            </div>
          </div>
        )}

        {facturasCta.length > 0 && (
          <div>
            <label className="form-label">Facturas en cuenta corriente</label>
            <div style={{border:"1px solid var(--border)", borderRadius:8, overflow:"hidden"}}>
              {facturasCta.map((c, i) => (
                <div key={c.id} style={{
                  display:"flex", justifyContent:"space-between", alignItems:"center",
                  padding:"7px 12px", fontSize:12,
                  borderTop: i > 0 ? "1px solid var(--border)" : "none",
                }}>
                  <span style={{color:"var(--text3)", fontFamily:"monospace"}}>{c.nro}</span>
                  <span style={{color:"var(--text3)"}}>{fmtFechaAR(c.fecha)}</span>
                  <span style={{color:"var(--accent2)", fontWeight:600}}>{fmt(c.total)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {proveedorId && facturasCta.length === 0 && (
          <div style={{padding:"10px 14px", borderRadius:8, background:"rgba(62,207,142,0.07)",
            border:"1px solid rgba(62,207,142,0.2)", fontSize:12, color:"var(--green)"}}>
            Este proveedor no tiene facturas pendientes en cuenta corriente.
          </div>
        )}

        <div className="form-row form-row-2">
          <div className="form-group">
            <label className="form-label">Importe *</label>
            <input type="number" min={0} className="form-input" placeholder="0.00"
              value={monto} onChange={e=>setMonto(e.target.value)}/>
            {saldoPendiente > 0 && (
              <button type="button"
                style={{marginTop:4, fontSize:11, color:"var(--accent)", background:"none", border:"none", cursor:"pointer", padding:0}}
                onClick={()=>setMonto(String(saldoPendiente))}>
                Completar saldo ({fmt(saldoPendiente)})
              </button>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Forma de pago *</label>
            <select className="form-select" value={formaPago} onChange={e=>setFormaPago(e.target.value)}>
              {FORMAS_PAGO_OP.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </div>

        {/* Fuente de pago */}
        <div className="form-group">
          <label className="form-label">
            {formaPago === "Efectivo" ? "Sale de *" : "Banco / Cuenta *"}
          </label>
          {formaPago === "Efectivo" ? (
            <div style={{display:"flex", gap:8}}>
              {FUENTES_EFECTIVO.map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFuentePago(f)}
                  style={{
                    flex:1, padding:"9px 12px", borderRadius:8, fontSize:13, cursor:"pointer",
                    border: fuentePago === f ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                    background: fuentePago === f ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "var(--bg3)",
                    color: fuentePago === f ? "var(--accent)" : "var(--text2)",
                    fontWeight: fuentePago === f ? 600 : 400,
                    transition: "all .15s",
                  }}
                >
                  {f}
                </button>
              ))}
            </div>
          ) : (
            <>
              <input
                className="form-input"
                list="op-bancos-list"
                placeholder="Ej: Banco Galicia, BBVA..."
                value={fuentePago}
                onChange={e => setFuentePago(e.target.value)}
              />
              <datalist id="op-bancos-list">
                {BANCOS_COMUNES.map(b => <option key={b} value={b}/>)}
              </datalist>
            </>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">
            {formaPago === "Efectivo" ? "Referencia (opcional)" : formaPago === "Cheque" ? "N° de cheque" : "N° de transferencia / comprobante"}
          </label>
          <input className="form-input"
            placeholder={formaPago === "Efectivo" ? "Opcional" : "N° comprobante"}
            value={referencia} onChange={e=>setReferencia(e.target.value)}/>
        </div>

        <div className="form-group">
          <label className="form-label">Concepto / Observaciones</label>
          <input className="form-input" placeholder={`Pago a ${proveedor ? proveedor.nombre : "proveedor"}`}
            value={concepto} onChange={e=>setConcepto(e.target.value)}/>
        </div>
      </div>

      <div className="modal-footer">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={confirmar} disabled={!canConfirm}>
          <Icon name="check" size={14}/> Emitir Orden de Pago
        </button>
      </div>
    </Modal>
  );
}
