import { useState, useEffect, useMemo } from "react";
import Icon from "../ui/Icon";
import { fmt, today, calcularIva, periodoDe } from "../../utils/helpers";
import { LISTAS, FORMAS_PAGO, TIPOS_FACTURA, ALICUOTAS_IVA, DISCRIMINA_IVA } from "../../constants";
import ModalNuevoCliente from "../clientes/ModalNuevoCliente";
import ModalTicket from "./ModalTicket";
import ModalBuscadorProductos from "./ModalBuscadorProductos";
import ModalEditarVenta from "./ModalEditarVenta";
import ModalCambioArticulo from "./ModalCambioArticulo";
import ModalComprobanteCambio from "./ModalComprobanteCambio";

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function PageVentas({ ventas, setVentas, clientes, setClientes, productos, setProductos, caja, usuarioActivo, depositos = [], stockDepositos = [], setStockDepositos, pasesDeposito = [], setPasesDeposito, cambiosArticulo = [], setCambiosArticulo, pagosCtaCte, setPagosCtaCte, cierresPeriodo = [] }) {

  // ── Estado del formulario ─────────────────────────────────────────────
  const listaDefault   = LISTAS.reduce((a, b) => b.pct > a.pct ? b : a);
  const depositoInicial = depositos.find(d => d.tipo !== "reserva")?.id || null;

  const [clienteInput, setClienteInput]   = useState("");
  const [clienteSelec, setClienteSelec]   = useState(null);
  const [lista, setLista]                 = useState(listaDefault);
  const [formaPago, setFormaPago]         = useState(FORMAS_PAGO[0]);
  const [tipo, setTipo]                   = useState("Mostrador");
  const [tipoFactura, setTipoFactura]     = useState("B");
  const [alicuotaIva, setAlicuotaIva]     = useState(ALICUOTAS_IVA[0].id);
  const [items, setItems]                 = useState([]);
  const [busqueda, setBusqueda]           = useState("");
  const [showResults, setShowResults]     = useState(false);
  const [depositoId,    setDepositoId]    = useState(depositoInicial);
  const [esSeña,        setEsSeña]        = useState(false);
  const [showNuevoCliente,  setShowNuevoCliente]  = useState(false);
  const [showCatalogo,      setShowCatalogo]      = useState(false);
  const [showTicket,        setShowTicket]        = useState(null);
  const [editarVenta,       setEditarVenta]       = useState(null);
  const [showCambioArt,     setShowCambioArt]     = useState(false);
  const [comprobanteCambio, setComprobanteCambio] = useState(null);

  // ── Estado de filtros del historial ───────────────────────────────────
  const [fUsuario,  setFUsuario]  = useState("");
  const [fCliente,  setFCliente]  = useState("");
  const [fDesde,    setFDesde]    = useState(daysAgo(3));
  const [fHasta,    setFHasta]    = useState(today());
  const [fPago,     setFPago]     = useState("");
  const [fArticulo, setFArticulo] = useState("");
  const [fTipo,     setFTipo]     = useState(""); // "" | "Comprobante" | "Mostrador"

  // Atajo Ctrl+M: ciclar filtro de tipo (compliance facturas)
  useEffect(() => {
    const CICLO = ["", "Comprobante", "Mostrador"];
    const handler = (e) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === "m") {
        e.preventDefault();
        setFTipo(prev => {
          const i = CICLO.indexOf(prev);
          return CICLO[(i + 1) % CICLO.length];
        });
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // ── Helpers de depósitos ─────────────────────────────────────────────
  const depositoNombre  = depositos.find(d => d.id === depositoId)?.nombre || "—";
  const depositoReserva = depositos.find(d => d.tipo === "reserva");
  const depositosNormales = depositos.filter(d => d.tipo !== "reserva");

  const stockEnDeposito = (productoId) => {
    if (!depositoId) return 0;
    return stockDepositos.find(s => s.productoId === productoId && s.depositoId === depositoId)?.cantidad ?? 0;
  };

  // ── Lógica del formulario ─────────────────────────────────────────────
  const clienteSugs = useMemo(() => {
    if (!clienteInput) return [];
    const q   = clienteInput.toLowerCase();
    const dni = clienteInput.replace(/[\.\-\s]/g, "");
    return clientes.filter(c =>
      c.nombre.toLowerCase().includes(q) ||
      c.dni?.replace(/[\.\-\s]/g, "").includes(dni)
    ).slice(0, 6);
  }, [clientes, clienteInput]);

  const resultados = useMemo(() => {
    if (!busqueda.trim()) return [];
    const q = busqueda.toLowerCase();
    return productos
      .filter(p =>
        p.nombre.toLowerCase().includes(q) ||
        p.codigo.toLowerCase().includes(q) ||
        p.categoria.toLowerCase().includes(q)
      )
      .map(p => ({ ...p, stockDeposito: stockEnDeposito(p.id) }))
      .slice(0, 8);
  }, [busqueda, productos, depositoId, stockDepositos]);

  const addItem = (prod) => {
    const disponible = stockEnDeposito(prod.id);
    if (disponible <= 0) return;
    setItems(prev => {
      const ex = prev.find(i => i.productoId === prod.id);
      if (ex) {
        if (ex.qty >= disponible) return prev;
        return prev.map(i => i.productoId === prod.id ? { ...i, qty: i.qty + 1 } : i);
      }
      const precio = Math.round(prod.precio * (1 + lista.pct / 100));
      return [...prev, { productoId: prod.id, nombre: prod.nombre, precio, qty: 1, stock: disponible }];
    });
    setBusqueda("");
    setShowResults(false);
  };

  const changeQty = (productoId, delta) => {
    setItems(prev => prev.map(i => {
      if (i.productoId !== productoId) return i;
      const nq = i.qty + delta;
      if (nq <= 0) return null;
      if (nq > i.stock) return i;
      return { ...i, qty: nq };
    }).filter(Boolean));
  };

  const removeItem = (id) => setItems(prev => prev.filter(i => i.productoId !== id));

  useEffect(() => {
    setItems(prev => prev.map(i => {
      const prod = productos.find(p => p.id === i.productoId);
      if (!prod) return i;
      return { ...i, precio: Math.round(prod.precio * (1 + lista.pct / 100)) };
    }));
  }, [lista]);

  const subtotal    = items.reduce((a, i) => a + i.precio * i.qty, 0);
  const esCtaCte    = formaPago === "Cuenta Corriente";
  const clienteFinal = clienteSelec ? clienteSelec.nombre : "Consumidor Final";

  const limpiarForm = () => {
    setClienteInput("");
    setClienteSelec(null);
    setLista(listaDefault);
    setFormaPago(FORMAS_PAGO[0]);
    setTipo("Mostrador");
    setItems([]);
    setBusqueda("");
    setEsSeña(false);
    // depositoId se mantiene para la siguiente venta
  };

  const periodoActual = periodoDe(today());
  const periodoCerrado = (cierresPeriodo || []).find(p => p.periodo === periodoActual && p.estado === "cerrado");

  const confirmar = () => {
    if (periodoCerrado) { alert(`El período ${periodoActual} está cerrado. Un administrador debe reabrirlo desde Tesorería para registrar nuevas ventas.`); return; }
    if (!caja.abierta) { alert("La caja está cerrada. Abrila desde Caja para registrar ventas."); return; }
    if (!depositoId)   { alert("Seleccioná un depósito de origen."); return; }
    if (items.length === 0) { alert("Agregá al menos un producto."); return; }
    if (esCtaCte && !clienteSelec) { alert("Para cuenta corriente debés seleccionar un cliente."); return; }

    // Validar stock en el depósito seleccionado
    for (const item of items) {
      const disp = stockEnDeposito(item.productoId);
      if (item.qty > disp) {
        alert(`Stock insuficiente en ${depositoNombre}: "${item.nombre}" — disponible: ${disp}, pedido: ${item.qty}`);
        return;
      }
    }

    const nextId = ventas.length + 1;

    if (esSeña) {
      // ── SEÑA: mover stock del depósito origen al depósito de reservas ──
      setStockDepositos(prev => {
        let upd = [...prev];
        items.forEach(item => {
          const oIdx = upd.findIndex(s => s.productoId === item.productoId && s.depositoId === depositoId);
          if (oIdx >= 0) upd[oIdx] = { ...upd[oIdx], cantidad: upd[oIdx].cantidad - item.qty };
          if (depositoReserva) {
            const rIdx = upd.findIndex(s => s.productoId === item.productoId && s.depositoId === depositoReserva.id);
            if (rIdx >= 0) {
              upd[rIdx] = { ...upd[rIdx], cantidad: upd[rIdx].cantidad + item.qty };
            } else {
              upd.push({ id: Date.now() + item.productoId, productoId: item.productoId, depositoId: depositoReserva.id, cantidad: item.qty });
            }
          }
        });
        return upd;
      });
      // Registrar pases de depósito
      const nuevoPases = items.map((item, idx) => ({
        id:                   Date.now() + idx,
        fecha:                today(),
        ventaId:              nextId,
        productoId:           item.productoId,
        productoNombre:       item.nombre,
        cantidad:             item.qty,
        depositoOrigenId:     depositoId,
        depositoOrigenNombre: depositoNombre,
        depositoDestinoId:    depositoReserva?.id,
        depositoDestinoNombre:depositoReserva?.nombre || "Reservas",
        motivo:               "Seña de venta",
        usuario:              usuarioActivo?.nombre || "—",
      }));
      setPasesDeposito(prev => [...prev, ...nuevoPases]);
      // El stock total (producto.stock) NO cambia — la mercadería sigue en el local

    } else {
      // ── VENTA NORMAL: descontar del depósito y del stock total ──
      setStockDepositos(prev => prev.map(s => {
        if (s.depositoId !== depositoId) return s;
        const item = items.find(i => i.productoId === s.productoId);
        return item ? { ...s, cantidad: s.cantidad - item.qty } : s;
      }));
      setProductos(prev => prev.map(p => {
        const item = items.find(i => i.productoId === p.id);
        return item ? { ...p, stock: p.stock - item.qty } : p;
      }));
    }

    const alic = ALICUOTAS_IVA.find(a => a.id === alicuotaIva)?.valor ?? 0.21;
    const { neto, iva } = calcularIva(subtotal, alic);

    const venta = {
      id:              nextId,
      fecha:           today(),
      periodo:         periodoActual,
      usuario:         usuarioActivo?.nombre || "—",
      clienteId:       clienteSelec?.id || null,
      cliente:         clienteFinal,
      lista:           lista.nombre,
      formaPago,
      tipo,
      tipoFactura,
      alicuotaIva: alic,
      neto,
      iva,
      depositoId,
      depositoNombre,
      esSeña,
      items: items.map(i => ({ nombre: i.nombre, qty: i.qty, precio: i.precio })),
      total: subtotal,
    };
    setVentas(prev => [...prev, venta]);
    setShowTicket(venta);
    limpiarForm();
  };

  // ── Permisos de edición ───────────────────────────────────────────────
  // Regla: caja debe estar abierta + el rol determina qué ventas puede editar
  const puedeEditar = (v) => {
    if (!caja.abierta) return false;
    if (usuarioActivo?.rol === "admin") return true;
    // cajero: solo sus propias ventas
    return v.usuario === usuarioActivo?.nombre;
  };

  // ── Filtrado del historial ────────────────────────────────────────────
  const ventasFiltradas = useMemo(() => {
    return ventas.filter(v => {
      if (fDesde    && v.fecha < fDesde) return false;
      if (fHasta    && v.fecha > fHasta) return false;
      if (fUsuario  && !v.usuario?.toLowerCase().includes(fUsuario.toLowerCase())) return false;
      if (fCliente  && !v.cliente.toLowerCase().includes(fCliente.toLowerCase())) return false;
      if (fPago     && v.formaPago !== fPago) return false;
      if (fTipo     && v.tipo !== fTipo) return false;
      if (fArticulo) {
        const q = fArticulo.toLowerCase();
        if (!v.items?.some(i => i.nombre.toLowerCase().includes(q))) return false;
      }
      return true;
    }).sort((a, b) => (b.fecha > a.fecha ? 1 : b.fecha < a.fecha ? -1 : b.id - a.id));
  }, [ventas, fDesde, fHasta, fUsuario, fCliente, fPago, fTipo, fArticulo]);

  const limpiarFiltros = () => {
    setFUsuario("");
    setFCliente("");
    setFDesde(daysAgo(3));
    setFHasta(today());
    setFPago("");
    setFTipo("");
    setFArticulo("");
  };

  // ─────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ═══ FORMULARIO NUEVA VENTA ═══════════════════════════════════ */}
      <div className="card" style={{ position: "relative" }}>
        <div className="card-title">Nueva venta</div>

        {/* Overlay bloqueante cuando la caja está cerrada */}
        {!caja.abierta && (
          <div className="caja-overlay">
            <div className="caja-overlay-body">
              <div className="caja-overlay-icon">
                <Icon name="cash" size={28} />
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text1)", marginBottom: 6 }}>
                Caja cerrada
              </div>
              <div style={{ fontSize: 13, color: "var(--text3)", textAlign: "center", maxWidth: 300, lineHeight: 1.6 }}>
                No se pueden registrar ni modificar ventas con la caja cerrada.
                Abrila desde la sección <strong style={{ color: "var(--text2)" }}>Caja</strong> para continuar.
              </div>
            </div>
          </div>
        )}

        <div className="venta-layout">

          {/* ── Columna izquierda ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Cliente */}
            <div className="card" style={{ padding: "14px 16px" }}>
              <div className="card-title">Cliente</div>
              <div style={{ position: "relative" }}>
                <input
                  className="form-input"
                  placeholder="Buscar por nombre o DNI (vacío = Consumidor Final)"
                  value={clienteInput}
                  onChange={e => { setClienteInput(e.target.value); setClienteSelec(null); }}
                />
                {clienteInput && clienteSugs.length > 0 && (
                  <div style={{
                    position: "absolute", zIndex: 20, width: "100%", top: "100%", left: 0,
                    background: "var(--bg3)", border: "1px solid var(--border2)",
                    borderRadius: "var(--radius)", marginTop: 4,
                    maxHeight: 200, overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.4)"
                  }}>
                    {clienteSugs.map(c => (
                      <div
                        key={c.id}
                        onMouseDown={e => { e.preventDefault(); setClienteSelec(c); setClienteInput(c.nombre); }}
                        style={{
                          padding: "10px 14px", cursor: "pointer",
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          borderBottom: "1px solid var(--border)", fontSize: 13,
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = "rgba(124,111,239,0.1)"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      >
                        <div>
                          <div style={{ color: "var(--text1)", fontWeight: 500 }}>{c.nombre}</div>
                          <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 1 }}>DNI {c.dni} · {c.iva}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "var(--text3)" }}>
                  {clienteSelec
                    ? `Seleccionado: ${clienteSelec.nombre} — ${clienteSelec.iva}`
                    : "Consumidor Final (sin selección)"}
                </span>
                <button
                  className="btn btn-sm btn-ghost"
                  style={{ marginLeft: "auto" }}
                  onClick={() => setShowNuevoCliente(true)}
                >
                  <Icon name="plus" size={13} /> Nuevo cliente
                </button>
              </div>
            </div>

            {/* Configuración */}
            <div className="card" style={{ padding: "14px 16px" }}>
              <div className="card-title">Configuración</div>

              {/* Fila 1: lista, pago, tipo */}
              <div className="form-row form-row-3" style={{ gap: 10, marginBottom: 10 }}>
                <div className="form-group">
                  <label className="form-label">Lista de precios</label>
                  <select className="form-select" value={lista.id}
                    onChange={e => setLista(LISTAS.find(l => l.id === parseInt(e.target.value)))}>
                    {LISTAS.map(l => (
                      <option key={l.id} value={l.id}>
                        {l.nombre} {l.pct > 0 ? `(+${l.pct}%)` : "(base)"}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Forma de pago</label>
                  <select className="form-select" value={formaPago}
                    onChange={e => setFormaPago(e.target.value)}>
                    {FORMAS_PAGO.map(f => <option key={f}>{f}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Tipo de comprobante</label>
                  <select className="form-select" value={tipo} onChange={e => setTipo(e.target.value)}>
                    <option>Mostrador</option>
                    <option>Comprobante electrónico</option>
                  </select>
                </div>
              </div>

              {/* Fila 1b: tipo de factura + alícuota (solo si es comprobante electrónico) */}
              {tipo === "Comprobante electrónico" && (
                <div className="form-row form-row-2" style={{ gap: 10, marginBottom: 10 }}>
                  <div className="form-group">
                    <label className="form-label">Tipo de factura</label>
                    <select className="form-select" value={tipoFactura} onChange={e => setTipoFactura(e.target.value)}>
                      {TIPOS_FACTURA.map(t => <option key={t} value={t}>Factura {t}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Alícuota IVA</label>
                    <select className="form-select" value={alicuotaIva} onChange={e => setAlicuotaIva(e.target.value)}>
                      {ALICUOTAS_IVA.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {/* Fila 2: depósito + tipo de operación */}
              <div className="form-row form-row-2" style={{ gap: 10 }}>
                <div className="form-group">
                  <label className="form-label">Depósito de origen</label>
                  <select
                    className="form-select"
                    value={depositoId || ""}
                    onChange={e => { setDepositoId(parseInt(e.target.value)); setItems([]); }}
                  >
                    <option value="">— Seleccionar —</option>
                    {depositosNormales.map(d => (
                      <option key={d.id} value={d.id}>{d.nombre}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Tipo de operación</label>
                  <div className="segmented-control">
                    <button
                      type="button"
                      className={`segmented-btn${!esSeña ? " active" : ""}`}
                      onClick={() => setEsSeña(false)}
                    >
                      Venta
                    </button>
                    <button
                      type="button"
                      className={`segmented-btn${esSeña ? " active" : ""}`}
                      onClick={() => setEsSeña(true)}
                    >
                      Seña / Reserva
                    </button>
                  </div>
                </div>
              </div>

              {/* Info seña activa */}
              {esSeña && depositoId && (
                <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(124,111,239,0.08)", border: "1px solid rgba(124,111,239,0.2)", borderRadius: 6, fontSize: 12, color: "var(--accent2)", display: "flex", gap: 6, alignItems: "center" }}>
                  <Icon name="box" size={13}/>
                  Artículos reservados: <strong>{depositoNombre}</strong> → <strong>{depositoReserva?.nombre || "Reservas"}</strong>. Stock total sin cambios.
                </div>
              )}
              {esCtaCte && (
                <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 6, fontSize: 12, color: "var(--amber)" }}>
                  Cuenta corriente: se registrará saldo pendiente en el cliente seleccionado.
                </div>
              )}
            </div>

            {/* Productos */}
            <div className="card" style={{ padding: "14px 16px" }}>
              <div className="card-title">Productos</div>

              {/* Buscador */}
              <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "flex-start" }}>
              <div style={{ position: "relative", flex: 1 }}>
                <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text3)", pointerEvents: "none" }}>
                  <Icon name="search" size={14} />
                </div>
                <input
                  className="form-input"
                  style={{ paddingLeft: 32 }}
                  placeholder="Buscar por nombre, código o categoría..."
                  value={busqueda}
                  onChange={e => { setBusqueda(e.target.value); setShowResults(true); }}
                  onFocus={() => busqueda && setShowResults(true)}
                  onBlur={() => setTimeout(() => setShowResults(false), 150)}
                />
                {showResults && resultados.length > 0 && (
                  <div style={{
                    position: "absolute", zIndex: 20, width: "100%", top: "100%", left: 0,
                    background: "var(--bg3)", border: "1px solid var(--border2)",
                    borderRadius: "var(--radius)", marginTop: 4,
                    maxHeight: 220, overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.4)"
                  }}>
                    {resultados.map(p => (
                      <div
                        key={p.id}
                        onMouseDown={e => { e.preventDefault(); addItem(p); }}
                        style={{
                          padding: "10px 14px",
                          cursor: p.stockDeposito === 0 ? "not-allowed" : "pointer",
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          borderBottom: "1px solid var(--border)", fontSize: 13,
                          opacity: p.stockDeposito === 0 ? 0.5 : 1,
                        }}
                        onMouseEnter={e => { if (p.stockDeposito > 0) e.currentTarget.style.background = "rgba(124,111,239,0.1)"; }}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      >
                        <div>
                          <div style={{ color: "var(--text1)", fontWeight: 500 }}>{p.nombre}</div>
                          <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>{p.codigo} · {p.categoria}</div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                          <div style={{ color: "var(--accent2)", fontWeight: 600 }}>
                            {fmt(Math.round(p.precio * (1 + lista.pct / 100)))}
                          </div>
                          {p.stockDeposito === 0
                            ? <div style={{ fontSize: 11, color: "var(--red)" }}>Sin stock en depósito</div>
                            : <div style={{ fontSize: 11, color: "var(--text3)" }}>{depositoNombre}: {p.stockDeposito}</div>
                          }
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {/* Botón abrir catálogo completo */}
              <button
                className="btn btn-sm"
                style={{ flexShrink: 0, height: 38, whiteSpace: "nowrap" }}
                onClick={() => caja.abierta && setShowCatalogo(true)}
                disabled={!caja.abierta}
              >
                <Icon name="box" size={13} /> Catálogo
              </button>
              </div>{/* fin flex buscador */}

              {/* Carrito */}
              <div style={{
                background: "var(--bg3)", border: "1px solid var(--border)",
                borderRadius: "var(--radius)", overflow: "hidden", minHeight: 100
              }}>
                {items.length === 0 ? (
                  <div style={{ padding: 36, textAlign: "center", color: "var(--text3)", fontSize: 13 }}>
                    <Icon name="box" size={26} /><br />
                    Buscá un producto para agregar
                  </div>
                ) : (
                  items.map(item => (
                    <div key={item.productoId} style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "10px 14px", borderBottom: "1px solid var(--border)"
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: "var(--text1)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {item.nombre}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>{fmt(item.precio)} c/u</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        <button onClick={() => changeQty(item.productoId, -1)} className="qty-btn">−</button>
                        <span style={{ fontSize: 13, minWidth: 24, textAlign: "center", color: "var(--text1)", fontWeight: 600 }}>
                          {item.qty}
                        </span>
                        <button onClick={() => changeQty(item.productoId, +1)} className="qty-btn">+</button>
                      </div>
                      <div style={{ minWidth: 80, textAlign: "right", fontWeight: 600, color: "var(--accent2)", flexShrink: 0 }}>
                        {fmt(item.precio * item.qty)}
                      </div>
                      <button
                        onClick={() => removeItem(item.productoId)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--red)", padding: 4, borderRadius: 4, display: "flex", alignItems: "center", flexShrink: 0 }}
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
          {/* fin columna izquierda */}

          {/* ── Panel resumen ── */}
          <div className="venta-panel">
            <div>
              <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 16, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>
                Resumen
              </div>
              {[
                ["Cliente",   clienteFinal],
                ["Lista",     `${lista.nombre}${lista.pct > 0 ? ` (+${lista.pct}%)` : ""}`],
                ["Pago",      formaPago],
                ["Tipo",      tipo],
                ["Depósito",  depositoNombre],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--text2)", marginBottom: 6, gap: 8 }}>
                  <span style={{ flexShrink: 0 }}>{k}</span>
                  <span style={{ textAlign: "right", color: "var(--text1)" }}>{v}</span>
                </div>
              ))}
              {esSeña && (
                <div style={{ marginTop: 4, marginBottom: 6 }}>
                  <span className="badge" style={{ background: "rgba(124,111,239,0.15)", color: "var(--accent2)", fontSize: 11 }}>
                    SEÑA — Reserva a {depositoReserva?.nombre}
                  </span>
                </div>
              )}
              <div style={{ height: 1, background: "var(--border)", margin: "16px 0" }} />
              {tipo === "Comprobante electrónico" && (() => {
                const alic = ALICUOTAS_IVA.find(a => a.id === alicuotaIva)?.valor ?? 0.21;
                const { neto, iva } = calcularIva(subtotal, alic);
                return (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text3)", marginBottom: 4 }}>
                      <span>Neto</span><span>{fmt(neto)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text3)", marginBottom: 10 }}>
                      <span>IVA ({ALICUOTAS_IVA.find(a => a.id === alicuotaIva)?.label})</span><span>{fmt(iva)}</span>
                    </div>
                  </>
                );
              })()}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 14, color: "var(--text2)", fontWeight: 500 }}>Total</span>
                <span style={{ fontSize: 26, fontWeight: 700, color: "var(--accent2)" }}>
                  {fmt(subtotal)}
                </span>
              </div>
              {items.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 11, color: "var(--text3)", textAlign: "right" }}>
                  {items.reduce((a, i) => a + i.qty, 0)} artículo{items.reduce((a, i) => a + i.qty, 0) !== 1 ? "s" : ""}
                </div>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: "auto", paddingTop: 20 }}>
              <button className="btn btn-primary" onClick={confirmar} style={{ width: "100%", justifyContent: "center", background: esSeña ? "var(--accent)" : undefined }}>
                <Icon name="check" size={15} /> {esSeña ? "Registrar seña" : "Confirmar venta"}
              </button>
              <button className="btn" onClick={limpiarForm} style={{ width: "100%", justifyContent: "center" }}>
                Limpiar
              </button>
            </div>
          </div>

        </div>
      </div>
      {/* fin formulario */}

      {/* ═══ HISTORIAL DE VENTAS ══════════════════════════════════════ */}
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Historial de ventas</div>
            {fTipo && (
              <span className={`badge ${fTipo === "Comprobante" ? "badge-ok" : "badge-warn"}`} style={{ fontSize: 10 }}>
                {fTipo}
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, color: "var(--text3)" }}>
              {ventasFiltradas.length} resultado{ventasFiltradas.length !== 1 ? "s" : ""}
            </span>
            <button
              className="btn btn-sm"
              style={{ color: "var(--accent2)", borderColor: "rgba(124,111,239,0.3)" }}
              onClick={() => caja.abierta && setShowCambioArt(true)}
              disabled={!caja.abierta}
              title={!caja.abierta ? "Abrí la caja para registrar cambios" : ""}
            >
              <Icon name="tag" size={13} /> Cambio de artículo
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div className="filtros-grid">
          <div className="form-group">
            <label className="form-label">Usuario</label>
            <input className="form-input" placeholder="Todos" value={fUsuario} onChange={e => setFUsuario(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Cliente</label>
            <input className="form-input" placeholder="Todos" value={fCliente} onChange={e => setFCliente(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Desde</label>
            <input type="date" className="form-input" value={fDesde} onChange={e => setFDesde(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Hasta</label>
            <input type="date" className="form-input" value={fHasta} onChange={e => setFHasta(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Forma de pago</label>
            <select className="form-select" value={fPago} onChange={e => setFPago(e.target.value)}>
              <option value="">Todas</option>
              {FORMAS_PAGO.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Artículo</label>
            <input className="form-input" placeholder="Buscar..." value={fArticulo} onChange={e => setFArticulo(e.target.value)} />
          </div>
          <button
            className="btn btn-sm"
            onClick={limpiarFiltros}
            title="Limpiar filtros"
            style={{ alignSelf: "flex-end", height: 38 }}
          >
            <Icon name="close" size={13} /> Limpiar
          </button>
        </div>

        {/* Tabla con scroll */}
        <div className="hist-table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Fecha</th>
                <th>Usuario</th>
                <th>Cliente</th>
                <th>Tipo</th>
                <th>Depósito</th>
                <th>Pago</th>
                <th>Artículos</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {ventasFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: "center", color: "var(--text3)", padding: 40 }}>
                    No hay ventas en el rango seleccionado
                  </td>
                </tr>
              ) : (
                ventasFiltradas.map(v => (
                  <tr key={v.id} style={v.tipo === "Mostrador" ? { borderLeft: "2px solid rgba(245,158,11,0.35)" } : {}}>
                    <td className="mono" style={{ color: "var(--text3)", fontSize: 12 }}>#{v.id}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{v.fecha}</td>
                    <td style={{ color: "var(--text2)" }}>{v.usuario || "—"}</td>
                    <td style={{ color: "var(--text1)" }}>{v.cliente}</td>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        {v.tipo === "Comprobante electrónico"
                          ? <span className="badge badge-ok" style={{ fontSize: 10 }}>Comprobante</span>
                          : <span className="badge badge-warn" style={{ fontSize: 10 }}>Mostrador</span>
                        }
                        {v.tipoFactura && (
                          <span style={{ fontSize: 10, color: "var(--text3)" }}>Fact. {v.tipoFactura}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        <span style={{ fontSize: 12, color: "var(--text2)" }}>{v.depositoNombre || "—"}</span>
                        {v.esSeña && <span className="badge" style={{ background: "rgba(124,111,239,0.15)", color: "var(--accent2)", fontSize: 10 }}>SEÑA</span>}
                      </div>
                    </td>
                    <td>
                      {v.formaPago === "Cuenta Corriente"
                        ? <span className="badge badge-warn">Cta. Cte.</span>
                        : <span className="badge badge-blue">{v.formaPago}</span>}
                    </td>
                    <td style={{ fontSize: 12, color: "var(--text3)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {v.items?.map(i => `${i.qty}× ${i.nombre}`).join(", ") || "—"}
                    </td>
                    <td style={{ color: "var(--accent2)", fontWeight: 600, whiteSpace: "nowrap" }}>{fmt(v.total)}</td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button className="btn btn-sm" onClick={() => setShowTicket(v)}>Ver</button>
                        {puedeEditar(v) && (
                          <button className="btn btn-sm" onClick={() => setEditarVenta(v)} style={{ color: "var(--accent2)", borderColor: "rgba(124,111,239,0.3)" }}>
                            Editar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══ HISTORIAL DE NOTAS DE CRÉDITO / DÉBITO ═══════════════════ */}
      {(cambiosArticulo && cambiosArticulo.length > 0) && (
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Notas de crédito / débito</div>
            <span style={{ fontSize: 12, color: "var(--text3)" }}>
              {cambiosArticulo.length} comprobante{cambiosArticulo.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="hist-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>N°</th>
                  <th>Tipo</th>
                  <th>Fecha</th>
                  <th>Usuario</th>
                  <th>Cliente</th>
                  <th>Venta original</th>
                  <th>Cambio</th>
                  <th>Forma de pago</th>
                  <th>Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {cambiosArticulo.slice().sort((a, b) => b.id - a.id).map(c => {
                  const tipo = c.diferencia < 0 ? "NC" : c.diferencia > 0 ? "ND" : "CA";
                  const color = c.diferencia < 0 ? "var(--amber)" : c.diferencia > 0 ? "var(--blue)" : "var(--green)";
                  return (
                    <tr key={c.id}>
                      <td className="mono" style={{ color: "var(--text3)", fontSize: 12 }}>{c.nro}</td>
                      <td>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
                          background: `color-mix(in srgb, ${color} 14%, transparent)`, color,
                        }}>
                          {tipo}
                        </span>
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>{c.fecha}</td>
                      <td style={{ color: "var(--text2)" }}>{c.usuario || "—"}</td>
                      <td style={{ color: "var(--text1)" }}>{c.ventaOriginalCliente}</td>
                      <td className="mono" style={{ color: "var(--text3)", fontSize: 12 }}>#{c.ventaOriginalId}</td>
                      <td style={{ fontSize: 12, color: "var(--text3)", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.itemViejo?.nombre} → {c.productoNuevo?.nombre}
                      </td>
                      <td>
                        {c.diferencia === 0 ? (
                          <span style={{ fontSize: 12, color: "var(--text3)" }}>—</span>
                        ) : c.diferencia > 0 ? (
                          c.formaPagoDif === "Cuenta Corriente"
                            ? <span className="badge badge-warn">Cta. Cte.</span>
                            : <span className="badge badge-blue">{c.formaPagoDif}</span>
                        ) : (
                          <span className="badge" style={{ background: "rgba(245,158,11,0.12)", color: "var(--amber)" }}>
                            {c.ventaOriginalClienteId ? "A favor (cta. cte.)" : "Devuelto en efectivo"}
                          </span>
                        )}
                      </td>
                      <td style={{ fontWeight: 600, color, whiteSpace: "nowrap" }}>
                        {c.diferencia === 0 ? fmt(0) : `${c.diferencia < 0 ? "−" : "+"}${fmt(Math.abs(c.diferencia))}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modales */}
      {editarVenta && (
        <ModalEditarVenta
          venta={editarVenta}
          clientes={clientes}
          setClientes={setClientes}
          usuarioActivo={usuarioActivo}
          onGuardar={(ventaActualizada) => {
            setVentas(prev => prev.map(v => v.id === ventaActualizada.id ? ventaActualizada : v));
            setEditarVenta(null);
          }}
          onClose={() => setEditarVenta(null)}
        />
      )}
      {showCatalogo && (
        <ModalBuscadorProductos
          productos={productos}
          lista={lista}
          depositoId={depositoId}
          depositoNombre={depositoNombre}
          stockDepositos={stockDepositos}
          onAgregar={addItem}
          onClose={() => setShowCatalogo(false)}
        />
      )}
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
      {showTicket && (
        <ModalTicket venta={showTicket} onClose={() => setShowTicket(null)} />
      )}

      {showCambioArt && (
        <ModalCambioArticulo
          ventas={ventas}
          productos={productos}
          setProductos={setProductos}
          stockDepositos={stockDepositos}
          setStockDepositos={setStockDepositos}
          depositos={depositos}
          usuarioActivo={usuarioActivo}
          cambiosArticulo={cambiosArticulo}
          onClose={() => setShowCambioArt(false)}
          onConfirmar={(data) => {
            const nro = `${data.diferencia < 0 ? "NC" : data.diferencia > 0 ? "ND" : "CA"}-${String((cambiosArticulo?.length || 0) + 1).padStart(4, "0")}`;
            const registro = { ...data, id: (cambiosArticulo?.length || 0) + 1, nro, estado: "emitida" };

            setCambiosArticulo?.(prev => [...(prev || []), registro]);

            // Si hay nota de crédito y el cliente tiene cuenta corriente, se descuenta del saldo
            if (data.diferencia < 0 && data.ventaOriginalClienteId && setPagosCtaCte) {
              setPagosCtaCte(prev => [...(prev || []), {
                id: Date.now(),
                clienteId: data.ventaOriginalClienteId,
                fecha: data.fecha,
                monto: Math.abs(data.diferencia),
                observacion: `Nota de crédito ${nro} — cambio de artículo`,
              }]);
            }

            setShowCambioArt(false);
            setComprobanteCambio(registro);
          }}
        />
      )}

      {comprobanteCambio && (
        <ModalComprobanteCambio
          cambio={comprobanteCambio}
          onClose={() => setComprobanteCambio(null)}
        />
      )}

    </div>
  );
}
