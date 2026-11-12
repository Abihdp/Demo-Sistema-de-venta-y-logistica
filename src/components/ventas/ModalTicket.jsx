import { useState } from "react";
import Icon from "../ui/Icon";
import { Modal } from "../ui/Modal";
import { fmt, fmtFechaAR, fmtHoraAR, pagosDeVenta } from "../../utils/helpers";
import { imprimirTicketVenta } from "../../utils/agenteImpresion";

const FUENTE_TICKET = "'Courier New', Consolas, monospace";

export default function ModalTicket({ venta, cambios = [], logoBase64 = null, onClose }) {
  const [modo, setModo] = useState("oscuro"); // "oscuro" | "claro"
  const [esRegalo, setEsRegalo] = useState(false); // ticket sin precios, para cambios
  // Qué artículos de la venta van en el ticket de regalo — por defecto todos
  // (mismo comportamiento que antes), pero se pueden destildar los que no
  // corresponden (p.ej. si el cliente solo quiere regalar parte de la compra).
  const [itemsSeleccionados, setItemsSeleccionados] = useState(
    () => new Set((venta.items || []).map((_, i) => i))
  );
  const toggleItemRegalo = (i) => {
    setItemsSeleccionados(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const claro = modo === "claro";
  const ticket = claro ? styles.claro : styles.oscuro;

  const itemsConIndice = (venta.items || []).map((item, i) => ({ item, i }));
  const itemsParaMostrar = esRegalo
    ? itemsConIndice.filter(({ i }) => itemsSeleccionados.has(i))
    : itemsConIndice;

  return (
    <Modal onClose={onClose} size="modal-sm">
      <div className="modal-header">
        <div className="modal-title">Comprobante #{venta.id || "—"}</div>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      {/* Toggle de vista — visible y etiquetado */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        <button
          onClick={() => setModo("oscuro")}
          style={{
            ...toggleBtn,
            background: !claro ? "var(--bg4)" : "transparent",
            color:      !claro ? "var(--text1)" : "var(--text3)",
            borderColor: !claro ? "var(--border2)" : "transparent",
            fontWeight:  !claro ? 600 : 400,
          }}
        >
          <Icon name="moon" size={13}/> Oscuro
        </button>
        <button
          onClick={() => setModo("claro")}
          style={{
            ...toggleBtn,
            background: claro ? "#fff" : "transparent",
            color:      claro ? "#111" : "var(--text3)",
            borderColor: claro ? "#ccc" : "transparent",
            fontWeight:  claro ? 600 : 400,
          }}
        >
          <Icon name="sun" size={13}/> Claro (imprimir)
        </button>
      </div>

      {/* Ticket de regalo: mismo comprobante, sin precios — para poder hacer cambios */}
      <div style={{ marginBottom: 14 }}>
        <button
          onClick={() => setEsRegalo(v => !v)}
          style={{
            ...toggleBtn,
            width: "100%",
            justifyContent: "center",
            background: esRegalo ? "rgba(124,111,239,0.12)" : "var(--bg4)",
            color:      esRegalo ? "var(--accent2)" : "var(--text3)",
            borderColor: esRegalo ? "var(--accent2)" : "var(--border2)",
            fontWeight:  esRegalo ? 600 : 400,
          }}
        >
          <Icon name="gift" size={13}/> Ticket para regalo (sin precios)
        </button>
      </div>

      {esRegalo && (venta.items || []).length > 1 && (
        <div className="no-print" style={{ marginBottom: 14, padding: 10, borderRadius: 8, background: "var(--bg4)", border: "1px solid var(--border2)" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".03em" }}>
            Artículos incluidos en el ticket de regalo
          </div>
          {(venta.items || []).map((item, i) => (
            <label key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "3px 0", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={itemsSeleccionados.has(i)}
                onChange={() => toggleItemRegalo(i)}
                style={{ accentColor: "var(--accent)" }}
              />
              <span style={{ color: "var(--text1)" }}>{item.qty}× {item.nombre}</span>
            </label>
          ))}
        </div>
      )}

      {/* Cuerpo del ticket */}
      <div className="ticket-print-area" style={{ background: ticket.bg, borderRadius: 8, padding: 16, marginBottom: 16, border: claro ? "1px solid #ccc" : "none", fontFamily: FUENTE_TICKET }}>
        <div style={{ textAlign: "center", marginBottom: 10 }}>
          {logoBase64 && (
            <img src={logoBase64} alt="Logo" style={{ maxWidth: 120, maxHeight: 80, marginBottom: 6 }} />
          )}
          <div style={{ fontSize: 19, fontWeight: 700, color: ticket.title, letterSpacing: "0.06em" }}>PECO'S</div>
          <div style={{ fontSize: 10, color: ticket.muted, letterSpacing: "0.03em" }}>Sistema de Gestión Comercial</div>
        </div>

        <Dash ticket={ticket}/>

        <TLine label="Fecha"       value={`${fmtFechaAR(venta.fecha)}${venta.createdAt ? ` · ${fmtHoraAR(venta.createdAt)}` : ""}`} ticket={ticket}/>
        {venta.id && <TLine label="Comprobante" value={`N° ${String(venta.id).padStart(6, "0")}`} ticket={ticket}/>}
        {venta.usuario && <TLine label="Atendió" value={venta.usuario}        ticket={ticket}/>}

        <Dash ticket={ticket}/>

        <TLine label="Cliente" value={venta.cliente}  ticket={ticket}/>
        {!esRegalo && (venta.pagos && venta.pagos.length > 1 ? (
          venta.pagos.map((p, i) => (
            <TLine key={i} label={i === 0 ? "Pago" : ""} value={`${p.formaPago}: ${fmt(p.monto)}`} ticket={ticket}/>
          ))
        ) : (
          <TLine label="Pago" value={venta.formaPago} ticket={ticket}/>
        ))}
        {!esRegalo && venta.pagos?.[0]?.tarjetaNombre && (
          <TLine
            label="Tarjeta"
            value={`${venta.pagos[0].tarjetaNombre} — ${venta.pagos[0].cuotas} cuota${venta.pagos[0].cuotas !== 1 ? "s" : ""}${venta.pagos[0].interesPct > 0 ? ` (+${venta.pagos[0].interesPct}%)` : ""}`}
            ticket={ticket}
          />
        )}
        <TLine label="Tipo"    value={venta.tipo}     ticket={ticket}/>

        <Dash ticket={ticket}/>

        {(venta.esSeña || esRegalo) && (
          <div style={{ marginBottom: 8, textAlign: "center" }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: claro ? "#7c6fef" : "var(--accent2)", border: `1px solid ${claro ? "#c4baf7" : "rgba(124,111,239,0.3)"}`, borderRadius: 4, padding: "2px 6px", letterSpacing: "0.03em" }}>
              {esRegalo
                ? "TICKET DE REGALO — VÁLIDO PARA CAMBIO"
                : (venta.estado === "pendiente" ? "SEÑA / RESERVA — PENDIENTE DE RETIRO" : "SEÑA / RESERVA")}
            </span>
          </div>
        )}

        {!esRegalo && venta.estado === "pendiente" && (
          <>
            <TLine label="Total factura"    value={fmt(venta.total)} ticket={ticket}/>
            <TLine label="Seña"             value={fmt(pagosDeVenta(venta).reduce((a, p) => a + p.monto, 0))} ticket={ticket}/>
            <TLine label="Saldo pendiente"  value={fmt(Math.max(0, venta.total - pagosDeVenta(venta).reduce((a, p) => a + p.monto, 0)))} ticket={ticket}/>
            <Dash ticket={ticket}/>
          </>
        )}

        {itemsParaMostrar.map(({ item, i }) => {
          const qtyCambiada = cambios
            .filter(c => c.estado !== "anulada" && c.itemViejo?.nombre === item.nombre)
            .reduce((a, c) => a + (c.itemViejo?.qty || 0), 0);
          const cambiado = qtyCambiada > 0;
          return (
            <div key={i} style={{ padding: "3px 0", fontSize: 12, opacity: cambiado ? 0.5 : 1 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ color: ticket.text, textDecoration: cambiado ? "line-through" : "none", flexShrink: 0 }}>
                  {item.qty}×
                </span>
                <span style={{ color: ticket.text, textDecoration: cambiado ? "line-through" : "none", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                  {item.nombre}
                </span>
                {!esRegalo && (
                  <>
                    <span style={{ flex: 1, minWidth: 8, overflow: "hidden", whiteSpace: "nowrap", color: ticket.divider }} aria-hidden="true">
                      {DOTS}
                    </span>
                    <span style={{ color: ticket.accent, fontWeight: 600, whiteSpace: "nowrap", textDecoration: cambiado ? "line-through" : "none", flexShrink: 0 }}>
                      {fmt(item.precio * item.qty)}
                    </span>
                  </>
                )}
              </div>
              {cambiado && (
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".03em", color: claro ? "#b45309" : "var(--amber)" }}>
                  cambiado
                </div>
              )}
            </div>
          );
        })}

        <Dash ticket={ticket} char="="/>

        {esRegalo ? (
          <div style={{ textAlign: "center", fontSize: 10, color: ticket.muted, padding: "2px 0 10px" }}>
            Sin valor fiscal · No indica precios
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 16, fontWeight: 700, padding: "2px 0 10px", letterSpacing: "0.03em" }}>
            <span style={{ color: ticket.title }}>TOTAL</span>
            <span style={{ color: ticket.title }}>{fmt(venta.total)}</span>
          </div>
        )}

        <Dash ticket={ticket}/>

        <div style={{ textAlign: "center", marginTop: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: ticket.title, letterSpacing: "0.04em" }}>¡GRACIAS POR SU COMPRA!</div>
          <div style={{ fontSize: 9, color: ticket.muted, marginTop: 3 }}>
            {esRegalo ? "Presentá este comprobante para cambios" : "Conservá este comprobante"}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn" style={{ flex: 1, justifyContent: "center" }} onClick={() => imprimirTicketVenta(
          esRegalo ? { ...venta, items: itemsParaMostrar.map(({ item }) => item) } : venta,
          cambios, esRegalo, logoBase64
        )}>
          <Icon name="printer" size={14}/> Imprimir
        </button>
        <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} onClick={onClose}>
          <Icon name="check" size={14}/> Listo
        </button>
      </div>
    </Modal>
  );
}

// Separadores como texto (no como línea de fondo): la impresión térmica fuerza
// `background: white !important` en toda .ticket-print-area (ver global.css),
// así que una línea dibujada con background quedaría blanca sobre blanco al
// imprimir. El texto sí respeta el `color: black !important` de la impresión.
const DOTS = ".".repeat(100);

function Dash({ ticket, char = "-" }) {
  return (
    <div style={{ overflow: "hidden", whiteSpace: "nowrap", fontSize: 12, lineHeight: 1, color: ticket.divider, margin: "8px 0" }} aria-hidden="true">
      {char.repeat(100)}
    </div>
  );
}

function TLine({ label, value, ticket }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0", fontSize: 12, gap: 8 }}>
      <span style={{ color: ticket.muted, whiteSpace: "nowrap" }}>{label}</span>
      <span style={{ color: ticket.text, textAlign: "right", wordBreak: "break-word" }}>{value}</span>
    </div>
  );
}

const styles = {
  oscuro: {
    bg:      "var(--bg3)",
    title:   "var(--text1)",
    text:    "var(--text1)",
    muted:   "var(--text3)",
    divider: "var(--border)",
    accent:  "var(--accent2)",
  },
  claro: {
    bg:      "#ffffff",
    title:   "#111111",
    text:    "#222222",
    muted:   "#777777",
    divider: "#dddddd",
    accent:  "#5048c8",
  },
};

const toggleBtn = {
  display: "flex", alignItems: "center", gap: 6,
  padding: "5px 12px", fontSize: 12, border: "1px solid transparent",
  borderRadius: 6, cursor: "pointer",
  fontFamily: "inherit", transition: "all .15s",
};

// ─── MODAL NUEVO CLIENTE ───────────────────────────────────────────────────────
