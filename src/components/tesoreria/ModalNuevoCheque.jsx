import { useState } from "react";
import { fmt, today, fmtFechaAR } from "../../utils/helpers.js";
import { Modal } from "../ui/Modal.jsx";
import Icon from "../ui/Icon.jsx";

export default function ModalNuevoCheque({ clientes, proveedores, cheques, onClose, onConfirm }) {
  const [tipo, setTipo]                 = useState("recibido"); // "recibido" | "emitido"
  const [numero, setNumero]             = useState("");
  const [banco, setBanco]               = useState("");
  const [monto, setMonto]               = useState("");
  const [fechaRecepcion, setFechaRecepcion] = useState(today());
  const [fechaVencimiento, setFechaVencimiento] = useState("");
  const [clienteId, setClienteId]       = useState("");
  const [proveedorId, setProveedorId]   = useState("");
  const [observacion, setObservacion]   = useState("");

  const montoNum   = parseFloat(monto) || 0;
  const nro         = `CH-${String((cheques?.length || 0) + 1).padStart(4, "0")}`;
  const canConfirm  = numero.trim() && banco.trim() && montoNum > 0 && fechaVencimiento;

  const cliente   = clientes?.find(c => String(c.id) === String(clienteId));
  const proveedor = proveedores?.find(p => String(p.id) === String(proveedorId));

  const confirmar = () => {
    if (!canConfirm) return;
    onConfirm({
      nro,
      tipo,
      numero: numero.trim(),
      banco: banco.trim(),
      monto: montoNum,
      fechaRecepcion,
      fechaVencimiento,
      clienteId: cliente?.id || null,
      cliente: cliente?.nombre || null,
      proveedorId: proveedor?.id || null,
      proveedor: proveedor?.nombre || null,
      observacion: observacion.trim(),
      estado: "en_cartera", // en_cartera | depositado | rechazado | entregado
    });
  };

  return (
    <Modal onClose={onClose} size="modal-md">
      <div className="modal-header">
        <div className="modal-title">Nuevo cheque</div>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

        <div className="segmented-control" style={{ marginBottom: 4 }}>
          <button
            type="button"
            className={`segmented-btn${tipo === "recibido" ? " active" : ""}`}
            onClick={() => setTipo("recibido")}
          >
            Recibido de cliente
          </button>
          <button
            type="button"
            className={`segmented-btn${tipo === "emitido" ? " active" : ""}`}
            onClick={() => setTipo("emitido")}
          >
            Emitido a proveedor
          </button>
        </div>

        <div className="form-row form-row-2">
          <div className="form-group">
            <label className="form-label">N° de cheque *</label>
            <input className="form-input" value={numero} onChange={e => setNumero(e.target.value)} placeholder="00012345" />
          </div>
          <div className="form-group">
            <label className="form-label">Banco *</label>
            <input className="form-input" value={banco} onChange={e => setBanco(e.target.value)} placeholder="Banco Nación" />
          </div>
        </div>

        <div className="form-row form-row-2">
          <div className="form-group">
            <label className="form-label">Monto *</label>
            <input className="form-input" type="number" value={monto} onChange={e => setMonto(e.target.value)} placeholder="0" />
          </div>
          <div className="form-group">
            <label className="form-label">Fecha de vencimiento *</label>
            <input className="form-input" type="date" value={fechaVencimiento} onChange={e => setFechaVencimiento(e.target.value)} />
          </div>
        </div>

        {tipo === "recibido" && clientes && (
          <div className="form-group">
            <label className="form-label">Cliente (opcional)</label>
            <select className="form-select" value={clienteId} onChange={e => setClienteId(e.target.value)}>
              <option value="">Sin asociar</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
        )}

        {tipo === "emitido" && proveedores && (
          <div className="form-group">
            <label className="form-label">Proveedor (opcional)</label>
            <select className="form-select" value={proveedorId} onChange={e => setProveedorId(e.target.value)}>
              <option value="">Sin asociar</option>
              {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Observación</label>
          <input className="form-input" value={observacion} onChange={e => setObservacion(e.target.value)} placeholder="Opcional" />
        </div>

        {monto && fechaVencimiento && (
          <div style={{
            padding: "10px 14px", borderRadius: 8,
            background: tipo === "recibido" ? "rgba(62,207,142,0.08)" : "rgba(242,107,91,0.08)",
            border: `1px solid ${tipo === "recibido" ? "rgba(62,207,142,0.2)" : "rgba(242,107,91,0.2)"}`,
            display: "flex", justifyContent: "space-between", alignItems: "center"
          }}>
            <span style={{ fontSize: 12, color: "var(--text2)" }}>
              {tipo === "recibido" ? "Ingresa a cartera" : "Sale de cartera"} · vence {fmtFechaAR(fechaVencimiento)}
            </span>
            <span style={{ fontSize: 16, fontWeight: 700, color: tipo === "recibido" ? "var(--green)" : "var(--red)" }}>
              {fmt(montoNum)}
            </span>
          </div>
        )}
      </div>

      <div className="modal-footer">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" disabled={!canConfirm} onClick={confirmar}>
          <Icon name="check" size={14} /> Registrar cheque
        </button>
      </div>
    </Modal>
  );
}