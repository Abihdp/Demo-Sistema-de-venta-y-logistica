import { useState } from "react";
import { Modal } from "../ui/Modal.jsx";
import Icon from "../ui/Icon.jsx";
import { useToast } from "../ui/Toast.jsx";
import { fmt, pagosDeVenta, fmtFechaAR, itemsPendientesEntrega, listaParaFormaPago } from "../../utils/helpers";
import { FORMAS_PAGO } from "../../constants";

// Sección de selección de cantidades a retirar — aislada y remontada (vía
// `key` en el padre) cada vez que cambia la cantidad de retiros ya hechos,
// para que los inputs vuelvan a arrancar en "retirar todo lo pendiente"
// después de cada retiro parcial. Mismo patrón que SeccionRetirar en
// ModalDetalleReserva.jsx (Reservas nativas).
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
        El retiro no queda condicionado a que esté todo pago — el cobro es una acción aparte, más abajo.
      </div>
      <button
        className="btn btn-sm btn-success"
        onClick={() => onRetirar(itemsElegidos)}
        disabled={retirando || itemsElegidos.length === 0}
      >
        <Icon name="check" size={13}/> {retirando ? "Registrando..." : retiraTodo ? "Retirar todo" : "Retirar seleccionado (parcial)"}
      </button>
    </div>
  );
}

export default function ModalCompletarRetiro({ venta, configPrecios = {}, tarjetas = [], listas = [], onRetirar, onAgregarPago, onRecalcularPrecios, onClose }) {
  const { toast } = useToast();
  const [retirando, setRetirando]           = useState(false);
  const [recalculando, setRecalculando]     = useState(false);

  const [montoPago, setMontoPago]           = useState("");
  const [formaPago, setFormaPago]           = useState(FORMAS_PAGO[0]);
  const [tarjetaId, setTarjetaId]           = useState(null);
  const [cuotasSel, setCuotasSel]           = useState(null);
  const [pagando, setPagando]               = useState(false);

  const pagos      = pagosDeVenta(venta);
  const cobrado     = pagos.reduce((a, p) => a + p.monto, 0);
  const saldo        = Math.max(0, venta.total - cobrado);
  const pctAbonado = venta.total > 0 ? Math.min(100, Math.round((cobrado / venta.total) * 100)) : 0;
  const pendientes = itemsPendientesEntrega(venta);
  const hayPendientes = pendientes.some(p => p.qtyPendiente > 0);

  const diasDesde = Math.floor((Date.now() - new Date(`${venta.fecha}T00:00:00`).getTime()) / 86400000);
  const umbralAviso = configPrecios?.diasAvisoActualizarPrecios ?? 15;
  const mostrarAvisoPrecio = diasDesde >= umbralAviso;

  // Si el medio de pago elegido para el saldo tiene asignada una lista
  // distinta a la de la venta (ej. señaron en Efectivo pero cobran la
  // diferencia con Tarjeta), se ofrece recalcular los ítems pendientes
  // contra esa lista antes de cobrar — mismo criterio de asignación que usa
  // ModalNuevaVenta/ModalNuevaReserva al crear la seña.
  const listaSugerida = saldo > 0 ? listaParaFormaPago(listas, formaPago) : null;
  const sugerirCambioLista = listaSugerida && listaSugerida.nombre !== venta.lista;

  const tarjetaSeleccionada = tarjetas.find(t => t.id === tarjetaId) || null;
  const cuotaInfo = tarjetaSeleccionada?.cuotas.find(c => c.cuotas === cuotasSel) || null;
  const interesPct = (formaPago === "Tarjeta Crédito" && cuotaInfo?.interesPct) || 0;
  const montoConRecargo = interesPct > 0 && montoPago ? Math.round(Number(montoPago) * (1 + interesPct / 100)) : Number(montoPago) || 0;

  const handleFormaPago = (valor) => {
    setFormaPago(valor);
    if (valor === "Tarjeta Crédito" && tarjetas.length > 0) {
      setTarjetaId(tarjetas[0].id);
      setCuotasSel(tarjetas[0].cuotas?.[0]?.cuotas ?? null);
    } else {
      setTarjetaId(null);
      setCuotasSel(null);
    }
  };
  const handleTarjetaId = (valor) => {
    const tid = Number(valor);
    setTarjetaId(tid);
    const t = tarjetas.find(t => t.id === tid);
    if (t && !t.cuotas.some(c => c.cuotas === cuotasSel)) setCuotasSel(t.cuotas[0]?.cuotas ?? null);
  };

  const handleRetirar = async (itemsElegidos) => {
    setRetirando(true);
    try {
      await onRetirar(venta, itemsElegidos);
      const quedaAlgo = pendientes.some(p => {
        const tomado = itemsElegidos.find(i => i.productoId === p.productoId)?.qty || 0;
        return tomado < p.qtyPendiente;
      });
      if (!quedaAlgo && saldo <= 0) onClose();
    } catch (err) {
      toast(err.message || "Error al registrar el retiro.", "error");
    } finally {
      setRetirando(false);
    }
  };

  const handlePagar = async () => {
    const monto = Number(montoPago);
    if (!montoPago || isNaN(monto) || monto <= 0) { toast("Ingresá un monto válido.", "error"); return; }
    if (monto > saldo) { toast(`El monto no puede superar el saldo pendiente (${fmt(saldo)}).`, "error"); return; }

    setPagando(true);
    try {
      const tarjetaInfo = interesPct > 0
        ? { tarjetaId, tarjetaNombre: tarjetaSeleccionada?.nombre || "", cuotas: cuotasSel, interesPct }
        : null;
      await onAgregarPago(venta, { monto, formaPago, tarjetaInfo });
      setMontoPago("");
      if (!hayPendientes && monto >= saldo) onClose();
    } catch (err) {
      toast(err.message || "Error al registrar el pago.", "error");
    } finally {
      setPagando(false);
    }
  };

  const handleRecalcular = async (listaOverride = null) => {
    setRecalculando(true);
    try {
      await onRecalcularPrecios(venta, listaOverride);
    } finally {
      setRecalculando(false);
    }
  };

  return (
    <Modal onClose={onClose} size="modal-lg">
      <div className="modal-header">
        <div>
          <div className="modal-title">Venta #{venta.id}</div>
          <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>{fmtFechaAR(venta.fecha)} · {venta.cliente}</div>
        </div>
        <button className="close-btn" onClick={onClose}><Icon name="close" size={16}/></button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Artículos */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Artículos reservados</div>
            <button className="btn btn-sm" title={`Lista actual: ${venta.lista || "—"}`} onClick={() => handleRecalcular()} disabled={recalculando}>
              <Icon name="sync" size={13}/> {recalculando ? "Recalculando..." : "Recalcular precios"}
            </button>
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
                    <td style={{ textAlign: "right", fontWeight: 600, color: "var(--accent2)" }}>{fmt(it.precio * it.qty)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} style={{ fontWeight: 600, color: "var(--text1)" }}>Total factura</td>
                  <td style={{ textAlign: "right", fontWeight: 700, color: "var(--accent2)", fontSize: 15 }}>{fmt(venta.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Pagos */}
        <div>
          <div className="card-title" style={{ marginBottom: 8 }}>Pagos registrados</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Forma de pago</th><th style={{ textAlign: "right" }}>Monto</th></tr></thead>
              <tbody>
                {pagos.length === 0 ? (
                  <tr><td colSpan={2} style={{ textAlign: "center", color: "var(--text3)", padding: 16 }}>Sin pagos registrados</td></tr>
                ) : pagos.map((p, i) => (
                  <tr key={i}>
                    <td><span className="badge badge-blue">{p.formaPago}</span></td>
                    <td style={{ textAlign: "right", fontWeight: 600, color: "var(--green)" }}>+{fmt(p.monto)}</td>
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
              <span style={{ color: "var(--text3)" }}>{pctAbonado}% abonado — cobrado: <strong style={{ color: "var(--green)" }}>{fmt(cobrado)}</strong></span>
              <span style={{ color: saldo > 0 ? "var(--amber)" : "var(--green)", fontWeight: 700 }}>Saldo pendiente: {fmt(saldo)}</span>
            </div>
          </div>
        </div>

        {/* Retiros ya hechos */}
        {venta.retiros?.length > 0 && (
          <div>
            <div className="card-title" style={{ marginBottom: 8 }}>Historial de retiros</div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>N° retiro</th><th>Fecha</th><th>Items</th></tr></thead>
                <tbody>
                  {venta.retiros.map((r, i) => (
                    <tr key={i}>
                      <td className="mono" style={{ fontSize: 12, color: "var(--text3)" }}>{r.nro}</td>
                      <td style={{ fontSize: 13 }}>{fmtFechaAR(r.fecha)}</td>
                      <td style={{ fontSize: 12, color: "var(--text2)" }}>{r.items.map(i => `${i.qty}x ${i.nombre}`).join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {mostrarAvisoPrecio && (
          <div style={{ padding: "10px 14px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "var(--radius)", fontSize: 12, color: "var(--amber)" }}>
            <Icon name="warning" size={13} style={{ marginRight: 4 }}/>
            Pasaron {diasDesde} días desde la seña — los precios pueden haber cambiado. Usá "Recalcular precios" arriba si corresponde.
          </div>
        )}

        <div style={{ height: 1, background: "var(--border)" }} />

        {/* Registrar pago — independiente del retiro */}
        {saldo > 0 && (
          <div>
            <div className="card-title" style={{ marginBottom: 8 }}>Registrar pago</div>
            <div className="form-row form-row-2" style={{ marginBottom: 8 }}>
              <div className="form-group">
                <label className="form-label">Monto (saldo: {fmt(saldo)})</label>
                <input className="form-input" type="number" min="0" max={saldo} placeholder="0" value={montoPago} onChange={e => setMontoPago(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Forma de pago</label>
                <select className="form-select" value={formaPago} onChange={e => handleFormaPago(e.target.value)}>
                  {FORMAS_PAGO.map(f => <option key={f}>{f}</option>)}
                </select>
              </div>
            </div>
            {sugerirCambioLista && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 14px", background: "color-mix(in srgb, var(--accent) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)", borderRadius: "var(--radius)", marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: "var(--accent2)" }}>
                  <Icon name="info" size={13} style={{ marginRight: 4 }}/>
                  "{formaPago}" usa la lista "{listaSugerida.nombre}" (venta actual: "{venta.lista || "—"}"). Recalculá los ítems pendientes antes de cobrar el saldo.
                </div>
                <button className="btn btn-sm btn-primary" onClick={() => handleRecalcular(listaSugerida)} disabled={recalculando}>
                  <Icon name="sync" size={13}/> {recalculando ? "Recalculando..." : `Recalcular con "${listaSugerida.nombre}"`}
                </button>
              </div>
            )}
            {formaPago === "Tarjeta Crédito" && tarjetas.length > 0 && (
              <div className="form-row form-row-2" style={{ gap: 10, marginBottom: 8, maxWidth: 400 }}>
                <div className="form-group">
                  <label className="form-label">Tarjeta</label>
                  <select className="form-select" value={tarjetaId ?? ""} onChange={e => handleTarjetaId(e.target.value)}>
                    {tarjetas.map(t => (
                      <option key={t.id} value={t.id}>{t.nombre}{t.banco ? ` (${t.banco})` : ""}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Cuotas</label>
                  {tarjetaSeleccionada?.cuotas.length > 0 ? (
                    <select className="form-select" value={cuotasSel ?? ""} onChange={e => setCuotasSel(Number(e.target.value))}>
                      {tarjetaSeleccionada.cuotas.map(c => (
                        <option key={c.id} value={c.cuotas}>
                          {c.cuotas} cuota{c.cuotas !== 1 ? "s" : ""}{c.interesPct > 0 ? ` (+${c.interesPct}%)` : " (sin interés)"}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div style={{ padding: "9px 12px", background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 12, color: "var(--text3)" }}>
                      Sin cuotas cargadas para esta tarjeta
                    </div>
                  )}
                </div>
              </div>
            )}
            {interesPct > 0 && montoPago && (
              <div style={{ fontSize: 12, color: "var(--amber)", marginBottom: 8 }}>
                Recargo por tarjeta (+{interesPct}%) — se cobra: <strong>{fmt(montoConRecargo)}</strong>
              </div>
            )}
            <button className="btn btn-sm btn-primary" onClick={handlePagar} disabled={pagando}>
              <Icon name="plus" size={13}/> {pagando ? "Registrando..." : "Registrar pago"}
            </button>
          </div>
        )}

        {saldo > 0 && hayPendientes && (
          <div style={{ height: 1, background: "var(--border)" }} />
        )}

        {/* Retirar mercadería — independiente del pago */}
        {hayPendientes && (
          <SeccionRetirar
            key={venta.retiros?.length || 0}
            pendientes={pendientes}
            onRetirar={handleRetirar}
            retirando={retirando}
          />
        )}

        {!hayPendientes && saldo <= 0 && (
          <div style={{ fontSize: 13, color: "var(--green)", fontWeight: 600 }}>
            <Icon name="check" size={14} style={{ marginRight: 4 }}/> Retirada y cobrada por completo.
          </div>
        )}
      </div>

      <div className="modal-footer">
        <button className="btn btn-sm btn-ghost" onClick={onClose}>Cerrar</button>
      </div>
    </Modal>
  );
}
