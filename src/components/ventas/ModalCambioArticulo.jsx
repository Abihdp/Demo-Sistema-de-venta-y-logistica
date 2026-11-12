import { useState, useMemo, useEffect } from "react";
import { Modal } from "../ui/Modal";
import Icon from "../ui/Icon";
import { fmt, today, horaActual, precioPorLista, labelLista, normalizarCodigoEscaneado, coincideBusqueda, fmtFechaAR } from "../../utils/helpers";
import { FORMAS_PAGO } from "../../constants";
import { ModalHistorial } from "../clientes/PageClientes";
import { useToast } from "../ui/Toast";

// ─── Paso 1: buscar la venta original ──────────────────────────────────────────
function PasoBuscarVenta({ ventas, productos = [], onSeleccionar, onClose }) {
  const [q, setQ] = useState("");

  const codigoDe = (nombre) => productos.find(p => p.nombre === nombre)?.codigo || "";

  const coincideQuery = (v, query) =>
    String(v.id).includes(query) ||
    v.cliente.toLowerCase().includes(query) ||
    v.items?.some(i => coincideBusqueda(i.nombre, query) || codigoDe(i.nombre).toLowerCase().includes(query));

  const resultados = useMemo(() => {
    if (!q.trim()) return [];
    const query = q.toLowerCase();
    return ventas
      .filter(v => v.estado !== "anulada" && coincideQuery(v, query))
      .sort((a, b) => b.id - a.id)
      .slice(0, 15);
  }, [ventas, q]);

  // Si lo único que coincide es una venta anulada, avisar por qué no aparece
  const soloAnuladasCoinciden = useMemo(() => {
    if (!q.trim() || resultados.length > 0) return false;
    const query = q.toLowerCase();
    return ventas.some(v => v.estado === "anulada" && coincideQuery(v, query));
  }, [ventas, q, resultados]);

  return (
    <Modal onClose={onClose} size="modal-md">
      <div className="modal-header">
        <div className="modal-title">Cambio de artículo — Buscar venta</div>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      <div className="form-group" style={{ marginBottom: 14 }}>
        <label className="form-label">Buscar por N° de comprobante, cliente, artículo o código</label>
        <input
          className="form-input"
          autoFocus
          placeholder="Ej: 42, Juan Pérez, Remera, COD123..."
          value={q}
          onChange={e => setQ(e.target.value)}
        />
      </div>

      {q.trim() && resultados.length === 0 && (
        <div style={{ padding: "20px 0", textAlign: "center", color: "var(--text3)", fontSize: 13 }}>
          {soloAnuladasCoinciden
            ? "Esa venta está anulada — no se puede hacer un cambio de artículo sobre ella."
            : "Sin resultados"}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 360, overflowY: "auto" }}>
        {resultados.map(v => (
          <div
            key={v.id}
            onClick={() => onSeleccionar(v)}
            style={{
              background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8,
              padding: "10px 14px", cursor: "pointer",
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = "var(--accent)"}
            onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text1)" }}>
                #{v.id} — {v.cliente}
              </span>
              <span style={{ fontSize: 12, color: "var(--accent2)", fontWeight: 600 }}>{fmt(v.total)}</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--text3)" }}>
              {fmtFechaAR(v.fecha)} · {v.items?.map(i => `${i.qty}× ${i.nombre}`).join(", ")}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ─── Paso 2: armar el cambio ────────────────────────────────────────────────────
function PasoArmarCambio({ venta, productos, stockDepositos, depositoId, depositoNombre, usuarioActivo, cambios = [], ventasTodas = [], clientes = [], pagosCtaCte = [], listas = [], margenBase = 0, rubros = [], proveedores = [], permitirStockNegativo = false, permitirEditarPrecioVenta = false, onClose, onConfirmar, onVolver }) {
  const [viejosSel, setViejosSel]         = useState([]); // [{ idx, qty }]
  const [busqueda, setBusqueda]           = useState("");
  const [showResults, setShowResults]     = useState(false);
  const [productoNuevo, setProductoNuevo] = useState(null);
  const [qtyNuevo, setQtyNuevo]           = useState(1);
  const [nuevosSel, setNuevosSel]         = useState([]); // [{ productoNuevo, qtyNuevo, total, precioManual }]
  const [listaSelId, setListaSelId]       = useState(null);
  const [formaPagoDif, setFormaPagoDif]   = useState(FORMAS_PAGO[0]);
  const [motivo, setMotivo]               = useState("");
  const [showHistorial, setShowHistorial] = useState(false);
  const [guardando, setGuardando]         = useState(false);

  // Lista de precios para los artículos nuevos — por defecto la de la venta original,
  // pero se puede elegir otra (ej. el cliente ahora paga con otro medio).
  const listaPorDefecto = listas.find(l => l.nombre === venta.lista) || listas[0] || { id: 0, pct: 0 };
  const listaActiva = (listaSelId != null && listas.find(l => l.id === listaSelId)) || listaPorDefecto;
  const precioEnLista = (prod) => precioPorLista(prod, listaActiva, margenBase, rubros, proveedores);

  // Si cambia la lista seleccionada, recalcular los precios no editados a mano
  useEffect(() => {
    setProductoNuevo(prev => (prev && !prev.precioManual) ? { ...prev, precio: precioEnLista(prev) } : prev);
    setNuevosSel(prev => prev.map(n => n.precioManual
      ? n
      : { ...n, productoNuevo: { ...n.productoNuevo, precio: precioEnLista(n.productoNuevo) }, total: precioEnLista(n.productoNuevo) * n.qtyNuevo }
    ));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listaActiva.id]);

  const cliente = venta.clienteId ? clientes.find(c => c.id === venta.clienteId) || null : null;

  // Cuánto de este ítem ya se cambió en cambios previos (persistidos, no anulados)
  const qtyYaCambiada = (it) => cambios
    .filter(c => c.estado !== "anulada" && c.itemViejo?.nombre === it.nombre)
    .reduce((a, c) => a + (c.itemViejo?.qty || 0), 0);
  const qtyRestante = (it) => Math.max(0, it.qty - qtyYaCambiada(it));
  const itemYaCambiado = (it) => qtyRestante(it) <= 0;

  const toggleViejo = (idx) => {
    setViejosSel(prev => {
      if (prev.some(v => v.idx === idx)) return prev.filter(v => v.idx !== idx);
      return [...prev, { idx, qty: 1 }];
    });
  };
  const setQtyViejoSel = (idx, qty) => setViejosSel(prev => prev.map(v => v.idx === idx ? { ...v, qty } : v));

  const viejosConDatos = useMemo(() => viejosSel.map(v => {
    const it = venta.items[v.idx];
    return { idx: v.idx, item: it, qty: v.qty, total: it.precio * v.qty };
  }), [viejosSel, venta.items]);

  const stockEnDeposito = (productoId) => {
    if (!depositoId) return 0;
    return stockDepositos?.find(s => s.productoId === productoId && s.depositoId === depositoId)?.cantidad ?? 0;
  };

  // Unidades del producto nuevo ya reservadas por artículos agregados en esta sesión
  const qtyReservadaEnNuevos = (productoId) => nuevosSel
    .filter(n => n.productoNuevo.id === productoId)
    .reduce((a, n) => a + n.qtyNuevo, 0);

  const resultadosBusqueda = useMemo(() => {
    if (!busqueda.trim()) return [];
    const q = normalizarCodigoEscaneado(busqueda.toLowerCase());
    return productos
      .filter(p => coincideBusqueda([p.nombre, p.codigo].join(" "), q))
      .map(p => ({ ...p, stockDeposito: stockEnDeposito(p.id) }))
      .slice(0, 8);
  }, [busqueda, productos, depositoId, stockDepositos]);

  // Cuenta Corriente solo disponible para devoluciones si la venta tiene un cliente vinculado
  const formasDevolucion = cliente ? FORMAS_PAGO : FORMAS_PAGO.filter(f => f !== "Cuenta Corriente");

  const stockDisponibleNuevo = productoNuevo
    ? Math.max(0, stockEnDeposito(productoNuevo.id) - qtyReservadaEnNuevos(productoNuevo.id))
    : 0;
  const stockSuficiente = !productoNuevo || qtyNuevo <= stockDisponibleNuevo;

  // Artículo nuevo en armado (todavía no agregado a la lista) — se incluye automáticamente al confirmar
  const nuevoPendiente = (productoNuevo && qtyNuevo > 0)
    ? { productoNuevo, qtyNuevo, total: productoNuevo.precio * qtyNuevo, precioManual: !!productoNuevo.precioManual }
    : null;

  const todosNuevos = nuevoPendiente ? [...nuevosSel, nuevoPendiente] : nuevosSel;

  const totalViejo = viejosConDatos.reduce((a, v) => a + v.total, 0);
  const totalNuevo = todosNuevos.reduce((a, n) => a + n.total, 0);
  const diferencia = totalNuevo - totalViejo; // positivo = cliente paga más / negativo = nota de crédito

  const puedeConfirmar = viejosConDatos.length > 0 && todosNuevos.length > 0 && (stockSuficiente || permitirStockNegativo);

  const agregarNuevoArticulo = () => {
    if (!nuevoPendiente || !(stockSuficiente || permitirStockNegativo)) return;
    setNuevosSel(prev => [...prev, nuevoPendiente]);
    setProductoNuevo(null);
    setQtyNuevo(1);
    setBusqueda("");
  };

  const quitarNuevo = (idx) => setNuevosSel(prev => prev.filter((_, i) => i !== idx));

  const editarPrecioNuevoSel = (idx, valor) => {
    const precio = Math.max(0, Number(valor) || 0);
    setNuevosSel(prev => prev.map((n, i) => i === idx
      ? { ...n, productoNuevo: { ...n.productoNuevo, precio }, total: precio * n.qtyNuevo, precioManual: true }
      : n));
  };

  const editarPrecioBuilder = (valor) => {
    const precio = Math.max(0, Number(valor) || 0);
    setProductoNuevo(prev => prev ? { ...prev, precio, precioManual: true } : prev);
  };

  const confirmar = async () => {
    if (!puedeConfirmar || guardando) return; // evita doble registro por doble click
    // Se emparejan viejos y nuevos de a uno (neteando su diferencia por fila); si sobran
    // artículos de un lado, quedan solos con su valor completo — la suma total no cambia.
    const n = Math.max(viejosConDatos.length, todosNuevos.length);
    const pares = [];
    for (let i = 0; i < n; i++) {
      const v = viejosConDatos[i] || null;
      const nv = todosNuevos[i] || null;
      pares.push({
        itemViejo: v ? { ...v.item, qty: v.qty, productoId: v.item.productoId ?? productos.find(p => p.nombre === v.item.nombre)?.id } : null,
        productoNuevo: nv ? nv.productoNuevo : null,
        qtyNuevo: nv ? nv.qtyNuevo : 0,
        totalViejo: v ? v.total : 0,
        totalNuevo: nv ? nv.total : 0,
      });
    }
    setGuardando(true);
    try {
      await onConfirmar({
        ventaOriginalId: venta.id,
        ventaOriginalCliente: venta.cliente,
        ventaOriginalClienteId: venta.clienteId || null,
        fecha: today(),
        hora: horaActual(),
        usuario: usuarioActivo?.nombre || "—",
        pares,
        totalViejo,
        totalNuevo,
        diferencia,
        formaPagoDif,
        motivo: motivo.trim(),
        depositoId,
        depositoNombre,
      });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
    <Modal onClose={onClose} size="modal-lg">
      <div className="modal-header">
        <div className="modal-title">Cambio de artículo — Venta #{venta.id}</div>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Cliente de la venta original */}
        <div className="card" style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          {cliente ? (
            <>
              <Icon name="users" size={15} style={{ color: "var(--accent2)", flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: "var(--text1)", fontWeight: 600 }}>{cliente.nombre}</div>
                <div style={{ fontSize: 11, color: "var(--text3)" }}>
                  DNI {cliente.dni} · {cliente.iva}
                </div>
              </div>
              <button className="btn btn-sm" onClick={() => setShowHistorial(true)}>
                <Icon name="chart" size={13} /> Ver historial
              </button>
            </>
          ) : (
            <>
              <Icon name="users" size={15} style={{ color: "var(--text3)", flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: "var(--text3)" }}>
                Consumidor Final — sin cuenta corriente registrada
              </span>
            </>
          )}
        </div>

        {/* Paso A: elegir artículo(s) a devolver */}
        <div className="card" style={{ padding: "14px 16px" }}>
          <div className="card-title">1. Artículo(s) que devuelve el cliente</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {venta.items?.map((it, idx) => {
              const restante = qtyRestante(it);
              const yaCambiadoParcial = restante < it.qty;
              const yaCambiado = restante <= 0;
              const sel = viejosSel.find(v => v.idx === idx);
              const seleccionado = !!sel;
              return (
                <div key={idx}>
                  <label
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 12px", borderRadius: 8,
                      cursor: yaCambiado ? "not-allowed" : "pointer",
                      opacity: yaCambiado ? 0.5 : 1,
                      background: seleccionado ? "color-mix(in srgb, var(--accent) 10%, transparent)" : "var(--bg3)",
                      border: `1px solid ${seleccionado ? "var(--accent)" : "var(--border)"}`,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={seleccionado}
                      disabled={yaCambiado}
                      onChange={() => toggleViejo(idx)}
                      style={{ accentColor: "var(--accent)" }}
                    />
                    <span style={{ flex: 1, fontSize: 13, color: "var(--text1)", textDecoration: yaCambiado ? "line-through" : "none" }}>
                      {it.qty}× {it.nombre}
                      {yaCambiado && (
                        <span style={{ marginLeft: 8, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".03em", color: "var(--amber)" }}>
                          ya cambiado
                        </span>
                      )}
                      {!yaCambiado && yaCambiadoParcial && (
                        <span style={{ marginLeft: 8, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".03em", color: "var(--amber)" }}>
                          quedan {restante}
                        </span>
                      )}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--text3)", textDecoration: yaCambiado ? "line-through" : "none" }}>{fmt(it.precio)} c/u</span>
                  </label>

                  {seleccionado && it.qty > 1 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px 2px 40px" }}>
                      <span style={{ fontSize: 12, color: "var(--text3)" }}>Cantidad a cambiar:</span>
                      <button className="qty-btn" onClick={() => setQtyViejoSel(idx, Math.max(1, sel.qty - 1))}>−</button>
                      <span style={{ minWidth: 20, textAlign: "center", fontSize: 13, fontWeight: 600 }}>{sel.qty}</span>
                      <button className="qty-btn" onClick={() => setQtyViejoSel(idx, Math.min(restante, sel.qty + 1))}>+</button>
                      <span style={{ fontSize: 11, color: "var(--text3)" }}>de {restante} disponible{restante !== 1 ? "s" : ""}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Paso B: elegir artículo(s) nuevo(s) — se mantiene disponible mientras haya al menos un artículo a devolver */}
        {viejosConDatos.length > 0 && (
          <div className="card" style={{ padding: "14px 16px" }}>
            <div className="card-title">2. Artículo(s) nuevo(s) que se lleva</div>

            {listas.length > 0 && (
              <div className="form-group" style={{ marginBottom: 10 }}>
                <label className="form-label">Lista de precios para estos artículos</label>
                <select
                  className="form-select"
                  value={listaActiva.id}
                  onChange={e => setListaSelId(Number(e.target.value))}
                >
                  {listas.map(l => (
                    <option key={l.id} value={l.id}>{labelLista(l)}</option>
                  ))}
                </select>
              </div>
            )}

            {nuevosSel.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
                {nuevosSel.map((n, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8,
                      padding: "8px 12px", fontSize: 12,
                    }}
                  >
                    <span style={{ flex: 1, color: "var(--text1)" }}>{n.qtyNuevo}× {n.productoNuevo.nombre}</span>
                    {permitirEditarPrecioVenta ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                        <input
                          type="number" min="0"
                          value={n.productoNuevo.precio}
                          onChange={e => editarPrecioNuevoSel(idx, e.target.value)}
                          title="Precio de venta editable"
                          style={{
                            width: 64, fontSize: 11, padding: "1px 4px", borderRadius: 4,
                            background: n.precioManual ? "rgba(245,158,11,0.1)" : "var(--bg4)",
                            border: `1px solid ${n.precioManual ? "var(--amber)" : "var(--border2)"}`,
                            color: n.precioManual ? "var(--amber)" : "var(--text2)",
                          }}
                        />
                        <span style={{ color: "var(--text3)" }}>c/u</span>
                      </span>
                    ) : (
                      <span style={{ color: "var(--text2)", fontWeight: 600 }}>{fmt(n.total)}</span>
                    )}
                    <button className="close-btn" style={{ fontSize: 16 }} onClick={() => quitarNuevo(idx)} title="Quitar">×</button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ position: "relative", marginBottom: 10 }}>
              <input
                className="form-input"
                placeholder="Buscar por nombre o código..."
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
                  maxHeight: 200, overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.4)"
                }}>
                  {resultadosBusqueda.map(p => (
                    <div
                      key={p.id}
                      onMouseDown={e => {
                        e.preventDefault();
                        setProductoNuevo({ ...p, precio: precioEnLista(p) });
                        setBusqueda(p.nombre);
                        setShowResults(false);
                      }}
                      style={{
                        padding: "10px 14px", cursor: p.stockDeposito === 0 ? "not-allowed" : "pointer",
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        borderBottom: "1px solid var(--border)", fontSize: 13,
                        opacity: p.stockDeposito === 0 ? 0.5 : 1,
                      }}
                      onMouseEnter={e => { if (p.stockDeposito > 0) e.currentTarget.style.background = "color-mix(in srgb, var(--accent) 10%, transparent)"; }}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <div>
                        <div style={{ color: "var(--text1)", fontWeight: 500 }}>{p.nombre}</div>
                        <div style={{ fontSize: 11, color: "var(--text3)" }}>{p.codigo}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ color: "var(--accent2)", fontWeight: 600 }}>{fmt(precioEnLista(p))}</div>
                        <div style={{ fontSize: 11, color: p.stockDeposito === 0 ? "var(--red)" : "var(--text3)" }}>
                          Stock: {p.stockDeposito}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {productoNuevo && (
              <div style={{
                background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8,
                padding: "10px 14px", display: "flex", alignItems: "center", gap: 12
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: "var(--text1)", fontWeight: 500 }}>{productoNuevo.nombre}</div>
                  {permitirEditarPrecioVenta ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, marginTop: 2 }}>
                      <input
                        type="number" min="0"
                        value={productoNuevo.precio}
                        onChange={e => editarPrecioBuilder(e.target.value)}
                        title="Precio de venta editable"
                        style={{
                          width: 64, fontSize: 11, padding: "1px 4px", borderRadius: 4,
                          background: productoNuevo.precioManual ? "rgba(245,158,11,0.1)" : "var(--bg4)",
                          border: `1px solid ${productoNuevo.precioManual ? "var(--amber)" : "var(--border2)"}`,
                          color: productoNuevo.precioManual ? "var(--amber)" : "var(--text2)",
                        }}
                      />
                      <span style={{ fontSize: 11, color: "var(--text3)" }}>c/u</span>
                    </span>
                  ) : (
                    <div style={{ fontSize: 11, color: "var(--text3)" }}>{fmt(productoNuevo.precio)} c/u</div>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button className="qty-btn" onClick={() => setQtyNuevo(q => Math.max(1, q - 1))}>−</button>
                  <span style={{ minWidth: 24, textAlign: "center", fontSize: 13, fontWeight: 600 }}>{qtyNuevo}</span>
                  <button className="qty-btn" onClick={() => setQtyNuevo(q => permitirStockNegativo ? q + 1 : Math.min(stockDisponibleNuevo, q + 1))}>+</button>
                </div>
                <div style={{ minWidth: 80, textAlign: "right", fontWeight: 700, color: "var(--accent2)" }}>
                  {fmt(nuevoPendiente?.total || 0)}
                </div>
              </div>
            )}

            {productoNuevo && !stockSuficiente && (
              <div style={{ marginTop: 8, fontSize: 12, color: permitirStockNegativo ? "var(--amber)" : "var(--red)" }}>
                Stock insuficiente — disponible: {stockDisponibleNuevo}
                {permitirStockNegativo && ` (se confirma igual, quedará en ${stockDisponibleNuevo - qtyNuevo})`}
              </div>
            )}

            {productoNuevo && (
              <button
                className="btn btn-sm"
                style={{ marginTop: 10 }}
                disabled={!(stockSuficiente || permitirStockNegativo)}
                onClick={agregarNuevoArticulo}
              >
                <Icon name="plus" size={13} /> Agregar este artículo
              </button>
            )}
          </div>
        )}

        {/* Paso C: diferencia */}
        {viejosConDatos.length > 0 && todosNuevos.length > 0 && (
          <div className="card" style={{ padding: "14px 16px" }}>
            <div className="card-title">3. Diferencia</div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
              <span style={{ color: "var(--text2)" }}>Valor artículo{viejosConDatos.length > 1 ? "s" : ""} devuelto{viejosConDatos.length > 1 ? "s" : ""}</span>
              <span style={{ color: "var(--text1)" }}>{fmt(totalViejo)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 10 }}>
              <span style={{ color: "var(--text2)" }}>Valor artículo{todosNuevos.length > 1 ? "s" : ""} nuevo{todosNuevos.length > 1 ? "s" : ""}</span>
              <span style={{ color: "var(--text1)" }}>{fmt(totalNuevo)}</span>
            </div>
            <div style={{ height: 1, background: "var(--border)", margin: "8px 0" }} />

            {diferencia === 0 && (
              <div style={{
                padding: "10px 14px", borderRadius: 8,
                background: "rgba(62,207,142,0.08)", border: "1px solid rgba(62,207,142,0.2)",
                display: "flex", justifyContent: "space-between", alignItems: "center"
              }}>
                <span style={{ fontSize: 13, color: "var(--text2)" }}>Cambio sin diferencia de precio</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: "var(--green)" }}>{fmt(0)}</span>
              </div>
            )}

            {diferencia < 0 && (
              <>
                <div style={{
                  padding: "10px 14px", borderRadius: 8,
                  background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)",
                  display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10
                }}>
                  <span style={{ fontSize: 13, color: "var(--amber)" }}>
                    Se emite Nota de Crédito a favor del cliente
                  </span>
                  <span style={{ fontSize: 18, fontWeight: 700, color: "var(--amber)" }}>{fmt(Math.abs(diferencia))}</span>
                </div>
                <div className="form-group">
                  <label className="form-label">Forma de devolución</label>
                  <select
                    className="form-select"
                    value={formasDevolucion.includes(formaPagoDif) ? formaPagoDif : formasDevolucion[0]}
                    onChange={e => setFormaPagoDif(e.target.value)}
                  >
                    {formasDevolucion.map(f => <option key={f}>{f}</option>)}
                  </select>
                </div>
                <div style={{ fontSize: 12, color: "var(--text3)" }}>
                  {formaPagoDif === "Cuenta Corriente"
                    ? "El importe se acredita como saldo a favor del cliente en su cuenta corriente."
                    : `Se le entrega ${fmt(Math.abs(diferencia))} al cliente por ${formaPagoDif}. Se reflejará como egreso en Caja.`}
                </div>
              </>
            )}

            {diferencia > 0 && (
              <>
                <div style={{
                  padding: "10px 14px", borderRadius: 8,
                  background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)",
                  display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10
                }}>
                  <span style={{ fontSize: 13, color: "var(--blue)" }}>
                    El cliente debe pagar la diferencia
                  </span>
                  <span style={{ fontSize: 18, fontWeight: 700, color: "var(--blue)" }}>{fmt(diferencia)}</span>
                </div>
                <div className="form-group">
                  <label className="form-label">Forma de pago de la diferencia</label>
                  <select
                    className="form-select"
                    value={formasDevolucion.includes(formaPagoDif) ? formaPagoDif : formasDevolucion[0]}
                    onChange={e => setFormaPagoDif(e.target.value)}
                  >
                    {formasDevolucion.map(f => <option key={f}>{f}</option>)}
                  </select>
                </div>
                {formaPagoDif === "Cuenta Corriente" && (
                  <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 6 }}>
                    El importe queda como saldo pendiente en la cuenta corriente del cliente.
                  </div>
                )}
              </>
            )}

            <div className="form-group" style={{ marginTop: 12 }}>
              <label className="form-label">Motivo del cambio (opcional)</label>
              <input
                className="form-input"
                placeholder="Ej: Talle incorrecto, cliente prefirió otro color..."
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
              />
            </div>
          </div>
        )}

      </div>

      <div className="modal-footer">
        <button className="btn" onClick={onVolver} disabled={guardando}>← Volver</button>
        <button className="btn btn-primary" disabled={!puedeConfirmar || guardando} onClick={confirmar}>
          <Icon name="check" size={14} /> {guardando ? "Confirmando..." : `Confirmar cambio${todosNuevos.length > 1 || viejosConDatos.length > 1 ? ` (${viejosConDatos.length} devuelto${viejosConDatos.length !== 1 ? "s" : ""} · ${todosNuevos.length} nuevo${todosNuevos.length !== 1 ? "s" : ""})` : ""}`}
        </button>
      </div>
    </Modal>

    {showHistorial && cliente && (
      <ModalHistorial
        cliente={cliente}
        ventas={ventasTodas}
        pagos={pagosCtaCte}
        onClose={() => setShowHistorial(false)}
      />
    )}
    </>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────────
export default function ModalCambioArticulo({
  ventas, productos, setProductos,
  stockDepositos, aplicarDeltaStockMultiple, aplicarDeltaStockProductoMultiple,
  depositos, usuarioActivo,
  cambiosArticulo = [],
  clientes = [], pagosCtaCte = [],
  listas = [], margenBase = 0,
  rubros = [], proveedores = [],
  permitirStockNegativo = false,
  permitirEditarPrecioVenta = false,
  onClose, onConfirmar,
}) {
  const { toast } = useToast();
  const [paso, setPaso] = useState("buscar"); // "buscar" | "armar"
  const [ventaSel, setVentaSel] = useState(null);

  // Bug 2: usar el depósito de la venta original, no siempre el primero
  const depositoId = ventaSel?.depositoId || depositos?.find(d => d.tipo !== "reserva")?.id || null;
  const depositoNombre = depositos?.find(d => d.id === depositoId)?.nombre || "—";

  if (paso === "buscar") {
    return (
      <PasoBuscarVenta
        ventas={ventas}
        productos={productos}
        onClose={onClose}
        onSeleccionar={(v) => { setVentaSel(v); setPaso("armar"); }}
      />
    );
  }

  return (
    <PasoArmarCambio
      venta={ventaSel}
      productos={productos}
      stockDepositos={stockDepositos}
      depositoId={depositoId}
      depositoNombre={depositoNombre}
      usuarioActivo={usuarioActivo}
      cambios={cambiosArticulo.filter(c => c.ventaOriginalId === ventaSel.id)}
      ventasTodas={ventas}
      clientes={clientes}
      pagosCtaCte={pagosCtaCte}
      listas={listas}
      margenBase={margenBase}
      rubros={rubros}
      proveedores={proveedores}
      permitirStockNegativo={permitirStockNegativo}
      permitirEditarPrecioVenta={permitirEditarPrecioVenta}
      onClose={onClose}
      onVolver={() => setPaso("buscar")}
      onConfirmar={async (data) => {
        // Primero se guarda el cambio (y, si corresponde, el ajuste de cta.
        // cte.) — recién si eso sale bien se toca el stock. Antes era al
        // revés: el stock se disparaba "fire-and-forget" (sin esperar la
        // respuesta, con el error silenciado) ANTES de intentar guardar el
        // cambio. Si el guardado fallaba — como pasó con el bug de "time
        // zone p.m. not recognized" — el stock ya había bajado pero no
        // quedaba ningún cambio ni comprobante que lo explicara. Si ahora
        // falla el guardado, `onConfirmar` tira el error para acá y el
        // stock queda intacto (ver catch más abajo en el error — no hay:
        // se corta antes de llegar al ajuste de stock).
        await onConfirmar(data);

        // Se acumula por producto para no pisar el cambio de un par con el
        // de otro cuando un mismo artículo aparece como "viejo" en un par y
        // "nuevo" en otro.
        const deltas = {}; // productoId -> delta neto de unidades a sumar al stock
        const acumular = (productoId, delta) => {
          if (!productoId) return;
          deltas[productoId] = (deltas[productoId] || 0) + delta;
        };
        data.pares.forEach(par => {
          if (par.itemViejo) acumular(par.itemViejo.productoId, par.itemViejo.qty);   // vuelve al stock
          if (par.productoNuevo) acumular(par.productoNuevo.id, -par.qtyNuevo);       // sale del stock
        });
        const cambios = Object.entries(deltas).map(([productoId, delta]) => ({
          productoId: Number(productoId), depositoId: data.depositoId, delta,
        }));
        if (!cambios.length) return;

        // El cambio ya quedó guardado en este punto — si el ajuste de stock
        // falla, no tiene sentido "deshacer" el cambio (ya se emitió el
        // comprobante); se avisa para corregirlo a mano, mismo criterio que
        // usa el resto de la app (ver TabReservas.handleRetirarItems).
        try {
          if (aplicarDeltaStockMultiple) await aplicarDeltaStockMultiple(cambios);
          // El total (productos.stock) también se ajusta acá — antes solo se
          // tocaba el stock por depósito y el total nunca se enteraba de un
          // cambio de artículo, así que quedaba desincronizado de la suma real
          // por depósito en todo producto que alguna vez pasó por un cambio.
          if (aplicarDeltaStockProductoMultiple) {
            await aplicarDeltaStockProductoMultiple(
              cambios.map(c => ({ productoId: c.productoId, delta: c.delta }))
            );
          }
        } catch (err) {
          toast(`Cambio registrado, pero hubo un error al ajustar el stock — verificá manualmente. (${err.message})`, "warning");
        }
      }}
    />
  );
}
