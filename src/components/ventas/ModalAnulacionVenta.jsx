import { useState } from "react";
import Modal from "../ui/Modal";
import Icon from "../ui/Icon";
import { fmt, pagosDeVenta, fmtFechaAR } from "../../utils/helpers";

export default function ModalAnulacionVenta({ venta, caja, onClose, onConfirmar }) {
  const [motivo, setMotivo] = useState("");
  const [error,  setError]  = useState("");

  const pagos       = pagosDeVenta(venta);
  const cajaAbierta = caja?.abierta;

  const confirmar = () => {
    if (!motivo.trim()) { setError("El motivo de anulación es obligatorio."); return; }
    onConfirmar({ motivo: motivo.trim() });
  };

  return (
    <Modal onClose={onClose} size="modal-md">
      <div className="modal-header">
        <div className="modal-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="warning" size={16} color="var(--red)" />
          Anular venta #{venta.id}
        </div>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Resumen de la venta */}
        <div style={{
          background: "var(--bg3)", border: "1px solid var(--border)",
          borderRadius: 8, padding: "12px 14px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text1)" }}>
                {venta.cliente}
              </div>
              <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>
                {fmtFechaAR(venta.fecha)} · {venta.tipo} · {venta.depositoNombre || "—"}
                {venta.esSeña && (
                  <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--accent2)" }}>
                    {venta.estado === "pendiente" ? "SEÑA · PENDIENTE" : "SEÑA · RETIRADA"}
                  </span>
                )}
              </div>
            </div>
            <span style={{ fontSize: 20, fontWeight: 700, color: "var(--accent2)", fontFamily: "var(--font-mono)" }}>
              {fmt(venta.total)}
            </span>
          </div>

          {/* Items */}
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
            {(venta.items || []).map((it, i) => (
              <div key={i} style={{ fontSize: 12, color: "var(--text2)", display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span>{it.qty}× {it.nombre}</span>
                <span style={{ color: "var(--text3)" }}>{fmt(it.precio * it.qty)}</span>
              </div>
            ))}
          </div>

          {/* Medios de pago */}
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8, marginTop: 6 }}>
            {pagos.map((p, i) => (
              <div key={i} style={{ fontSize: 12, display: "flex", justifyContent: "space-between", color: "var(--text3)" }}>
                <span>{p.formaPago}</span>
                <span style={{ fontWeight: 600 }}>{fmt(p.monto)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Caja cerrada → no se puede anular directamente */}
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
              No se puede anular directamente una venta con la caja cerrada.
              Para revertir esta venta, abrí la caja o emitite una{" "}
              <strong style={{ color: "var(--blue)" }}>Nota de Crédito</strong> desde la sección{" "}
              <strong>Caja → Nueva Nota de Crédito</strong>.
            </div>
          </div>
        )}

        {/* Caja abierta → mostrar consecuencias y pedir motivo */}
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
                <ConsecRow icon="check" text="La venta quedará marcada como ANULADA en el historial." />
                {venta.esSeña && venta.estado === "pendiente" && (
                  <ConsecRow icon="box" text={`Se revertirá la reserva: artículos vuelven de Reservas a "${venta.depositoNombre || "depósito original"}". El stock total no cambia (nunca se descontó).`} />
                )}
                {(!venta.esSeña || venta.estado === "activa") && (
                  <ConsecRow icon="box" text={`Se devolverá el stock de ${(venta.items || []).reduce((a, i) => a + i.qty, 0)} artículo${(venta.items || []).reduce((a, i) => a + i.qty, 0) !== 1 ? "s" : ""} al depósito "${venta.depositoNombre || "original"}".`} />
                )}
                {pagos.map((p, i) => (
                  p.formaPago === "Cuenta Corriente" ? (
                    <ConsecRow key={i} icon="users" text={`Se cancelará la deuda de ${fmt(p.monto)} en cuenta corriente de ${venta.cliente}.`} color="var(--amber)" />
                  ) : (
                    <ConsecRow key={i} icon="cash" text={`Se registra egreso de ${fmt(p.monto)} por ${p.formaPago} en caja.`} color="var(--blue)" />
                  )
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">
                Motivo de anulación <span style={{ color: "var(--red)" }}>*</span>
              </label>
              <input
                className="form-input"
                autoFocus
                placeholder="Ej: Error en precio, venta duplicada, cliente desistió..."
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
