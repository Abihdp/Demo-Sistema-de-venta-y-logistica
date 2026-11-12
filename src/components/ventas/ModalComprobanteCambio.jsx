import { Modal } from "../ui/Modal";
import Icon from "../ui/Icon";
import { fmt, fmtFechaAR } from "../../utils/helpers";
import { imprimirComprobanteCambio } from "../../utils/agenteImpresion";

export default function ModalComprobanteCambio({ cambio, cambios, logoBase64 = null, onClose }) {
  const lista = cambios ?? (Array.isArray(cambio) ? cambio : [cambio]);
  const primero = lista[0];

  const totalViejo = lista.reduce((a, c) => a + (c.totalViejo || 0), 0);
  const totalNuevo = lista.reduce((a, c) => a + (c.totalNuevo || 0), 0);
  const diferencia = lista.reduce((a, c) => a + (c.diferencia || 0), 0);

  const esNotaCredito = diferencia < 0;
  const esNotaDebito   = diferencia > 0;

  const tipoLabel = esNotaCredito ? "Nota de Crédito" : esNotaDebito ? "Nota de Débito" : "Comprobante de Cambio";
  const tipoColor = esNotaCredito ? "var(--amber)" : esNotaDebito ? "var(--blue)" : "var(--green)";

  return (
    <Modal onClose={onClose} size="modal-sm">
      <div className="modal-header">
        <div className="modal-title">{primero.nro}</div>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      <div className="ticket-print-area" style={{ background: "var(--bg3)", borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <div style={{ textAlign: "center", marginBottom: 14 }}>
          {logoBase64 && (
            <img src={logoBase64} alt="Logo" style={{ maxWidth: 110, maxHeight: 70, marginBottom: 6 }} />
          )}
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text1)" }}>PECO'S</div>
          <div style={{
            display: "inline-block", marginTop: 6, padding: "3px 12px", borderRadius: 99,
            fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em",
            background: `color-mix(in srgb, ${tipoColor} 14%, transparent)`, color: tipoColor,
          }}>
            {tipoLabel}
          </div>
          <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 6 }}>
            {fmtFechaAR(primero.fecha)} · {primero.hora?.slice(0, 5)}
          </div>
        </div>

        <div className="divider" />

        <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 4 }}>
          Cliente: <strong style={{ color: "var(--text1)" }}>{primero.ventaOriginalCliente}</strong>
        </div>
        <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 4 }}>
          Venta original: <strong style={{ color: "var(--text1)" }}>#{primero.ventaOriginalId}</strong>
        </div>
        {primero.motivo && (
          <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 4 }}>
            Motivo: {primero.motivo}
          </div>
        )}

        <div className="divider" />

        {lista.filter(c => c.productoNuevo?.id).map((c, idx) => (
          <div key={c.id ?? `nuevo-${idx}`}>
            <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 6 }}>Artículo nuevo</div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 10 }}>
              <span>{c.qtyNuevo}× {c.productoNuevo.nombre}</span>
              <span style={{ color: "var(--text2)" }}>+{fmt(c.totalNuevo)}</span>
            </div>
          </div>
        ))}

        {lista.filter(c => c.itemViejo?.nombre).map((c, idx) => (
          <div key={c.id ?? `viejo-${idx}`}>
            <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 6 }}>Artículo devuelto</div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 10 }}>
              <span>{c.itemViejo.qty}× {c.itemViejo.nombre}</span>
              <span style={{ color: "var(--text2)" }}>−{fmt(c.totalViejo)}</span>
            </div>
          </div>
        ))}

        <div className="divider" />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text1)" }}>
            {esNotaCredito ? "A favor del cliente" : esNotaDebito ? "A cobrar al cliente" : "Diferencia"}
          </span>
          <span style={{ fontSize: 22, fontWeight: 700, color: tipoColor }}>
            {fmt(Math.abs(diferencia))}
          </span>
        </div>

        {esNotaDebito && (
          <div style={{ marginTop: 8, fontSize: 12, color: "var(--text3)", textAlign: "right" }}>
            Cobrado por {primero.formaPagoDif}
          </div>
        )}

        {esNotaCredito && (
          <div style={{ marginTop: 8, fontSize: 12, color: "var(--text3)", textAlign: "right" }}>
            {primero.formaPagoDif === "Cuenta Corriente"
              ? "Acreditado en cuenta corriente del cliente"
              : `Devuelto por ${primero.formaPagoDif}`}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn" style={{ flex: 1, justifyContent: "center" }} onClick={() => imprimirComprobanteCambio(lista, logoBase64)}>
          <Icon name="printer" size={14} /> Imprimir
        </button>
        <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} onClick={onClose}>
          <Icon name="check" size={14} /> Listo
        </button>
      </div>
    </Modal>
  );
}