import { useState, useMemo, useEffect } from "react";
import { Modal } from "../ui/Modal";
import Icon from "../ui/Icon";
import { fmt, precioPorLista, calcularSaldoCtaCte, montoCtaCte, normalizarCodigoEscaneado, coincideBusqueda, fmtFechaAR } from "../../utils/helpers";
import { FORMAS_PAGO, PAGO_COMBINADO } from "../../constants";
import { useToast } from "../ui/Toast.jsx";
import { useConfirm } from "../ui/Confirm.jsx";
import ModalNuevoCliente from "../clientes/ModalNuevoCliente";
import InfoCtaCte from "../clientes/InfoCtaCte.jsx";

// Reconstruye el pagosSplit "editable" (montos base, sin el recargo de
// interés que ya quedó aplicado en venta.pagos) a partir de los pagos
// guardados — se usa tanto para precargar el editor como para saber si el
// usuario cambió algo (hayCambios compara contra esta misma reconstrucción).
function pagosSplitDesdeVenta(pagos) {
  return (pagos || []).map(p => ({
    formaPago: p.formaPago,
    monto: String(p.interesPct > 0 ? Math.round(p.monto / (1 + p.interesPct / 100)) : p.monto),
    cuotas: p.cuotas || 1,
    tarjetaId: p.tarjetaId ?? null,
  }));
}

export default function ModalEditarVenta({
  venta, productos, listas, clientes, setClientes, stockDepositos = [], depositos = [], tarjetas = [],
  margenBase = 0, rubros = [], proveedores = [], usuarioActivo, ventas = [], pagosCtaCte = [], cambiosArticulo = [],
  onGuardar, onClose,
}) {
  const { toast } = useToast();
  const { confirm } = useConfirm();

  const listaInicial = listas.find(l => l.nombre === venta.lista) || listas[0];
  const pagoDividioInicial = (venta.pagos || []).length > 1;

  const [lista, setLista]                 = useState(listaInicial?.nombre || "");
  const [formaPago, setFormaPago]         = useState(FORMAS_PAGO.includes(venta.formaPago) ? venta.formaPago : FORMAS_PAGO[0]);
  const [depositoId, setDepositoId]       = useState(venta.depositoId ?? null);
  const [modoPago, setModoPago]           = useState(pagoDividioInicial ? "dividido" : "unico"); // "unico" | "dividido"
  const [pagosSplit, setPagosSplit]       = useState(() =>
    pagoDividioInicial
      ? pagosSplitDesdeVenta(venta.pagos)
      : [{ formaPago: venta.formaPago, monto: String(venta.total), cuotas: 1, tarjetaId: null }]
  );
  const [tarjetaId, setTarjetaId]         = useState(venta.pagos?.[0]?.tarjetaId ?? null);
  const [cuotasSel, setCuotasSel]         = useState(venta.pagos?.[0]?.cuotas ?? null);
  const [tipo, setTipo]                   = useState(venta.tipo);
  const [descripcion, setDescripcion]     = useState(venta.descripcion || "");
  const [clienteInput, setClienteInput]   = useState(venta.clienteId ? venta.cliente : "");
  const [clienteSelec, setClienteSelec]   = useState(
    venta.clienteId ? (clientes.find(c => c.id === venta.clienteId) || { id: venta.clienteId, nombre: venta.cliente }) : null
  );
  const [showNuevoCliente, setShowNuevoCliente] = useState(false);
  const [items, setItems]                 = useState(() => (venta.items || []).map(it => ({ ...it })));
  const [busqueda, setBusqueda]           = useState("");
  const [showResults, setShowResults]     = useState(false);
  const [guardando, setGuardando]         = useState(false);
  const [error, setError]                 = useState("");

  const listaObj = listas.find(l => l.nombre === lista) || listaInicial;
  const esCtaCte = modoPago === "unico"
    ? formaPago === "Cuenta Corriente"
    : pagosSplit.some(p => p.formaPago === "Cuenta Corriente");

  // ── Pago dividido (mismo patrón que Nueva venta) ──────────────────────
  const activarPagoDividido = () => {
    setPagosSplit([{ formaPago, monto: String(subtotalItems), cuotas: 1, tarjetaId: null }]);
    setModoPago("dividido");
  };
  const activarPagoUnico = () => setModoPago("unico");
  const agregarPagoSplit = () => setPagosSplit(prev => [...prev, { formaPago: FORMAS_PAGO[0], monto: "", cuotas: 1, tarjetaId: null }]);
  const quitarPagoSplit  = (idx) => setPagosSplit(prev => prev.filter((_, i) => i !== idx));
  const editarPagoSplit  = (idx, campo, valor) => setPagosSplit(prev => prev.map((p, i) => {
    if (i !== idx) return p;
    let upd = { ...p, [campo]: valor };
    if (campo === "formaPago") {
      if (valor !== "Tarjeta Crédito") {
        upd.cuotas = 1; upd.tarjetaId = null;
      } else if (tarjetas.length > 0) {
        upd.tarjetaId = tarjetas[0].id;
        upd.cuotas = tarjetas[0].cuotas?.[0]?.cuotas ?? 1;
      }
    }
    if (campo === "tarjetaId") {
      const tid = Number(valor);
      upd.tarjetaId = tid;
      const t = tarjetas.find(t => t.id === tid);
      if (t && !t.cuotas.some(c => c.cuotas === p.cuotas)) upd.cuotas = t.cuotas[0]?.cuotas ?? 1;
    }
    if (campo === "cuotas") upd.cuotas = Number(valor);
    return upd;
  }));
  const sumaPagosSplit = pagosSplit.reduce((a, p) => a + (Number(p.monto) || 0), 0);

  // ── Tarjeta de crédito + cuotas (pago único) ───────────────────────────
  // Si la venta ya tenía Tarjeta Crédito pero su pago no guardó tarjetaId
  // (pasa con 1 cuota sin interés — no se registra el detalle, ver
  // guardar()), acá se autoselecciona la primera tarjeta cargada, igual que
  // en Nueva venta — si no, el select queda "vacío" aunque muestre la única
  // tarjeta disponible, y las cuotas nunca llegan a cargarse.
  useEffect(() => {
    if (modoPago === "unico" && formaPago === "Tarjeta Crédito" && tarjetas.length > 0 && !tarjetaId) {
      setTarjetaId(tarjetas[0].id);
    }
    if (formaPago !== "Tarjeta Crédito" || modoPago !== "unico") {
      if (tarjetaId !== null) setTarjetaId(null);
      if (cuotasSel !== null) setCuotasSel(null);
    }
  }, [formaPago, modoPago, tarjetas]); // eslint-disable-line react-hooks/exhaustive-deps

  const tarjetaSeleccionada = tarjetas.find(t => t.id === tarjetaId) || null;

  useEffect(() => {
    if (!tarjetaSeleccionada) return;
    if (!tarjetaSeleccionada.cuotas.some(c => c.cuotas === cuotasSel)) {
      setCuotasSel(tarjetaSeleccionada.cuotas[0]?.cuotas ?? null);
    }
  }, [tarjetaId, tarjetaSeleccionada]); // eslint-disable-line react-hooks/exhaustive-deps

  const cuotaInfo = tarjetaSeleccionada?.cuotas.find(c => c.cuotas === cuotasSel) || null;
  const interesTarjetaPct = (modoPago === "unico" && cuotaInfo?.interesPct) || 0;

  // Producto real detrás de un item de la venta — por id si está disponible
  // (más confiable) y si no por nombre, para ítems viejos sin productoId.
  // OJO: tiene que ser "id, y si no hay id recién ahí nombre" — nunca un solo
  // find() con `id-match || nombre-match`, porque dos variantes con el mismo
  // nombre mostrado pero código/precio distinto (ej. una remera en dos listas
  // de precios distintas) pueden hacer que el nombre matchee un producto
  // DISTINTO al de productoId si ese aparece antes en el array — ahí es
  // cuando "se mezclan" los productos al cambiar de lista.
  const productoDeItem = (it) => {
    if (it.productoId != null) {
      const porId = productos.find(p => p.id === it.productoId);
      if (porId) return porId;
    }
    return productos.find(p => p.nombre === it.nombre);
  };

  const stockEnDeposito = (productoId) => {
    if (!venta.depositoId) return 0;
    return stockDepositos.find(s => s.productoId === productoId && s.depositoId === venta.depositoId)?.cantidad ?? 0;
  };

  // ── Cliente (solo para Cuenta Corriente) ──────────────────────────────
  const clienteSugs = useMemo(() => {
    if (!clienteInput) return [];
    const q   = clienteInput.toLowerCase();
    const dni = clienteInput.replace(/[.\-\s]/g, "");
    return clientes.filter(c =>
      c.nombre.toLowerCase().includes(q) ||
      c.dni?.replace(/[.\-\s]/g, "").includes(dni)
    ).slice(0, 6);
  }, [clientes, clienteInput]);

  // ── Cambiar lista → recalcular precios de todos los items ─────────────
  const cambiarLista = (nuevaLista) => {
    const nuevoListaObj = listas.find(l => l.nombre === nuevaLista);
    if (nuevoListaObj) {
      setItems(prev => prev.map(it => {
        const prod = productoDeItem(it);
        if (!prod) return it; // producto dado de baja: conserva el precio que tenía
        return { ...it, precio: precioPorLista(prod, nuevoListaObj, margenBase, rubros, proveedores) };
      }));
    }
    setLista(nuevaLista);
  };

  // ── Cantidad / precio / eliminar item ──────────────────────────────────
  const cambiarQty = (idx, delta) => {
    setItems(prev => {
      const next = prev.map((it, i) => i === idx ? { ...it, qty: it.qty + delta } : it);
      return next.filter(it => it.qty > 0);
    });
  };

  const cambiarPrecio = (idx, valor) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, precio: valor === "" ? 0 : Number(valor) } : it));
  };

  const quitarItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));

  // ── Buscador para agregar productos ────────────────────────────────────
  const resultadosBusqueda = useMemo(() => {
    if (!busqueda.trim()) return [];
    const q = normalizarCodigoEscaneado(busqueda.toLowerCase());
    return productos
      .filter(p => (p.tipo || "simple") !== "madre" && p.activo !== false)
      .filter(p => coincideBusqueda([p.nombre, p.codigo, p.rubro || p.categoria || ""].join(" "), q))
      .map(p => ({ ...p, stockDeposito: stockEnDeposito(p.id) }))
      .slice(0, 8);
  }, [busqueda, productos, stockDepositos, venta.depositoId]); // eslint-disable-line react-hooks/exhaustive-deps

  const agregarProductoBusqueda = (producto) => {
    setItems(prev => {
      const idx = prev.findIndex(it => it.productoId != null ? it.productoId === producto.id : it.nombre === producto.nombre);
      if (idx >= 0) {
        return prev.map((it, i) => i === idx ? { ...it, qty: it.qty + 1 } : it);
      }
      const precio = precioPorLista(producto, listaObj, margenBase, rubros, proveedores);
      return [...prev, { productoId: producto.id, nombre: producto.nombre, qty: 1, precio }];
    });
    setBusqueda("");
    setShowResults(false);
  };

  // ── Totales ─────────────────────────────────────────────────────────────
  const subtotalItems = items.reduce((a, it) => a + it.qty * it.precio, 0);
  // Recargo por tarjeta de crédito en cuotas — mismo cálculo que Nueva venta.
  // En pago dividido cada fila de "Tarjeta Crédito" tiene su propia
  // tarjeta/cuotas, y el interés se suma solo sobre el monto de esa fila.
  const cuotaInfoDeFila = (p) => {
    if (p.formaPago !== "Tarjeta Crédito") return null;
    const t = tarjetas.find(t => t.id === p.tarjetaId);
    return t?.cuotas.find(c => c.cuotas === p.cuotas) || null;
  };
  const montoFinalFila = (p) => {
    const base = Number(p.monto) || 0;
    const pct = cuotaInfoDeFila(p)?.interesPct || 0;
    return pct > 0 ? Math.round(base * (1 + pct / 100)) : base;
  };
  const totalConRecargoSplit = pagosSplit.reduce((a, p) => a + montoFinalFila(p), 0);
  const totalNuevo = modoPago === "dividido"
    ? totalConRecargoSplit
    : (interesTarjetaPct > 0 ? Math.round(subtotalItems * (1 + interesTarjetaPct / 100)) : subtotalItems);
  const totalViejo   = venta.total;
  const diferencia   = totalNuevo - totalViejo;
  const pagosSplitOk = modoPago === "unico" || (pagosSplit.length > 0 && Math.round(sumaPagosSplit) === Math.round(subtotalItems));

  // El saldo de InfoCtaCte se calcula con los datos ACTUALES (pre-edición) de
  // `ventas`, que todavía incluyen el aporte viejo de esta misma venta si ya
  // era de este cliente en cta. cte. — se resta para no contarlo dos veces.
  const montoCtaCteOriginalDeEstaVenta =
    (clienteSelec && venta.clienteId === clienteSelec.id) ? montoCtaCte(venta) : 0;
  // Monto nuevo a cta. cte.: en pago dividido, solo la(s) fila(s) de "Cuenta
  // Corriente" (no el total de la venta); en pago único, todo o nada.
  const montoCtaCteNuevo = modoPago === "dividido"
    ? pagosSplit.filter(p => p.formaPago === "Cuenta Corriente").reduce((a, p) => a + montoFinalFila(p), 0)
    : (formaPago === "Cuenta Corriente" ? totalNuevo : 0);
  const deltaCtaCte = montoCtaCteNuevo - montoCtaCteOriginalDeEstaVenta;
  const hayCambios =
    items.length !== (venta.items || []).length ||
    items.some((it, i) => {
      const orig = (venta.items || [])[i];
      return !orig || orig.qty !== it.qty || orig.precio !== it.precio || orig.nombre !== it.nombre;
    }) ||
    lista !== venta.lista ||
    depositoId !== (venta.depositoId ?? null) ||
    modoPago !== (pagoDividioInicial ? "dividido" : "unico") ||
    (modoPago === "unico"
      ? (formaPago !== venta.formaPago || tarjetaId !== (venta.pagos?.[0]?.tarjetaId ?? null) || cuotasSel !== (venta.pagos?.[0]?.cuotas ?? null))
      : JSON.stringify(pagosSplit) !== JSON.stringify(pagosSplitDesdeVenta(venta.pagos))) ||
    tipo !== venta.tipo ||
    descripcion.trim() !== (venta.descripcion || "") ||
    (clienteSelec?.id || null) !== (venta.clienteId || null);

  const guardar = async () => {
    setError("");
    if (items.length === 0) {
      toast("La venta debe tener al menos un producto.", "error");
      return;
    }
    if (!depositoId) {
      toast("Seleccioná un depósito de origen.", "error");
      return;
    }
    if (esCtaCte && !clienteSelec) {
      setError("Cuenta corriente requiere un cliente seleccionado.");
      return;
    }
    let pagosFinal;
    if (modoPago === "unico") {
      pagosFinal = [{
        formaPago, monto: totalNuevo,
        ...(formaPago === "Tarjeta Crédito" && interesTarjetaPct > 0 ? {
          tarjetaId, tarjetaNombre: tarjetaSeleccionada?.nombre || "",
          cuotas: cuotasSel, interesPct: interesTarjetaPct,
        } : {}),
      }];
    } else {
      for (const p of pagosSplit) {
        const m = Number(p.monto);
        if (!p.formaPago || isNaN(m) || m <= 0) { toast("Revisá los medios de pago: todos los montos deben ser mayores a cero.", "error"); return; }
      }
      if (Math.round(sumaPagosSplit) !== Math.round(subtotalItems)) {
        toast(`La suma de los pagos (${fmt(sumaPagosSplit)}) no coincide con el total de la venta (${fmt(subtotalItems)}). Ajustá los montos.`, "error");
        return;
      }
      pagosFinal = pagosSplit.map(p => {
        const pct = cuotaInfoDeFila(p)?.interesPct || 0;
        return {
          formaPago: p.formaPago,
          monto: montoFinalFila(p),
          ...(pct > 0 ? {
            tarjetaId: p.tarjetaId,
            tarjetaNombre: tarjetas.find(t => t.id === p.tarjetaId)?.nombre || "",
            cuotas: p.cuotas,
            interesPct: pct,
          } : {}),
        };
      });
    }
    const formaPagoFinal = pagosFinal.length === 1 ? pagosFinal[0].formaPago : PAGO_COMBINADO;

    // Límite de cuenta corriente: advertencia, no bloqueo. `deltaCtaCte` ya
    // descuenta el aporte actual (antes de editar) de esta misma venta.
    if (esCtaCte && clienteSelec) {
      const saldoActual = calcularSaldoCtaCte(clienteSelec.id, ventas, pagosCtaCte, cambiosArticulo);
      const saldoResultante = Math.max(0, saldoActual + deltaCtaCte);
      const limite = clienteSelec.limiteCtaCte;
      if (limite !== null && limite !== undefined && saldoResultante > limite) {
        const continuar = await confirm(
          `El cliente supera su límite de cuenta corriente (${fmt(limite)}). Saldo resultante: ${fmt(saldoResultante)}. ¿Querés guardar los cambios igual?`,
          { danger: true, confirmLabel: "Guardar igual" }
        );
        if (!continuar) return;
      }
    }

    const clienteFinal = clienteSelec ? clienteSelec.nombre : "Consumidor Final";
    setGuardando(true);
    try {
      await onGuardar({
        lista,
        formaPago:  formaPagoFinal,
        pagos:      pagosFinal,
        tipo,
        descripcion: descripcion.trim(),
        total:      totalNuevo,
        depositoId,
        clienteId:  clienteSelec?.id || null,
        cliente:    clienteFinal,
        items:      items.map(it => ({ productoId: it.productoId ?? null, nombre: it.nombre, qty: it.qty, precio: it.precio })),
      });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal onClose={onClose} size="modal-lg">
      <div className="modal-header">
        <div>
          <div className="modal-title">Editar venta #{venta.id} — {fmtFechaAR(venta.fecha)}</div>
          <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>
            Editando como <strong style={{ color: "var(--accent2)" }}>{usuarioActivo.nombre}</strong>
          </div>
        </div>
        <button className="close-btn" onClick={onClose}><Icon name="close" size={16}/></button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16, alignItems: "start" }}>

        {/* ── Sección 1: Configuración general ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Lista de precios</label>
            <select className="form-select" value={lista} onChange={e => cambiarLista(e.target.value)}>
              {listas.map(l => <option key={l.id} value={l.nombre}>{l.nombre}</option>)}
            </select>
          </div>

          {depositos.length > 0 && (
            <div className="form-group">
              <label className="form-label">Depósito de origen</label>
              <select className="form-select" value={depositoId ?? ""} onChange={e => setDepositoId(Number(e.target.value))}>
                {depositos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
              </select>
            </div>
          )}

          <div className="form-group">
            <label className="form-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Forma de pago</span>
              <button
                type="button"
                onClick={modoPago === "unico" ? activarPagoDividido : activarPagoUnico}
                style={{ background: "none", border: "none", color: "var(--accent2)", fontSize: 11, cursor: "pointer", padding: 0 }}
              >
                {modoPago === "unico" ? "Dividir pago" : "Pago único"}
              </button>
            </label>
            {modoPago === "unico" ? (
              <select className="form-select" value={formaPago} onChange={e => { setFormaPago(e.target.value); setError(""); }}>
                {FORMAS_PAGO.map(f => <option key={f}>{f}</option>)}
              </select>
            ) : (
              <div style={{ padding: "9px 12px", background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 12, color: "var(--text3)" }}>
                {pagosSplit.length} medio{pagosSplit.length !== 1 ? "s" : ""} de pago (ver abajo)
              </div>
            )}
          </div>

          {/* Tarjeta + cuotas — solo pago único con "Tarjeta Crédito" y si hay tarjetas cargadas */}
          {modoPago === "unico" && formaPago === "Tarjeta Crédito" && tarjetas.length > 0 && (
            <div className="form-group">
              <label className="form-label">Tarjeta</label>
              <select className="form-select" value={tarjetaId ?? ""} onChange={e => setTarjetaId(Number(e.target.value))}>
                {tarjetas.map(t => (
                  <option key={t.id} value={t.id}>{t.nombre}{t.banco ? ` (${t.banco})` : ""}</option>
                ))}
              </select>
              {tarjetaSeleccionada?.cuotas.length > 0 ? (
                <select className="form-select" style={{ marginTop: 6 }} value={cuotasSel ?? ""} onChange={e => setCuotasSel(Number(e.target.value))}>
                  {tarjetaSeleccionada.cuotas.map(c => (
                    <option key={c.id} value={c.cuotas}>
                      {c.cuotas} cuota{c.cuotas !== 1 ? "s" : ""}{c.interesPct > 0 ? ` (+${c.interesPct}%)` : " (sin interés)"}
                    </option>
                  ))}
                </select>
              ) : (
                <div style={{ marginTop: 6, padding: "9px 12px", background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 12, color: "var(--text3)" }}>
                  Sin cuotas cargadas para esta tarjeta
                </div>
              )}
            </div>
          )}

          {/* Pago dividido: filas de medio de pago + monto */}
          {modoPago === "dividido" && (
            <div style={{ padding: "10px 12px", background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>
                Medios de pago
              </div>
              {pagosSplit.map((p, idx) => {
                const tarjetaFila = tarjetas.find(t => t.id === p.tarjetaId);
                const montoFinal  = montoFinalFila(p);
                const conRecargo  = montoFinal !== (Number(p.monto) || 0);
                return (
                  <div key={idx} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <select className="form-select" style={{ flex: 1 }} value={p.formaPago}
                        onChange={e => editarPagoSplit(idx, "formaPago", e.target.value)}>
                        {FORMAS_PAGO.map(f => <option key={f}>{f}</option>)}
                      </select>
                      <input
                        className="form-input mono" type="number" style={{ width: 100 }} placeholder="Monto"
                        value={p.monto} onChange={e => editarPagoSplit(idx, "monto", e.target.value)}
                      />
                      <button
                        onClick={() => quitarPagoSplit(idx)}
                        disabled={pagosSplit.length <= 1}
                        style={{ background: "none", border: "none", cursor: pagosSplit.length <= 1 ? "not-allowed" : "pointer", color: "var(--red)", padding: 4, opacity: pagosSplit.length <= 1 ? 0.4 : 1 }}
                      >
                        <Icon name="trash" size={14}/>
                      </button>
                    </div>
                    {p.formaPago === "Tarjeta Crédito" && tarjetas.length > 0 && (
                      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                        <select className="form-select" style={{ flex: 1, fontSize: 12 }} value={p.tarjetaId ?? ""}
                          onChange={e => editarPagoSplit(idx, "tarjetaId", e.target.value)}>
                          {tarjetas.map(t => (
                            <option key={t.id} value={t.id}>{t.nombre}{t.banco ? ` (${t.banco})` : ""}</option>
                          ))}
                        </select>
                        {tarjetaFila?.cuotas.length > 0 ? (
                          <select className="form-select" style={{ flex: 1, fontSize: 12 }} value={p.cuotas ?? ""}
                            onChange={e => editarPagoSplit(idx, "cuotas", e.target.value)}>
                            {tarjetaFila.cuotas.map(c => (
                              <option key={c.id} value={c.cuotas}>
                                {c.cuotas} cuota{c.cuotas !== 1 ? "s" : ""}{c.interesPct > 0 ? ` (+${c.interesPct}%)` : " (sin interés)"}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span style={{ fontSize: 11, color: "var(--text3)", alignSelf: "center" }}>Sin cuotas cargadas</span>
                        )}
                      </div>
                    )}
                    {conRecargo && (
                      <div style={{ fontSize: 11, color: "var(--amber)", marginTop: 2, textAlign: "right" }}>
                        Con recargo: {fmt(montoFinal)}
                      </div>
                    )}
                  </div>
                );
              })}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                <button className="btn btn-sm btn-ghost" onClick={agregarPagoSplit}>
                  <Icon name="plus" size={13}/> Agregar
                </button>
                <span style={{ fontSize: 11, fontWeight: 600, color: pagosSplitOk ? "var(--green)" : "var(--amber)" }}>
                  {fmt(sumaPagosSplit)} de {fmt(subtotalItems)}
                </span>
              </div>
              {totalConRecargoSplit !== sumaPagosSplit && (
                <div style={{ display: "flex", justifyContent: "flex-end", fontSize: 11, color: "var(--amber)", marginTop: 4 }}>
                  Total con recargo de tarjeta: {fmt(totalConRecargoSplit)}
                </div>
              )}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Tipo de comprobante</label>
            <select className="form-select" value={tipo} onChange={e => setTipo(e.target.value)}>
              <option>Mostrador</option>
              <option>Comprobante electrónico</option>
            </select>
          </div>

          {esCtaCte && (
            <div className="form-group">
              <label className="form-label">Cliente</label>
              <div style={{ position: "relative" }}>
                <input
                  className="form-input"
                  placeholder="Buscar por nombre o DNI"
                  value={clienteInput}
                  onChange={e => { setClienteInput(e.target.value); setClienteSelec(null); setError(""); }}
                />
                {clienteInput && clienteSugs.length > 0 && !clienteSelec && (
                  <div style={{
                    position: "absolute", zIndex: 20, width: "100%", top: "100%", left: 0,
                    background: "var(--bg3)", border: "1px solid var(--border2)",
                    borderRadius: "var(--radius)", marginTop: 4,
                    maxHeight: 200, overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.4)"
                  }}>
                    {clienteSugs.map(c => (
                      <div
                        key={c.id}
                        onMouseDown={e => { e.preventDefault(); setClienteSelec(c); setClienteInput(c.nombre); setError(""); }}
                        style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid var(--border)", fontSize: 13 }}
                        onMouseEnter={e => e.currentTarget.style.background = "color-mix(in srgb, var(--accent) 10%, transparent)"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      >
                        <div style={{ color: "var(--text1)", fontWeight: 500 }}>{c.nombre}</div>
                        <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 1 }}>DNI {c.dni} · {c.iva}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: clienteSelec ? "var(--text2)" : "var(--amber)" }}>
                  {clienteSelec ? `${clienteSelec.nombre}` : "Sin cliente seleccionado"}
                </span>
                <button className="btn btn-sm btn-ghost" style={{ marginLeft: "auto" }} onClick={() => setShowNuevoCliente(true)}>
                  <Icon name="plus" size={12}/> Nuevo
                </button>
              </div>

              {clienteSelec && (
                <InfoCtaCte
                  cliente={clienteSelec}
                  ventas={ventas}
                  pagosCtaCte={pagosCtaCte}
                  cambiosArticulo={cambiosArticulo}
                  montoNuevaVenta={deltaCtaCte}
                />
              )}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Descripción (opcional)</label>
            <textarea
              className="form-input"
              rows={2}
              style={{ resize: "vertical" }}
              placeholder="Nota interna sobre esta venta..."
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
            />
          </div>

          {error && (
            <div style={{ padding: "8px 12px", background: "rgba(242,107,91,0.08)", border: "1px solid rgba(242,107,91,0.25)", borderRadius: 6, fontSize: 12, color: "var(--red)" }}>
              {error}
            </div>
          )}
        </div>

        {/* ── Sección 2: Items de la venta ── */}
        <div>
          <div className="table-wrap" style={{ marginBottom: 10 }}>
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th style={{ textAlign: "center" }}>Cantidad</th>
                  <th style={{ textAlign: "right" }}>Precio unit.</th>
                  <th style={{ textAlign: "right" }}>Subtotal</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", color: "var(--text3)", padding: 24 }}>
                      Sin productos — agregá uno abajo
                    </td>
                  </tr>
                ) : items.map((it, idx) => {
                  const prod = productoDeItem(it);
                  const inactivo = !prod || prod.activo === false;
                  return (
                    <tr key={idx}>
                      <td style={{ color: "var(--text1)" }}>
                        {it.nombre}
                        {prod?.codigo && (
                          <div className="mono" style={{ fontSize: 10, color: "var(--text3)" }}>{prod.codigo}</div>
                        )}
                        {inactivo && (
                          <div style={{ fontSize: 10, color: "var(--text3)" }}>Producto inactivo</div>
                        )}
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                          <button className="qty-btn" disabled={inactivo} onClick={() => cambiarQty(idx, -1)}>−</button>
                          <span className="mono" style={{ minWidth: 22, textAlign: "center", fontWeight: 600 }}>{it.qty}</span>
                          <button className="qty-btn" disabled={inactivo} onClick={() => cambiarQty(idx, +1)}>+</button>
                        </div>
                      </td>
                      <td>
                        <input
                          className="form-input mono"
                          type="number" min="0"
                          style={{ width: 100, padding: "5px 8px", fontSize: 13, textAlign: "right", marginLeft: "auto", display: "block" }}
                          value={it.precio}
                          onChange={e => cambiarPrecio(idx, e.target.value)}
                        />
                      </td>
                      <td className="mono" style={{ textAlign: "right", color: "var(--accent2)", fontWeight: 600 }}>
                        {fmt(it.qty * it.precio)}
                      </td>
                      <td>
                        <button className="btn btn-sm btn-ghost" title="Quitar" onClick={() => quitarItem(idx)}>
                          <Icon name="close" size={13} color="var(--red)"/>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Buscador para agregar productos */}
          <div style={{ position: "relative" }}>
            <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text3)", pointerEvents: "none" }}>
              <Icon name="search" size={14} />
            </div>
            <input
              className="form-input"
              style={{ paddingLeft: 32 }}
              placeholder="Buscar producto para agregar..."
              value={busqueda}
              onChange={e => { setBusqueda(e.target.value); setShowResults(true); }}
              onFocus={() => busqueda && setShowResults(true)}
              onBlur={() => setTimeout(() => setShowResults(false), 150)}
            />
            {showResults && resultadosBusqueda.length > 0 && (
              <div style={{
                position: "absolute", zIndex: 20, width: "100%", top: "100%", left: 0,
                background: "var(--bg3)", border: "1px solid var(--border2)",
                borderRadius: "var(--radius)", marginTop: 4,
                maxHeight: 220, overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.4)"
              }}>
                {resultadosBusqueda.map(p => (
                  <div
                    key={p.id}
                    onMouseDown={e => { e.preventDefault(); agregarProductoBusqueda(p); }}
                    style={{
                      padding: "10px 14px", cursor: "pointer",
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      borderBottom: "1px solid var(--border)", fontSize: 13,
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "color-mix(in srgb, var(--accent) 10%, transparent)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <div>
                      <div style={{ color: "var(--text1)", fontWeight: 500 }}>{p.nombre}</div>
                      <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>{p.codigo} · {p.rubro || p.categoria}</div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                      <div style={{ color: "var(--accent2)", fontWeight: 600 }}>{fmt(precioPorLista(p, listaObj, margenBase, rubros, proveedores))}</div>
                      <div style={{ fontSize: 11, color: p.stockDeposito === 0 ? "var(--red)" : "var(--text3)" }}>
                        {p.stockDeposito === 0 ? "Sin stock en depósito" : `Stock: ${p.stockDeposito}`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="modal-footer" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 13 }}>
          {diferencia !== 0 ? (
            <span style={{ color: "var(--text2)" }}>
              Total anterior: <span className="mono">{fmt(totalViejo)}</span>
              {" → "}Nuevo total: <span className="mono" style={{ fontWeight: 700, color: "var(--accent2)" }}>{fmt(totalNuevo)}</span>
            </span>
          ) : (
            <span style={{ color: "var(--text2)" }}>Total: <span className="mono" style={{ fontWeight: 700, color: "var(--accent2)" }}>{fmt(totalNuevo)}</span></span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={guardar} disabled={!hayCambios || guardando || !pagosSplitOk}
            title={!pagosSplitOk ? "La suma de los medios de pago debe coincidir con el total" : undefined}>
            <Icon name="check" size={14}/>
            {guardando
              ? "Guardando..."
              : diferencia === 0
                ? "Guardar cambios"
                : `Guardar cambios (${diferencia > 0 ? "+" : "−"}${fmt(Math.abs(diferencia))})`}
          </button>
        </div>
      </div>

      {showNuevoCliente && (
        <ModalNuevoCliente
          onClose={() => setShowNuevoCliente(false)}
          onGuardar={(c) => {
            const nc = { ...c, id: clientes.length + Date.now() };
            setClientes(prev => [...prev, nc]);
            setClienteSelec(nc);
            setClienteInput(nc.nombre);
            setShowNuevoCliente(false);
          }}
        />
      )}
    </Modal>
  );
}
