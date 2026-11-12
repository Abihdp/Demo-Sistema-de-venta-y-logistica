import { useState } from "react";
import Modal from "../ui/Modal";
import Icon from "../ui/Icon";
import { fmt, fmtFechaAR } from "../../utils/helpers";

export default function ModalAnulacionCambio({ grupo, caja, onClose, onConfirmar }) {
  const [motivo, setMotivo] = useState("");
  const [error,  setError]  = useState("");

  const cajaAbierta = caja?.abierta;
  const esNotaCredito = grupo.diferencia < 0;
  const esNotaDebito   = grupo.diferencia > 0;

  const confirmar = () => {
    if (!motivo.trim()) { setError("El motivo de anulación es obligatorio."); return; }
    onConfirmar({ motivo: motivo.trim() });
  };

  return (
    <Modal onClose={onClose} size="modal-md">
      <div className="modal-header">
        <div className="modal-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="warning" size={16} color="var(--red)" />
          Anular cambio {grupo.nro}
        </div>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Resumen del cambio */}
        <div style={{
          background: "var(--bg3)", border: "1px solid var(--border)",
          borderRadius: 8, padding: "12px 14px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text1)" }}>
                {grupo.ventaOriginalCliente}
              </div>
              <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>
                {fmtFechaAR(grupo.fecha)} · Venta original #{grupo.ventaOriginalId}
              </div>
            </div>
            {grupo.diferencia !== 0 && (
              <span style={{ fontSize: 18, fontWeight: 700, color: esNotaCredito ? "var(--amber)" : "var(--blue)", fontFamily: "var(--font-mono)" }}>
                {fmt(Math.abs(grupo.diferencia))}
              </span>
            )}
          </div>

          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            {grupo.rows.map((r, i) => (
              <div key={r.id ?? i} style={{ fontSize: 12, color: "var(--text2)" }}>
                {r.itemViejo?.nombre && <div>↩ Devuelve: {r.itemViejo.qty}× {r.itemViejo.nombre}</div>}
                {r.productoNuevo?.id && <div>↪ Se llevó: {r.qtyNuevo}× {r.productoNuevo.nombre}</div>}
              </div>
            ))}
          </div>
        </div>

        {/* Caja cerrada → no se puede anular */}
        {!cajaAbierta && (
          <div style={{
            padding: "14px 16px", borderRadius: 8,
            background: "rgba(242,107,91,0.08)", border: "1px solid rgba(242,107,91,0.25)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Icon name="lock" size={14} color="var(--red)" />
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--red)" }}>Caja cerrada — anulación no disponible</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--text2)", lineHeight: 1.6 }}>
              Un cambio de artículo solo puede anularse con la caja del mismo turno todavía abierta.
            </div>
          </div>
        )}

        {/* Caja abierta → consecuencias y motivo */}
        {cajaAbierta && (
          <>
            <div style={{
              padding: "12px 14px", borderRadius: 8,
              background: "rgba(242,107,91,0.06)", border: "1px solid rgba(242,107,91,0.2)",
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--red)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 10 }}>
                Esta acción es irreversible. Se realizarán los siguientes cambios:
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                <ConsecRow icon="check" text="El cambio quedará marcado como ANULADO en el historial." />
                <ConsecRow icon="box" text="Se revierte el stock: vuelve lo que el cliente se había llevado y se retira lo que había devuelto." />
                {grupo.diferencia !== 0 && grupo.formaPagoDif === "Cuenta Corriente" && esNotaCredito && (
                  <ConsecRow icon="users" text={`Se cancela el crédito de ${fmt(Math.abs(grupo.diferencia))} en la cuenta corriente de ${grupo.ventaOriginalCliente}.`} color="var(--amber)" />
                )}
                {grupo.diferencia !== 0 && grupo.formaPagoDif !== "Cuenta Corriente" && (
                  <ConsecRow icon="cash" text={`Deja de contar en Caja el ${esNotaDebito ? "cobro" : "egreso"} de ${fmt(Math.abs(grupo.diferencia))} por ${grupo.formaPagoDif}.`} color="var(--blue)" />
                )}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">
                Motivo de anulación <span style={{ color: "var(--red)" }}>*</span>
              </label>
              <input
                className="form-input"
                autoFocus
                placeholder="Ej: Se cargó mal el artículo, cliente se arrepintió..."
                value={motivo}
                onChange={e => { setMotivo(e.target.value); setError(""); }}
              />
            </div>

            {error && (
              <div style={{
                padding: "9px 12px", background: "rgba(242,107,91,0.08)",
                border: "1px solid rgba(242,107,91,0.25)", borderRadius: 8,
                fontSize: 13, color: "var(--red)"
              }}>
                {error}
              </div>
            )}
          </>
        )}
      </div>

      <div className="modal-footer">
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        {cajaAbierta && (
          <button
            className="btn btn-danger"
            onClick={confirmar}
            style={{ background: "var(--red)", borderColor: "var(--red)", color: "#fff" }}
          >
            <Icon name="warning" size={14} /> Confirmar anulación
          </button>
        )}
      </div>
    </Modal>
  );
}

function ConsecRow({ icon, text, color }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: color || "var(--text2)" }}>
      <Icon name={icon} size={13} style={{ flexShrink: 0, marginTop: 1 }} color={color || "var(--text3)"} />
      <span>{text}</span>
    </div>
  );
}
