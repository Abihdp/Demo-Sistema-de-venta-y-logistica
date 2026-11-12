import { useState } from "react";
import { Modal } from "../ui/Modal.jsx";
import Icon from "../ui/Icon.jsx";
import { useToast } from "../ui/Toast.jsx";
import { fmt, today, fmtFechaAR, itemsPendientesEntrega, listaParaFormaPago } from "../../utils/helpers.js";
import { FORMAS_PAGO } from "../../constants/index.js";
import ModalTicket from "../ventas/ModalTicket.jsx";

const ESTADO_BADGE = {
  pendiente:  { label: "Pendiente",  cls: "badge-warn"   },
  completada: { label: "Completada", cls: "badge-ok"     },
  cancelada:  { label: "Cancelada",  cls: "badge-danger" },
};

// Adapta una reserva nativa al mismo esquema que ModalTicket usa para las
// "ventas con seña" (pagos, esSeña, estado, items) — así se reutiliza el
// mismo comprobante imprimible sin duplicar la lógica de impresión. Cada
// seña se lista como un pago; el comprobante muestra total, seña acumulada
// y saldo pendiente igual que en una venta con seña pendiente.
function reservaComoTicket(reserva) {
  return {
    id: reserva.nro,
    fecha: reserva.fecha,
    usuario: reserva.usuario,
    cliente: reserva.cliente,
    formaPago: reserva.señas[0]?.formaPago || "",
    pagos: reserva.señas.map(s => ({ formaPago: s.formaPago, monto: s.monto })),
    tipo: "Reserva",
    esSeña: true,
    estado: reserva.estado === "pendiente" ? "pendiente" : "activa",
    items: reserva.items,
    total: reserva.total,
  };
}

// Sección de selección de cantidades a retirar — aislada en su propio
// componente y remontada (vía `key` en el padre) cada vez que cambia la
// cantidad de retiros ya hechos, para que los inputs vuelvan a arrancar
// en "retirar todo lo pendiente" después de cada retiro parcial.
function SeccionRetirar({ pendientes, onRetirar, retirando }) {
  const [cantidades, setCantidades] = useState(() =>
    Object.fromEntries(pendientes.filter(p => p.qtyPendiente > 0).map(p => [p.productoId, p.qtyPendiente]))
  );

  const setCantidad = (productoId, qty, max) => {
    const v = Math.max(0, Math.min(max, Number(qty) || 0));
    setCantidades(prev => ({ ...prev, [productoId]: v }));
  };

  const itemsElegidos = pendientes
    .filter(p => p.qtyPendiente > 0 && (cantidades[p.productoId] || 0) > 0)
    .map(p => ({ productoId: p.productoId, nombre: p.nombre, precio: p.precio, qty: cantidades[p.productoId] }));
  const subtotalElegido = itemsElegidos.reduce((a, i) => a + i.qty * i.precio, 0);
  const retiraTodo = pendientes.filter(p => p.qtyPendiente > 0).every(p => (cantidades[p.productoId] || 0) >= p.qtyPendiente);

  return (
    <div>
      <div className="card-title" style={{ marginBottom: 8 }}>Retirar mercadería</div>
      <div className="table-wrap" style={{ marginBottom: 10 }}>
        <table>
          <thead><tr><th>Producto</th><th style={{ textAlign: "right" }}>Pendiente</th><th style={{ textAlign: "right", width: 110 }}>Retirar ahora</th></tr></thead>
          <tbody>
            {pendientes.filter(p => p.qtyPendiente > 0).map(p => (
              <tr key={p.productoId}>
                <td style={{ color: "var(--text1)" }}>{p.nombre}</td>
                <td style={{ textAlign: "right", color: "var(--text3)" }}>{p.qtyPendiente}</td>
                <td style={{ textAlign: "right" }}>
                  <input
                    className="form-input" type="number" min={0} max={p.qtyPendiente}
                    style={{ width: 80, textAlign: "right" }}
                    value={cantidades[p.productoId] ?? 0}
                    onChange={e => setCantidad(p.productoId, e.target.value, p.qtyPendiente)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 8 }}>
        Subtotal a retirar: <strong style={{ color: "var(--text2)" }}>{fmt(subtotalElegido)}</strong>
        {" · "}El pago no condiciona el retiro — la seña ya cobrada se asigna automáticamente, el resto queda igual como saldo pendiente.
      </div>
      <button
        className="btn btn-sm btn-success"
        onClick={() => onRetirar(itemsElegidos)}
        disabled={retirando || itemsElegidos.length === 0}
      >
        <Icon name="check" size={13}/> {retirando ? "Registrando..." : retiraTodo ? "Retirar todo — completa la reserva" : "Retirar seleccionado (parcial)"}
      </button>
    </div>
  );
}

export default function ModalDetalleReserva({ reserva, agregarSeña, onRetirar, onRecalcularPrecios, listas = [], cancelarReserva, onClose, usuarioActivo, logoBase64 = null }) {
  const { toast } = useToast();

  const [nuevaMonto, setNuevaMonto] = useState("");
  const [nuevaFormaPago, setNuevaFormaPago] = useState(FORMAS_PAGO[0]);
  const [nuevaObservacion, setNuevaObservacion] = useState("");
  const [guardandoSeña, setGuardandoSeña] = useState(false);

  const [showTicket, setShowTicket] = useState(false);
  const [recalculando, setRecalculando] = useState(false);

  const [retirando, setRetirando] = useState(false);

  const [motivoCancelacion, setMotivoCancelacion] = useState("");
  const [mostrarCancelar, setMostrarCancelar] = useState(false);
  const [cancelando, setCancelando] = useState(false);

  const badge = ESTADO_BADGE[reserva.estado] || { label: reserva.estado, cls: "badge-accent" };
  const pctAbonado = reserva.total > 0 ? Math.min(100, Math.round((reserva.totalSeñas / reserva.total) * 100)) : 0;
  const noCancelada = reserva.estado !== "cancelada";
  const pendientes = itemsPendientesEntrega(reserva);
  const hayPendientes = pendientes.some(p => p.qtyPendiente > 0);

  // Si el medio de pago elegido para una nueva seña tiene asignada una lista
  // distinta a la de la reserva (ej. señaron en Efectivo pero ahora pagan el
  // saldo con Tarjeta), se ofrece recalcular los ítems pendientes contra esa
  // lista antes de registrar el pago — mismo criterio que usa
  // ModalCompletarRetiro para las señas hechas desde Ventas.
  const listaSugerida = noCancelada && reserva.saldoPendiente > 0 ? listaParaFormaPago(listas, nuevaFormaPago) : null;
  const sugerirCambioLista = listaSugerida && listaSugerida.nombre !== reserva.lista;

  const handleRecalcular = async (listaOverride = null) => {
    setRecalculando(true);
    try {
      await onRecalcularPrecios(reserva, listaOverride);
    } finally {
      setRecalculando(false);
    }
  };

  const handleAgregarSeña = async () => {
    const monto = Number(nuevaMonto);
    if (!nuevaMonto.trim() || isNaN(monto) || monto <= 0) { toast("Ingresá un monto válido.", "error"); return; }

    setGuardandoSeña(true);
    try {
      await agregarSeña(reserva.id, {
        fecha: today(),
        monto,
        formaPago: nuevaFormaPago,
        observacion: nuevaObservacion.trim(),
        usuario: usuarioActivo?.nombre || "",
      });
      toast(`Seña de ${fmt(monto)} registrada.`, "success");
      setNuevaMonto("");
      setNuevaObservacion("");
    } catch (err) {
      toast(err.message || "Error al registrar la seña.", "error");
    } finally {
      setGuardandoSeña(false);
    }
  };

  const handleRetirar = async (itemsElegidos) => {
    setRetirando(true);
    try {
      await onRetirar(reserva, itemsElegidos);
      const quedaAlgo = pendientes.some(p => {
        const tomado = itemsElegidos.find(i => i.productoId === p.productoId)?.qty || 0;
        return tomado < p.qtyPendiente;
      });
      if (!quedaAlgo) onClose();
    } catch (err) {
      toast(err.message || "Error al registrar el retiro.", "error");
    } finally {
      setRetirando(false);
    }
  };

  const handleCancelar = async () => {
    if (!motivoCancelacion.trim()) { toast("Ingresá un motivo de cancelación.", "error"); return; }
    setCancelando(true);
    try {
      await cancelarReserva(reserva.id, motivoCancelacion.trim());
      toast(`Reserva ${reserva.nro} cancelada.`, "success");
      onClose();
    } catch (err) {
      toast(err.message || "Error al cancelar la reserva.", "error");
    } finally {
      setCancelando(false);
    }
  };

  return (
    <>
    <Modal onClose={onClose} size="modal-lg">
      <div className="modal-header">
        <div>
          <div className="modal-title">{reserva.nro} <span className={`badge ${badge.cls}`} style={{ marginLeft: 8 }}>{badge.label}</span></div>
          <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>{fmtFechaAR(reserva.fecha)} · {reserva.cliente}</div>
        </div>
        <button className="close-btn" onClick={onClose}><Icon name="close" size={16}/></button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {reserva.observacion && reserva.estado !== "cancelada" && (
          <div style={{ fontSize: 12, color: "var(--text3)", padding: "8px 12px", background: "var(--bg3)", borderRadius: "var(--radius-sm)" }}>
            {reserva.observacion}
          </div>
        )}
        {reserva.estado === "cancelada" && reserva.observacion && (
          <div style={{ fontSize: 12, color: "var(--red)", padding: "8px 12px", background: "rgba(242,107,91,0.08)", border: "1px solid rgba(242,107,91,0.2)", borderRadius: "var(--radius-sm)" }}>
            Motivo de cancelación: {reserva.observacion}
          </div>
        )}

        {/* Artículos */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Artículos reservados</div>
            {noCancelada && (
              <button className="btn btn-sm" title={`Lista actual: ${reserva.lista || "—"}`} onClick={() => handleRecalcular()} disabled={recalculando}>
                <Icon name="sync" size={13}/> {recalculando ? "Recalculando..." : "Recalcular precios"}
              </button>
            )}
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Producto</th><th style={{ textAlign: "right" }}>Cant.</th><th style={{ textAlign: "right" }}>Retirado</th><th style={{ textAlign: "right" }}>Pendiente</th><th style={{ textAlign: "right" }}>Subtotal</th></tr></thead>
              <tbody>
                {pendientes.map((it, i) => (
                  <tr key={i}>
                    <td style={{ color: "var(--text1)" }}>{it.nombre}</td>
                    <td style={{ textAlign: "right" }}>{it.qty}</td>
                    <td style={{ textAlign: "right", color: it.qtyRetirada > 0 ? "var(--green)" : "var(--text3)" }}>{it.qtyRetirada}</td>
                    <td style={{ textAlign: "right", color: it.qtyPendiente > 0 ? "var(--amber)" : "var(--text3)", fontWeight: it.qtyPendiente > 0 ? 600 : 400 }}>{it.qtyPendiente}</td>
                    <td style={{ textAlign: "right", fontWeight: 600, color: "var(--accent2)" }}>{fmt(it.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} style={{ fontWeight: 600, color: "var(--text1)" }}>Total</td>
                  <td style={{ textAlign: "right", fontWeight: 700, color: "var(--accent2)", fontSize: 15 }}>{fmt(reserva.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Señas */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Historial de señas</div>
            {reserva.señas.length > 0 && (
              <button className="btn btn-sm" onClick={() => setShowTicket(true)}>
                <Icon name="printer" size={13}/> Imprimir comprobante de seña
              </button>
            )}
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>N° seña</th><th>Fecha</th><th>Forma de pago</th><th style={{ textAlign: "right" }}>Monto</th></tr></thead>
              <tbody>
                {reserva.señas.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--text3)", padding: 16 }}>Sin señas registradas</td></tr>
                ) : reserva.señas.map(s => (
                  <tr key={s.id}>
                    <td className="mono" style={{ fontSize: 12, color: "var(--text3)" }}>{s.nro}</td>
                    <td style={{ fontSize: 13 }}>{fmtFechaAR(s.fecha)}</td>
                    <td><span className="badge badge-blue">{s.formaPago}</span></td>
                    <td style={{ textAlign: "right", fontWeight: 600, color: "var(--green)" }}>+{fmt(s.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 10 }}>
            <div style={{ height: 8, background: "var(--bg4)", borderRadius: 99, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pctAbonado}%`, background: pctAbonado >= 100 ? "var(--green)" : "var(--accent)", transition: "width .2s" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 12 }}>
              <span style={{ color: "var(--text3)" }}>{pctAbonado}% abonado — señas: <strong style={{ color: "var(--green)" }}>{fmt(reserva.totalSeñas)}</strong></span>
              <span style={{ color: reserva.saldoPendiente > 0 ? "var(--amber)" : "var(--green)", fontWeight: 700 }}>Saldo pendiente: {fmt(reserva.saldoPendiente)}</span>
            </div>
          </div>
        </div>

        {/* Retiros ya hechos */}
        {reserva.retiros?.length > 0 && (
          <div>
            <div className="card-title" style={{ marginBottom: 8 }}>Historial de retiros</div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>N° retiro</th><th>Fecha</th><th>Items</th><th style={{ textAlign: "right" }}>Venta</th></tr></thead>
                <tbody>
                  {reserva.retiros.map((r, i) => (
                    <tr key={i}>
                      <td className="mono" style={{ fontSize: 12, color: "var(--text3)" }}>{r.nro}</td>
                      <td style={{ fontSize: 13 }}>{fmtFechaAR(r.fecha)}</td>
                      <td style={{ fontSize: 12, color: "var(--text2)" }}>{r.items.map(i => `${i.qty}x ${i.nombre}`).join(", ")}</td>
                      <td style={{ textAlign: "right", fontSize: 12, color: "var(--text3)" }}>#{r.ventaId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Acciones */}
        {noCancelada && (reserva.saldoPendiente > 0 || hayPendientes) && (
          <div style={{ height: 1, background: "var(--border)" }} />
        )}

        {/* Agregar seña — disponible mientras haya saldo, aunque ya se haya retirado todo */}
        {noCancelada && reserva.saldoPendiente > 0 && (
          <div>
            <div className="card-title" style={{ marginBottom: 8 }}>Agregar seña</div>
            <div className="form-row form-row-2" style={{ marginBottom: 8 }}>
              <div className="form-group">
                <label className="form-label">Monto</label>
                <input className="form-input" type="number" min="0" placeholder="0" value={nuevaMonto} onChange={e => setNuevaMonto(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Forma de pago</label>
                <select className="form-select" value={nuevaFormaPago} onChange={e => setNuevaFormaPago(e.target.value)}>
                  {FORMAS_PAGO.filter(f => f !== "Cuenta Corriente").map(f => <option key={f}>{f}</option>)}
                </select>
              </div>
            </div>
            {sugerirCambioLista && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 14px", background: "color-mix(in srgb, var(--accent) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)", borderRadius: "var(--radius)", marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: "var(--accent2)" }}>
                  <Icon name="info" size={13} style={{ marginRight: 4 }}/>
                  "{nuevaFormaPago}" usa la lista "{listaSugerida.nombre}" (reserva actual: "{reserva.lista || "—"}"). Recalculá los ítems pendientes antes de registrar la seña.
                </div>
                <button className="btn btn-sm btn-primary" onClick={() => handleRecalcular(listaSugerida)} disabled={recalculando}>
                  <Icon name="sync" size={13}/> {recalculando ? "Recalculando..." : `Recalcular con "${listaSugerida.nombre}"`}
                </button>
              </div>
            )}
            <div className="form-group" style={{ marginBottom: 8 }}>
              <label className="form-label">Observación <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "var(--text3)" }}>(opcional)</span></label>
              <input className="form-input" value={nuevaObservacion} onChange={e => setNuevaObservacion(e.target.value)} />
            </div>
            <button className="btn btn-sm btn-primary" onClick={handleAgregarSeña} disabled={guardandoSeña}>
              <Icon name="plus" size={13}/> {guardandoSeña ? "Registrando..." : "Registrar seña"}
            </button>
          </div>
        )}

        {noCancelada && reserva.saldoPendiente > 0 && hayPendientes && (
          <div style={{ height: 1, background: "var(--border)" }} />
        )}

        {/* Retirar mercadería */}
        {noCancelada && hayPendientes && (
          <SeccionRetirar
            key={reserva.retiros?.length || 0}
            pendientes={pendientes}
            onRetirar={handleRetirar}
            retirando={retirando}
          />
        )}

        {/* Cancelar — solo mientras la reserva sigue pendiente */}
        {reserva.estado === "pendiente" && (
          <>
            <div style={{ height: 1, background: "var(--border)" }} />
            <div>
              {!mostrarCancelar ? (
                <button className="btn btn-sm btn-ghost" style={{ color: "var(--red)" }} onClick={() => setMostrarCancelar(true)}>
                  <Icon name="close" size={13}/> Cancelar reserva
                </button>
              ) : (
                <div style={{ padding: "12px 14px", background: "rgba(242,107,91,0.06)", border: "1px solid rgba(242,107,91,0.2)", borderRadius: "var(--radius)" }}>
                  <div style={{ fontSize: 12, color: "var(--red)", marginBottom: 8 }}>
                    Las señas abonadas no se devuelven automáticamente. Si corresponde devolución, registrala manualmente en Caja.
                    {reserva.retiros?.length > 0 && " Los items ya retirados quedan como ventas firmes — esto solo cancela lo que falta entregar."}
                  </div>
                  <div className="form-group" style={{ marginBottom: 8 }}>
                    <label className="form-label">Motivo de cancelación</label>
                    <input className="form-input" value={motivoCancelacion} onChange={e => setMotivoCancelacion(e.target.value)} placeholder="Ej: Cliente desistió" />
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-sm btn-ghost" onClick={() => setMostrarCancelar(false)}>Volver</button>
                    <button className="btn btn-sm btn-danger" onClick={handleCancelar} disabled={cancelando}>
                      {cancelando ? "Cancelando..." : "Confirmar cancelación"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {reserva.estado === "completada" && (
          <div style={{ fontSize: 12, color: "var(--text3)" }}>
            Retirada el {fmtFechaAR(reserva.fechaCompletada)}
          </div>
        )}
      </div>

      <div className="modal-footer">
        <button className="btn btn-sm btn-ghost" onClick={onClose}>Cerrar</button>
      </div>
    </Modal>

    {showTicket && (
      <ModalTicket
        venta={reservaComoTicket(reserva)}
        logoBase64={logoBase64}
        onClose={() => setShowTicket(false)}
      />
    )}
    </>
  );
}
