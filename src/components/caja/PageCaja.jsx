import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../lib/supabase";
import Modal from "../ui/Modal";
import Icon from "../ui/Icon";
import Paginacion from "../ui/Paginacion";
import { usePaginacion } from "../../hooks/usePaginacion";
import { fmt, today, daysAgo, uid, horaActual, montoCtaCte, totalPorFormaPago, calcularMoraCliente, clienteAtrasadoSinMora, detalleVentasCtaCte, pagosDeVenta, fmtFechaAR, reciboEditable, moraCobradaDeRecibo, cargosManualesActivos } from "../../utils/helpers";
import { FORMAS_PAGO } from "../../constants/index";
import ModalDetalleCierre from "./ModalDetalleCierre";
import { useToast } from "../ui/Toast";
import { useConnectivity } from "../../lib/connectivity.js";
import { conTimeout } from "../../lib/outbox.js";

// ─── Modal: Retiro con cuenta contable ─────────────────────────────────────────
const CUENTA_RETIRO_DUENO = "retiro_dueno";

function ModalRetiro({ disponible, planCuentas, proveedores, onClose, onConfirm }) {
  const cuentasEgreso = (planCuentas || [])
    .filter(c => c.imputable && c.tipo === "egreso")
    .sort((a, b) => (a.codigo || "").localeCompare(b.codigo || ""));

  const [monto,       setMonto]       = useState("");
  const [cuenta,      setCuenta]      = useState("");
  const [medio,       setMedio]       = useState("Efectivo");
  const [motivo,      setMotivo]      = useState("");
  const [proveedorId, setProveedorId] = useState("");
  const [error,       setError]       = useState("");

  const montoNum  = parseFloat(monto);
  const sinFondos = medio === "Efectivo" && !isNaN(montoNum) && montoNum > 0 && montoNum > disponible;
  const esDueno   = cuenta === CUENTA_RETIRO_DUENO;
  const cuentaSeleccionada = cuentasEgreso.find(c => String(c.id) === String(cuenta));
  const canConfirm = !!cuenta && !isNaN(montoNum) && montoNum > 0 && !sinFondos;

  const confirmar = () => {
    setError("");
    if (isNaN(montoNum) || montoNum <= 0) { setError("Ingresá un monto mayor a cero."); return; }
    if (medio === "Efectivo" && montoNum > disponible) { setError(`Fondos insuficientes. Disponible: ${fmt(disponible)}`); return; }
    if (!cuenta) { setError("Seleccioná una cuenta contable."); return; }
    onConfirm({
      monto: montoNum,
      motivo: motivo || "Retiro",
      medio,
      cuentaId: cuenta,
      cuentaNombre: esDueno ? "Retiro de dueño" : (cuentaSeleccionada?.nombre || ""),
      proveedorId: proveedorId || null,
    });
  };

  return (
    <Modal onClose={onClose} size="modal-sm">
      <div className="modal-header">
        <div className="modal-title">Nuevo retiro</div>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>
      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="form-group">
          <label className="form-label">Cuenta contable <span style={{ color: "var(--red)" }}>*</span></label>
          <select className="form-select" value={cuenta}
            onChange={e => { setCuenta(e.target.value); setError(""); }}>
            <option value="">— Seleccionar cuenta —</option>
            <optgroup label="Especial">
              <option value={CUENTA_RETIRO_DUENO}>👤 Retiro de dueño</option>
            </optgroup>
            <optgroup label="Cuentas contables (egreso)">
              {cuentasEgreso.map(c => (
                <option key={c.id} value={c.id}>{c.codigo} · {c.nombre}</option>
              ))}
            </optgroup>
          </select>
          {cuenta ? (
            <span style={{ fontSize: 12, marginTop: 4, display: "flex", alignItems: "center", gap: 5, color: esDueno ? "var(--blue)" : "var(--green)" }}>
              <Icon name={esDueno ? "user" : "tag"} size={12} color={esDueno ? "var(--blue)" : "var(--green)"} />
              {esDueno
                ? "Movimiento de patrimonio — no genera gasto operativo."
                : "Se generará un gasto vinculado a esta cuenta en el módulo de Gastos."}
            </span>
          ) : (
            <span style={{ fontSize: 12, color: "var(--text3)", marginTop: 4, display: "block" }}>
              Seleccioná una cuenta contable para continuar.
            </span>
          )}
        </div>
        <div className="form-group">
          <label className="form-label">Medio de retiro</label>
          <div className="segmented-control">
            <button
              type="button"
              className={`segmented-btn${medio === "Efectivo" ? " active" : ""}`}
              onClick={() => { setMedio("Efectivo"); setError(""); }}
            >
              Efectivo
            </button>
            <button
              type="button"
              className={`segmented-btn${medio === "Transferencia" ? " active" : ""}`}
              onClick={() => { setMedio("Transferencia"); setError(""); }}
            >
              Transferencia
            </button>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Monto <span style={{ color: "var(--red)" }}>*</span></label>
          <input className="form-input" type="number" placeholder="0" value={monto}
            onChange={e => { setMonto(e.target.value); setError(""); }} />
          {medio === "Efectivo" ? (
            <span style={{ fontSize: 11, color: "var(--text3)", marginTop: 4, display: "block" }}>
              Disponible en caja: <strong style={{ color: disponible < 0 ? "var(--red)" : "var(--text1)" }}>{fmt(disponible)}</strong>
            </span>
          ) : (
            <span style={{ fontSize: 11, color: "var(--text3)", marginTop: 4, display: "block" }}>
              No descuenta del efectivo físico de la caja.
            </span>
          )}
        </div>
        <div className="form-group">
          <label className="form-label">Motivo / Descripción</label>
          <input className="form-input" placeholder="Ej: Pago a proveedor, retiro dueño..."
            value={motivo} onChange={e => setMotivo(e.target.value)} />
        </div>
        {!esDueno && proveedores && proveedores.length > 0 && (
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
        {sinFondos && (
          <div style={{ padding: "9px 12px", background: "rgba(242,107,91,0.08)", border: "1px solid rgba(242,107,91,0.25)", borderRadius: 8, fontSize: 13, color: "var(--red)", display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="warning" size={14} color="var(--red)" />
            Fondos insuficientes. Disponible: <strong>{fmt(disponible)}</strong>
          </div>
        )}
        {error && !sinFondos && (
          <div style={{ padding: "9px 12px", background: "rgba(242,107,91,0.08)", border: "1px solid rgba(242,107,91,0.25)", borderRadius: 8, fontSize: 13, color: "var(--red)" }}>{error}</div>
        )}
      </div>
      <div className="modal-footer">
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-danger" onClick={confirmar} disabled={!canConfirm}
          style={{ opacity: canConfirm ? 1 : 0.5 }}>
          Confirmar retiro
        </button>
      </div>
    </Modal>
  );
}

// ─── Modal: Recibo / Nota de Crédito / Nota de Débito ─────────────────────────
function ModalComprobante({ tipo, numero, clientes, ventas, pagosCtaCte, onClose, onConfirm }) {
  const [clienteId,     setClienteId]     = useState("");
  const [clienteLibre,  setClienteLibre]  = useState("");
  const [seleccionadas, setSeleccionadas] = useState({}); // Recibo: { ventaId: montoStr }
  const [ventaIdRef,    setVentaIdRef]    = useState(""); // NC/ND: referencia simple
  const [concepto,      setConcepto]      = useState("");
  const [formaPago,     setFormaPago]     = useState("Efectivo");
  const [monto,         setMonto]         = useState(""); // cuando no hay selección
  const [observaciones, setObservaciones] = useState("");
  const [devuelveMercaderia, setDevuelveMercaderia] = useState(false); // solo Nota de Crédito
  const [itemsSel,      setItemsSel]      = useState({}); // { idx: qty } sobre ventaRefSel.items
  const [error,         setError]         = useState("");
  const [guardando,     setGuardando]     = useState(false);

  const esRecibo      = tipo === "Recibo";
  const esNotaCredito = tipo === "Nota de Crédito";
  const colorTipo = tipo === "Recibo" ? "var(--green)" : tipo === "Nota de Crédito" ? "var(--blue)" : "var(--amber)";

  // Ventas en cta cte con saldo pendiente (Recibo)
  const ventasCuentaCorriente = clienteId
    ? ventas
        .filter(v => v.clienteId === parseInt(clienteId) && montoCtaCte(v) > 0)
        .map(v => {
          const pagado = (pagosCtaCte || [])
            .filter(p => p.ventaId === v.id)
            .reduce((sum, p) => sum + p.monto, 0);
          return { ...v, pagado, saldoPendiente: montoCtaCte(v) - pagado };
        })
        .filter(v => v.saldoPendiente > 0.009)
        .sort((a, b) => a.fecha.localeCompare(b.fecha)) // más antiguas primero
    : [];

  // Todas las ventas del cliente (NC/ND) — no tiene sentido referenciar una ya anulada
  const todasVentasCliente = clienteId
    ? ventas.filter(v => v.clienteId === parseInt(clienteId) && v.estado !== "anulada")
        .sort((a, b) => b.fecha.localeCompare(a.fecha))
    : [];

  const tieneSeleccionadas = esRecibo && Object.keys(seleccionadas).length > 0;
  const totalSeleccionado  = Object.values(seleccionadas).reduce((s, m) => s + (parseFloat(m) || 0), 0);

  const ventaRefSel = ventaIdRef ? ventas.find(v => v.id === parseInt(ventaIdRef)) : null;
  const ventaRefTieneCtaCte = ventaRefSel ? montoCtaCte(ventaRefSel) > 0 : false;

  // Cuando devuelve mercadería, el monto se calcula solo a partir de lo tildado
  // (mismo patrón que "Facturas en Cuenta Corriente" del Recibo) — no tiene
  // sentido pedirlo a mano si ya sabemos qué artículos y a qué precio vuelven.
  const tieneItemsDevueltos = esNotaCredito && devuelveMercaderia && Object.keys(itemsSel).length > 0;
  const totalItemsDevueltos = Object.entries(itemsSel)
    .reduce((s, [idx, qty]) => s + qty * (ventaRefSel?.items[parseInt(idx)]?.precio || 0), 0);

  const handleClienteChange = (e) => {
    setClienteId(e.target.value);
    setClienteLibre("");
    setSeleccionadas({});
    setVentaIdRef("");
    setDevuelveMercaderia(false);
    setItemsSel({});
    setError("");
  };

  const handleVentaRefChange = (e) => {
    const val = e.target.value;
    setVentaIdRef(val);
    setDevuelveMercaderia(false);
    setItemsSel({});
    const venta = val ? ventas.find(v => v.id === parseInt(val)) : null;
    setFormaPago(venta && montoCtaCte(venta) > 0 ? "Cuenta Corriente" : "Efectivo");
    setError("");
  };

  const toggleItemDevuelto = (idx, qtyVendida) => {
    setItemsSel(prev => {
      if (prev[idx] !== undefined) {
        const { [idx]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [idx]: qtyVendida };
    });
  };
  const setQtyItemDevuelto = (idx, qty) => setItemsSel(prev => ({ ...prev, [idx]: qty }));

  const toggleVenta = (ventaId, saldoPendiente) => {
    setSeleccionadas(prev => {
      if (prev[ventaId] !== undefined) {
        const { [ventaId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [ventaId]: String(saldoPendiente) };
    });
    setError("");
  };

  const confirmar = async () => {
    if (guardando) return; // evita doble registro por doble click
    setError("");
    if (!concepto.trim()) { setError("Ingresá un concepto."); return; }

    if (esNotaCredito && devuelveMercaderia && Object.keys(itemsSel).length === 0) {
      setError("Elegí al menos un artículo devuelto, o apagá \"Devuelve mercadería\".");
      return;
    }

    let montoFinal;
    if (tieneSeleccionadas) {
      for (const [vid, montoStr] of Object.entries(seleccionadas)) {
        const m = parseFloat(montoStr);
        const v = ventasCuentaCorriente.find(v => v.id === parseInt(vid));
        if (isNaN(m) || m <= 0) { setError("Todos los montos deben ser mayores a cero."); return; }
        if (m > v.saldoPendiente + 0.009) {
          setError(`El monto supera el saldo de la factura del ${fmtFechaAR(v.fecha)} (saldo: ${fmt(v.saldoPendiente)}).`);
          return;
        }
      }
      montoFinal = totalSeleccionado;
    } else if (tieneItemsDevueltos) {
      montoFinal = totalItemsDevueltos;
    } else {
      montoFinal = parseFloat(monto);
      if (isNaN(montoFinal) || montoFinal <= 0) { setError("Ingresá un monto válido mayor a cero."); return; }
    }

    let itemsDevueltos = null;
    if (esNotaCredito && devuelveMercaderia) {
      const entradas = Object.entries(itemsSel).filter(([, qty]) => qty > 0);
      itemsDevueltos = entradas.map(([idx, qty]) => {
        const item = ventaRefSel.items[parseInt(idx)];
        return { productoId: item.productoId ?? null, nombre: item.nombre, qty, precio: item.precio };
      });
    }

    const clienteNombre = clienteId
      ? clientes.find(c => c.id === parseInt(clienteId))?.nombre || "—"
      : (clienteLibre.trim() || "Consumidor Final");

    setGuardando(true);
    try {
      await onConfirm({
        id: uid(),
        tipo,
        numero,
        fecha: today(),
        clienteId: clienteId ? parseInt(clienteId) : null,
        cliente: clienteNombre,
        concepto: concepto.trim(),
        formaPago,
        monto: montoFinal,
        observaciones: observaciones.trim(),
        hora: horaActual(),
        // Recibo con multi-selección de cta cte
        ventasSeleccionadas: tieneSeleccionadas
          ? Object.entries(seleccionadas).map(([vid, montoStr]) => {
              const v = ventasCuentaCorriente.find(v => v.id === parseInt(vid));
              const montoAbonado = parseFloat(montoStr);
              return { ventaId: parseInt(vid), montoAbonado, saldoPrevio: v.saldoPendiente, saldoNuevo: v.saldoPendiente - montoAbonado };
            })
          : null,
        // NC/ND con referencia simple
        ventaId:  !tieneSeleccionadas && ventaIdRef ? parseInt(ventaIdRef) : null,
        ventaRef: !tieneSeleccionadas && ventaRefSel ? `Venta #${ventaRefSel.id} · ${fmtFechaAR(ventaRefSel.fecha)} · ${fmt(ventaRefSel.total)}` : null,
        depositoId: !tieneSeleccionadas && ventaRefSel ? ventaRefSel.depositoId : null,
        itemsDevueltos,
      });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal onClose={onClose} size="modal-lg">
      <div className="modal-header">
        <div className="modal-title">
          <span style={{ color: colorTipo }}>{tipo}</span>
          <span style={{ fontSize: 12, color: "var(--text3)", fontWeight: 400, marginLeft: 8 }}>#{numero}</span>
        </div>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14, maxHeight: "70vh", overflowY: "auto" }}>

        {/* ── Cliente ── */}
        <div style={{ display: "grid", gridTemplateColumns: clienteId ? "1fr" : "1fr 1fr", gap: 10 }}>
          <div className="form-group">
            <label className="form-label">Cliente</label>
            <select className="form-select" value={clienteId} onChange={handleClienteChange}>
              <option value="">— Consumidor Final —</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          {!clienteId && (
            <div className="form-group">
              <label className="form-label">Nombre libre (opcional)</label>
              <input className="form-input" placeholder="Ej: Juan García..."
                value={clienteLibre} onChange={e => setClienteLibre(e.target.value)} />
            </div>
          )}
        </div>

        {/* ── Facturas en cta cte — SOLO RECIBO ── */}
        {esRecibo && clienteId && (
          <div className="form-group">
            <label className="form-label" style={{ marginBottom: 10 }}>
              Facturas en Cuenta Corriente
              {tieneSeleccionadas && (
                <span style={{ marginLeft: 10, fontWeight: 700, color: "var(--green)", fontSize: 13 }}>
                  · Total a cobrar: {fmt(totalSeleccionado)}
                </span>
              )}
            </label>

            {ventasCuentaCorriente.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {ventasCuentaCorriente.map(v => {
                  const isSelected  = seleccionadas[v.id] !== undefined;
                  const montoInput  = seleccionadas[v.id] ?? "";
                  const montoNum    = parseFloat(montoInput);
                  const excede      = !isNaN(montoNum) && montoNum > v.saldoPendiente + 0.009;
                  const saldoResta  = !isNaN(montoNum) && montoNum > 0 ? v.saldoPendiente - montoNum : null;
                  return (
                    <div key={v.id} style={{
                      border: `1px solid ${isSelected ? "color-mix(in srgb, var(--accent) 50%, transparent)" : "var(--border)"}`,
                      borderRadius: 8,
                      background: isSelected ? "color-mix(in srgb, var(--accent) 6%, transparent)" : "var(--bg3)",
                      overflow: "hidden",
                    }}>
                      {/* Fila principal — clickeable para toggle */}
                      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", cursor: "pointer" }}
                        onClick={() => toggleVenta(v.id, v.saldoPendiente)}>
                        <input type="checkbox" readOnly checked={isSelected}
                          style={{ width: 15, height: 15, accentColor: "var(--accent)", flexShrink: 0, cursor: "pointer" }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, color: "var(--text1)", fontWeight: 500 }}>
                            {fmtFechaAR(v.fecha)} · {v.tipo || "Venta"}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>
                            {v.items?.slice(0, 3).map(i => i.nombre).join(" · ")}
                            {(v.items?.length ?? 0) > 3 ? " …" : ""}
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: 11, color: "var(--text3)" }}>Factura: {fmt(v.total)}</div>
                          {v.pagado > 0 && (
                            <div style={{ fontSize: 11, color: "var(--text3)" }}>Abonado: {fmt(v.pagado)}</div>
                          )}
                          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--amber)" }}>
                            Saldo: {fmt(v.saldoPendiente)}
                          </div>
                        </div>
                      </div>

                      {/* Panel de pago — visible al seleccionar */}
                      {isSelected && (
                        <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border)", background: "var(--bg4)", display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{ flex: 1, fontSize: 12 }}>
                            {saldoResta !== null && saldoResta > 0.009
                              ? <span style={{ color: "var(--text3)" }}>Queda pendiente: <strong style={{ color: "var(--amber)" }}>{fmt(saldoResta)}</strong></span>
                              : saldoResta !== null
                                ? <span style={{ color: "var(--green)", fontWeight: 600 }}>Pago total · Factura saldada</span>
                                : null}
                          </div>
                          <label style={{ fontSize: 12, color: "var(--text3)", flexShrink: 0 }}>Monto a pagar:</label>
                          <input
                            type="number"
                            className="form-input"
                            style={{ width: 120, padding: "5px 8px", flexShrink: 0, borderColor: excede ? "var(--red)" : undefined }}
                            value={montoInput}
                            onClick={e => e.stopPropagation()}
                            onChange={e => { setSeleccionadas(prev => ({ ...prev, [v.id]: e.target.value })); setError(""); }}
                          />
                        </div>
                      )}
                      {isSelected && excede && (
                        <div style={{ padding: "4px 14px 8px", fontSize: 11, color: "var(--red)", background: "var(--bg4)" }}>
                          El monto supera el saldo pendiente ({fmt(v.saldoPendiente)})
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "var(--text3)", padding: "10px 14px", background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8 }}>
                Este cliente no tiene facturas pendientes en Cuenta Corriente.
              </div>
            )}
          </div>
        )}

        {/* ── Venta de referencia — NC / ND ── */}
        {!esRecibo && clienteId && (
          <div className="form-group">
            <label className="form-label">
              Factura / Venta relacionada
              <span style={{ fontSize: 11, color: "var(--text3)", fontWeight: 400, marginLeft: 6 }}>(opcional)</span>
            </label>
            {todasVentasCliente.length > 0 ? (
              <>
                <select className="form-select" value={ventaIdRef} onChange={handleVentaRefChange}>
                  <option value="">— Sin vínculo —</option>
                  {todasVentasCliente.map(v => (
                    <option key={v.id} value={v.id}>
                      {fmtFechaAR(v.fecha)} · {v.tipo} · {v.formaPago} · {fmt(v.total)}
                    </option>
                  ))}
                </select>
                {ventaRefSel && (
                  <div style={{ marginTop: 5, fontSize: 11, color: "var(--text3)" }}>
                    {ventaRefSel.items?.map(i => i.nombre).join(", ")}
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 12, color: "var(--text3)", padding: "8px 12px", background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 6 }}>
                Este cliente no tiene ventas registradas.
              </div>
            )}
          </div>
        )}

        {/* ── ¿Devuelve mercadería? — solo Nota de Crédito con venta elegida ── */}
        {esNotaCredito && ventaRefSel && (
          <div className="form-group">
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "var(--text2)" }}>
              <input
                type="checkbox"
                checked={devuelveMercaderia}
                onChange={e => { setDevuelveMercaderia(e.target.checked); setItemsSel({}); }}
                style={{ accentColor: "var(--accent)", width: 15, height: 15 }}
              />
              ¿Esta Nota de Crédito devuelve mercadería?
            </label>
            <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 4 }}>
              Activá esto si el cliente trae los artículos de vuelta (se suman al stock). Dejalo apagado si es solo un ajuste financiero (ej. error de cobro) — no toca el stock.
            </div>

            {devuelveMercaderia && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                {(ventaRefSel.items || []).map((it, idx) => {
                  const seleccionado = itemsSel[idx] !== undefined;
                  const qty = itemsSel[idx] ?? it.qty;
                  return (
                    <div key={idx}>
                      <label style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "8px 12px", borderRadius: 8, cursor: "pointer",
                        background: seleccionado ? "color-mix(in srgb, var(--accent) 10%, transparent)" : "var(--bg3)",
                        border: `1px solid ${seleccionado ? "var(--accent)" : "var(--border)"}`,
                      }}>
                        <input
                          type="checkbox"
                          checked={seleccionado}
                          onChange={() => toggleItemDevuelto(idx, it.qty)}
                          style={{ accentColor: "var(--accent)" }}
                        />
                        <span style={{ flex: 1, fontSize: 13, color: "var(--text1)" }}>{it.qty}× {it.nombre}</span>
                        <span style={{ fontSize: 12, color: "var(--text3)" }}>{fmt(it.precio)} c/u</span>
                      </label>
                      {seleccionado && it.qty > 1 && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px 2px 40px" }}>
                          <span style={{ fontSize: 12, color: "var(--text3)" }}>Cantidad devuelta:</span>
                          <button className="qty-btn" onClick={() => setQtyItemDevuelto(idx, Math.max(1, qty - 1))}>−</button>
                          <span style={{ minWidth: 20, textAlign: "center", fontSize: 13, fontWeight: 600 }}>{qty}</span>
                          <button className="qty-btn" onClick={() => setQtyItemDevuelto(idx, Math.min(it.qty, qty + 1))}>+</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Concepto ── */}
        <div className="form-group">
          <label className="form-label">Concepto <span style={{ color: "var(--red)" }}>*</span></label>
          <input className="form-input"
            placeholder={
              esRecibo ? "Ej: Pago a cuenta corriente..." :
              tipo === "Nota de Crédito" ? "Ej: Devolución de mercadería..." :
              "Ej: Interés por mora en cuenta corriente..."
            }
            value={concepto} onChange={e => { setConcepto(e.target.value); setError(""); }} />
        </div>

        {/* ── Forma de cobro / pago ── */}
        <div className="form-group">
          <label className="form-label">
            {esRecibo ? "Forma de cobro" : esNotaCredito ? "Forma de devolución" : "Forma de cobro de la diferencia"}
          </label>
          <select className="form-select" value={formaPago} onChange={e => setFormaPago(e.target.value)}>
            {(!esRecibo && !ventaRefTieneCtaCte ? FORMAS_PAGO.filter(f => f !== "Cuenta Corriente") : FORMAS_PAGO).map(f => <option key={f}>{f}</option>)}
          </select>
          {!esRecibo && (
            <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 4 }}>
              {formaPago === "Cuenta Corriente"
                ? (esNotaCredito ? "Se descuenta de la deuda del cliente en cuenta corriente." : "Se suma a la deuda del cliente en cuenta corriente.")
                : (esNotaCredito ? `Sale de Caja por ${formaPago} — se refleja como egreso del día.` : `Entra a Caja por ${formaPago} — se refleja como ingreso del día.`)}
            </div>
          )}
        </div>

        {/* ── Monto: auto si hay selección de facturas o de artículos devueltos, manual si no ── */}
        {tieneSeleccionadas ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "var(--bg4)", borderRadius: 8, border: "1px solid var(--border2)" }}>
            <span style={{ fontSize: 13, color: "var(--text2)" }}>Total a cobrar ({Object.keys(seleccionadas).length} factura{Object.keys(seleccionadas).length > 1 ? "s" : ""})</span>
            <span style={{ fontSize: 22, fontWeight: 700, color: "var(--green)", fontFamily: "var(--font-mono)" }}>
              {fmt(totalSeleccionado)}
            </span>
          </div>
        ) : tieneItemsDevueltos ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "var(--bg4)", borderRadius: 8, border: "1px solid var(--border2)" }}>
            <span style={{ fontSize: 13, color: "var(--text2)" }}>Total artículos devueltos</span>
            <span style={{ fontSize: 22, fontWeight: 700, color: "var(--blue)", fontFamily: "var(--font-mono)" }}>
              {fmt(totalItemsDevueltos)}
            </span>
          </div>
        ) : (
          <div className="form-group">
            <label className="form-label">Monto <span style={{ color: "var(--red)" }}>*</span></label>
            <input className="form-input" type="number" placeholder="0"
              value={monto} onChange={e => { setMonto(e.target.value); setError(""); }} />
          </div>
        )}

        {/* ── Observaciones ── */}
        <div className="form-group">
          <label className="form-label">Observaciones</label>
          <input className="form-input" placeholder="Notas adicionales (opcional)"
            value={observaciones} onChange={e => setObservaciones(e.target.value)} />
        </div>

        {error && (
          <div style={{ padding: "9px 12px", background: "rgba(242,107,91,0.08)", border: "1px solid rgba(242,107,91,0.25)", borderRadius: 8, fontSize: 13, color: "var(--red)" }}>{error}</div>
        )}
      </div>

      <div className="modal-footer">
        <button className="btn btn-ghost" onClick={onClose} disabled={guardando}>Cancelar</button>
        <button className="btn btn-primary" onClick={confirmar} disabled={guardando}
          style={{ background: colorTipo, borderColor: colorTipo, color: "#fff" }}>
          {guardando ? "Emitiendo..." : `Emitir ${tipo}`}
        </button>
      </div>
    </Modal>
  );
}

// ─── Modal: Editar recibo ───────────────────────────────────────────────────────
function ModalEditarRecibo({ recibo, onClose, onGuardar }) {
  const [cliente,      setCliente]      = useState(recibo.cliente || "");
  const [concepto,     setConcepto]     = useState(recibo.observacion || "");
  const [formaPago,    setFormaPago]    = useState(recibo.formaPago || "Efectivo");
  const [monto,        setMonto]        = useState(String(recibo.monto ?? ""));
  const [error,        setError]        = useState("");
  const [guardando,    setGuardando]    = useState(false);

  const guardar = async () => {
    if (guardando) return;
    setError("");
    if (!concepto.trim()) { setError("Ingresá un concepto."); return; }
    const montoNum = parseFloat(monto);
    if (isNaN(montoNum) || montoNum <= 0) { setError("Ingresá un monto válido mayor a cero."); return; }

    setGuardando(true);
    try {
      await onGuardar({
        cliente: cliente.trim() || "Consumidor Final",
        observacion: concepto.trim(),
        formaPago,
        monto: montoNum,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal onClose={onClose} size="modal-sm">
      <div className="modal-header">
        <div className="modal-title">Editar recibo #{recibo.numero}</div>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="form-group">
          <label className="form-label">Cliente</label>
          <input className="form-input" value={cliente} onChange={e => setCliente(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Concepto</label>
          <input className="form-input" value={concepto} onChange={e => { setConcepto(e.target.value); setError(""); }} />
        </div>
        <div className="form-group">
          <label className="form-label">Forma de cobro</label>
          <select className="form-select" value={formaPago} onChange={e => setFormaPago(e.target.value)}>
            {FORMAS_PAGO.map(f => <option key={f}>{f}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Monto</label>
          <input className="form-input" type="number" min="0" value={monto} onChange={e => { setMonto(e.target.value); setError(""); }} />
        </div>
        {error && (
          <div style={{ padding: "9px 12px", background: "rgba(242,107,91,0.08)", border: "1px solid rgba(242,107,91,0.25)", borderRadius: 8, fontSize: 13, color: "var(--red)" }}>{error}</div>
        )}
      </div>

      <div className="modal-footer">
        <button className="btn btn-ghost" onClick={onClose} disabled={guardando}>Cancelar</button>
        <button className="btn btn-primary" onClick={guardar} disabled={guardando}>
          {guardando ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </Modal>
  );
}

// ─── Modal: Anular recibo ───────────────────────────────────────────────────────
function ModalAnularRecibo({ recibo, onClose, onConfirmar }) {
  const [motivo,    setMotivo]    = useState("");
  const [error,     setError]     = useState("");
  const [guardando, setGuardando] = useState(false);

  const confirmar = async () => {
    if (guardando) return;
    if (!motivo.trim()) { setError("El motivo de anulación es obligatorio."); return; }
    setGuardando(true);
    try {
      await onConfirmar(motivo.trim());
    } catch (err) {
      setError(err.message);
      setGuardando(false);
    }
  };

  return (
    <Modal onClose={onClose} size="modal-sm">
      <div className="modal-header">
        <div className="modal-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="warning" size={16} color="var(--red)" />
          Anular recibo #{recibo.numero}
        </div>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "var(--text2)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span>{recibo.cliente}</span>
            <strong style={{ color: "var(--accent2)" }}>{fmt(recibo.monto)}</strong>
          </div>
          <div style={{ color: "var(--text3)" }}>{recibo.formaPago} · {recibo.observacion}</div>
        </div>

        <div className="form-group">
          <label className="form-label">Motivo de anulación <span style={{ color: "var(--red)" }}>*</span></label>
          <input
            className="form-input"
            autoFocus
            placeholder="Ej: Duplicado por doble clic, error de monto..."
            value={motivo}
            onChange={e => { setMotivo(e.target.value); setError(""); }}
          />
        </div>
        {error && (
          <div style={{ padding: "9px 12px", background: "rgba(242,107,91,0.08)", border: "1px solid rgba(242,107,91,0.25)", borderRadius: 8, fontSize: 13, color: "var(--red)" }}>{error}</div>
        )}
      </div>

      <div className="modal-footer">
        <button className="btn btn-ghost" onClick={onClose} disabled={guardando}>Cancelar</button>
        <button className="btn btn-danger" onClick={confirmar} disabled={guardando}
          style={{ background: "var(--red)", borderColor: "var(--red)", color: "#fff" }}>
          {guardando ? "Anulando..." : "Confirmar anulación"}
        </button>
      </div>
    </Modal>
  );
}

// ─── Estilos de badge por tipo de comprobante ──────────────────────────────────
const BADGE_TIPO = {
  "Recibo":          { bg: "rgba(62,207,142,0.12)",  color: "var(--green)", border: "rgba(62,207,142,0.3)"  },
  "Nota de Crédito": { bg: "rgba(96,165,250,0.12)",  color: "var(--blue)",  border: "rgba(96,165,250,0.3)"  },
  "Nota de Débito":  { bg: "rgba(245,158,11,0.12)",  color: "var(--amber)", border: "rgba(245,158,11,0.3)"  },
};

// ─── Cálculo de movimientos de caja por medio de pago ─────────────────────────
// Se usa dos veces: para la sesión completa (día) y para el tramo actual
// (desde el último cierre de control). `incluye(createdAt)` decide qué
// registros entran.
function calcularMovimientos({ ventas, recibos, cambiosArticulo, anulaciones }, incluye) {
  const ventasHoy       = (ventas || []).filter(v => incluye(v.createdAt));
  const ventasEfectivo  = totalPorFormaPago(ventasHoy, "Efectivo");
  const ventasTransf    = totalPorFormaPago(ventasHoy, "Transferencia") + totalPorFormaPago(ventasHoy, "Mercado Pago");
  const ventasTarjetaD  = totalPorFormaPago(ventasHoy, "Tarjeta Débito");
  const ventasTarjetaC  = totalPorFormaPago(ventasHoy, "Tarjeta Crédito");
  const ventasCheque    = totalPorFormaPago(ventasHoy, "Cheque");
  const totalCtaCte     = totalPorFormaPago(ventasHoy, "Cuenta Corriente");

  // ── Cobros de cta cte (Recibos) ──
  const recibosDia        = (recibos || []).filter(r => incluye(r.createdAt));
  const recibosIngresoDia = recibosDia.filter(r => r.tipo === "Recibo" && r.estado !== "anulada");
  const cobroPorForma = (...formas) => recibosIngresoDia.filter(r => formas.includes(r.formaPago)).reduce((a, r) => a + r.monto, 0);
  const cobrosEfectivo  = cobroPorForma("Efectivo");
  const cobrosTransf    = cobroPorForma("Transferencia", "Mercado Pago");
  const cobrosTarjetaD  = cobroPorForma("Tarjeta Débito");
  const cobrosTarjetaC  = cobroPorForma("Tarjeta Crédito");
  const cobrosCheque    = cobroPorForma("Cheque");
  const totalCobros     = cobrosEfectivo + cobrosTransf + cobrosTarjetaD + cobrosTarjetaC + cobrosCheque;

  // ── Cambios de artículo ──
  const cambiosDia = (cambiosArticulo || []).filter(c => c.estado !== "anulada" && incluye(c.createdAt));

  // ── Notas de Crédito/Débito (no las que quedaron en Cuenta Corriente —
  // esas ya se reflejan como pago en pagos_ctacte, no como movimiento de caja) ──
  const notasDia        = recibosDia.filter(r => r.tipo !== "Recibo" && r.formaPago && r.formaPago !== "Cuenta Corriente");
  const notasDebitoDia  = notasDia.filter(r => r.tipo === "Nota de Débito");
  const notasCreditoDia = notasDia.filter(r => r.tipo === "Nota de Crédito");
  const notaDebitoPorForma  = (forma) => notasDebitoDia.filter(r => r.formaPago === forma).reduce((a, r) => a + r.monto, 0);
  const notaCreditoPorForma = (forma) => notasCreditoDia.filter(r => r.formaPago === forma).reduce((a, r) => a + r.monto, 0);

  const debitoCambio  = (...formas) => cambiosDia.filter(c => c.diferencia > 0 && formas.includes(c.formaPagoDif)).reduce((a, c) => a + c.diferencia, 0);
  const creditoCambio = (...formas) => cambiosDia.filter(c => c.diferencia < 0 && formas.includes(c.formaPagoDif)).reduce((a, c) => a + Math.abs(c.diferencia), 0);

  const debitosEfectivo  = debitoCambio("Efectivo") + notaDebitoPorForma("Efectivo");
  const debitosTransf    = debitoCambio("Transferencia", "Mercado Pago") + notaDebitoPorForma("Transferencia") + notaDebitoPorForma("Mercado Pago");
  const debitosTarjetaD  = debitoCambio("Tarjeta Débito") + notaDebitoPorForma("Tarjeta Débito");
  const debitosTarjetaC  = debitoCambio("Tarjeta Crédito") + notaDebitoPorForma("Tarjeta Crédito");
  const debitosCheque    = debitoCambio("Cheque") + notaDebitoPorForma("Cheque");

  const creditosEfectivo  = creditoCambio("Efectivo") + notaCreditoPorForma("Efectivo");
  const creditosTransf    = creditoCambio("Transferencia", "Mercado Pago") + notaCreditoPorForma("Transferencia") + notaCreditoPorForma("Mercado Pago");
  const creditosTarjetaD  = creditoCambio("Tarjeta Débito") + notaCreditoPorForma("Tarjeta Débito");
  const creditosTarjetaC  = creditoCambio("Tarjeta Crédito") + notaCreditoPorForma("Tarjeta Crédito");
  const creditosCheque    = creditoCambio("Cheque") + notaCreditoPorForma("Cheque");
  const creditosCtaCte    = creditoCambio("Cuenta Corriente");

  const totalCambiosIngreso = debitosEfectivo + debitosTransf + debitosTarjetaD + debitosTarjetaC + debitosCheque;
  const totalCambiosEgreso  = creditosEfectivo + creditosTransf + creditosTarjetaD + creditosTarjetaC + creditosCheque;

  // ── Anulaciones ──
  // El registro de la anulación no guarda su propio desglose de pagos — se
  // reconstruye buscando la venta original (marcarla "anulada" no le borra
  // el campo `pagos`), así siempre refleja exactamente lo que se cobró.
  const anulacionesDia = (anulaciones || []).filter(a => incluye(a.createdAt));
  const pagosAnulados  = anulacionesDia
    .map(a => (ventas || []).find(v => v.id === a.ventaId))
    .filter(Boolean)
    .flatMap(v => pagosDeVenta(v));
  const anulPorForma = (forma) => pagosAnulados.filter(p => p.formaPago === forma).reduce((s, p) => s + p.monto, 0);
  const anulEfectivo  = anulPorForma("Efectivo");
  const anulTransf    = anulPorForma("Transferencia") + anulPorForma("Mercado Pago");
  const anulTarjetaD  = anulPorForma("Tarjeta Débito");
  const anulTarjetaC  = anulPorForma("Tarjeta Crédito");
  const anulCheque    = anulPorForma("Cheque");
  const anulCtaCte    = anulPorForma("Cuenta Corriente");
  const totalAnulaciones = anulEfectivo + anulTransf + anulTarjetaD + anulTarjetaC + anulCheque + anulCtaCte;

  // ── Totales combinados ──
  const totalEfectivo  = ventasEfectivo + cobrosEfectivo  + debitosEfectivo  - creditosEfectivo  - anulEfectivo;
  const totalTransf    = ventasTransf   + cobrosTransf    + debitosTransf    - creditosTransf    - anulTransf;
  const totalTarjetaD  = ventasTarjetaD + cobrosTarjetaD  + debitosTarjetaD  - creditosTarjetaD  - anulTarjetaD;
  const totalTarjetaC  = ventasTarjetaC + cobrosTarjetaC  + debitosTarjetaC  - creditosTarjetaC  - anulTarjetaC;
  const totalCheque    = ventasCheque   + cobrosCheque    + debitosCheque    - creditosCheque    - anulCheque;
  // A diferencia de los demás medios, `totalCtaCte` no tiene débitos/créditos
  // por cambios de artículo que sumarle acá (esos van a `creditosCtaCte`,
  // que resta directamente del saldo del cliente, no de la caja física) —
  // solo hace falta descontar lo anulado.
  const totalCtaCteNeto = totalCtaCte - anulCtaCte;

  const totalGeneral = ventasEfectivo + ventasTarjetaD + ventasTarjetaC + ventasTransf + ventasCheque + totalCtaCte
    + totalCobros + totalCambiosIngreso - totalCambiosEgreso - totalAnulaciones;

  return {
    ventasHoy, ventasEfectivo, ventasTransf, ventasTarjetaD, ventasTarjetaC, ventasCheque, totalCtaCte,
    recibosDia, cobrosEfectivo, cobrosTransf, cobrosTarjetaD, cobrosTarjetaC, cobrosCheque, totalCobros,
    cambiosDia,
    debitosEfectivo, debitosTransf, debitosTarjetaD, debitosTarjetaC, debitosCheque,
    creditosEfectivo, creditosTransf, creditosTarjetaD, creditosTarjetaC, creditosCheque, creditosCtaCte,
    totalCambiosIngreso, totalCambiosEgreso,
    anulacionesDia, anulEfectivo, anulTransf, anulTarjetaD, anulTarjetaC, anulCheque, anulCtaCte, totalAnulaciones,
    totalEfectivo, totalTransf, totalTarjetaD, totalTarjetaC, totalCheque, totalCtaCteNeto, totalGeneral,
  };
}

// Título de sección del modal Resumen del día
const SecTitle = ({ children }) => (
  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".05em", margin: "4px 0 8px" }}>{children}</div>
);

// ─── Modal: Resumen del día ────────────────────────────────────────────────────
// Muestra todo lo que pasó en la sesión de caja: el recorrido del efectivo
// paso a paso (apertura → tramos → cierres de control → ahora), los totales
// del día por medio de pago y la lista completa de retiros y refuerzos.
function ModalResumenDia({ mov, inicio, aperturaTs, horaApertura, cierresParciales, retiros, refuerzos, actual, noEfectivo, onClose }) {
  const tsOf = (r) => (r.createdAt ? new Date(r.createdAt).getTime() : 0);
  const apertura = aperturaTs ? new Date(aperturaTs).getTime() : 0;

  // ── Recorrido del efectivo ──
  const pasos = [];
  let saldo = inicio || 0;
  pasos.push({ tipo: "apertura", hora: horaApertura, label: "Apertura de caja", monto: saldo, saldo });
  const tramos = [
    ...cierresParciales.map(cp => ({ cp, hasta: Math.max(cp._ts || 0, apertura) })),
    { cp: null, hasta: Infinity },
  ];
  let desde = apertura;
  tramos.forEach(({ cp, hasta }, idx) => {
    const enTramo = (r) => { const t = tsOf(r); return t >= desde && t < hasta; };
    pasos.push({
      tipo: "tramo",
      label: cp
        ? `Tramo ${idx + 1} — ${idx === 0 ? "desde la apertura" : `desde ${tramos[idx - 1].cp.numero}`} hasta ${cp.numero}`
        : `Tramo actual — ${idx === 0 ? "desde la apertura" : `desde ${tramos[idx - 1].cp.numero}`}`,
    });
    const ingresos = cp ? (cp.periodoEfectivo || 0) : actual.periodoEfectivo;
    if (ingresos !== 0) {
      saldo += ingresos;
      pasos.push({ tipo: ingresos >= 0 ? "suma" : "resta", label: "Ingresos en efectivo (ventas, cobros, cambios y anulaciones)", monto: ingresos, saldo });
    }
    const movs = [
      ...refuerzos.filter(enTramo).map(r => ({ ...r, _k: "ref" })),
      ...retiros.filter(enTramo).map(r => ({ ...r, _k: "ret" })),
    ].sort((a, b) => tsOf(a) - tsOf(b));
    movs.forEach(m => {
      if (m._k === "ref") {
        saldo += m.monto;
        pasos.push({ tipo: "suma", hora: m.hora, label: `Refuerzo${m.origen === "externo" ? " (externo)" : " (Tesorería)"}${m.motivo ? ` — ${m.motivo}` : ""}`, monto: m.monto, saldo });
      } else if ((m.medio ?? "Efectivo") === "Efectivo") {
        saldo -= m.monto;
        pasos.push({ tipo: "resta", hora: m.hora, label: `Retiro${m.cuentaNombre ? ` · ${m.cuentaNombre}` : ""}${m.motivo ? ` — ${m.motivo}` : ""}`, monto: -m.monto, saldo });
      } else {
        pasos.push({ tipo: "info", hora: m.hora, label: `Retiro por transferencia${m.motivo ? ` — ${m.motivo}` : ""} (no afecta el efectivo)`, monto: -m.monto, saldo });
      }
    });
    if (cp) {
      const queda = cp.saldoEnCaja ?? cp.real;
      pasos.push({ tipo: "cierre", hora: cp.hora, cp, label: `Cierre de control ${cp.numero}`, esperado: cp.esperado, real: cp.real, diferencia: cp.diferencia || 0, retiro: cp.retiroEfectivo || 0, saldo: queda });
      saldo = queda;
    } else {
      pasos.push({ tipo: "final", label: "Debería haber en caja ahora", saldo: actual.esperadoPeriodo });
    }
    desde = hasta;
  });

  const th = { padding: "7px 12px", fontSize: 10, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".05em" };
  const td = { padding: "7px 12px", fontSize: 12, borderTop: "1px solid var(--border)" };
  const mono = { fontFamily: "var(--font-mono)", textAlign: "right", whiteSpace: "nowrap" };
  const signo = (v) => (v > 0 ? `+${fmt(v)}` : v < 0 ? `−${fmt(Math.abs(v))}` : fmt(0));
  const colorDif = (d) => (d === 0 ? "var(--green)" : d > 0 ? "var(--blue)" : "var(--red)");

  // ── Totales por medio de pago ──
  const medios = [
    { label: "Efectivo",        v: mov.ventasEfectivo, c: mov.cobrosEfectivo, nd: mov.debitosEfectivo - mov.creditosEfectivo, an: mov.anulEfectivo, t: mov.totalEfectivo },
    { label: "Tarjeta Débito",  v: mov.ventasTarjetaD, c: mov.cobrosTarjetaD, nd: mov.debitosTarjetaD - mov.creditosTarjetaD, an: mov.anulTarjetaD, t: mov.totalTarjetaD },
    { label: "Tarjeta Crédito", v: mov.ventasTarjetaC, c: mov.cobrosTarjetaC, nd: mov.debitosTarjetaC - mov.creditosTarjetaC, an: mov.anulTarjetaC, t: mov.totalTarjetaC },
    { label: "Transferencia",   v: mov.ventasTransf,   c: mov.cobrosTransf,   nd: mov.debitosTransf - mov.creditosTransf,     an: mov.anulTransf,   t: mov.totalTransf },
    { label: "Cheque",          v: mov.ventasCheque,   c: mov.cobrosCheque,   nd: mov.debitosCheque - mov.creditosCheque,     an: mov.anulCheque,   t: mov.totalCheque },
    { label: "Cta. Corriente",  v: mov.totalCtaCte,    c: 0,                  nd: -mov.creditosCtaCte,                         an: mov.anulCtaCte,   t: mov.totalCtaCteNeto, warn: true },
  ];
  const mediosVisibles = medios.filter(m => m.v || m.c || m.nd || m.an || m.t || m.label === "Efectivo");

  const totalRetirosEf = retiros.filter(r => (r.medio ?? "Efectivo") === "Efectivo").reduce((a, r) => a + r.monto, 0);
  const totalRetiros   = retiros.reduce((a, r) => a + r.monto, 0);
  const totalRefuerzos = refuerzos.reduce((a, r) => a + r.monto, 0);
  const totalEnviadoEf = cierresParciales.reduce((a, cp) => a + (cp.retiroEfectivo || 0), 0);

  return (
    <Modal onClose={onClose} size="modal-lg">
      <div className="modal-header">
        <div className="modal-title">Resumen del día</div>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      <div style={{ padding: "18px 24px", display: "flex", flexDirection: "column", gap: 18, maxHeight: "75vh", overflowY: "auto" }}>

        {/* ── Métricas rápidas ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
          {[
            { label: "Movimiento total del día", val: mov.totalGeneral, color: "var(--accent2)" },
            { label: "Efectivo enviado a Tesorería", val: totalEnviadoEf, color: "var(--text1)" },
            { label: "Retiros del día", val: totalRetiros, color: "var(--red)" },
            { label: "Debería haber en caja ahora", val: actual.esperadoPeriodo, color: "var(--green)" },
          ].map((m, i) => (
            <div key={i} className="metric-card" style={{ padding: "10px 14px" }}>
              <div className="metric-label">{m.label}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: m.color, marginTop: 4 }}>{fmt(m.val)}</div>
            </div>
          ))}
        </div>

        {/* ── Recorrido del efectivo ── */}
        <div>
          <SecTitle>Recorrido del efectivo en caja</SecTitle>
          <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--bg4)" }}>
                  <th style={{ ...th, textAlign: "left", width: 64 }}>Hora</th>
                  <th style={{ ...th, textAlign: "left" }}>Concepto</th>
                  <th style={{ ...th, textAlign: "right" }}>Importe</th>
                  <th style={{ ...th, textAlign: "right" }}>Saldo en caja</th>
                </tr>
              </thead>
              <tbody>
                {pasos.map((p, i) => {
                  if (p.tipo === "tramo") {
                    return (
                      <tr key={i} style={{ background: "var(--bg4)" }}>
                        <td colSpan={4} style={{ padding: "6px 12px 4px", fontSize: 10, fontWeight: 700, color: "var(--accent2)", textTransform: "uppercase", letterSpacing: ".05em", borderTop: "2px solid var(--border2)" }}>{p.label}</td>
                      </tr>
                    );
                  }
                  if (p.tipo === "cierre") {
                    return (
                      <tr key={i} style={{ background: "color-mix(in srgb, var(--accent) 7%, transparent)" }}>
                        <td style={{ ...td, color: "var(--text3)" }}>{p.hora || ""}</td>
                        <td style={{ ...td }} colSpan={2}>
                          <div style={{ fontWeight: 700, color: "var(--accent2)" }}>{p.label}</div>
                          <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 3, display: "flex", gap: 14, flexWrap: "wrap" }}>
                            <span>Esperado <strong style={{ color: "var(--text1)" }}>{fmt(p.esperado)}</strong></span>
                            <span>Contado <strong style={{ color: "var(--text1)" }}>{fmt(p.real)}</strong></span>
                            <span>Diferencia <strong style={{ color: colorDif(p.diferencia) }}>{signo(p.diferencia)}</strong></span>
                            {p.retiro > 0 && <span>A Tesorería <strong style={{ color: "var(--red)" }}>−{fmt(p.retiro)}</strong></span>}
                          </div>
                        </td>
                        <td style={{ ...td, ...mono, fontWeight: 700, color: "var(--green)" }}>
                          {fmt(p.saldo)}
                          <div style={{ fontSize: 10, fontWeight: 400, color: "var(--text3)", fontFamily: "inherit" }}>queda en caja</div>
                        </td>
                      </tr>
                    );
                  }
                  if (p.tipo === "final") {
                    return (
                      <tr key={i} style={{ background: "var(--bg4)" }}>
                        <td style={{ ...td, borderTop: "2px solid var(--border2)" }}></td>
                        <td colSpan={2} style={{ ...td, borderTop: "2px solid var(--border2)", fontWeight: 700, color: "var(--text1)" }}>{p.label}</td>
                        <td style={{ ...td, ...mono, borderTop: "2px solid var(--border2)", fontSize: 14, fontWeight: 700, color: p.saldo < 0 ? "var(--red)" : "var(--green)" }}>{fmt(p.saldo)}</td>
                      </tr>
                    );
                  }
                  const color = p.tipo === "suma" ? "var(--green)" : p.tipo === "resta" ? "var(--red)" : p.tipo === "info" ? "var(--text3)" : "var(--text1)";
                  return (
                    <tr key={i}>
                      <td style={{ ...td, color: "var(--text3)" }}>{p.hora || ""}</td>
                      <td style={{ ...td, color: p.tipo === "info" ? "var(--text3)" : "var(--text2)" }}>{p.label}</td>
                      <td style={{ ...td, ...mono, fontWeight: 600, color }}>{p.tipo === "apertura" ? fmt(p.monto) : signo(p.monto)}</td>
                      <td style={{ ...td, ...mono, color: p.tipo === "info" ? "var(--text3)" : "var(--text1)" }}>{fmt(p.saldo)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Totales del día por medio de pago ── */}
        <div>
          <SecTitle>Totales del día por medio de pago</SecTitle>
          <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
              <thead>
                <tr style={{ background: "var(--bg4)" }}>
                  <th style={{ ...th, textAlign: "left" }}>Medio</th>
                  <th style={{ ...th, textAlign: "right" }}>Ventas</th>
                  <th style={{ ...th, textAlign: "right" }}>Cobros cta. cte.</th>
                  <th style={{ ...th, textAlign: "right" }}>Cambios / notas</th>
                  <th style={{ ...th, textAlign: "right" }}>Anulado</th>
                  <th style={{ ...th, textAlign: "right" }}>Total del día</th>
                </tr>
              </thead>
              <tbody>
                {mediosVisibles.map((m, i) => (
                  <tr key={i}>
                    <td style={{ ...td, fontWeight: 500, color: m.warn ? "var(--amber)" : "var(--text2)" }}>
                      {m.label}{m.warn && <span style={{ fontSize: 10, color: "var(--text3)", fontWeight: 400 }}> · no entra a caja</span>}
                    </td>
                    <td style={{ ...td, ...mono }}>{fmt(m.v)}</td>
                    <td style={{ ...td, ...mono, color: m.c ? "var(--blue)" : "var(--text3)" }}>{fmt(m.c)}</td>
                    <td style={{ ...td, ...mono, color: m.nd > 0 ? "var(--green)" : m.nd < 0 ? "var(--red)" : "var(--text3)" }}>{m.nd ? signo(m.nd) : fmt(0)}</td>
                    <td style={{ ...td, ...mono, color: m.an ? "var(--red)" : "var(--text3)" }}>{m.an ? `−${fmt(m.an)}` : fmt(0)}</td>
                    <td style={{ ...td, ...mono, fontWeight: 700, color: m.warn ? "var(--amber)" : "var(--text1)" }}>{fmt(m.t)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "var(--bg4)" }}>
                  <td colSpan={5} style={{ ...td, borderTop: "2px solid var(--border2)", fontWeight: 600, color: "var(--text1)" }}>Total</td>
                  <td style={{ ...td, ...mono, borderTop: "2px solid var(--border2)", fontSize: 14, fontWeight: 700, color: "var(--accent2)" }}>{fmt(mov.totalGeneral)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* ── Tarjetas / transferencias / cheques: enviado vs pendiente ── */}
        {noEfectivo.some(m => m.total || m.enviado) && (
          <div>
            <SecTitle>Tarjetas, transferencias y cheques — Tesorería</SecTitle>
            <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--bg4)" }}>
                    <th style={{ ...th, textAlign: "left" }}>Medio</th>
                    <th style={{ ...th, textAlign: "right" }}>Total del día</th>
                    <th style={{ ...th, textAlign: "right" }}>Enviado en cierres de control</th>
                    <th style={{ ...th, textAlign: "right" }}>Pendiente para el cierre final</th>
                  </tr>
                </thead>
                <tbody>
                  {noEfectivo.filter(m => m.total || m.enviado).map((m, i) => (
                    <tr key={i}>
                      <td style={{ ...td, color: "var(--text2)", fontWeight: 500 }}>{m.label}</td>
                      <td style={{ ...td, ...mono }}>{fmt(m.total)}</td>
                      <td style={{ ...td, ...mono, color: m.enviado ? "var(--red)" : "var(--text3)" }}>{m.enviado ? `−${fmt(m.enviado)}` : fmt(0)}</td>
                      <td style={{ ...td, ...mono, fontWeight: 700, color: "var(--text1)" }}>{fmt(m.pendiente)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Retiros y refuerzos del día ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
          <div>
            <SecTitle>Retiros del día ({retiros.length})</SecTitle>
            {retiros.length > 0 ? (
              <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                {[...retiros].sort((a, b) => tsOf(a) - tsOf(b)).map(r => (
                  <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "7px 10px", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
                    <span style={{ color: "var(--text3)", fontSize: 11, minWidth: 46 }}>{r.hora}</span>
                    <span style={{ flex: 1, color: "var(--text2)" }}>
                      {r.motivo || "—"}
                      <span style={{ color: "var(--text3)", fontSize: 10 }}> · {(r.medio ?? "Efectivo")}{r.cuentaNombre ? ` · ${r.cuentaNombre}` : ""}</span>
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--red)" }}>−{fmt(r.monto)}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 10px", background: "var(--bg4)", fontSize: 12, fontWeight: 600 }}>
                  <span>Total {totalRetirosEf !== totalRetiros && <span style={{ fontWeight: 400, color: "var(--text3)", fontSize: 11 }}>(efectivo {fmt(totalRetirosEf)})</span>}</span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--red)" }}>−{fmt(totalRetiros)}</span>
                </div>
              </div>
            ) : <div style={{ fontSize: 12, color: "var(--text3)" }}>Sin retiros en el día.</div>}
          </div>
          <div>
            <SecTitle>Refuerzos del día ({refuerzos.length})</SecTitle>
            {refuerzos.length > 0 ? (
              <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                {[...refuerzos].sort((a, b) => tsOf(a) - tsOf(b)).map(r => (
                  <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "7px 10px", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
                    <span style={{ color: "var(--text3)", fontSize: 11, minWidth: 46 }}>{r.hora}</span>
                    <span style={{ flex: 1, color: "var(--text2)" }}>
                      {r.motivo || "—"}
                      <span style={{ color: "var(--text3)", fontSize: 10 }}> · {r.origen === "externo" ? "Externo" : "Tesorería"}</span>
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--green)" }}>+{fmt(r.monto)}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 10px", background: "var(--bg4)", fontSize: 12, fontWeight: 600 }}>
                  <span>Total</span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--green)" }}>+{fmt(totalRefuerzos)}</span>
                </div>
              </div>
            ) : <div style={{ fontSize: 12, color: "var(--text3)" }}>Sin refuerzos en el día.</div>}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ─── Panel inline: Nuevo Recibo ───────────────────────────────────────────────
function PanelNuevoRecibo({ numero, clientes, ventas, pagosCtaCte, configMora = {}, cambiosArticulo, onConfirm }) {
  const [clienteId,     setClienteId]     = useState("");
  const [seleccionadas, setSeleccionadas] = useState({});
  const [concepto,      setConcepto]      = useState("");
  const [formaPago,     setFormaPago]     = useState("Efectivo");
  const [monto,         setMonto]         = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [error,         setError]         = useState("");
  const [exito,         setExito]         = useState(false);
  const [incluirMora,   setIncluirMora]   = useState(false);
  const [guardando,     setGuardando]     = useState(false);

  const ventasCuentaCorriente = clienteId
    ? detalleVentasCtaCte(parseInt(clienteId), ventas, pagosCtaCte)
        .filter(v => v.saldoPendiente > 0.009)
        .map(v => ({ ...v, pagado: Math.max(0, montoCtaCte(v) - v.saldoPendiente) }))
    : [];

  const tieneSeleccionadas = Object.keys(seleccionadas).length > 0;
  const totalSeleccionado  = Object.values(seleccionadas).reduce((s, m) => s + (parseFloat(m) || 0), 0);

  const clienteObj = clienteId ? clientes.find(c => c.id === parseInt(clienteId)) : null;
  const moraInfo   = clienteObj
    ? calcularMoraCliente(parseInt(clienteId), ventas, pagosCtaCte, configMora, clienteObj.configMora, cambiosArticulo)
    : null;
  const hayMora    = moraInfo != null && moraInfo.recargo > 0;
  const atrasadoSinMora = clienteAtrasadoSinMora(moraInfo);

  // ── Mora manual por factura ──
  // Al cobrar una factura que tiene mora manual cargada, su mora se suma
  // sola (se puede destildar). El resto de la mora (de "toda la cuenta", de
  // facturas ya pagadas, o el % automático) va con la casilla general.
  const cargosActivos = moraInfo?.moraManual ? cargosManualesActivos(clienteObj?.configMora) : [];
  const idsFacturasListadas = new Set(ventasCuentaCorriente.map(v => v.id));
  const cargosDeFactura = (ventaId) => cargosActivos.filter(c => c.ventaId === ventaId);
  const moraDeFactura   = (ventaId) => cargosDeFactura(ventaId).reduce((a, c) => a + (Number(c.monto) || 0), 0);
  const [moraFacturaOff, setMoraFacturaOff] = useState({}); // { [ventaId]: true } = no cobrar su mora
  const facturasConMoraIncluida = Object.keys(seleccionadas).map(Number)
    .filter(id => moraDeFactura(id) > 0 && !moraFacturaOff[id]);
  const moraFacturasIncluida = facturasConMoraIncluida.reduce((a, id) => a + moraDeFactura(id), 0);
  // Mora "general": con facturas seleccionadas, la que no está ligada a una
  // factura listada; sin selección (monto libre), toda la mora.
  const cargosGenerales = tieneSeleccionadas
    ? cargosActivos.filter(c => !idsFacturasListadas.has(c.ventaId))
    : cargosActivos;
  const moraGeneral = !hayMora ? 0
    : !moraInfo.moraManual ? moraInfo.recargo
    : cargosGenerales.reduce((a, c) => a + (Number(c.monto) || 0), 0);
  const moraIncluidaTotal = moraFacturasIncluida + (incluirMora ? moraGeneral : 0);

  const handleClienteChange = (e) => { setClienteId(e.target.value); setSeleccionadas({}); setMoraFacturaOff({}); setError(""); setIncluirMora(false); };
  const toggleVenta = (ventaId, saldoPendiente) => {
    setSeleccionadas(prev => {
      if (prev[ventaId] !== undefined) { const { [ventaId]: _, ...rest } = prev; return rest; }
      return { ...prev, [ventaId]: String(saldoPendiente) };
    });
    setError("");
  };

  const reset = () => { setClienteId(""); setSeleccionadas({}); setMoraFacturaOff({}); setConcepto(""); setFormaPago("Efectivo"); setMonto(""); setObservaciones(""); setError(""); setIncluirMora(false); };

  const confirmar = async () => {
    if (guardando) return; // evita doble registro por doble click
    setError("");
    if (!concepto.trim()) { setError("Ingresá un concepto."); return; }
    let montoFinal;
    if (tieneSeleccionadas) {
      for (const [vid, montoStr] of Object.entries(seleccionadas)) {
        const m = parseFloat(montoStr);
        const v = ventasCuentaCorriente.find(v => v.id === parseInt(vid));
        if (isNaN(m) || m <= 0) { setError("Todos los montos deben ser mayores a cero."); return; }
        if (m > v.saldoPendiente + 0.009) { setError(`El monto supera el saldo de la factura del ${fmtFechaAR(v.fecha)} (saldo: ${fmt(v.saldoPendiente)}).`); return; }
      }
      montoFinal = totalSeleccionado;
    } else {
      montoFinal = parseFloat(monto);
      if (isNaN(montoFinal) || montoFinal <= 0) { setError("Ingresá un monto válido mayor a cero."); return; }
    }
    const montoMoraIncluido = moraIncluidaTotal;
    // Cargos de mora manual que quedan cobrados con este recibo
    const moraCargoIds = moraInfo?.moraManual
      ? [
          ...facturasConMoraIncluida.flatMap(id => cargosDeFactura(id).map(c => c.id)),
          ...(incluirMora ? cargosGenerales.map(c => c.id) : []),
        ]
      : undefined;
    const clienteNombre = clienteId ? clientes.find(c => c.id === parseInt(clienteId))?.nombre || "—" : "Consumidor Final";
    setGuardando(true);
    try {
      await onConfirm({
        id: uid(), tipo: "Recibo", numero, fecha: today(),
        clienteId: clienteId ? parseInt(clienteId) : null,
        cliente: clienteNombre, concepto: concepto.trim(), formaPago,
        monto: montoFinal + montoMoraIncluido, observaciones: observaciones.trim(),
        hora: horaActual(),
        // moraDeudaDesde: a qué deuda corresponde la mora cobrada, para que
        // no se vuelva a cobrar mientras esa deuda siga pendiente.
        ...(montoMoraIncluido > 0 ? { moraIncluida: montoMoraIncluido, moraDeudaDesde: moraInfo.fechaDeuda, moraCargoIds } : {}),
        ventasSeleccionadas: tieneSeleccionadas
          ? Object.entries(seleccionadas).map(([vid, montoStr]) => {
              const v = ventasCuentaCorriente.find(v => v.id === parseInt(vid));
              const montoAbonado = parseFloat(montoStr);
              return { ventaId: parseInt(vid), montoAbonado, saldoPrevio: v.saldoPendiente, saldoNuevo: v.saldoPendiente - montoAbonado };
            })
          : null,
      });
      setExito(true);
      setTimeout(() => { setExito(false); reset(); }, 2000);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="card" style={{ margin: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div className="card-title" style={{ margin: 0 }}>Nuevo Recibo</div>
          <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>#{numero}</div>
        </div>
        {exito && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "rgba(62,207,142,0.12)", border: "1px solid rgba(62,207,142,0.3)", borderRadius: 8, fontSize: 13, color: "var(--green)" }}>
            <Icon name="check" size={14} color="var(--green)" /> Recibo emitido
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="form-group">
          <label className="form-label">Cliente</label>
          <select className="form-select" value={clienteId} onChange={handleClienteChange}>
            <option value="">— Consumidor Final —</option>
            {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>

        {clienteId && (
          <div className="form-group">
            <label className="form-label" style={{ marginBottom: 10 }}>
              Facturas en Cuenta Corriente
              {tieneSeleccionadas && (
                <span style={{ marginLeft: 10, fontWeight: 700, color: "var(--green)", fontSize: 13 }}>
                  · Total a cobrar: {fmt(totalSeleccionado)}
                </span>
              )}
            </label>
            {ventasCuentaCorriente.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {ventasCuentaCorriente.map(v => {
                  const isSelected = seleccionadas[v.id] !== undefined;
                  const montoInput = seleccionadas[v.id] ?? "";
                  const montoNum   = parseFloat(montoInput);
                  const excede     = !isNaN(montoNum) && montoNum > v.saldoPendiente + 0.009;
                  const saldoResta = !isNaN(montoNum) && montoNum > 0 ? v.saldoPendiente - montoNum : null;
                  return (
                    <div key={v.id} style={{ border: `1px solid ${isSelected ? "color-mix(in srgb, var(--accent) 50%, transparent)" : "var(--border)"}`, borderRadius: 8, background: isSelected ? "color-mix(in srgb, var(--accent) 6%, transparent)" : "var(--bg3)", overflow: "hidden" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", cursor: "pointer" }}
                        onClick={() => toggleVenta(v.id, v.saldoPendiente)}>
                        <input type="checkbox" readOnly checked={isSelected} style={{ width: 15, height: 15, accentColor: "var(--accent)", flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, color: "var(--text1)", fontWeight: 500 }}>{fmtFechaAR(v.fecha)} · {v.tipo || "Venta"}</div>
                          <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>{v.items?.slice(0, 3).map(i => i.nombre).join(" · ")}{(v.items?.length ?? 0) > 3 ? " …" : ""}</div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          {v.pagado > 0 && <div style={{ fontSize: 11, color: "var(--text3)" }}>Abonado: {fmt(v.pagado)}</div>}
                          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--amber)" }}>Saldo: {fmt(v.saldoPendiente)}</div>
                          {moraDeFactura(v.id) > 0 && <div style={{ fontSize: 11, color: "var(--red)", marginTop: 1 }}>+ Mora: {fmt(moraDeFactura(v.id))}</div>}
                        </div>
                      </div>
                      {isSelected && (
                        <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border)", background: "var(--bg4)", display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{ flex: 1, fontSize: 12 }}>
                            {saldoResta !== null && saldoResta > 0.009
                              ? <span style={{ color: "var(--text3)" }}>Queda pendiente: <strong style={{ color: "var(--amber)" }}>{fmt(saldoResta)}</strong></span>
                              : saldoResta !== null ? <span style={{ color: "var(--green)", fontWeight: 600 }}>Pago total · Factura saldada</span> : null}
                          </div>
                          <label style={{ fontSize: 12, color: "var(--text3)", flexShrink: 0 }}>Monto a pagar:</label>
                          <input type="number" className="form-input"
                            style={{ width: 120, padding: "5px 8px", flexShrink: 0, borderColor: excede ? "var(--red)" : undefined }}
                            value={montoInput}
                            onClick={e => e.stopPropagation()}
                            onChange={e => { setSeleccionadas(prev => ({ ...prev, [v.id]: e.target.value })); setError(""); }}
                          />
                        </div>
                      )}
                      {isSelected && moraDeFactura(v.id) > 0 && (
                        <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px 9px", background: "var(--bg4)", fontSize: 12, color: "var(--text2)", cursor: "pointer" }}>
                          <input type="checkbox" checked={!moraFacturaOff[v.id]} style={{ accentColor: "var(--accent)" }}
                            onChange={e => setMoraFacturaOff(prev => ({ ...prev, [v.id]: !e.target.checked }))} />
                          Cobrar la mora de esta factura ({fmt(moraDeFactura(v.id))})
                        </label>
                      )}
                      {isSelected && excede && (
                        <div style={{ padding: "4px 14px 8px", fontSize: 11, color: "var(--red)", background: "var(--bg4)" }}>
                          El monto supera el saldo pendiente ({fmt(v.saldoPendiente)})
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "var(--text3)", padding: "10px 14px", background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8 }}>
                Este cliente no tiene facturas pendientes en Cuenta Corriente.
              </div>
            )}
          </div>
        )}

        {clienteId && hayMora && moraGeneral > 0 && (
          <div style={{
            padding: "12px 14px", borderRadius: 8,
            background: moraInfo.estado === "vencido_grave" ? "rgba(242,107,91,0.08)" : "rgba(245,158,11,0.08)",
            border: `1px solid ${moraInfo.estado === "vencido_grave" ? "rgba(242,107,91,0.3)" : "rgba(245,158,11,0.3)"}`,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: moraInfo.estado === "vencido_grave" ? "var(--red)" : "var(--amber)" }}>
                  {!moraInfo.moraManual ? "Recargo por mora" : tieneSeleccionadas ? "Otra mora manual de la cuenta" : "Mora manual"}
                </div>
                <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>
                  {moraInfo.moraManual
                    ? (tieneSeleccionadas ? "Cargada a toda la cuenta o a facturas que no se están cobrando." : "Cargada a mano desde la ficha del cliente — pisa el % automático.")
                    : `${moraInfo.config.diasEnMora} días en mora · ${moraInfo.config.pctAplicado}%${moraInfo.moraYaCobrada > 0 ? ` · ya cobrado ${fmt(moraInfo.moraYaCobrada)}` : ""}`}
                </div>
              </div>
              <div style={{ fontSize: 17, fontWeight: 700, color: moraInfo.estado === "vencido_grave" ? "var(--red)" : "var(--amber)" }}>
                {fmt(moraGeneral)}
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "var(--text2)" }}>
              <input
                type="checkbox"
                checked={incluirMora}
                onChange={e => setIncluirMora(e.target.checked)}
                style={{ accentColor: "var(--accent)", width: 15, height: 15 }}
              />
              Incluir mora en este cobro ({fmt(moraGeneral)})
            </label>
          </div>
        )}

        {clienteId && !hayMora && atrasadoSinMora && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 14px", borderRadius: 8, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)" }}>
            <Icon name="warning" size={14} color="var(--amber)" style={{ marginTop: 1, flexShrink: 0 }} />
            <div style={{ fontSize: 12, color: "var(--amber)" }}>
              Este cliente está atrasado ({moraInfo.diasMora} días) y no tiene mora configurada — ni % automático ni mora manual. Si corresponde cargarle algo, un admin puede hacerlo desde Clientes → Historial antes de cerrar este cobro.
            </div>
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Concepto <span style={{ color: "var(--red)" }}>*</span></label>
          <input className="form-input" placeholder="Ej: Pago a cuenta corriente..."
            value={concepto} onChange={e => { setConcepto(e.target.value); setError(""); }} />
        </div>

        <div className="form-group">
          <label className="form-label">Forma de cobro</label>
          <select className="form-select" value={formaPago} onChange={e => setFormaPago(e.target.value)}>
            {FORMAS_PAGO.map(f => <option key={f}>{f}</option>)}
          </select>
        </div>

        {tieneSeleccionadas ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "var(--bg4)", borderRadius: 8, border: "1px solid var(--border2)" }}>
            <div>
              <div style={{ fontSize: 13, color: "var(--text2)" }}>
                Total a cobrar ({Object.keys(seleccionadas).length} factura{Object.keys(seleccionadas).length > 1 ? "s" : ""}{moraIncluidaTotal > 0 ? " + mora" : ""})
              </div>
              {moraIncluidaTotal > 0 && (
                <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>
                  Facturas: {fmt(totalSeleccionado)} · Mora: {fmt(moraIncluidaTotal)}
                </div>
              )}
            </div>
            <span style={{ fontSize: 22, fontWeight: 700, color: "var(--green)", fontFamily: "var(--font-mono)" }}>
              {fmt(totalSeleccionado + moraIncluidaTotal)}
            </span>
          </div>
        ) : (
          <div className="form-group">
            <label className="form-label">Monto <span style={{ color: "var(--red)" }}>*</span></label>
            <input className="form-input" type="number" placeholder="0"
              value={monto} onChange={e => { setMonto(e.target.value); setError(""); }} />
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Observaciones</label>
          <input className="form-input" placeholder="Notas adicionales (opcional)"
            value={observaciones} onChange={e => setObservaciones(e.target.value)} />
        </div>

        {error && (
          <div style={{ padding: "9px 12px", background: "rgba(242,107,91,0.08)", border: "1px solid rgba(242,107,91,0.25)", borderRadius: 8, fontSize: 13, color: "var(--red)" }}>{error}</div>
        )}

        <button className="btn btn-success" onClick={confirmar} disabled={exito || guardando} style={{ justifyContent: "center" }}>
          <Icon name="check" size={14} /> {guardando ? "Emitiendo..." : "Emitir Recibo"}
        </button>
      </div>
    </div>
  );
}

// ─── Modal: Reporte del último cierre ──────────────────────────────────────────
function ModalUltimoCierre({ cierre, onClose, isLocked, onSave }) {
  const [editMode,    setEditMode]    = useState(false);
  const [editReal,    setEditReal]    = useState("");
  const [editRetiroEf, setEditRetiroEf] = useState("");
  const [guardado,    setGuardado]    = useState(false);

  const editRealNum  = parseFloat(editReal);
  const editRetiroNum = parseFloat(editRetiroEf) || 0;
  const editDif      = !isNaN(editRealNum) ? editRealNum - cierre.esperado : null;
  const editSaldo    = !isNaN(editRealNum) ? Math.max(0, editRealNum - editRetiroNum) : null;
  const canSave      = !isNaN(editRealNum) && editRealNum >= 0;

  const entrarEdicion = () => {
    setEditReal(String(cierre.real));
    setEditRetiroEf(String(cierre.retiroFinalEfectivo || 0));
    setEditMode(true);
    setGuardado(false);
  };

  const cancelarEdicion = () => { setEditMode(false); setEditReal(""); setEditRetiroEf(""); };

  const guardar = () => {
    if (!canSave) return;
    const nuevoCierre = {
      ...cierre,
      real: editRealNum,
      diferencia: editRealNum - cierre.esperado,
      retiroFinalEfectivo: editRetiroNum,
      saldoInicial: Math.max(0, editRealNum - editRetiroNum),
    };
    onSave(nuevoCierre);
    setGuardado(true);
    setTimeout(() => { setGuardado(false); setEditMode(false); }, 1200);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
      onClick={onClose}>
      <div className="card" style={{ width: 700, maxWidth: "95vw", maxHeight: "85vh", overflowY: "auto", margin: 0 }}
        onClick={e => e.stopPropagation()}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div className="card-title" style={{ margin: 0 }}>Cierre del {fmtFechaAR(cierre.fecha)} a las {cierre.hora}</div>
            {isLocked && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 4, fontSize: 11, padding: "2px 9px", borderRadius: 4, background: "rgba(62,207,142,0.1)", color: "var(--green)", border: "1px solid rgba(62,207,142,0.25)" }}>
                <Icon name="lock" size={11} color="var(--green)" /> Revisado por Tesorería · No editable
              </div>
            )}
            {!isLocked && !editMode && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 4, fontSize: 11, padding: "2px 9px", borderRadius: 4, background: "rgba(245,158,11,0.1)", color: "var(--amber)", border: "1px solid rgba(245,158,11,0.25)" }}>
                <Icon name="unlock" size={11} color="var(--amber)" /> Pendiente de revisión · Editable
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {!isLocked && !editMode && (
              <button className="btn btn-sm btn-ghost" onClick={entrarEdicion} style={{ fontSize: 11 }}>
                <Icon name="edit" size={13} /> Corregir cierre
              </button>
            )}
            <button className="btn btn-sm btn-ghost" onClick={onClose} style={{ padding: "4px 8px" }}>
              <Icon name="x" size={14} />
            </button>
          </div>
        </div>

        {/* ── Panel de edición ── */}
        {editMode && (
          <div style={{ marginBottom: 16, padding: 16, background: "color-mix(in srgb, var(--accent) 6%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)", borderRadius: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent2)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 12 }}>
              Corrección del cierre
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Efectivo real contado</label>
                <input className="form-input" type="number" value={editReal}
                  onChange={e => setEditReal(e.target.value)} autoFocus />
                <span style={{ fontSize: 11, color: "var(--text3)", marginTop: 3, display: "block" }}>
                  Esperado: <strong>{fmt(cierre.esperado)}</strong>
                </span>
              </div>
              <div className="form-group">
                <label className="form-label">Efectivo a retirar (Tesorería)</label>
                <input className="form-input" type="number" value={editRetiroEf}
                  onChange={e => setEditRetiroEf(e.target.value)} />
                <span style={{ fontSize: 11, color: "var(--text3)", marginTop: 3, display: "block" }}>
                  Saldo inicial siguiente apertura
                </span>
              </div>
            </div>

            {editReal !== "" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 10 }}>
                <div className="metric-card" style={{ padding: "8px 12px" }}>
                  <div className="metric-label">Diferencia</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 14, marginTop: 2, color: editDif === 0 ? "var(--green)" : editDif > 0 ? "var(--blue)" : "var(--red)" }}>
                    {editDif > 0 ? "+" : ""}{fmt(editDif ?? 0)}
                  </div>
                </div>
                <div className="metric-card" style={{ padding: "8px 12px" }}>
                  <div className="metric-label">Saldo siguiente apertura</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 14, marginTop: 2, color: "var(--green)" }}>{fmt(editSaldo ?? 0)}</div>
                </div>
                <div className="metric-card" style={{ padding: "8px 12px" }}>
                  <div className="metric-label">Total a Tesorería</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 14, marginTop: 2, color: "var(--accent2)" }}>
                    {fmt(editRetiroNum + (cierre.totalTarjeta || 0) + (cierre.totalTransf || 0) + (cierre.totalCheque || 0) + (cierre.totalMpago || 0))}
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
              <button className="btn btn-primary btn-sm" onClick={guardar} disabled={!canSave}>
                <Icon name="check" size={13} /> Guardar cambios
              </button>
              <button className="btn btn-ghost btn-sm" onClick={cancelarEdicion}>Cancelar</button>
              {guardado && (
                <span style={{ fontSize: 12, color: "var(--green)", display: "flex", alignItems: "center", gap: 4 }}>
                  <Icon name="check" size={12} color="var(--green)" /> Guardado
                </span>
              )}
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div className="cierre-box">
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 10 }}>Ventas por medio de pago</div>
            <div style={{ background: "var(--bg4)", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
              <table style={{ width: "100%" }}>
                <thead><tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th style={{ padding: "6px 10px", fontSize: 10, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".05em", textAlign: "left" }}>Tipo</th>
                  <th style={{ padding: "6px 10px", fontSize: 10, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".05em", textAlign: "right" }}>Importe</th>
                </tr></thead>
                <tbody>
                  {[
                    { label: "Efectivo",       val: cierre.totalEfectivo,     color: "var(--green)" },
                    { label: "Tarjeta",        val: cierre.totalTarjeta  || 0 },
                    { label: "Transferencia",  val: cierre.totalTransf   || 0 },
                    { label: "Cheque",         val: cierre.totalCheque   || 0 },
                    { label: "Mercado Pago",   val: cierre.totalMpago    || 0 },
                    { label: "Cta. Corriente", val: cierre.totalCtaCte   || 0, color: "var(--amber)" },
                  ].map((r, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "7px 10px", fontSize: 12, color: r.color || "var(--text2)" }}>{r.label}</td>
                      <td style={{ padding: "7px 10px", fontSize: 12, textAlign: "right", fontWeight: 600, color: r.color || (r.val > 0 ? "var(--text1)" : "var(--text3)"), fontFamily: "var(--font-mono)" }}>{fmt(r.val)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr style={{ borderTop: "1px solid var(--border2)", background: "var(--bg3)" }}>
                  <td style={{ padding: "8px 10px", fontSize: 12, fontWeight: 600, color: "var(--text1)" }}>Total rendición</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", fontSize: 13, fontWeight: 700, color: "var(--accent2)", fontFamily: "var(--font-mono)" }}>
                    {fmt((cierre.totalEfectivo || 0) + (cierre.totalTarjeta || 0) + (cierre.totalTransf || 0) + (cierre.totalCheque || 0) + (cierre.totalMpago || 0) + (cierre.totalCtaCte || 0))}
                  </td>
                </tr></tfoot>
              </table>
            </div>
          </div>

          <div className="cierre-box">
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 10 }}>Cuadre de efectivo</div>
            <div className="total-line sub"><span>Inicio de caja</span><span>{fmt(cierre.inicio)}</span></div>
            <div className="total-line sub"><span>+ Efectivo cobrado</span><span style={{ color: "var(--green)" }}>+{fmt(cierre.totalEfectivo)}</span></div>
            <div className="total-line sub"><span>− Retiros ({(cierre.retiros || []).length})</span><span style={{ color: "var(--red)" }}>−{fmt(cierre.totalRetiros || 0)}</span></div>
            <div style={{ height: 1, background: "var(--border)", margin: "8px 0" }} />
            <div className="total-line sub"><span>Esperado en caja</span><span>{fmt(cierre.esperado)}</span></div>
            <div className="total-line sub"><span>Real contado</span><span>{fmt(cierre.real)}</span></div>
            <div style={{ height: 1, background: "var(--border)", margin: "8px 0" }} />
            <div className="total-line">
              <span style={{ fontWeight: 600 }}>Diferencia</span>
              <span style={{ fontWeight: 700, fontSize: 15, color: cierre.diferencia === 0 ? "var(--green)" : cierre.diferencia > 0 ? "var(--blue)" : "var(--red)" }}>
                {cierre.diferencia > 0 ? "+" : ""}{fmt(cierre.diferencia)}
                {" "}<span style={{ fontSize: 12, fontWeight: 400 }}>{cierre.diferencia === 0 ? "✓ Sin diferencia" : cierre.diferencia > 0 ? "(sobrante)" : "(faltante)"}</span>
              </span>
            </div>
            {cierre.saldoInicial != null && (
              <>
                <div style={{ height: 1, background: "var(--border)", margin: "8px 0" }} />
                <div className="total-line sub"><span style={{ color: "var(--text3)" }}>Efectivo retirado</span><span style={{ color: "var(--red)" }}>−{fmt(cierre.retiroFinalEfectivo || 0)}</span></div>
                <div className="total-line sub" style={{ fontWeight: 600 }}><span>Saldo dejado en caja</span><span style={{ color: "var(--green)" }}>{fmt(cierre.saldoInicial)}</span></div>
              </>
            )}
          </div>
        </div>

        {(cierre.totalCambiosIngreso > 0 || cierre.totalCambiosEgreso > 0 || cierre.creditosCtaCte > 0) && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>
              Cambios de artículo y notas · ya incluido en ventas por medio de pago
            </div>
            <div className="cierre-box">
              {cierre.totalCambiosIngreso > 0 && (
                <div className="total-line sub">
                  <span>Diferencia cobrada (Nota de Débito)</span>
                  <span style={{ color: "var(--green)" }}>+{fmt(cierre.totalCambiosIngreso)}</span>
                </div>
              )}
              {cierre.totalCambiosEgreso > 0 && (
                <div className="total-line sub">
                  <span>Devuelto al cliente (Nota de Crédito)</span>
                  <span style={{ color: "var(--red)" }}>−{fmt(cierre.totalCambiosEgreso)}</span>
                </div>
              )}
              {cierre.creditosCtaCte > 0 && (
                <div className="total-line sub">
                  <span style={{ color: "var(--amber)" }}>Acreditado en cta. cte. (Nota de Crédito)</span>
                  <span style={{ color: "var(--amber)" }}>−{fmt(cierre.creditosCtaCte)}</span>
                </div>
              )}
              {(cierre.totalAnulaciones || 0) > 0 && (
                <div className="total-line sub">
                  <span style={{ color: "var(--red)" }}>Ventas anuladas ({(cierre.anulacionesDia || []).length})</span>
                  <span style={{ color: "var(--red)" }}>−{fmt(cierre.totalAnulaciones)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {(cierre.anulacionesDia || []).length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--red)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>
              Ventas anuladas ({cierre.anulacionesDia.length})
            </div>
            <div style={{ background: "var(--bg3)", borderRadius: 8, overflow: "hidden", border: "1px solid rgba(242,107,91,0.25)" }}>
              {cierre.anulacionesDia.map((a, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", padding: "8px 12px", borderBottom: "1px solid var(--border)", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--text3)", minWidth: 55, flexShrink: 0 }}>{a.hora}</span>
                  <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 4, background: "rgba(242,107,91,0.1)", color: "var(--red)", border: "1px solid rgba(242,107,91,0.2)", whiteSpace: "nowrap", flexShrink: 0 }}>
                    #{a.ventaId}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: "var(--text2)" }}>{a.cliente}</div>
                    <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>
                      {a.usuario} · {a.motivo}
                    </div>
                  </div>
                  <span style={{ color: "var(--red)", fontWeight: 600, fontSize: 13, flexShrink: 0 }}>−{fmt(a.total)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {(cierre.retiros || []).length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>Retiros registrados</div>
            <div style={{ background: "var(--bg3)", borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)" }}>
              {cierre.retiros.map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", padding: "8px 12px", borderBottom: "1px solid var(--border)", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--text3)", minWidth: 55 }}>{r.hora}</span>
                  {(r.medio ?? "Efectivo") === "Efectivo" ? (
                    <span className="badge badge-ok" style={{ fontSize: 10 }}>Efectivo</span>
                  ) : (
                    <span className="badge badge-blue" style={{ fontSize: 10 }}>Transferencia</span>
                  )}
                  {r.cuentaId === CUENTA_RETIRO_DUENO ? (
                    <span className="badge badge-blue" style={{ fontSize: 10 }}>Retiro dueño</span>
                  ) : r.cuentaNombre ? (
                    <span className="badge badge-ok" style={{ fontSize: 10 }}>{r.cuentaNombre}</span>
                  ) : (
                    <span style={{ fontSize: 11, color: "var(--text3)" }}>—</span>
                  )}
                  <span style={{ flex: 1, fontSize: 13, color: "var(--text2)" }}>{r.motivo}</span>
                  <span style={{ color: "var(--red)", fontWeight: 600, fontSize: 13 }}>−{fmt(r.monto)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {(cierre.comprobantes || []).length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>Comprobantes emitidos</div>
            <div style={{ background: "var(--bg3)", borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)" }}>
              {cierre.comprobantes.map((r, i) => {
                const st = BADGE_TIPO[r.tipo] || {};
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", padding: "8px 12px", borderBottom: "1px solid var(--border)", gap: 8 }}>
                    <span style={{ fontSize: 12, color: "var(--text3)", minWidth: 55 }}>{r.hora}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 4, background: st.bg, color: st.color, border: `1px solid ${st.border}`, whiteSpace: "nowrap" }}>{r.tipo}</span>
                    <span style={{ fontSize: 12, color: "var(--text3)", minWidth: 65, fontFamily: "var(--font-mono)" }}>{r.numero}</span>
                    <span style={{ flex: 1, fontSize: 13, color: "var(--text2)" }}>{r.cliente}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: st.color, fontFamily: "var(--font-mono)" }}>{fmt(r.monto)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── PAGE: CAJA ────────────────────────────────────────────────────────────────
export default function PageCaja({ caja, setCaja, retiros: retirosCaja = [], agregarRetiro: agregarRetiroDB, eliminarRetiro: eliminarRetiroDB, refuerzos: refuerzosCaja = [], agregarRefuerzo: agregarRefuerzoDB, ventas, recibos, setRecibos, clientes, pagosCtaCte, setPagosCtaCte, agregarPagoCtaCte, eliminarPagoCtaCte, revertirMoraCobrada, stockDepositos, aplicarDeltaStockMultiple, tesoreria, agregarMovimientoTesoreria, actualizarMovimientoTesoreria, cambiosArticulo, anulaciones = [], historialCierres = [], setHistorialCierres, usuarioActivo, permisos = {}, configMora = {}, guardarCierre, emitirRecibo, editarRecibo, anularRecibo, periodosCerrados = [], planCuentas = [], gastos = [], agregarGasto, proveedores = [] }) {
  const [showEditarRecibo, setShowEditarRecibo] = useState(null);
  const [showAnularRecibo, setShowAnularRecibo] = useState(null);
  const [verHistorialRecibos, setVerHistorialRecibos] = useState(false);
  const [histRecibosDesde,    setHistRecibosDesde]    = useState("");
  const [histRecibosHasta,    setHistRecibosHasta]    = useState("");
  const [histRecibosCliente,  setHistRecibosCliente]  = useState("");
  const [histRecibosUsuario,  setHistRecibosUsuario]  = useState("");
  const [histRecibosFormaPago, setHistRecibosFormaPago] = useState("");
  const [histRecibosTipo,     setHistRecibosTipo]     = useState("");
  const { toast } = useToast();
  // Cerrar caja y hacer un cierre de control necesitan ver el estado real y
  // completo de ambas PCs para cuadrar bien — a diferencia del resto de Caja
  // (vender, retiros, refuerzos, recibos), estas dos acciones no se pueden
  // encolar para más tarde: requieren conexión confirmada en el momento.
  const isOnline = useConnectivity();
  const [cierreReal,       setCierreReal]       = useState("");
  const [inicioCaja,       setInicioCaja]       = useState("");
  const [editandoInicio,   setEditandoInicio]   = useState(false);
  const [nuevoInicio,      setNuevoInicio]      = useState("");
  const [modalRetiro,      setModalRetiro]      = useState(false);
  const [modalComprobante, setModalComprobante] = useState(null);
  const [showDesglose,         setShowDesglose]         = useState(false);
  const [activeTab,            setActiveTab]            = useState("caja");
  const [retiroFinalEfectivo,  setRetiroFinalEfectivo]  = useState("");
  const [showUltimoCierre,     setShowUltimoCierre]     = useState(false);
  const [mainTab,              setMainTab]              = useState("dia");
  const [verDetalleCierre,     setVerDetalleCierre]     = useState(null);
  const [showCierreControl, setShowCierreControl] = useState(false);
  const [editandoParcial,     setEditandoParcial]     = useState(false);
  const [editParcialReal,     setEditParcialReal]     = useState("");
  const [editParcialRetiroEf, setEditParcialRetiroEf] = useState("");
  const [ctrlReal,      setCtrlReal]      = useState("");
  const [ctrlTransf,    setCtrlTransf]    = useState("");
  const [ctrlTD,        setCtrlTD]        = useState("");
  const [ctrlTC,        setCtrlTC]        = useState("");
  const [ctrlCheque,    setCtrlCheque]    = useState("");
  const [ctrlRetiroEf,      setCtrlRetiroEf]      = useState("");
  const [ctrlRetiroTransf,  setCtrlRetiroTransf]  = useState("");
  const [ctrlRetiroTD,      setCtrlRetiroTD]      = useState("");
  const [ctrlRetiroTC,      setCtrlRetiroTC]      = useState("");
  const [ctrlRetiroCheque,  setCtrlRetiroCheque]  = useState("");
  const [retiroTransf,  setRetiroTransf]  = useState("");
  const [retiroTD,      setRetiroTD]      = useState("");
  const [retiroTC,      setRetiroTC]      = useState("");
  const [retiroCheque,  setRetiroCheque]  = useState("");
  const [showRefuerzo,   setShowRefuerzo]   = useState(false);
  const [refuerzoMonto,  setRefuerzoMonto]  = useState("");
  const [refuerzoMotivo, setRefuerzoMotivo] = useState("");
  const [refuerzoOrigen, setRefuerzoOrigen] = useState("tesoreria"); // "tesoreria" | "externo"

  // Filtros historial
  const [hFDesde, setHFDesde] = useState(() => daysAgo(30));
  const [hFHasta,  setHFHasta]  = useState(today());
  const [hBuscar,  setHBuscar]  = useState("");

  // ── Migración: ultimoCierre → historialCierres ────────────────────────────
  useEffect(() => {
    if (!caja.ultimoCierre) return;
    if ((historialCierres || []).length > 0) return;
    if (typeof setHistorialCierres !== "function") return;
    setHistorialCierres([{
      id: 1,
      numero: "C-0001",
      fecha: caja.ultimoCierre.fecha || today(),
      horaApertura: "—",
      horaCierre: caja.ultimoCierre.hora || "—",
      usuario: "—",
      ventas: 0,
      totalVendido: 0,
      inicio: caja.ultimoCierre.inicio || 0,
      totalEfectivo: caja.ultimoCierre.totalEfectivo || 0,
      totalTarjeta:  caja.ultimoCierre.totalTarjeta  || 0,
      totalTransf:   caja.ultimoCierre.totalTransf   || 0,
      totalCheque:   caja.ultimoCierre.totalCheque   || 0,
      totalMpago:    caja.ultimoCierre.totalMpago    || 0,
      totalCtaCte:   caja.ultimoCierre.totalCtaCte   || 0,
      retiros:       caja.ultimoCierre.retiros        || [],
      totalRetiros:  caja.ultimoCierre.totalRetiros   || 0,
      esperado:      caja.ultimoCierre.esperado        || 0,
      real:          caja.ultimoCierre.real            || 0,
      diferencia:    caja.ultimoCierre.diferencia      || 0,
      detalle:       caja.ultimoCierre,
    }]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Vinculación cierre ↔ Tesorería ──────────────────────────────────────────
  const tesoreriaCierre = caja.ultimoCierre
    ? (tesoreria || []).find(t =>
        (caja.ultimoCierre.cierreId && t.cierreId === caja.ultimoCierre.cierreId) ||
        (!caja.ultimoCierre.cierreId && t.fecha === caja.ultimoCierre.fecha && t.hora === caja.ultimoCierre.hora)
      )
    : null;
  const ultimoCierreLocked = tesoreriaCierre?.estado === "en_caja_mayor";

  const onSaveUltimoCierre = async (nuevoCierre) => {
    setCaja(prev => ({ ...prev, ultimoCierre: nuevoCierre }));
    if (tesoreriaCierre && typeof actualizarMovimientoTesoreria === "function") {
      const retiroEf = nuevoCierre.retiroFinalEfectivo || 0;
      // Si el cierre guarda lo que se envió de cada medio (retiroTarjetaD, etc.)
      // se usa eso: con cierres de control en el día, los totales del día
      // incluyen lo que ya se mandó a Tesorería antes y se contaría dos veces.
      // Cierres viejos sin esos campos siguen usando los totales.
      const c = nuevoCierre;
      const totalTesoreria = c.retiroTarjetaD != null
        ? retiroEf + (c.retiroTarjetaD || 0) + (c.retiroTarjetaC || 0) + (c.retiroTransf || 0) + (c.retiroCheque || 0) + (c.totalMpago || 0)
        : retiroEf + (c.totalTarjeta || 0) + (c.totalTransf || 0) + (c.totalCheque || 0) + (c.totalMpago || 0);
      try {
        await actualizarMovimientoTesoreria(tesoreriaCierre.id, {
          montoEfectivo: retiroEf, monto: totalTesoreria,
          diferencia: nuevoCierre.diferencia, saldoInicial: nuevoCierre.saldoInicial, detalle: nuevoCierre,
        });
      } catch (err) {
        toast(`Cierre corregido, pero no se pudo actualizar Tesorería: ${err.message}`, "error");
      }
    }
  };

  // ── Movimientos de la sesión actual: posteriores a la apertura de caja ──────
  // Ya NO se exige que además sean del día calendario de hoy: si la caja quedó
  // abierta de un día para el otro (nadie la cerró), las ventas/retiros/etc. de
  // esos días intermedios deben arrastrarse y sumarse en el próximo cierre en
  // vez de perderse (bug real: cierres de un día completo desaparecían porque
  // nunca se contaban ni en el cierre salteado ni en el siguiente).
  const esDeSesionActual = (createdAt) => !caja.aperturaTs || !createdAt || createdAt >= caja.aperturaTs;

  // ── Movimientos de la sesión completa (día) por medio de pago ─────────────
  // (considera ventas con pago dividido, cobros de cta cte, cambios de
  // artículo, notas de crédito/débito y anulaciones — ver calcularMovimientos)
  const movDia = calcularMovimientos({ ventas, recibos, cambiosArticulo, anulaciones }, esDeSesionActual);
  const {
    ventasEfectivo, ventasTransf, ventasTarjetaD, ventasTarjetaC, ventasCheque,
    recibosDia, cobrosEfectivo, cobrosTransf, cobrosTarjetaD, cobrosTarjetaC, cobrosCheque, totalCobros,
    totalCambiosIngreso, totalCambiosEgreso, creditosCtaCte,
    anulacionesDia, anulEfectivo, anulTransf, anulTarjetaD, anulTarjetaC, anulCheque, anulCtaCte, totalAnulaciones,
    totalEfectivo, totalTransf, totalTarjetaD, totalTarjetaC, totalCheque, totalCtaCteNeto,
  } = movDia;

  // ── Historial completo de recibos (no limitado a la sesión de hoy) ───────────
  const usuariosRecibos = useMemo(() =>
    [...new Set((recibos || []).map(r => r.usuario).filter(Boolean))].sort(),
    [recibos]);

  const recibosHistorial = useMemo(() => {
    return (recibos || [])
      .filter(r => !histRecibosDesde || r.fecha >= histRecibosDesde)
      .filter(r => !histRecibosHasta || r.fecha <= histRecibosHasta)
      .filter(r => !histRecibosCliente.trim() || (r.cliente || "").toLowerCase().includes(histRecibosCliente.trim().toLowerCase()))
      .filter(r => !histRecibosUsuario || r.usuario === histRecibosUsuario)
      .filter(r => !histRecibosFormaPago || r.formaPago === histRecibosFormaPago)
      .filter(r => !histRecibosTipo || r.tipo === histRecibosTipo)
      .sort((a, b) => (b.fecha + (b.hora || "")).localeCompare(a.fecha + (a.hora || "")));
  }, [recibos, histRecibosDesde, histRecibosHasta, histRecibosCliente, histRecibosUsuario, histRecibosFormaPago, histRecibosTipo]);

  const { pagina: paginaHistRecibos, setPagina: setPaginaHistRecibos, totalPaginas: totalPaginasHistRecibos, itemsPagina: recibosHistorialPagina, pageSize: pageSizeHistRecibos } = usePaginacion(recibosHistorial);


  // Solo los retiros en Efectivo salen del efectivo físico de la caja; los
  // retiros por Transferencia son informativos y no afectan el cuadre.
  const totalRetiros              = retirosCaja.reduce((a, r) => a + r.monto, 0);
  const totalRetirosEfectivo      = retirosCaja.filter(r => (r.medio ?? "Efectivo") === "Efectivo").reduce((a, r) => a + r.monto, 0);
  const totalRetirosTransferencia = retirosCaja.filter(r => r.medio === "Transferencia").reduce((a, r) => a + r.monto, 0);
  const totalRefuerzos = refuerzosCaja.reduce((a, r) => a + r.monto, 0);

  // ── Cierres parciales del día ─────────────────────────────────────────────────
  const cierresParciales = caja.cierresParciales || [];
  const ultimoParcial    = cierresParciales.length > 0 ? cierresParciales[cierresParciales.length - 1] : null;

  // Solo el último cierre parcial es editable — y solo mientras Tesorería no
  // lo haya revisado y pasado a Caja Mayor (mismo criterio que ultimoCierre).
  const ultimoParcialTesoreria = ultimoParcial
    ? (tesoreria || []).find(t => t.cierreId === ultimoParcial.id)
    : null;
  const ultimoParcialLocked = ultimoParcialTesoreria?.estado === "en_caja_mayor";

  const periodoEfectivo  = totalEfectivo  - (ultimoParcial?.acumEfectivo  || 0);
  const periodoTransf    = totalTransf    - (ultimoParcial?.acumTransf    || 0);
  const periodoTarjetaD  = totalTarjetaD  - (ultimoParcial?.acumTarjetaD  || 0);
  const periodoTarjetaC  = totalTarjetaC  - (ultimoParcial?.acumTarjetaC  || 0);
  const periodoCheque    = totalCheque    - (ultimoParcial?.acumCheque    || 0);
  const periodoCtaCte    = totalCtaCteNeto - (ultimoParcial?.acumCtaCte    || 0);
  const periodoRetiros              = totalRetiros              - (ultimoParcial?.acumRetiros              || 0);
  const periodoRetirosEfectivo      = totalRetirosEfectivo      - (ultimoParcial?.acumRetirosEfectivo      || 0);
  const periodoRetirosTransferencia = totalRetirosTransferencia - (ultimoParcial?.acumRetirosTransferencia || 0);
  const periodoRefuerzos = totalRefuerzos - (ultimoParcial?.acumRefuerzos || 0);

  const inicioEfectivoPeriodo = ultimoParcial?.saldoEnCaja ?? ultimoParcial?.real ?? (caja.inicio || 0);
  const esperadoPeriodo       = inicioEfectivoPeriodo + periodoEfectivo - periodoRetirosEfectivo + periodoRefuerzos;

  // Un retiro/refuerzo solo cuenta como "del período actual" (o puede
  // borrarse, para retiros) si es posterior al último cierre parcial — igual
  // criterio de "misma caja" que ventaEditable/cambioEditable/reciboEditable.
  // Ahora que retiros/refuerzos son filas de Supabase, se comparan por su
  // `createdAt` real (asignado por Postgres) en vez de reusar el `id` como
  // timestamp.
  const limitePeriodoRetiroTs = new Date(Math.max(
    ultimoParcial?._ts || 0,
    caja.aperturaTs ? new Date(caja.aperturaTs).getTime() : 0
  )).toISOString();
  const retirosPeriodo = retirosCaja.filter(r => r.createdAt >= limitePeriodoRetiroTs);
  const puedeEliminarRetiro = (retiro) => retiro.createdAt >= limitePeriodoRetiroTs;

  const refuerzosPeriodo = refuerzosCaja.filter(r => r.createdAt >= limitePeriodoRetiroTs);

  // ── Movimientos del tramo actual (desde el último cierre de control) ──────
  // Es lo que se muestra en "Movimientos" en la pantalla principal: así la
  // caja refleja solo lo que pasó desde el último cierre de control. El día
  // completo queda en el botón "Resumen del día".
  const esDelTramo = (createdAt) => esDeSesionActual(createdAt) && (!createdAt || createdAt >= limitePeriodoRetiroTs);
  const movTramo   = calcularMovimientos({ ventas, recibos, cambiosArticulo, anulaciones }, esDelTramo);

  // ── Tarjetas / transferencias / cheques pendientes de enviar a Tesorería ──
  // Lo que ya se mandó a Tesorería en los cierres de control se descuenta;
  // si en un cierre de control no se retiró todo, el resto sigue pendiente
  // y se arrastra al siguiente cierre (de control o final).
  const enviadoEnParciales = (campo) => cierresParciales.reduce((a, cp) => a + (cp[campo] || 0), 0);
  const pendienteTransf    = totalTransf   - enviadoEnParciales("retiroTransf");
  const pendienteTarjetaD  = totalTarjetaD - enviadoEnParciales("retiroTarjetaD");
  const pendienteTarjetaC  = totalTarjetaC - enviadoEnParciales("retiroTarjetaC");
  const pendienteCheque    = totalCheque   - enviadoEnParciales("retiroCheque");
  // Arrastre de cierres anteriores (lo pendiente que no se vendió en este tramo)
  const arrastreTransf     = pendienteTransf   - periodoTransf;
  const arrastreTarjetaD   = pendienteTarjetaD - periodoTarjetaD;
  const arrastreTarjetaC   = pendienteTarjetaC - periodoTarjetaC;
  const arrastreCheque     = pendienteCheque   - periodoCheque;

  // ── Cierre de control: retiro a Tesorería del período ────────────────────────
  const ctrlTdVal     = ctrlTD     !== "" ? (parseFloat(ctrlTD)     || 0) : periodoTarjetaD;
  const ctrlTcVal     = ctrlTC     !== "" ? (parseFloat(ctrlTC)     || 0) : periodoTarjetaC;
  const ctrlTransfVal = ctrlTransf !== "" ? (parseFloat(ctrlTransf) || 0) : periodoTransf;
  const ctrlChequeVal = ctrlCheque !== "" ? (parseFloat(ctrlCheque) || 0) : periodoCheque;

  const ctrlRetiroEfNum     = parseFloat(ctrlRetiroEf) || 0;
  const ctrlRetiroTransfNum = ctrlRetiroTransf !== "" ? (parseFloat(ctrlRetiroTransf) || 0) : ctrlTransfVal + arrastreTransf;
  const ctrlRetiroTDNum     = ctrlRetiroTD     !== "" ? (parseFloat(ctrlRetiroTD)     || 0) : ctrlTdVal + arrastreTarjetaD;
  const ctrlRetiroTCNum     = ctrlRetiroTC     !== "" ? (parseFloat(ctrlRetiroTC)     || 0) : ctrlTcVal + arrastreTarjetaC;
  const ctrlRetiroChequeNum = ctrlRetiroCheque !== "" ? (parseFloat(ctrlRetiroCheque) || 0) : ctrlChequeVal + arrastreCheque;
  const ctrlSaldoEnCaja     = ctrlReal !== "" ? Math.max(0, (parseFloat(ctrlReal) || 0) - ctrlRetiroEfNum) : null;
  const ctrlTotalTesoreria  = ctrlRetiroEfNum + ctrlRetiroTransfNum + ctrlRetiroTDNum + ctrlRetiroTCNum + ctrlRetiroChequeNum;

  // ── Cierre final: distribución a Tesorería ───────────────────────────────────
  const retiroEfNum      = parseFloat(retiroFinalEfectivo) || 0;
  const retiroTransfNum  = retiroTransf  !== "" ? (parseFloat(retiroTransf)  || 0) : pendienteTransf;
  const retiroTDNum      = retiroTD      !== "" ? (parseFloat(retiroTD)      || 0) : pendienteTarjetaD;
  const retiroTCNum      = retiroTC      !== "" ? (parseFloat(retiroTC)      || 0) : pendienteTarjetaC;
  const retiroChequeNum  = retiroCheque  !== "" ? (parseFloat(retiroCheque)  || 0) : pendienteCheque;
  const saldoEnCajaFinal    = cierreReal !== "" ? Math.max(0, (parseFloat(cierreReal) || 0) - retiroEfNum) : null;
  const diferenciaPeriodo   = cierreReal !== "" ? (parseFloat(cierreReal) || 0) - esperadoPeriodo : null;
  const totalParaTesoreria  = retiroEfNum + retiroTransfNum + retiroTDNum + retiroTCNum + retiroChequeNum;

  const nextNumero = (tipo) => {
    const prefix = tipo === "Recibo" ? "R" : tipo === "Nota de Crédito" ? "NC" : "ND";
    const count = (recibos || []).filter(r => r.tipo === tipo).length + 1;
    return `${prefix}-${String(count).padStart(4, "0")}`;
  };

  const abrirCaja = () => {
    const monto = parseFloat(inicioCaja);
    if (isNaN(monto) || monto < 0) { toast("Ingresá un monto válido.", "error"); return; }
    setCaja({ abierta: true, inicio: monto, sessionId: uid(), horaApertura: horaActual(), aperturaTs: new Date().toISOString(), usuarioApertura: usuarioActivo?.nombre || null, ultimoCierre: caja.ultimoCierre, cierresParciales: [] });
    setInicioCaja("");
  };

  const abrirCajaDesdeUltimoCierre = () => {
    const inicio = caja.ultimoCierre.saldoInicial ?? caja.ultimoCierre.real;
    setCaja(prev => ({ abierta: true, inicio, sessionId: uid(), horaApertura: horaActual(), aperturaTs: new Date().toISOString(), usuarioApertura: usuarioActivo?.nombre || null, ultimoCierre: prev.ultimoCierre, cierresParciales: [] }));
  };

  const guardarInicio = () => {
    const monto = parseFloat(nuevoInicio);
    if (isNaN(monto) || monto < 0) { toast("Monto inválido.", "error"); return; }
    setCaja(prev => ({ ...prev, inicio: monto }));
    setEditandoInicio(false);
    setNuevoInicio("");
  };

  const agregarRetiro = async ({ monto, motivo, medio, cuentaId, cuentaNombre, proveedorId }) => {
    const esDueno = cuentaId === CUENTA_RETIRO_DUENO;
    let gastoId = null;
    let fallóGasto = false;

    if (!esDueno) {
      try {
        if (typeof agregarGasto !== "function") throw new Error("agregarGasto no disponible");
        const proveedor = (proveedores || []).find(p => String(p.id) === String(proveedorId));
        const nuevoGasto = await agregarGasto({
          nro: `G-${String((gastos?.length || 0) + 1).padStart(4, "0")}`,
          fecha: today(),
          cuentaId,
          concepto: motivo,
          monto,
          formaPago: medio,
          fuente: "caja_salon",
          proveedorId: proveedor?.id ?? null,
          proveedor: proveedor?.nombre ?? null,
          referencia: "",
          recurrente: false,
          estado: "registrado",
          usuario: usuarioActivo?.nombre || null,
          periodo: today().slice(0, 7),
        });
        gastoId = nuevoGasto?.id ?? null;
      } catch (err) {
        fallóGasto = true;
      }
    }

    try {
      await agregarRetiroDB({
        monto, motivo, medio, cuentaId, gastoId,
        cuentaNombre: esDueno ? "Retiro de dueño" : cuentaNombre,
        usuario: usuarioActivo?.nombre || null,
      });
      setModalRetiro(false);
      if (esDueno) {
        toast(`Retiro de dueño registrado — ${fmt(monto)}`, "success");
      } else if (fallóGasto) {
        toast("Retiro registrado. No se pudo vincular el gasto — cargarlo manualmente en Gastos.", "warning");
      } else {
        toast(`Retiro registrado y gasto vinculado a ${cuentaNombre}`, "success");
      }
    } catch (err) {
      toast(`Error al registrar el retiro: ${err.message}`, "error");
    }
  };

  const eliminarRetiro = async (id) => {
    const retiro = retirosCaja.find(r => r.id === id);
    if (retiro && !puedeEliminarRetiro(retiro)) {
      toast("Este retiro ya fue incluido en un cierre de control y no puede borrarse desde acá.", "warning");
      return;
    }
    try {
      await eliminarRetiroDB(id);
    } catch (err) {
      toast(`Error al eliminar el retiro: ${err.message}`, "error");
    }
  };

  const hacerCierreParcial = () => {
    const real = parseFloat(ctrlReal);
    if (isNaN(real) || real < 0) { toast("Ingresá el efectivo contado.", "error"); return; }
    const nro = cierresParciales.length + 1;
    const saldoEnCaja = Math.max(0, real - ctrlRetiroEfNum);
    const nuevoParcial = {
      id: uid(), tipo: "parcial",
      numero: `CP-${String(nro).padStart(4, "0")}`,
      fecha: today(), hora: horaActual(), _ts: Date.now(),
      usuario: usuarioActivo?.nombre || "—",
      periodoEfectivo, periodoTransf, periodoTarjetaD, periodoTarjetaC, periodoCheque, periodoCtaCte, periodoRetiros,
      inicioEfectivo: inicioEfectivoPeriodo,
      esperado: esperadoPeriodo, real, diferencia: real - esperadoPeriodo,
      transfConfirmado: ctrlTransfVal, tdConfirmado: ctrlTdVal, tcConfirmado: ctrlTcVal, chequeConfirmado: ctrlChequeVal,
      retiroEfectivo: ctrlRetiroEfNum, retiroTransf: ctrlRetiroTransfNum,
      retiroTarjetaD: ctrlRetiroTDNum, retiroTarjetaC: ctrlRetiroTCNum, retiroCheque: ctrlRetiroChequeNum,
      totalRetiroTesoreria: ctrlTotalTesoreria, saldoEnCaja,
      acumEfectivo: totalEfectivo, acumTransf: totalTransf,
      acumTarjetaD: totalTarjetaD, acumTarjetaC: totalTarjetaC,
      acumCheque: totalCheque, acumCtaCte: totalCtaCteNeto, acumRetiros: totalRetiros, acumRefuerzos: totalRefuerzos,
      acumRetirosEfectivo: totalRetirosEfectivo, acumRetirosTransferencia: totalRetirosTransferencia,
      acumRefuerzosCount: refuerzosCaja.length,
    };
    setCaja(prev => ({ ...prev, cierresParciales: [...(prev.cierresParciales || []), nuevoParcial] }));
    if (typeof agregarMovimientoTesoreria === "function" && ctrlTotalTesoreria > 0) {
      agregarMovimientoTesoreria({
        cierreId: nuevoParcial.id, tipo: "Cierre de Caja",
        fecha: today(), hora: nuevoParcial.hora,
        montoEfectivo: ctrlRetiroEfNum,
        montoTarjeta: ctrlRetiroTDNum + ctrlRetiroTCNum,
        montoTarjetaD: ctrlRetiroTDNum, montoTarjetaC: ctrlRetiroTCNum,
        montoTransf: ctrlRetiroTransfNum, montoCheque: ctrlRetiroChequeNum, montoMpago: 0,
        monto: ctrlTotalTesoreria, diferencia: real - esperadoPeriodo,
        saldoInicial: saldoEnCaja, estado: "pendiente",
        detalle: {
          inicio: inicioEfectivoPeriodo, totalEfectivo: periodoEfectivo, totalRetiros: periodoRetiros,
          esperado: esperadoPeriodo, real,
          tipoCierre: "parcial", numero: nuevoParcial.numero,
        },
      }).catch(err => toast(`Cierre de control guardado, pero no se pudo registrar en Tesorería: ${err.message}`, "error"));
    }
    guardarCierre({
      numero:             nuevoParcial.numero,
      fecha:              today(),
      horaApertura:       caja.horaApertura || "—",
      horaCierre:         nuevoParcial.hora,
      usuario:            nuevoParcial.usuario,
      inicio:             inicioEfectivoPeriodo,
      totalEfectivo:      periodoEfectivo,
      totalTarjeta:       periodoTarjetaD + periodoTarjetaC,
      totalTransferencia: periodoTransf,
      totalCheque:        periodoCheque,
      totalMpago:         0,
      totalCtaCte:        periodoCtaCte,
      retiros:            retirosPeriodo,
      totalRetiros:       periodoRetiros,
      refuerzos:          refuerzosPeriodo,
      totalRefuerzos:     periodoRefuerzos,
      esperado:           esperadoPeriodo,
      real,
      diferencia:         real - esperadoPeriodo,
      cantVentas:         0,
      totalVendido:       periodoEfectivo + periodoTransf + periodoTarjetaD + periodoTarjetaC + periodoCheque,
    }).catch(() => {
      // no bloqueamos el cierre de control por un error de red
    });
    setCtrlReal(""); setCtrlTransf(""); setCtrlTD(""); setCtrlTC(""); setCtrlCheque("");
    setCtrlRetiroEf(""); setCtrlRetiroTransf(""); setCtrlRetiroTD(""); setCtrlRetiroTC(""); setCtrlRetiroCheque("");
    setShowCierreControl(false);
    toast("Cierre de control registrado.", "success");
  };

  // ── Corrección del último cierre parcial (solo efectivo contado y retiro a
  // Tesorería — mismo alcance que la corrección del cierre final). El resto
  // de los campos del parcial (esperado, acumulados) quedan sin tocar: son
  // el reflejo de lo vendido/movido hasta ese momento, no del conteo. ──────
  const entrarEdicionParcial = () => {
    if (!ultimoParcial) return;
    setEditParcialReal(String(ultimoParcial.real));
    setEditParcialRetiroEf(String(ultimoParcial.retiroEfectivo || 0));
    setEditandoParcial(true);
  };

  const cancelarEdicionParcial = () => {
    setEditandoParcial(false);
    setEditParcialReal(""); setEditParcialRetiroEf("");
  };

  const guardarEdicionParcial = () => {
    const realNum = parseFloat(editParcialReal);
    if (isNaN(realNum) || realNum < 0) { toast("Ingresá un monto válido.", "error"); return; }
    const retiroEfNum2 = parseFloat(editParcialRetiroEf) || 0;
    const diferencia = realNum - ultimoParcial.esperado;
    const saldoEnCaja = Math.max(0, realNum - retiroEfNum2);
    const totalRetiroTesoreria = retiroEfNum2
      + (ultimoParcial.retiroTransf || 0) + (ultimoParcial.retiroTarjetaD || 0)
      + (ultimoParcial.retiroTarjetaC || 0) + (ultimoParcial.retiroCheque || 0);

    const actualizado = {
      ...ultimoParcial,
      real: realNum, retiroEfectivo: retiroEfNum2,
      diferencia, saldoEnCaja, totalRetiroTesoreria,
    };
    setCaja(prev => ({
      ...prev,
      cierresParciales: (prev.cierresParciales || []).map(cp => cp.id === ultimoParcial.id ? actualizado : cp),
    }));

    if (ultimoParcialTesoreria && !ultimoParcialLocked && typeof actualizarMovimientoTesoreria === "function") {
      actualizarMovimientoTesoreria(ultimoParcialTesoreria.id, {
        montoEfectivo: retiroEfNum2,
        monto: totalRetiroTesoreria,
        diferencia, saldoInicial: saldoEnCaja,
        detalle: { ...ultimoParcialTesoreria.detalle, real: realNum },
      }).catch(err => toast(`Cierre corregido, pero no se pudo actualizar Tesorería: ${err.message}`, "error"));
    }

    setEditandoParcial(false);
    setEditParcialReal(""); setEditParcialRetiroEf("");
    toast("Cierre de control corregido.", "success");
  };

  const hacerRefuerzo = async () => {
    const monto = parseFloat(refuerzoMonto);
    if (isNaN(monto) || monto <= 0) { toast("Ingresá un monto válido.", "error"); return; }

    const esExterno = refuerzoOrigen === "externo";
    const hora = horaActual();

    if (!esExterno) {
      // Validar saldo en Tesorería — solo aplica cuando el refuerzo sale de ahí.
      const cajaMayorT     = (tesoreria || []).filter(t => t.estado === "en_caja_mayor");
      const retirosT       = (tesoreria || []).filter(t => t.tipo === "Retiro");
      const ingresosACajaT = (tesoreria || []).filter(t => t.tipo === "Ingreso a Caja");
      const saldoTesor     = cajaMayorT.reduce((s,t) => s + t.monto, 0)
                           - retirosT.reduce((s,t) => s + t.monto, 0)
                           - ingresosACajaT.reduce((s,t) => s + t.monto, 0);
      if (monto > saldoTesor) {
        toast(`Saldo insuficiente en Tesorería (disponible: ${fmt(saldoTesor)}).`, "error");
        return;
      }
    }

    const motivo = refuerzoMotivo.trim() || (esExterno ? "Ingreso externo" : "Refuerzo desde Tesorería");
    try {
      await agregarRefuerzoDB({ monto, motivo, origen: refuerzoOrigen, usuario: usuarioActivo?.nombre || null });
    } catch (err) {
      toast(`Error al registrar el refuerzo: ${err.message}`, "error");
      return;
    }

    // Un ingreso externo (plata que pone la dueña u otra persona, no sale de
    // Tesorería) no genera movimiento ahí — solo queda anotado en Caja.
    if (!esExterno) {
      agregarMovimientoTesoreria({
        tipo: "Ingreso a Caja", fecha: today(), hora,
        monto, concepto: `Refuerzo a Caja Salón${refuerzoMotivo.trim() ? ` — ${refuerzoMotivo.trim()}` : ""}`,
        formaPago: "Efectivo", estado: "ingreso_caja",
      }).catch(err => toast(`Refuerzo registrado en caja, pero no se pudo descontar de Tesorería: ${err.message}`, "error"));
    }

    setRefuerzoMonto(""); setRefuerzoMotivo(""); setRefuerzoOrigen("tesoreria"); setShowRefuerzo(false);
    toast(`Refuerzo de ${fmt(monto)} registrado.`, "success");
  };

  // El número mostrado en el formulario mientras se completa (nextNumero) es
  // solo una vista previa calculada en el navegador — el número real, el
  // insert del recibo, el ajuste de cuenta corriente y la devolución de
  // stock (NC) se hacen como una sola operación en emitirRecibo (useRecibos),
  // que además sabe encolarse sola si no hay conexión en ese momento.
  const emitirComprobante = async (dataOriginal) => {
    const data = { ...dataOriginal, sessionId: caja.sessionId, usuario: usuarioActivo?.nombre || "" };
    try {
      const reciboGuardado = await emitirRecibo(data);
      if (String(reciboGuardado.id).startsWith("local-")) {
        toast("Sin conexión: el comprobante se guardó localmente y se va a sincronizar solo cuando vuelva internet.", "warning");
      }
    } catch (err) {
      toast(`Error al guardar el recibo: ${err.message}`, "error");
    }
    if (modalComprobante) setModalComprobante(null);
  };

  const cerrarCaja = async () => {
    const real = parseFloat(cierreReal);
    if (isNaN(real)) { toast("Ingresá el monto real en caja.", "error"); return; }
    // Número asignado por Postgres (contador atómico, prefijo "C-") en vez de
    // calcularlo del largo del historial en el navegador — así un cierre desde
    // esta PC y otro casi simultáneo desde la otra nunca salen con el mismo número.
    // Con límite de tiempo: si la conexión se cortó justo entre que se habilitó
    // el botón y este click, mejor un error claro que quedar colgado sin aviso.
    let numeroFinal;
    try {
      const { data, error: errNumero } = await conTimeout(() => supabase.rpc('siguiente_numero_cierre'));
      if (errNumero) { toast(`No se pudo generar el número de cierre: ${errNumero.message}`, "error"); return; }
      numeroFinal = data;
    } catch (err) {
      toast(`No se pudo cerrar la caja: ${err.message}`, "error");
      return;
    }
    const diff = real - esperadoPeriodo;
    const saldoInicial = Math.max(0, real - retiroEfNum);
    const cierreId = uid();
    const cierreData = {
      cierreId, tipo: "final", tipoCierre: "final", numero: numeroFinal,
      fecha: today(), hora: horaActual(),
      inicio: caja.inicio,
      // Totales del día completo
      totalEfectivo, totalTransf, totalTarjetaD, totalTarjetaC, totalCheque, totalCtaCte: totalCtaCteNeto,
      totalTarjeta: totalTarjetaD + totalTarjetaC,
      ventasEfectivo, ventasTransf, ventasTarjetaD, ventasTarjetaC, ventasCheque,
      cobrosEfectivo, cobrosTransf, cobrosTarjetaD, cobrosTarjetaC, cobrosCheque, totalCobros,
      totalCambiosIngreso, totalCambiosEgreso, creditosCtaCte,
      totalAnulaciones, anulEfectivo, anulTransf, anulTarjetaD, anulTarjetaC, anulCheque, anulCtaCte,
      anulacionesDia,
      retiros: retirosCaja, totalRetiros,
      // Período del cierre final
      periodoEfectivo, periodoTransf, periodoTarjetaD, periodoTarjetaC, periodoCheque, periodoCtaCte, periodoRetiros,
      inicioEfectivo: inicioEfectivoPeriodo,
      esperado: esperadoPeriodo, real, diferencia: diff,
      // Distribución a Tesorería
      retiroFinalEfectivo: retiroEfNum,
      retiroTransf: retiroTransfNum, retiroTarjetaD: retiroTDNum, retiroTarjetaC: retiroTCNum, retiroCheque: retiroChequeNum,
      saldoInicial,
      comprobantes: recibosDia,
      cierresParciales,
    };
    setCaja(prev => ({ ...prev, abierta: false, ultimoCierre: cierreData, cierresParciales: [] }));
    if (typeof agregarMovimientoTesoreria === "function") {
      agregarMovimientoTesoreria({
        cierreId, tipo: "Cierre de Caja",
        fecha: today(), hora: horaActual(),
        montoEfectivo: retiroEfNum,
        montoTarjeta: retiroTDNum + retiroTCNum,
        montoTarjetaD: retiroTDNum, montoTarjetaC: retiroTCNum,
        montoTransf: retiroTransfNum, montoCheque: retiroChequeNum, montoMpago: 0,
        monto: totalParaTesoreria, diferencia: diff,
        saldoInicial, estado: "pendiente", detalle: cierreData,
      }).catch(err => toast(`Caja cerrada, pero no se pudo registrar en Tesorería: ${err.message}`, "error"));
    }
    const ventasHoyCerradas = (ventas || []).filter(v => v.estado !== "anulada" && esDeSesionActual(v.createdAt));
    const cierreHistorial = {
      numero:             numeroFinal,
      fecha:              today(),
      horaApertura:       caja.horaApertura || "—",
      horaCierre:         horaActual(),
      // Marca de tiempo exacta (con fecha) de apertura/cierre — a diferencia de
      // horaApertura/horaCierre (solo "HH:MM:SS", sin día), permite reconstruir
      // después qué ventas cayeron dentro de esta sesión para mostrar el
      // desglose en el historial, incluso si la sesión abarcó más de un día.
      aperturaTs:         caja.aperturaTs || null,
      cierreTs:           new Date().toISOString(),
      usuario:            usuarioActivo?.nombre || "—",
      inicio:             inicioEfectivoPeriodo,
      totalEfectivo:      periodoEfectivo,
      totalTarjeta:       periodoTarjetaD + periodoTarjetaC,
      totalTransferencia: periodoTransf,
      totalCheque:        periodoCheque,
      totalMpago:         0,
      totalCtaCte:        periodoCtaCte,
      retiros:            retirosPeriodo,
      totalRetiros:       periodoRetiros,
      refuerzos:          refuerzosPeriodo,
      totalRefuerzos:     periodoRefuerzos,
      esperado:           esperadoPeriodo,
      real,
      diferencia:         diff,
      cantVentas:         ventasHoyCerradas.length,
      totalVendido:       ventasHoyCerradas.reduce((a, v) => a + (v.total || 0), 0),
      comprobantes:       recibosDia,
    };
    guardarCierre(cierreHistorial).catch(() => {
      setHistorialCierres(prev => [...(prev || []), { ...cierreHistorial, id: cierreId }]);
      toast("Cierre guardado localmente. Hubo un problema de conexión — verificá que se guardó en Supabase.", "warning");
    });
    setCierreReal(""); setRetiroFinalEfectivo("");
    setRetiroTransf(""); setRetiroTD(""); setRetiroTC(""); setRetiroCheque("");
    setActiveTab("caja");
  };

  // ── Historial: filtros ────────────────────────────────────────────────────
  const histFiltrados = (historialCierres || [])
    .filter(c => {
      if (hFDesde && c.fecha < hFDesde) return false;
      if (hFHasta && c.fecha > hFHasta) return false;
      if (hBuscar.trim()) {
        const q = hBuscar.trim().toLowerCase();
        return (c.numero || "").toLowerCase().includes(q) ||
               (c.usuario || "").toLowerCase().includes(q);
      }
      return true;
    })
    .slice().sort((a, b) => b.id - a.id);

  const { pagina: paginaHist, setPagina: setPaginaHist, totalPaginas: totalPaginasHist, itemsPagina: histPagina, pageSize: pageSizeHist } = usePaginacion(histFiltrados);

  const histSumaDif    = histFiltrados.reduce((a, c) => a + (c.diferencia || 0), 0);
  const histSumaVentas = histFiltrados.reduce((a, c) => a + (c.totalVendido || 0), 0);
  const histPromDiario = histFiltrados.length > 0 ? histSumaVentas / histFiltrados.length : 0;

  const histExportCSV = () => {
    const headers = ["N° Cierre","Fecha","Usuario","Ventas","Total Vendido","Esperado","Real","Diferencia"];
    const rows = histFiltrados.map(c => [
      c.numero, fmtFechaAR(c.fecha), c.usuario || "—", c.ventas || 0,
      (c.totalVendido || 0).toFixed(2), (c.esperado || 0).toFixed(2),
      (c.real || 0).toFixed(2), (c.diferencia || 0).toFixed(2),
    ].join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `cierres-${hFDesde || "inicio"}-${hFHasta || "hoy"}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div style={{ maxWidth: 1100 }}>

      {/* ── Modales ── */}
      {modalRetiro && (
        <ModalRetiro
          disponible={esperadoPeriodo}
          planCuentas={planCuentas}
          proveedores={proveedores}
          onClose={() => setModalRetiro(false)}
          onConfirm={agregarRetiro}
        />
      )}
      {showDesglose && (
        <ModalResumenDia
          mov={movDia}
          inicio={caja.inicio || 0}
          aperturaTs={caja.aperturaTs}
          horaApertura={caja.horaApertura}
          cierresParciales={cierresParciales}
          retiros={retirosCaja}
          refuerzos={refuerzosCaja}
          actual={{ periodoEfectivo, esperadoPeriodo }}
          noEfectivo={[
            { label: "Tarjeta Débito",  total: totalTarjetaD, enviado: enviadoEnParciales("retiroTarjetaD"), pendiente: pendienteTarjetaD },
            { label: "Tarjeta Crédito", total: totalTarjetaC, enviado: enviadoEnParciales("retiroTarjetaC"), pendiente: pendienteTarjetaC },
            { label: "Transferencia",   total: totalTransf,   enviado: enviadoEnParciales("retiroTransf"),   pendiente: pendienteTransf },
            { label: "Cheque",          total: totalCheque,   enviado: enviadoEnParciales("retiroCheque"),   pendiente: pendienteCheque },
          ]}
          onClose={() => setShowDesglose(false)}
        />
      )}

      {showEditarRecibo && (
        <ModalEditarRecibo
          recibo={showEditarRecibo}
          onClose={() => setShowEditarRecibo(null)}
          onGuardar={async (cambios) => {
            try {
              await editarRecibo(showEditarRecibo.id, cambios);
              // Si el comprobante estaba ligado a un pago en cuenta corriente
              // (Recibo, o Nota de Crédito/Débito con forma "Cuenta Corriente"),
              // hay que resincronizar el monto: se borra y se vuelve a crear
              // con el valor nuevo, así el saldo del cliente queda correcto.
              // Nota de Débito se guarda en negativo (agrega deuda).
              if (showEditarRecibo.clienteId && agregarPagoCtaCte && eliminarPagoCtaCte) {
                // Vínculo por `reciboId` (robusto); si el pago es viejo y no lo
                // tiene, se cae al match por texto de antes.
                const pagoLigado = (pagosCtaCte || []).find(p => p.reciboId === showEditarRecibo.id) ||
                  (pagosCtaCte || []).find(p =>
                    p.reciboId == null &&
                    p.clienteId === showEditarRecibo.clienteId &&
                    p.observacion?.startsWith(`${showEditarRecibo.tipo} ${showEditarRecibo.numero} —`)
                  );
                try {
                  if (pagoLigado) await eliminarPagoCtaCte(pagoLigado.id);
                  // Mismo criterio que al emitir (ver useRecibos.js): un Recibo
                  // SIEMPRE impacta la cta. cte. sin importar la forma de cobro
                  // (esa forma es solo cómo entró la plata a caja) — una
                  // Nota de Crédito/Débito solo si se dejó explícitamente "en
                  // cuenta corriente". Antes acá solo se chequeaba la segunda
                  // condición, así que editar un Recibo cobrado en Efectivo/
                  // Transferencia/etc. borraba el pago y nunca lo volvía a
                  // crear — la deuda del cliente reaparecía como si nunca
                  // hubiera pagado.
                  const esRecibo = showEditarRecibo.tipo === "Recibo";
                  // Si el recibo incluía mora, esa parte no es pago de la
                  // deuda (está anotada en la ficha del cliente): se descuenta.
                  const clienteRecibo = (clientes || []).find(c => c.id === showEditarRecibo.clienteId);
                  const moraDelRecibo = esRecibo ? moraCobradaDeRecibo(clienteRecibo?.configMora, showEditarRecibo.id) : 0;
                  const montoDeuda = cambios.monto - moraDelRecibo;
                  if (montoDeuda > 0 && (esRecibo || cambios.formaPago === "Cuenta Corriente")) {
                    const signo = showEditarRecibo.tipo === "Nota de Débito" ? -1 : 1;
                    await agregarPagoCtaCte({
                      clienteId:   showEditarRecibo.clienteId,
                      fecha:       showEditarRecibo.fecha,
                      monto:       signo * montoDeuda,
                      formaPago:   cambios.formaPago,
                      observacion: `${showEditarRecibo.tipo} ${showEditarRecibo.numero} — ${cambios.observacion}`,
                      usuario:     usuarioActivo?.nombre || "",
                      reciboId:    showEditarRecibo.id,
                    });
                  }
                } catch (err) {
                  toast(`Comprobante actualizado. Error al resincronizar la cuenta corriente: ${err.message}`, "warning");
                }
              }
              setShowEditarRecibo(null);
              toast("Comprobante actualizado.", "success");
            } catch (err) {
              toast(err.message, "error");
              throw err;
            }
          }}
        />
      )}

      {showAnularRecibo && (
        <ModalAnularRecibo
          recibo={showAnularRecibo}
          onClose={() => setShowAnularRecibo(null)}
          onConfirmar={async (motivo) => {
            try {
              await anularRecibo(showAnularRecibo.id, motivo);
              // Si el comprobante estaba ligado a un pago en cuenta corriente
              // (Recibo, o Nota de Crédito/Débito con forma "Cuenta Corriente"),
              // se revierte para que la deuda vuelva a su valor real.
              if (showAnularRecibo.clienteId && eliminarPagoCtaCte) {
                const pagoLigado = (pagosCtaCte || []).find(p => p.reciboId === showAnularRecibo.id) ||
                  (pagosCtaCte || []).find(p =>
                    p.reciboId == null &&
                    p.clienteId === showAnularRecibo.clienteId &&
                    p.observacion?.startsWith(`${showAnularRecibo.tipo} ${showAnularRecibo.numero} —`)
                  );
                if (pagoLigado) {
                  try {
                    await eliminarPagoCtaCte(pagoLigado.id);
                  } catch (err) {
                    toast(`Comprobante anulado. Error al revertir la cuenta corriente: ${err.message}`, "warning");
                  }
                }
                // Si el recibo había cobrado mora, vuelve a quedar pendiente.
                const clienteRecibo = (clientes || []).find(c => c.id === showAnularRecibo.clienteId);
                if (showAnularRecibo.tipo === "Recibo" && revertirMoraCobrada &&
                    moraCobradaDeRecibo(clienteRecibo?.configMora, showAnularRecibo.id) > 0) {
                  try {
                    await revertirMoraCobrada(showAnularRecibo.clienteId, showAnularRecibo.id);
                  } catch (err) {
                    toast(`Comprobante anulado. Error al revertir la mora cobrada: ${err.message}`, "warning");
                  }
                }
              }
              // Si era una Nota de Crédito que había devuelto mercadería, se
              // retira ese stock de nuevo (la devolución queda sin efecto).
              if (showAnularRecibo.tipo === "Nota de Crédito" && showAnularRecibo.itemsDevueltos?.length > 0 && aplicarDeltaStockMultiple) {
                const ventaOrigen = ventas.find(v => v.id === showAnularRecibo.ventaId);
                if (ventaOrigen?.depositoId) {
                  try {
                    const cambiosStock = showAnularRecibo.itemsDevueltos
                      .filter(it => it.productoId)
                      .map(it => ({ productoId: it.productoId, depositoId: ventaOrigen.depositoId, delta: -it.qty }));
                    if (cambiosStock.length) await aplicarDeltaStockMultiple(cambiosStock);
                  } catch (err) {
                    toast(`Comprobante anulado. Error al revertir el stock: ${err.message}`, "warning");
                  }
                }
              }
              setShowAnularRecibo(null);
              toast("Comprobante anulado.", "success");
            } catch (err) {
              toast(err.message, "error");
              throw err;
            }
          }}
        />
      )}

      {modalComprobante && (
        <ModalComprobante
          tipo={modalComprobante}
          numero={nextNumero(modalComprobante)}
          clientes={clientes || []}
          ventas={ventas || []}
          pagosCtaCte={pagosCtaCte || []}
          onClose={() => setModalComprobante(null)}
          onConfirm={emitirComprobante}
        />
      )}

      {/* ── Status bar ── */}
      <div className={`caja-status ${caja.abierta ? "caja-open" : "caja-closed"}`}>
        <div className="caja-dot" />
        <div style={{ flex: 1 }}>
          <span style={{ fontWeight: 600, color: "var(--text1)" }}>
            Caja {caja.abierta ? "abierta" : "cerrada"}
          </span>
          {caja.abierta && !editandoInicio && (
            <span style={{ fontSize: 12, color: "var(--text3)", marginLeft: 10 }}>
              Apertura: {caja.horaApertura} · Inicio: {fmt(caja.inicio)}
            </span>
          )}
          {caja.abierta && editandoInicio && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 10 }}>
              <input className="form-input" type="number"
                style={{ width: 110, padding: "3px 8px", fontSize: 12 }}
                value={nuevoInicio} onChange={e => setNuevoInicio(e.target.value)}
                placeholder={String(caja.inicio)} autoFocus />
              <button className="btn btn-sm btn-success" onClick={guardarInicio}>Guardar</button>
              <button className="btn btn-sm btn-ghost" onClick={() => setEditandoInicio(false)}>Cancelar</button>
            </span>
          )}
        </div>
        {caja.abierta && !editandoInicio && (
          <button className="btn btn-sm btn-ghost" style={{ fontSize: 11 }}
            onClick={() => { setNuevoInicio(String(caja.inicio)); setEditandoInicio(true); }}>
            Modificar inicio
          </button>
        )}
        {caja.abierta
          ? <Icon name="unlock" size={16} color="var(--green)" />
          : <Icon name="lock"   size={16} color="var(--red)" />}
      </div>

      {/* ── Main tabs ── */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, background: "var(--bg2)", borderRadius: 10, padding: 4 }}>
        {[
          { id: "dia",       label: "Caja del día",         icon: "cash"    },
          { id: "historial", label: "Historial de cierres", icon: "receipt" },
        ].map(tab => (
          <button key={tab.id}
            className={`btn btn-sm ${mainTab === tab.id ? "btn-primary" : "btn-ghost"}`}
            style={{ flex: 1, justifyContent: "center", borderRadius: 7 }}
            onClick={() => setMainTab(tab.id)}>
            <Icon name={tab.icon} size={13} /> {tab.label}
            {tab.id === "historial" && (historialCierres || []).length > 0 && (
              <span style={{ marginLeft: 4, fontSize: 10, padding: "1px 6px", borderRadius: 10,
                background: mainTab === "historial" ? "rgba(255,255,255,0.2)" : "var(--bg3)",
                color: mainTab === "historial" ? "inherit" : "var(--text3)" }}>
                {(historialCierres || []).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {mainTab === "dia" && (<>
      {/* ── Aviso: caja abierta desde un día anterior sin cerrar ── */}
      {caja.abierta && caja.aperturaTs && caja.aperturaTs.slice(0, 10) !== today() && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", marginBottom: 16, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 8, fontSize: 13, color: "var(--amber)" }}>
          <Icon name="warning" size={16} color="var(--amber)" />
          <div>
            <strong>Caja abierta desde el {fmtFechaAR(caja.aperturaTs.slice(0, 10))} sin cerrar.</strong>{" "}
            Al cerrar hoy se van a sumar juntas las ventas y movimientos de todos estos días.
          </div>
        </div>
      )}
      {/* ── Abrir caja ── */}
      {!caja.abierta && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">Abrir caja</div>
          {caja.ultimoCierre ? (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 4 }}>Saldo dejado en el cierre anterior · {fmtFechaAR(caja.ultimoCierre.fecha)}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, color: "var(--green)" }}>{fmt(caja.ultimoCierre.saldoInicial ?? caja.ultimoCierre.real)}</div>
                </div>
                <Icon name="cash" size={28} color="var(--green)" />
              </div>
              <p style={{ fontSize: 12, color: "var(--text3)", margin: "0 0 14px" }}>
                El monto inicial queda fijado al saldo dejado en el cierre anterior. Para corregir diferencias usá el módulo Tesorería.
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {!!permisos?.[usuarioActivo?.id]?.abrirCaja && (
                <button className="btn btn-success" onClick={abrirCajaDesdeUltimoCierre}>
                  <Icon name="unlock" size={14} /> Abrir caja · {fmt(caja.ultimoCierre.saldoInicial ?? caja.ultimoCierre.real)}
                </button>
                )}
                <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => setShowUltimoCierre(true)}>
                  <Icon name="eye" size={13} /> Ver reporte
                </button>
              </div>
            </>
          ) : (
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Efectivo inicial en caja</label>
                <input className="form-input" type="number" placeholder="Ej: 5000"
                  value={inicioCaja} onChange={e => setInicioCaja(e.target.value)} />
              </div>
              {!!permisos?.[usuarioActivo?.id]?.abrirCaja && (
              <button className="btn btn-success" onClick={abrirCaja}>
                <Icon name="unlock" size={14} /> Abrir caja
              </button>
              )}
            </div>
          )}
        </div>
      )}

      {caja.abierta && (
        <>
          {/* ── Tabs ── */}
          <div style={{ display: "flex", gap: 4, marginBottom: 16, background: "var(--bg2)", borderRadius: 10, padding: 4 }}>
            {[
              { id: "caja",         label: "Caja y Retiros", icon: "cash"    },
              { id: "recibos",      label: "Recibos",        icon: "receipt" },
              { id: "comprobantes", label: "Comprobantes",   icon: "tag"     },
            ].map(tab => (
              <button key={tab.id}
                className={`btn btn-sm ${activeTab === tab.id ? "btn-primary" : "btn-ghost"}`}
                style={{ flex: 1, justifyContent: "center", borderRadius: 7 }}
                onClick={() => setActiveTab(tab.id)}>
                <Icon name={tab.icon} size={13} /> {tab.label}
              </button>
            ))}
          </div>

          {/* ── Tab: Caja y Retiros ── */}
          {activeTab === "caja" && (<>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
              {!!permisos?.[usuarioActivo?.id]?.generarRetiro && (
              <button className="btn btn-danger btn-sm" onClick={() => setModalRetiro(true)}>
                <Icon name="upload" size={14} /> Registrar Retiro
              </button>
              )}
            </div>

          {/* ── Movimientos del día + Cierre lado a lado ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>

            {/* Movimientos del día */}
            <div className="card" style={{ margin: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div className="card-title" style={{ margin: 0 }}>
                  {ultimoParcial ? "Movimientos desde el último cierre" : "Movimientos del día"}
                </div>
                <button className="btn btn-sm btn-secondary" style={{ fontSize: 11, gap: 5 }}
                  onClick={() => setShowDesglose(true)}>
                  <Icon name="chart" size={13} /> Resumen del día
                </button>
              </div>
              {ultimoParcial && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", padding: "8px 12px", marginBottom: 12, background: "color-mix(in srgb, var(--accent) 7%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent)", borderRadius: 8, fontSize: 11, color: "var(--text2)" }}>
                  <span>
                    Desde <strong style={{ color: "var(--accent2)" }}>{ultimoParcial.numero}</strong> ({ultimoParcial.hora}) · lo anterior está en <em>Resumen del día</em>
                  </span>
                  <span>
                    Quedó en caja: <strong style={{ fontFamily: "var(--font-mono)", color: "var(--green)" }}>{fmt(inicioEfectivoPeriodo)}</strong>
                  </span>
                </div>
              )}
              <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", marginBottom: 14 }}>
                <table style={{ width: "100%" }}>
                  <thead>
                    <tr style={{ background: "var(--bg4)" }}>
                      <th style={{ padding: "7px 12px", textAlign: "left", fontSize: 10, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".05em" }}>Medio de pago</th>
                      <th style={{ padding: "7px 12px", textAlign: "right", fontSize: 10, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".05em" }}>Importe</th>
                      <th style={{ padding: "7px 12px", textAlign: "left", fontSize: 10, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".05em" }}>Obs.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* ── Sección: Ventas del día ── */}
                    <tr style={{ background: "var(--bg4)" }}>
                      <td colSpan={3} style={{ padding: "5px 12px 3px", fontSize: 9, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".06em" }}>{ultimoParcial ? "Ventas" : "Ventas del día"}</td>
                    </tr>
                    {[
                      { label: "Efectivo",        val: movTramo.ventasEfectivo,  obs: "Ingresa a caja", warn: false },
                      { label: "Tarjeta Débito",  val: movTramo.ventasTarjetaD,  obs: "",               warn: false },
                      { label: "Tarjeta Crédito", val: movTramo.ventasTarjetaC,  obs: "",               warn: false },
                      { label: "Transferencia",   val: movTramo.ventasTransf,    obs: "Incl. Mpago",    warn: false },
                      { label: "Cheque",          val: movTramo.ventasCheque,    obs: "",               warn: false },
                      { label: "Cta. Corriente",  val: movTramo.totalCtaCte,     obs: "No a caja",      warn: true  },
                    ].map((row, i) => (
                      <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ padding: "8px 12px", fontSize: 12, color: row.warn ? "var(--amber)" : "var(--text2)", fontWeight: 500 }}>{row.label}</td>
                        <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: row.warn ? "var(--amber)" : row.val > 0 ? "var(--green)" : "var(--text3)" }}>{fmt(row.val)}</td>
                        <td style={{ padding: "8px 12px", fontSize: 10, color: "var(--text3)" }}>{row.obs}</td>
                      </tr>
                    ))}
                    {/* ── Sección: Cobros de Cta. Cte. ── */}
                    {movTramo.totalCobros > 0 && (
                      <>
                        <tr style={{ background: "var(--bg4)", borderTop: "2px solid var(--border2)" }}>
                          <td colSpan={3} style={{ padding: "5px 12px 3px", fontSize: 9, fontWeight: 700, color: "var(--blue)", textTransform: "uppercase", letterSpacing: ".06em" }}>Cobros Cta. Cte.</td>
                        </tr>
                        {[
                          { label: "Efectivo",        val: movTramo.cobrosEfectivo  },
                          { label: "Tarjeta Débito",  val: movTramo.cobrosTarjetaD  },
                          { label: "Tarjeta Crédito", val: movTramo.cobrosTarjetaC  },
                          { label: "Transferencia",   val: movTramo.cobrosTransf    },
                          { label: "Cheque",          val: movTramo.cobrosCheque    },
                        ].filter(r => r.val > 0).map((row, i) => (
                          <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                            <td style={{ padding: "8px 12px", fontSize: 12, color: "var(--text2)", fontWeight: 500 }}>{row.label}</td>
                            <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--blue)" }}>{fmt(row.val)}</td>
                            <td style={{ padding: "8px 12px", fontSize: 10, color: "var(--text3)" }}>Ingresa a caja</td>
                          </tr>
                        ))}
                      </>
                    )}
                    {/* ── Sección: Anulaciones del día ── */}
                    {movTramo.totalAnulaciones > 0 && (
                      <>
                        <tr style={{ background: "var(--bg4)", borderTop: "2px solid var(--border2)" }}>
                          <td colSpan={3} style={{ padding: "5px 12px 3px", fontSize: 9, fontWeight: 700, color: "var(--red)", textTransform: "uppercase", letterSpacing: ".06em" }}>
                            Ventas anuladas ({movTramo.anulacionesDia.length})
                          </td>
                        </tr>
                        {[
                          { label: "Efectivo",        val: movTramo.anulEfectivo  },
                          { label: "Tarjeta Débito",  val: movTramo.anulTarjetaD  },
                          { label: "Tarjeta Crédito", val: movTramo.anulTarjetaC  },
                          { label: "Transferencia",   val: movTramo.anulTransf    },
                          { label: "Cheque",          val: movTramo.anulCheque    },
                        ].filter(r => r.val > 0).map((row, i) => (
                          <tr key={`an-${i}`} style={{ borderTop: "1px solid var(--border)" }}>
                            <td style={{ padding: "8px 12px", fontSize: 12, color: "var(--red)", fontWeight: 500 }}>{row.label}</td>
                            <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--red)" }}>−{fmt(row.val)}</td>
                            <td style={{ padding: "8px 12px", fontSize: 10, color: "var(--text3)" }}>Devuelto / anulado</td>
                          </tr>
                        ))}
                        {movTramo.anulCtaCte > 0 && (
                          <tr style={{ borderTop: "1px solid var(--border)" }}>
                            <td style={{ padding: "8px 12px", fontSize: 12, color: "var(--amber)", fontWeight: 500 }}>Cta. Cte. (anulada)</td>
                            <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--amber)" }}>−{fmt(movTramo.anulCtaCte)}</td>
                            <td style={{ padding: "8px 12px", fontSize: 10, color: "var(--text3)" }}>Deuda cancelada</td>
                          </tr>
                        )}
                      </>
                    )}
                    {/* ── Sección: Cambios de artículo ── */}
                    {(movTramo.totalCambiosIngreso > 0 || movTramo.totalCambiosEgreso > 0 || movTramo.creditosCtaCte > 0) && (
                      <>
                        <tr style={{ background: "var(--bg4)", borderTop: "2px solid var(--border2)" }}>
                          <td colSpan={3} style={{ padding: "5px 12px 3px", fontSize: 9, fontWeight: 700, color: "var(--accent2)", textTransform: "uppercase", letterSpacing: ".06em" }}>Cambios de artículo y notas</td>
                        </tr>
                        {[
                          { label: "Efectivo (ND)",       val: movTramo.debitosEfectivo  },
                          { label: "Tarjeta Débito (ND)", val: movTramo.debitosTarjetaD  },
                          { label: "Tarjeta Créd. (ND)",  val: movTramo.debitosTarjetaC  },
                          { label: "Transferencia (ND)",  val: movTramo.debitosTransf    },
                          { label: "Cheque (ND)",         val: movTramo.debitosCheque    },
                        ].filter(r => r.val > 0).map((row, i) => (
                          <tr key={`nd-${i}`} style={{ borderTop: "1px solid var(--border)" }}>
                            <td style={{ padding: "8px 12px", fontSize: 12, color: "var(--text2)", fontWeight: 500 }}>{row.label}</td>
                            <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--green)" }}>+{fmt(row.val)}</td>
                            <td style={{ padding: "8px 12px", fontSize: 10, color: "var(--text3)" }}>Diferencia cobrada</td>
                          </tr>
                        ))}
                        {[
                          { label: "Efectivo (NC)",       val: movTramo.creditosEfectivo  },
                          { label: "Tarjeta Débito (NC)", val: movTramo.creditosTarjetaD  },
                          { label: "Tarjeta Créd. (NC)",  val: movTramo.creditosTarjetaC  },
                          { label: "Transferencia (NC)",  val: movTramo.creditosTransf    },
                          { label: "Cheque (NC)",         val: movTramo.creditosCheque    },
                        ].filter(r => r.val > 0).map((row, i) => (
                          <tr key={`nc-${i}`} style={{ borderTop: "1px solid var(--border)" }}>
                            <td style={{ padding: "8px 12px", fontSize: 12, color: "var(--amber)", fontWeight: 500 }}>{row.label}</td>
                            <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--red)" }}>−{fmt(row.val)}</td>
                            <td style={{ padding: "8px 12px", fontSize: 10, color: "var(--text3)" }}>Devuelto al cliente</td>
                          </tr>
                        ))}
                        {movTramo.creditosCtaCte > 0 && (
                          <tr style={{ borderTop: "1px solid var(--border)" }}>
                            <td style={{ padding: "8px 12px", fontSize: 12, color: "var(--amber)", fontWeight: 500 }}>Cta. Corriente (NC)</td>
                            <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--amber)" }}>−{fmt(movTramo.creditosCtaCte)}</td>
                            <td style={{ padding: "8px 12px", fontSize: 10, color: "var(--text3)" }}>No a caja — saldo cliente</td>
                          </tr>
                        )}
                      </>
                    )}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: "2px solid var(--border2)", background: "var(--bg4)" }}>
                      <td style={{ padding: "9px 12px", fontSize: 12, fontWeight: 600, color: "var(--text1)" }}>Total</td>
                      <td style={{ padding: "9px 12px", textAlign: "right", fontSize: 14, fontWeight: 700, color: "var(--accent2)", fontFamily: "var(--font-mono)" }}>
                        {fmt(movTramo.totalGeneral)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Lista de retiros */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 11, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".04em" }}>
                  Retiros
                </span>
                <span style={{ fontSize: 11, color: "var(--text3)" }}>
                  Disp. efectivo: <strong style={{ color: esperadoPeriodo < 0 ? "var(--red)" : "var(--text1)" }}>{fmt(esperadoPeriodo)}</strong>
                </span>
              </div>

              {retirosPeriodo.length > 0 ? (
                <div style={{ background: "var(--bg3)", borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)" }}>
                  {retirosPeriodo.map(r => {
                    const puedeBorrar = !!permisos?.[usuarioActivo?.id]?.generarRetiro && puedeEliminarRetiro(r);
                    return (
                      <div key={r.id} style={{ display: "flex", alignItems: "center", padding: "7px 10px", borderBottom: "1px solid var(--border)", gap: 7 }}>
                        <span style={{ fontSize: 11, color: "var(--text3)", minWidth: 50 }}>{r.hora}</span>
                        {(r.medio ?? "Efectivo") === "Efectivo" ? (
                          <span className="badge badge-ok" style={{ fontSize: 10 }}>Efectivo</span>
                        ) : (
                          <span className="badge badge-blue" style={{ fontSize: 10 }}>Transferencia</span>
                        )}
                        {r.cuentaId === CUENTA_RETIRO_DUENO ? (
                          <span className="badge badge-blue" style={{ fontSize: 10, whiteSpace: "nowrap" }}>Retiro dueño</span>
                        ) : r.cuentaNombre ? (
                          <span className="badge badge-ok" style={{ fontSize: 10, whiteSpace: "nowrap" }}>{r.cuentaNombre}</span>
                        ) : (
                          <span style={{ fontSize: 11, color: "var(--text3)" }}>—</span>
                        )}
                        <span style={{ flex: 1, fontSize: 12, color: "var(--text2)" }}>{r.motivo}</span>
                        <span style={{ color: "var(--red)", fontWeight: 600, fontSize: 12, marginRight: 4 }}>−{fmt(r.monto)}</span>
                        {puedeBorrar && (
                          <button className="btn btn-sm btn-ghost" style={{ padding: "2px 5px" }}
                            onClick={() => eliminarRetiro(r.id)} title="Eliminar retiro">
                            <Icon name="trash" size={12} color="var(--red)" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "var(--text3)", padding: "6px 0" }}>{ultimoParcial ? "Sin retiros desde el último cierre." : "Sin retiros registrados."}</div>
              )}
              {retirosCaja.length > retirosPeriodo.length && (
                <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 6 }}>
                  + {retirosCaja.length - retirosPeriodo.length} retiro(s) anteriores ya incluidos en cierres de control — ver <em>Resumen del día</em>.
                </div>
              )}

              {/* ── Refuerzos a caja ── */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14, marginBottom: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 11, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".04em" }}>
                  Refuerzos a caja
                </span>
                {!showRefuerzo && (
                  <button className="btn btn-sm btn-ghost" style={{ color: "var(--green)" }} onClick={() => setShowRefuerzo(true)}>
                    <Icon name="plus" size={12} /> Nuevo refuerzo
                  </button>
                )}
              </div>

              {refuerzosPeriodo.length > 0 && (
                <div style={{ background: "var(--bg3)", borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)", marginBottom: 8 }}>
                  {refuerzosPeriodo.map(r => (
                    <div key={r.id} style={{ display: "flex", alignItems: "center", padding: "7px 10px", borderBottom: "1px solid var(--border)", gap: 7 }}>
                      <span style={{ fontSize: 11, color: "var(--text3)", minWidth: 50 }}>{r.hora}</span>
                      <span
                        className="badge"
                        style={{
                          fontSize: 9, flexShrink: 0,
                          background: r.origen === "externo" ? "color-mix(in srgb, var(--amber) 15%, transparent)" : "color-mix(in srgb, var(--accent) 15%, transparent)",
                          color: r.origen === "externo" ? "var(--amber)" : "var(--accent2)",
                        }}
                      >
                        {r.origen === "externo" ? "Externo" : "Tesorería"}
                      </span>
                      <span style={{ flex: 1, fontSize: 12, color: "var(--text2)" }}>{r.motivo}</span>
                      <span style={{ color: "var(--green)", fontWeight: 600, fontSize: 12 }}>+{fmt(r.monto)}</span>
                    </div>
                  ))}
                </div>
              )}
              {refuerzosCaja.length > refuerzosPeriodo.length && (
                <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 8 }}>
                  + {refuerzosCaja.length - refuerzosPeriodo.length} refuerzo(s) anteriores ya incluidos en cierres de control — ver <em>Resumen del día</em>.
                </div>
              )}

              {showRefuerzo && (
                <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, padding: 12, marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--green)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 10 }}>
                    Nuevo refuerzo
                  </div>
                  <div className="form-group" style={{ margin: "0 0 10px" }}>
                    <label className="form-label">Origen</label>
                    <div className="segmented-control">
                      <button
                        type="button"
                        className={`segmented-btn${refuerzoOrigen === "tesoreria" ? " active" : ""}`}
                        onClick={() => setRefuerzoOrigen("tesoreria")}
                      >
                        Desde Tesorería
                      </button>
                      <button
                        type="button"
                        className={`segmented-btn${refuerzoOrigen === "externo" ? " active" : ""}`}
                        onClick={() => setRefuerzoOrigen("externo")}
                        title="Plata que pone la dueña u otra persona de su bolsillo (ej: cambio) — no sale de Tesorería"
                      >
                        Ingreso externo
                      </button>
                    </div>
                    {refuerzoOrigen === "externo" && (
                      <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 5 }}>
                        No descuenta de Tesorería — solo queda anotado en el arqueo de Caja.
                      </div>
                    )}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "8px 10px", marginBottom: 10 }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Monto *</label>
                      <input
                        className="form-input" type="number" placeholder="0"
                        value={refuerzoMonto} onChange={e => setRefuerzoMonto(e.target.value)} autoFocus
                      />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Motivo (opcional)</label>
                      <input
                        className="form-input" placeholder="Ej: fondo de cambio, refuerzo fin de semana..."
                        value={refuerzoMotivo} onChange={e => setRefuerzoMotivo(e.target.value)}
                      />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} onClick={hacerRefuerzo}>
                      <Icon name="check" size={13} /> Confirmar refuerzo
                    </button>
                    <button className="btn btn-ghost" onClick={() => { setShowRefuerzo(false); setRefuerzoMonto(""); setRefuerzoMotivo(""); setRefuerzoOrigen("tesoreria"); }}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ── Cierres de control (parciales) ── */}
            <div className="card" style={{ margin: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div className="card-title" style={{ margin: 0 }}>Cierres de control</div>
                {!showCierreControl && (
                  <button className="btn btn-sm btn-secondary" onClick={() => setShowCierreControl(true)}>
                    <Icon name="plus" size={13} /> Nuevo cierre de control
                  </button>
                )}
              </div>

              {/* Lista de cierres parciales del día */}
              {cierresParciales.length > 0 ? (
                <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", marginBottom: 14 }}>
                  {cierresParciales.map((cp, i) => {
                    const esUltimo = i === cierresParciales.length - 1;
                    return (
                    <div key={cp.id} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined, padding: "8px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", rowGap: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", rowGap: 4 }}>
                          <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, background: "rgba(139,92,246,0.12)", color: "var(--accent2)", fontWeight: 700, border: "1px solid rgba(139,92,246,0.25)" }}>
                            {cp.numero}
                          </span>
                          <span style={{ fontSize: 11, color: "var(--text3)" }}>{cp.hora}</span>
                          <span style={{ fontSize: 11, color: "var(--text2)" }}>{cp.usuario}</span>
                          {esUltimo && ultimoParcialLocked && (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, padding: "1px 7px", borderRadius: 4, background: "rgba(62,207,142,0.1)", color: "var(--green)", border: "1px solid rgba(62,207,142,0.25)", whiteSpace: "nowrap" }}>
                              <Icon name="lock" size={10} color="var(--green)" /> Revisado por Tesorería
                            </span>
                          )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", rowGap: 4 }}>
                          <span style={{ fontSize: 11, color: "var(--text3)" }}>Ef. esperado: <strong>{fmt(cp.esperado)}</strong></span>
                          <span style={{ fontSize: 11, color: "var(--text3)" }}>Real: <strong style={{ color: "var(--green)" }}>{fmt(cp.real)}</strong></span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: cp.diferencia === 0 ? "var(--green)" : cp.diferencia > 0 ? "var(--blue)" : "var(--red)" }}>
                            {cp.diferencia > 0 ? "+" : ""}{fmt(cp.diferencia)}
                          </span>
                          {esUltimo && !ultimoParcialLocked && !editandoParcial && (
                            <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: "3px 8px" }} onClick={entrarEdicionParcial}>
                              <Icon name="edit" size={12} /> Corregir
                            </button>
                          )}
                        </div>
                      </div>
                      {(cp.totalRetiroTesoreria || 0) > 0 && (
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 16, marginTop: 4 }}>
                          <span style={{ fontSize: 11, color: "var(--text3)" }}>Retirado a Tesorería: <strong style={{ color: "var(--red)" }}>−{fmt(cp.totalRetiroTesoreria)}</strong></span>
                          <span style={{ fontSize: 11, color: "var(--text3)" }}>Queda en caja: <strong style={{ color: "var(--green)" }}>{fmt(cp.saldoEnCaja ?? cp.real)}</strong></span>
                        </div>
                      )}

                      {esUltimo && editandoParcial && (
                        <div style={{ marginTop: 10, padding: 12, background: "color-mix(in srgb, var(--accent) 6%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)", borderRadius: 8 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent2)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 10 }}>
                            Corrección del cierre {cp.numero}
                          </div>
                          <div className="form-row form-row-2" style={{ gap: 10, marginBottom: 10 }}>
                            <div className="form-group" style={{ margin: 0 }}>
                              <label className="form-label">Efectivo real contado</label>
                              <input className="form-input" type="number" value={editParcialReal}
                                onChange={e => setEditParcialReal(e.target.value)} autoFocus />
                              <span style={{ fontSize: 11, color: "var(--text3)", marginTop: 3, display: "block" }}>
                                Esperado: <strong>{fmt(cp.esperado)}</strong>
                              </span>
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                              <label className="form-label">Efectivo a retirar (Tesorería)</label>
                              <input className="form-input" type="number" value={editParcialRetiroEf}
                                onChange={e => setEditParcialRetiroEf(e.target.value)} />
                              <span style={{ fontSize: 11, color: "var(--text3)", marginTop: 3, display: "block" }}>
                                Queda en caja: <strong>{fmt(Math.max(0, (parseFloat(editParcialReal) || 0) - (parseFloat(editParcialRetiroEf) || 0)))}</strong>
                              </span>
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button className="btn btn-primary btn-sm" onClick={guardarEdicionParcial}>
                              <Icon name="check" size={13} /> Guardar cambios
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={cancelarEdicionParcial}>Cancelar</button>
                          </div>
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "var(--text3)", padding: "4px 0", marginBottom: 14 }}>Sin cierres de control hoy.</div>
              )}

              {/* Formulario inline: cierre de control */}
              {showCierreControl && (
                <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, padding: 14, marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent2)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 12 }}>
                    Nuevo cierre de control — período actual
                  </div>

                  {/* Resumen del período */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 20px", marginBottom: 12 }}>
                    {[
                      { label: "Ef. período", val: periodoEfectivo, color: "var(--green)" },
                      { label: "T. Débito",   val: periodoTarjetaD },
                      { label: "T. Crédito",  val: periodoTarjetaC },
                      { label: "Transfer.",   val: periodoTransf },
                      { label: "Cheque",      val: periodoCheque },
                      { label: "Cta. Cte.",   val: periodoCtaCte, color: "var(--amber)" },
                      { label: "Refuerzos",   val: periodoRefuerzos, color: "var(--green)" },
                    ].filter(r => r.val !== 0).map((r, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                        <span style={{ color: "var(--text3)" }}>{r.label}</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: r.color || "var(--text2)" }}>{fmt(r.val)}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 12 }}>
                    Ef. esperado: <strong style={{ color: "var(--text1)" }}>{fmt(esperadoPeriodo)}</strong>
                    {" "}(inicio período: <strong>{fmt(inicioEfectivoPeriodo)}</strong>)
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 12px" }}>
                    <div className="form-group" style={{ margin: 0, gridColumn: "1 / -1" }}>
                      <label className="form-label">Efectivo contado en caja *</label>
                      <input className="form-input" type="number" placeholder={`Esperado: ${fmt(esperadoPeriodo)}`} value={ctrlReal} onChange={e => setCtrlReal(e.target.value)} autoFocus />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Tarjeta Débito (esperado: {fmt(periodoTarjetaD)})</label>
                      <input className="form-input" type="number" placeholder={fmt(periodoTarjetaD)} value={ctrlTD} onChange={e => setCtrlTD(e.target.value)} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Tarjeta Crédito (esperado: {fmt(periodoTarjetaC)})</label>
                      <input className="form-input" type="number" placeholder={fmt(periodoTarjetaC)} value={ctrlTC} onChange={e => setCtrlTC(e.target.value)} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Transferencia (esperado: {fmt(periodoTransf)})</label>
                      <input className="form-input" type="number" placeholder={fmt(periodoTransf)} value={ctrlTransf} onChange={e => setCtrlTransf(e.target.value)} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Cheque (esperado: {fmt(periodoCheque)})</label>
                      <input className="form-input" type="number" placeholder={fmt(periodoCheque)} value={ctrlCheque} onChange={e => setCtrlCheque(e.target.value)} />
                    </div>
                  </div>

                  {/* ── Retiro a Tesorería del período ── */}
                  {ctrlReal !== "" && (
                    <>
                      <div style={{ height: 1, background: "var(--border2)", margin: "14px 0 10px" }} />
                      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 10 }}>
                        Retiro a Tesorería
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 12px" }}>
                        <div className="form-group" style={{ margin: 0, gridColumn: "1 / -1" }}>
                          <label className="form-label">Efectivo a retirar</label>
                          <input className="form-input" type="number" placeholder="Ej: 0"
                            value={ctrlRetiroEf} onChange={e => setCtrlRetiroEf(e.target.value)} />
                        </div>
                        {(ctrlTdVal + arrastreTarjetaD) > 0 && (
                          <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Tarjeta Débito ({fmt((ctrlTdVal + arrastreTarjetaD))})</label>
                            <input className="form-input" type="number" placeholder={fmt((ctrlTdVal + arrastreTarjetaD))} value={ctrlRetiroTD} onChange={e => setCtrlRetiroTD(e.target.value)} />
                          </div>
                        )}
                        {(ctrlTcVal + arrastreTarjetaC) > 0 && (
                          <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Tarjeta Crédito ({fmt((ctrlTcVal + arrastreTarjetaC))})</label>
                            <input className="form-input" type="number" placeholder={fmt((ctrlTcVal + arrastreTarjetaC))} value={ctrlRetiroTC} onChange={e => setCtrlRetiroTC(e.target.value)} />
                          </div>
                        )}
                        {(ctrlTransfVal + arrastreTransf) > 0 && (
                          <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Transferencia ({fmt((ctrlTransfVal + arrastreTransf))})</label>
                            <input className="form-input" type="number" placeholder={fmt((ctrlTransfVal + arrastreTransf))} value={ctrlRetiroTransf} onChange={e => setCtrlRetiroTransf(e.target.value)} />
                          </div>
                        )}
                        {(ctrlChequeVal + arrastreCheque) > 0 && (
                          <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Cheque ({fmt((ctrlChequeVal + arrastreCheque))})</label>
                            <input className="form-input" type="number" placeholder={fmt((ctrlChequeVal + arrastreCheque))} value={ctrlRetiroCheque} onChange={e => setCtrlRetiroCheque(e.target.value)} />
                          </div>
                        )}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "var(--bg4)", border: "1px solid var(--border)", borderRadius: 8, marginTop: 10 }}>
                        <span style={{ fontSize: 12, color: "var(--text2)" }}>Saldo que queda en caja</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 700, color: "var(--green)" }}>
                          {ctrlSaldoEnCaja !== null ? fmt(ctrlSaldoEnCaja) : "—"}
                        </span>
                      </div>

                      {ctrlTotalTesoreria > 0 && (
                        <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 6 }}>
                          Total a Tesorería: <strong style={{ color: "var(--accent2)" }}>{fmt(ctrlTotalTesoreria)}</strong>
                        </div>
                      )}
                    </>
                  )}

                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button
                      className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }}
                      onClick={hacerCierreParcial}
                      disabled={!isOnline}
                      title={!isOnline ? "Necesitás conexión para hacer un cierre de control" : undefined}
                    >
                      <Icon name="check" size={13} /> Confirmar cierre de control
                    </button>
                    <button className="btn btn-ghost" onClick={() => {
                      setShowCierreControl(false);
                      setCtrlReal(""); setCtrlTransf(""); setCtrlTD(""); setCtrlTC(""); setCtrlCheque("");
                      setCtrlRetiroEf(""); setCtrlRetiroTransf(""); setCtrlRetiroTD(""); setCtrlRetiroTC(""); setCtrlRetiroCheque("");
                    }}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ── Cierre final de caja ── */}
            <div className="card" style={{ margin: 0 }}>
              <div className="card-title">Cierre final de caja</div>

              {/* Resumen período actual (último tramo) */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>
                  {cierresParciales.length > 0 ? `Desde el último cierre (${ultimoParcial?.numero} · ${ultimoParcial?.hora})` : "Período completo del día"}
                </div>
                <div className="total-line sub"><span>Efectivo</span><span style={{ color: "var(--green)" }}>{fmt(periodoEfectivo)}</span></div>
                {pendienteTarjetaD !== 0 && <div className="total-line sub"><span>Tarjeta Débito{arrastreTarjetaD !== 0 && <span style={{ fontSize: 10, color: "var(--text3)" }}> (incl. {fmt(arrastreTarjetaD)} de cierres anteriores)</span>}</span><span>{fmt(pendienteTarjetaD)}</span></div>}
                {pendienteTarjetaC !== 0 && <div className="total-line sub"><span>Tarjeta Crédito{arrastreTarjetaC !== 0 && <span style={{ fontSize: 10, color: "var(--text3)" }}> (incl. {fmt(arrastreTarjetaC)} de cierres anteriores)</span>}</span><span>{fmt(pendienteTarjetaC)}</span></div>}
                {pendienteTransf !== 0 && <div className="total-line sub"><span>Transferencia{arrastreTransf !== 0 && <span style={{ fontSize: 10, color: "var(--text3)" }}> (incl. {fmt(arrastreTransf)} de cierres anteriores)</span>}</span><span>{fmt(pendienteTransf)}</span></div>}
                {pendienteCheque !== 0 && <div className="total-line sub"><span>Cheque{arrastreCheque !== 0 && <span style={{ fontSize: 10, color: "var(--text3)" }}> (incl. {fmt(arrastreCheque)} de cierres anteriores)</span>}</span><span>{fmt(pendienteCheque)}</span></div>}
                {periodoCtaCte > 0 && <div className="total-line sub"><span style={{ color: "var(--amber)" }}>Cta. Corriente</span><span style={{ color: "var(--amber)" }}>{fmt(periodoCtaCte)}</span></div>}
                <div style={{ height: 1, background: "var(--border)", margin: "8px 0" }} />
                <div className="total-line sub"><span>{ultimoParcial ? `Quedó en caja tras ${ultimoParcial.numero}` : "Inicio de caja"}</span><span>{fmt(inicioEfectivoPeriodo)}</span></div>
                <div className="total-line sub"><span>+ Efectivo cobrado</span><span style={{ color: "var(--green)" }}>+{fmt(periodoEfectivo)}</span></div>
                {periodoRefuerzos > 0 && <div className="total-line sub"><span style={{ color: "var(--green)" }}>+ Refuerzos a caja</span><span style={{ color: "var(--green)" }}>+{fmt(periodoRefuerzos)}</span></div>}
                {periodoRetirosEfectivo > 0 && periodoRetirosTransferencia > 0 ? (
                  <>
                    <div className="total-line sub"><span>− Retiros en efectivo</span><span style={{ color: "var(--red)" }}>−{fmt(periodoRetirosEfectivo)}</span></div>
                    <div className="total-line sub"><span style={{ color: "var(--text3)" }}>− Retiros por transferencia <span style={{ fontSize: 10 }}>(no afecta el cuadre)</span></span><span style={{ color: "var(--text3)" }}>−{fmt(periodoRetirosTransferencia)}</span></div>
                    <div className="total-line sub"><span>Total retiros</span><span style={{ color: "var(--red)" }}>−{fmt(periodoRetiros)}</span></div>
                  </>
                ) : periodoRetirosEfectivo > 0 ? (
                  <div className="total-line sub"><span>− Retiros del período</span><span style={{ color: "var(--red)" }}>−{fmt(periodoRetirosEfectivo)}</span></div>
                ) : periodoRetirosTransferencia > 0 ? (
                  <div className="total-line sub"><span style={{ color: "var(--text3)" }}>Retiros por transferencia <span style={{ fontSize: 10 }}>(no afecta el cuadre)</span></span><span style={{ color: "var(--text3)" }}>−{fmt(periodoRetirosTransferencia)}</span></div>
                ) : null}
                <div style={{ height: 1, background: "var(--border)", margin: "8px 0" }} />
                <div className="total-line" style={{ fontWeight: 600, fontSize: 13 }}>
                  <span>Debería haber en caja</span>
                  <span style={{ color: "var(--text1)" }}>{fmt(esperadoPeriodo)}</span>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 8 }}>
                <label className="form-label">Efectivo real contado</label>
                <input className="form-input" type="number"
                  placeholder="Contá y escribí el total..."
                  value={cierreReal} onChange={e => setCierreReal(e.target.value)} />
              </div>

              {cierreReal !== "" && diferenciaPeriodo !== null && (
                <div className="metric-card" style={{ marginBottom: 14, padding: "8px 14px" }}>
                  <div className="metric-label">Diferencia de efectivo</div>
                  <div className="metric-value" style={{ fontSize: 16, color: diferenciaPeriodo === 0 ? "var(--green)" : diferenciaPeriodo > 0 ? "var(--blue)" : "var(--red)" }}>
                    {diferenciaPeriodo > 0 ? "+" : ""}{fmt(diferenciaPeriodo)}
                    <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 8 }}>
                      {diferenciaPeriodo === 0 ? "✓ Sin diferencia" : diferenciaPeriodo > 0 ? "(sobrante)" : "(faltante)"}
                    </span>
                  </div>
                </div>
              )}

              {/* ── Distribución a Tesorería ── */}
              {cierreReal !== "" && (
                <>
                  <div style={{ height: 1, background: "var(--border2)", margin: "0 0 14px" }} />
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 10 }}>
                    Distribución a Tesorería
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 12px", marginBottom: 12 }}>
                    <div className="form-group" style={{ margin: 0, gridColumn: "1 / -1" }}>
                      <label className="form-label">Efectivo a retirar</label>
                      <input className="form-input" type="number"
                        placeholder={`Ej: ${fmt(parseFloat(cierreReal) || 0)}`}
                        value={retiroFinalEfectivo}
                        onChange={e => setRetiroFinalEfectivo(e.target.value)} />
                    </div>
                    {pendienteTarjetaD > 0 && (
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Tarjeta Débito ({fmt(pendienteTarjetaD)})</label>
                        <input className="form-input" type="number" placeholder={fmt(pendienteTarjetaD)} value={retiroTD} onChange={e => setRetiroTD(e.target.value)} />
                      </div>
                    )}
                    {pendienteTarjetaC > 0 && (
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Tarjeta Crédito ({fmt(pendienteTarjetaC)})</label>
                        <input className="form-input" type="number" placeholder={fmt(pendienteTarjetaC)} value={retiroTC} onChange={e => setRetiroTC(e.target.value)} />
                      </div>
                    )}
                    {pendienteTransf > 0 && (
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Transferencia ({fmt(pendienteTransf)})</label>
                        <input className="form-input" type="number" placeholder={fmt(pendienteTransf)} value={retiroTransf} onChange={e => setRetiroTransf(e.target.value)} />
                      </div>
                    )}
                    {pendienteCheque > 0 && (
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Cheque ({fmt(pendienteCheque)})</label>
                        <input className="form-input" type="number" placeholder={fmt(pendienteCheque)} value={retiroCheque} onChange={e => setRetiroCheque(e.target.value)} />
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: saldoEnCajaFinal != null && saldoEnCajaFinal < 0 ? "rgba(242,107,91,0.08)" : "var(--bg3)", border: `1px solid ${saldoEnCajaFinal != null && saldoEnCajaFinal < 0 ? "rgba(242,107,91,0.3)" : "var(--border)"}`, borderRadius: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: 12, color: "var(--text2)" }}>Saldo que queda en caja</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 700, color: saldoEnCajaFinal != null && saldoEnCajaFinal >= 0 ? "var(--green)" : "var(--red)" }}>
                      {saldoEnCajaFinal !== null ? fmt(saldoEnCajaFinal) : "—"}
                    </span>
                  </div>

                  <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", marginBottom: 14 }}>
                    <div style={{ padding: "5px 12px 3px", background: "var(--bg4)", fontSize: 9, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".06em" }}>
                      Resumen — va a Tesorería
                    </div>
                    {[
                      { label: "Efectivo",        val: retiroEfNum,    color: "var(--green)" },
                      { label: "Tarjeta Débito",  val: retiroTDNum,    show: pendienteTarjetaD > 0 || retiroTD !== "" },
                      { label: "Tarjeta Crédito", val: retiroTCNum,    show: pendienteTarjetaC > 0 || retiroTC !== "" },
                      { label: "Transferencia",   val: retiroTransfNum, show: pendienteTransf > 0 || retiroTransf !== "" },
                      { label: "Cheque",          val: retiroChequeNum, show: pendienteCheque > 0 || retiroCheque !== "" },
                    ].filter(r => r.show !== false).map((row, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 12px", borderTop: "1px solid var(--border)" }}>
                        <span style={{ fontSize: 12, color: row.color || "var(--text2)" }}>{row.label}</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: row.color || "var(--text1)" }}>{fmt(row.val)}</span>
                      </div>
                    ))}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderTop: "2px solid var(--border2)", background: "var(--bg4)" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text1)" }}>Total a Tesorería</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--accent2)" }}>{fmt(totalParaTesoreria)}</span>
                    </div>
                  </div>
                </>
              )}

              {!!permisos?.[usuarioActivo?.id]?.cerrarCaja && (
              <button
                className="btn btn-danger" onClick={cerrarCaja} style={{ width: "100%", justifyContent: "center" }}
                disabled={!isOnline}
                title={!isOnline ? "Necesitás conexión para cerrar la caja" : undefined}
              >
                <Icon name="lock" size={14} /> Cerrar caja
              </button>
              )}
            </div>
          </div>

          </>)}

          {/* ── Tab: Recibos ── */}
          {activeTab === "recibos" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
              <PanelNuevoRecibo
                numero={nextNumero("Recibo")}
                clientes={clientes || []}
                ventas={ventas || []}
                pagosCtaCte={pagosCtaCte || []}
                configMora={configMora}
                cambiosArticulo={cambiosArticulo}
                onConfirm={emitirComprobante}
              />
              <div className="card" style={{ margin: 0, gridColumn: verHistorialRecibos ? "1 / -1" : "auto" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                  <div className="card-title" style={{ margin: 0 }}>
                    {verHistorialRecibos ? "Historial completo de recibos" : "Recibos emitidos hoy"}
                  </div>
                  <button className="btn btn-sm btn-ghost" onClick={() => setVerHistorialRecibos(v => !v)}>
                    <Icon name={verHistorialRecibos ? "close" : "chart"} size={13} />
                    {verHistorialRecibos ? "Volver a hoy" : "Ver historial completo"}
                  </button>
                </div>

                {verHistorialRecibos ? (
                  <>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                      <input className="form-input" type="date" style={{ maxWidth: 150 }} value={histRecibosDesde} onChange={e => setHistRecibosDesde(e.target.value)} title="Desde" />
                      <input className="form-input" type="date" style={{ maxWidth: 150 }} value={histRecibosHasta} onChange={e => setHistRecibosHasta(e.target.value)} title="Hasta" />
                      <input className="form-input" style={{ maxWidth: 180 }} placeholder="Cliente..." value={histRecibosCliente} onChange={e => setHistRecibosCliente(e.target.value)} />
                      <select className="form-select" style={{ maxWidth: 160 }} value={histRecibosUsuario} onChange={e => setHistRecibosUsuario(e.target.value)}>
                        <option value="">Todos los usuarios</option>
                        {usuariosRecibos.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                      <select className="form-select" style={{ maxWidth: 160 }} value={histRecibosFormaPago} onChange={e => setHistRecibosFormaPago(e.target.value)}>
                        <option value="">Todas las formas</option>
                        {FORMAS_PAGO.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                      <select className="form-select" style={{ maxWidth: 160 }} value={histRecibosTipo} onChange={e => setHistRecibosTipo(e.target.value)}>
                        <option value="">Todos los tipos</option>
                        <option value="Recibo">Recibo</option>
                        <option value="Nota de Crédito">Nota de Crédito</option>
                        <option value="Nota de Débito">Nota de Débito</option>
                      </select>
                    </div>

                    {recibosHistorial.length > 0 ? (
                      <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                        {recibosHistorialPagina.map(r => {
                          const st = BADGE_TIPO[r.tipo] || {};
                          const anulado = r.estado === "anulada";
                          const ventaVinculada = r.ventaId ? ventas.find(v => v.id === r.ventaId) : null;
                          return (
                            <div key={r.id} style={{ borderBottom: "1px solid var(--border)", opacity: anulado ? 0.55 : 1 }}>
                              <div style={{ display: "flex", alignItems: "center", padding: "8px 12px", gap: 10, flexWrap: "wrap" }}>
                                <span style={{ fontSize: 12, color: "var(--text3)", minWidth: 80 }}>{fmtFechaAR(r.fecha)}</span>
                                <span style={{ fontSize: 12, color: "var(--text3)", minWidth: 50 }}>{r.hora?.slice(0, 5)}</span>
                                <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: st.bg, color: st.color, border: `1px solid ${st.border}`, whiteSpace: "nowrap" }}>{r.tipo}</span>
                                <span style={{ fontSize: 12, color: "var(--text3)", minWidth: 70, fontFamily: "var(--font-mono)" }}>{r.numero}</span>
                                <span style={{ flex: 1, fontSize: 13, color: "var(--text2)", textDecoration: anulado ? "line-through" : "none", minWidth: 120 }}>{r.cliente}</span>
                                <span style={{ fontSize: 11, color: "var(--text3)", minWidth: 90 }}>
                                  <Icon name="user" size={11} /> {r.usuario || "—"}
                                </span>
                                {r.formaPago && <span style={{ fontSize: 11, color: "var(--text3)" }}>{r.formaPago}</span>}
                                <span style={{ fontSize: 13, fontWeight: 600, color: st.color, fontFamily: "var(--font-mono)", textDecoration: anulado ? "line-through" : "none" }}>{fmt(r.monto)}</span>
                                {anulado && <span className="badge badge-danger" style={{ fontSize: 10 }}>ANULADO</span>}
                              </div>
                              {r.observacion && (
                                <div style={{ padding: "0 12px 6px 20px", fontSize: 11, color: "var(--text3)" }}>{r.observacion}</div>
                              )}
                              {anulado && r.motivoAnulacion && (
                                <div style={{ padding: "0 12px 8px 20px", fontSize: 11, color: "var(--red)" }}>
                                  Motivo: {r.motivoAnulacion}
                                </div>
                              )}
                              {ventaVinculada && (
                                <div style={{ padding: "2px 12px 4px 20px", fontSize: 11, color: "var(--text3)" }}>
                                  Vínculo: Venta #{ventaVinculada.id} · {fmtFechaAR(ventaVinculada.fecha)} · {fmt(ventaVinculada.total)}
                                </div>
                              )}
                              {r.ventasSeleccionadas?.length > 0 && (
                                <div style={{ padding: "4px 12px 8px", display: "flex", flexDirection: "column", gap: 3 }}>
                                  {r.ventasSeleccionadas.map((vs, i) => (
                                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 20, fontSize: 11 }}>
                                      <span style={{ color: "var(--text3)" }}>Factura #{vs.ventaId}:</span>
                                      <span style={{ color: "var(--green)", fontFamily: "var(--font-mono)", fontWeight: 600 }}>{fmt(vs.montoAbonado)}</span>
                                      {vs.saldoNuevo > 0.009
                                        ? <span style={{ color: "var(--amber)" }}>· Saldo pendiente: {fmt(vs.saldoNuevo)}</span>
                                        : <span style={{ color: "var(--green)" }}>· Factura saldada</span>}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ padding: "28px 0", textAlign: "center", fontSize: 13, color: "var(--text3)" }}>
                        Sin recibos que coincidan con los filtros
                      </div>
                    )}
                    <Paginacion pagina={paginaHistRecibos} totalPaginas={totalPaginasHistRecibos} onCambiar={setPaginaHistRecibos} totalItems={recibosHistorial.length} pageSize={pageSizeHistRecibos} etiqueta="recibos" />
                  </>
                ) : recibosDia.filter(r => r.tipo === "Recibo").length > 0 ? (
                  <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                    {recibosDia.filter(r => r.tipo === "Recibo").map(r => {
                      const st = BADGE_TIPO[r.tipo] || {};
                      const anulado = r.estado === "anulada";
                      const { puede: puedeEditar } = reciboEditable(r, caja, periodosCerrados);
                      return (
                        <div key={r.id} style={{ borderBottom: "1px solid var(--border)", opacity: anulado ? 0.55 : 1 }}>
                          <div style={{ display: "flex", alignItems: "center", padding: "8px 12px", gap: 10 }}>
                            <span style={{ fontSize: 12, color: "var(--text3)", minWidth: 55 }}>{r.hora}</span>
                            <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: st.bg, color: st.color, border: `1px solid ${st.border}`, whiteSpace: "nowrap" }}>{r.tipo}</span>
                            <span style={{ fontSize: 12, color: "var(--text3)", minWidth: 70, fontFamily: "var(--font-mono)" }}>{r.numero}</span>
                            <span style={{ flex: 1, fontSize: 13, color: "var(--text2)", textDecoration: anulado ? "line-through" : "none" }}>{r.cliente}</span>
                            {r.formaPago && <span style={{ fontSize: 11, color: "var(--text3)" }}>{r.formaPago}</span>}
                            <span style={{ fontSize: 13, fontWeight: 600, color: st.color, fontFamily: "var(--font-mono)", textDecoration: anulado ? "line-through" : "none" }}>{fmt(r.monto)}</span>
                            {anulado ? (
                              <span className="badge badge-danger" style={{ fontSize: 10 }}>ANULADO</span>
                            ) : puedeEditar ? (
                              <div style={{ display: "flex", gap: 4 }}>
                                <button className="btn btn-sm btn-ghost" title="Editar recibo" onClick={() => setShowEditarRecibo(r)}>
                                  <Icon name="edit" size={13} />
                                </button>
                                <button className="btn btn-sm btn-ghost" title="Anular recibo" onClick={() => setShowAnularRecibo(r)}>
                                  <Icon name="close" size={13} color="var(--red)" />
                                </button>
                              </div>
                            ) : null}
                          </div>
                          {anulado && r.motivoAnulacion && (
                            <div style={{ padding: "0 12px 8px 77px", fontSize: 11, color: "var(--red)" }}>
                              Motivo: {r.motivoAnulacion}
                            </div>
                          )}
                          {r.ventasSeleccionadas?.length > 0 && (
                            <div style={{ padding: "4px 12px 8px", display: "flex", flexDirection: "column", gap: 3 }}>
                              {r.ventasSeleccionadas.map((vs, i) => (
                                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 20, fontSize: 11 }}>
                                  <span style={{ color: "var(--text3)" }}>Factura #{vs.ventaId}:</span>
                                  <span style={{ color: "var(--green)", fontFamily: "var(--font-mono)", fontWeight: 600 }}>{fmt(vs.montoAbonado)}</span>
                                  {vs.saldoNuevo > 0.009
                                    ? <span style={{ color: "var(--amber)" }}>· Saldo pendiente: {fmt(vs.saldoNuevo)}</span>
                                    : <span style={{ color: "var(--green)" }}>· Factura saldada</span>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ padding: "28px 0", textAlign: "center", fontSize: 13, color: "var(--text3)" }}>
                    Sin recibos emitidos en esta sesión
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Tab: Comprobantes NC / ND ── */}
          {activeTab === "comprobantes" && (
            <div className="card">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button className="btn btn-sm"
                  style={{ background: "rgba(96,165,250,0.13)", color: "var(--blue)", border: "1px solid rgba(96,165,250,0.3)" }}
                  onClick={() => setModalComprobante("Nota de Crédito")}>
                  <Icon name="minus" size={14} /> Nueva Nota de Crédito
                </button>
                <button className="btn btn-sm"
                  style={{ background: "rgba(245,158,11,0.1)", color: "var(--amber)", border: "1px solid rgba(245,158,11,0.3)" }}
                  onClick={() => setModalComprobante("Nota de Débito")}>
                  <Icon name="plus" size={14} /> Nueva Nota de Débito
                </button>
              </div>

              {recibosDia.filter(r => r.tipo !== "Recibo").length > 0 ? (
                <div style={{ marginTop: 14, background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ padding: "6px 12px", background: "var(--bg4)", borderBottom: "1px solid var(--border)", fontSize: 10, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".04em" }}>
                    Comprobantes emitidos hoy
                  </div>
                  {recibosDia.filter(r => r.tipo !== "Recibo").map(r => {
                    const st = BADGE_TIPO[r.tipo] || {};
                    const anulado = r.estado === "anulada";
                    const { puede: puedeEditar } = reciboEditable(r, caja, periodosCerrados);
                    const ventaVinculada = r.ventaId ? ventas.find(v => v.id === r.ventaId) : null;
                    return (
                      <div key={r.id} style={{ borderBottom: "1px solid var(--border)", opacity: anulado ? 0.55 : 1 }}>
                        <div style={{ display: "flex", alignItems: "center", padding: "8px 12px", gap: 10 }}>
                          <span style={{ fontSize: 12, color: "var(--text3)", minWidth: 55 }}>{r.hora}</span>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: st.bg, color: st.color, border: `1px solid ${st.border}`, whiteSpace: "nowrap" }}>{r.tipo}</span>
                          <span style={{ fontSize: 12, color: "var(--text3)", minWidth: 70, fontFamily: "var(--font-mono)" }}>{r.numero}</span>
                          <span style={{ flex: 1, fontSize: 13, color: "var(--text2)", textDecoration: anulado ? "line-through" : "none" }}>{r.cliente}</span>
                          {r.formaPago && <span style={{ fontSize: 11, color: "var(--text3)" }}>{r.formaPago}</span>}
                          <span style={{ fontSize: 13, fontWeight: 600, color: st.color, fontFamily: "var(--font-mono)", textDecoration: anulado ? "line-through" : "none" }}>{fmt(r.monto)}</span>
                          {anulado ? (
                            <span className="badge badge-danger" style={{ fontSize: 10 }}>ANULADO</span>
                          ) : puedeEditar ? (
                            <div style={{ display: "flex", gap: 4 }}>
                              <button className="btn btn-sm btn-ghost" title="Editar comprobante" onClick={() => setShowEditarRecibo(r)}>
                                <Icon name="edit" size={13} />
                              </button>
                              <button className="btn btn-sm btn-ghost" title="Anular comprobante" onClick={() => setShowAnularRecibo(r)}>
                                <Icon name="close" size={13} color="var(--red)" />
                              </button>
                            </div>
                          ) : null}
                        </div>
                        {anulado && r.motivoAnulacion && (
                          <div style={{ padding: "0 12px 8px 77px", fontSize: 11, color: "var(--red)" }}>
                            Motivo: {r.motivoAnulacion}
                          </div>
                        )}
                        {ventaVinculada && (
                          <div style={{ padding: "2px 12px 4px 20px", fontSize: 11, color: "var(--text3)" }}>
                            Vínculo: Venta #{ventaVinculada.id} · {fmtFechaAR(ventaVinculada.fecha)} · {fmt(ventaVinculada.total)}
                          </div>
                        )}
                        {r.itemsDevueltos?.length > 0 && (
                          <div style={{ padding: "2px 12px 8px 20px", fontSize: 11, color: "var(--text3)" }}>
                            Mercadería devuelta: {r.itemsDevueltos.map(it => `${it.qty}× ${it.nombre}`).join(", ")}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ marginTop: 14, padding: "24px 0", textAlign: "center", fontSize: 12, color: "var(--text3)" }}>
                  Sin notas de crédito/débito emitidas hoy
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Último cierre (modal) ── */}
      {caja.ultimoCierre && (
        <div style={{ textAlign: "right", marginTop: 12 }}>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}
            onClick={() => setShowUltimoCierre(true)}>
            <Icon name="eye" size={13} /> Ver reporte del último cierre · {fmtFechaAR(caja.ultimoCierre.fecha)}
          </button>
        </div>
      )}
      </>)}

      {/* ── Tab: Historial de cierres ── */}
      {mainTab === "historial" && (
        <div>
          {/* Filtros */}
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Desde</label>
                <input className="form-input" type="date" value={hFDesde} onChange={e => setHFDesde(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Hasta</label>
                <input className="form-input" type="date" value={hFHasta} onChange={e => setHFHasta(e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                <label className="form-label">Buscar (N° cierre o usuario)</label>
                <input className="form-input" type="text" placeholder="Ej: C-0003 o Juan..."
                  value={hBuscar} onChange={e => setHBuscar(e.target.value)} />
              </div>
              {(hBuscar || hFDesde) && (
                <button className="btn btn-ghost btn-sm"
                  onClick={() => { setHFDesde(""); setHFHasta(today()); setHBuscar(""); }}>
                  Limpiar
                </button>
              )}
            </div>
          </div>

          {/* Métricas */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 14 }}>
            <div className="metric-card">
              <div className="metric-label">Total de cierres</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 700, color: "var(--accent2)", marginTop: 4 }}>
                {histFiltrados.length}
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Suma de diferencias</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 700, marginTop: 4,
                color: histSumaDif === 0 ? "var(--green)" : histSumaDif > 0 ? "var(--blue)" : "var(--red)" }}>
                {histSumaDif >= 0 ? "+" : "−"}{fmt(Math.abs(histSumaDif))}
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Promedio vendido por cierre</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 700, color: "var(--text1)", marginTop: 4 }}>
                {fmt(histPromDiario)}
              </div>
            </div>
          </div>

          {/* Tabla */}
          <div className="card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div className="card-title" style={{ marginBottom: 0 }}>
                Cierres registrados
                {histFiltrados.length > 0 && (
                  <span style={{ fontSize: 12, color: "var(--text3)", fontWeight: 400, marginLeft: 8 }}>
                    ({histFiltrados.length})
                  </span>
                )}
              </div>
              <button className="btn btn-ghost btn-sm" onClick={histExportCSV} disabled={histFiltrados.length === 0}>
                <Icon name="upload" size={13} /> Exportar CSV
              </button>
            </div>

            {histFiltrados.length > 0 ? (
              <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
                  <thead>
                    <tr style={{ background: "var(--bg4)" }}>
                      {["N° Cierre","Fecha","Usuario","Ventas","Total vendido","Esperado","Real","Diferencia",""].map((h, i) => (
                        <th key={i} style={{
                          padding: "7px 12px", fontSize: 10, fontWeight: 700,
                          color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".04em",
                          borderBottom: "1px solid var(--border)",
                          textAlign: i >= 3 && i < 8 ? "right" : i === 8 ? "center" : "left",
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {histPagina.map(c => {
                      const dif = c.diferencia || 0;
                      const difColor = dif === 0 ? "var(--green)" : dif > 0 ? "var(--blue)" : "var(--red)";
                      // "CP-" (Cierre Parcial) vs "C-" (Final): historial_cierres no tiene
                      // columna `tipo`, así que el prefijo del número es la única fuente
                      // confiable — se persiste igual para todos los cierres.
                      const esParcialRow = (c.numero || "").startsWith("CP-");
                      return (
                        <tr key={c.id} style={{ borderBottom: "1px solid var(--border)", cursor: "default" }}
                          onMouseEnter={e => e.currentTarget.style.background = "var(--bg4)"}
                          onMouseLeave={e => e.currentTarget.style.background = ""}>
                          <td style={{ padding: "8px 12px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--accent2)", fontFamily: "var(--font-mono)" }}>{c.numero}</span>
                              {esParcialRow ? (
                                <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "rgba(139,92,246,0.15)", color: "var(--accent2)", fontWeight: 700, border: "1px solid rgba(139,92,246,0.25)" }}>CTRL</span>
                              ) : (
                                <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "rgba(242,107,91,0.12)", color: "var(--red)", fontWeight: 700, border: "1px solid rgba(242,107,91,0.25)" }}>FINAL</span>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: "8px 12px", fontSize: 12, color: "var(--text2)" }}>
                            {fmtFechaAR(c.fecha)}
                          </td>
                          <td style={{ padding: "8px 12px", fontSize: 12, color: "var(--text2)" }}>
                            {c.usuario || "—"}
                          </td>
                          <td style={{ padding: "8px 12px", fontSize: 12, color: "var(--text3)", textAlign: "right" }}>
                            {c.ventas || 0}
                          </td>
                          <td style={{ padding: "8px 12px", fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text1)", textAlign: "right" }}>
                            {fmt(c.totalVendido || 0)}
                          </td>
                          <td style={{ padding: "8px 12px", fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text2)", textAlign: "right" }}>
                            {fmt(c.esperado || 0)}
                          </td>
                          <td style={{ padding: "8px 12px", fontSize: 12, fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text1)", textAlign: "right" }}>
                            {fmt(c.real || 0)}
                          </td>
                          <td style={{ padding: "8px 12px", textAlign: "right" }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: difColor }}>
                              {dif >= 0 ? "+" : "−"}{fmt(Math.abs(dif))}
                            </span>
                          </td>
                          <td style={{ padding: "8px 10px", textAlign: "center" }}>
                            <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: "3px 8px" }}
                              onClick={() => setVerDetalleCierre(c)}>
                              <Icon name="eye" size={12} /> Ver
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: "44px 0", textAlign: "center", fontSize: 13, color: "var(--text3)" }}>
                No hay cierres registrados en el período seleccionado
              </div>
            )}

            <Paginacion pagina={paginaHist} totalPaginas={totalPaginasHist} onCambiar={setPaginaHist} totalItems={histFiltrados.length} pageSize={pageSizeHist} etiqueta="cierres" />
          </div>
        </div>
      )}

      {showUltimoCierre && caja.ultimoCierre && (
        <ModalUltimoCierre
          cierre={caja.ultimoCierre}
          onClose={() => setShowUltimoCierre(false)}
          isLocked={ultimoCierreLocked}
          onSave={onSaveUltimoCierre}
        />
      )}
      {verDetalleCierre && (
        <ModalDetalleCierre
          cierre={verDetalleCierre}
          ventas={ventas}
          onClose={() => setVerDetalleCierre(null)}
        />
      )}
    </div>
  );
}


// ─── PAGE: COMPRAS ─────────────────────────────────────────────────────────────
