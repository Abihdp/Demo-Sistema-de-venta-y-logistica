import { useState, useMemo, useEffect } from "react";
import { Modal } from "../ui/Modal.jsx";
import Icon from "../ui/Icon.jsx";
import { useToast } from "../ui/Toast.jsx";
import { fmt, today, precioPorLista, coincideBusqueda } from "../../utils/helpers.js";
import { FORMAS_PAGO } from "../../constants/index.js";

export default function ModalNuevaReserva({
  clientes, productos, depositos = [], stockDepositos = [],
  listas: listasProp = [], configPrecios = {}, rubros = [], proveedores = [],
  reservas = [], usuarioActivo, crearReserva, onClose,
}) {
  const { toast } = useToast();
  const margenBase = configPrecios?.margenBase ?? 0;
  const depositosSeleccionables = depositos.filter(d => d.tipo !== "reserva" && d.tipo !== "transito");

  // Listas eliminadas (activa:false) no deben poder elegirse para reservas nuevas.
  const listas = listasProp.filter(l => l.activa !== false);

  const listaDefault = listas.length > 0 ? listas.reduce((a, b) => b.pct > a.pct ? b : a) : null;

  const [clienteInput, setClienteInput] = useState("");
  const [clienteSelec, setClienteSelec] = useState(null);
  const [listaId, setListaId] = useState(listaDefault?.id ?? "");
  const [depositoId, setDepositoId] = useState(depositosSeleccionables[0]?.id ?? "");
  const [items, setItems] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [observacion, setObservacion] = useState("");

  const [señaMonto, setSeñaMonto] = useState("");
  const [señaFormaPago, setSeñaFormaPago] = useState(FORMAS_PAGO[0]);
  const [señaObservacion, setSeñaObservacion] = useState("");
  const [guardando, setGuardando] = useState(false);

  const listaSeleccionada = listas.find(l => l.id === Number(listaId)) || listaDefault;

  // Al elegir el medio de pago de la seña, la lista se auto-selecciona si ese
  // medio fue asignado a alguna lista en "Gestionar listas" (mismo criterio
  // que usa PageVentas.jsx para ventas con seña).
  const listaParaFormaPago = (forma) =>
    listas.find(l => (l.formasPago || []).length > 0 && (l.formasPago || []).includes(forma)) || null;
  const listaFijadaPorPago = listaParaFormaPago(señaFormaPago) !== null;

  useEffect(() => {
    const asignada = listaParaFormaPago(señaFormaPago);
    if (asignada) setListaId(asignada.id);
  }, [señaFormaPago]); // eslint-disable-line react-hooks/exhaustive-deps

  const clienteSugs = useMemo(() => {
    if (!clienteInput) return [];
    const q = clienteInput.toLowerCase();
    const dni = clienteInput.replace(/[.\-\s]/g, "");
    return clientes.filter(c =>
      c.nombre.toLowerCase().includes(q) || c.dni?.replace(/[.\-\s]/g, "").includes(dni)
    ).slice(0, 6);
  }, [clientes, clienteInput]);

  const stockEnDeposito = (productoId) => {
    if (!depositoId) return 0;
    return stockDepositos.find(s => s.productoId === productoId && s.depositoId === Number(depositoId))?.cantidad ?? 0;
  };

  const resultados = useMemo(() => {
    if (!busqueda.trim()) return [];
    const q = busqueda.toLowerCase();
    return productos
      .filter(p => (p.tipo || "simple") !== "madre" && p.activo !== false)
      .filter(p => coincideBusqueda([p.nombre, p.codigo].join(" "), q))
      .slice(0, 8);
  }, [busqueda, productos]);

  const precioDe = (prod) => listaSeleccionada ? precioPorLista(prod, listaSeleccionada, margenBase, rubros, proveedores) : 0;

  // Recalcular precios de los items ya agregados cuando cambia la lista
  // (manualmente o por auto-selección según medio de pago de la seña).
  useEffect(() => {
    setItems(prev => prev.map(i => {
      const prod = productos.find(p => p.id === i.productoId);
      if (!prod) return i;
      const precio = precioDe(prod);
      return { ...i, precio, subtotal: precio * i.qty };
    }));
  }, [listaSeleccionada]); // eslint-disable-line react-hooks/exhaustive-deps

  const addItem = (prod) => {
    setItems(prev => {
      const ex = prev.find(i => i.productoId === prod.id);
      if (ex) return prev.map(i => i.productoId === prod.id ? { ...i, qty: i.qty + 1, subtotal: (i.qty + 1) * i.precio } : i);
      const precio = precioDe(prod);
      return [...prev, { productoId: prod.id, nombre: prod.nombre, qty: 1, precio, subtotal: precio }];
    });
    setBusqueda("");
    setShowResults(false);
  };

  const changeQty = (productoId, delta) => {
    setItems(prev => prev.map(i => {
      if (i.productoId !== productoId) return i;
      const nq = i.qty + delta;
      if (nq <= 0) return null;
      return { ...i, qty: nq, subtotal: nq * i.precio };
    }).filter(Boolean));
  };

  const removeItem = (id) => setItems(prev => prev.filter(i => i.productoId !== id));

  const total = items.reduce((a, i) => a + i.subtotal, 0);
  const señaNum = Number(señaMonto) || 0;
  const saldoPendiente = Math.max(0, total - señaNum);

  const confirmar = async () => {
    if (!clienteSelec) { toast("Seleccioná un cliente para la reserva.", "error"); return; }
    if (items.length === 0) { toast("Agregá al menos un producto.", "error"); return; }
    if (!depositoId) { toast("Seleccioná el depósito de origen.", "error"); return; }
    if (!señaMonto.toString().trim() || isNaN(señaNum) || señaNum <= 0) { toast("Ingresá el monto de la seña inicial.", "error"); return; }
    if (señaNum > total) { toast(`La seña (${fmt(señaNum)}) no puede ser mayor al total de la reserva (${fmt(total)}).`, "error"); return; }

    const nro = `RES-${String((reservas?.length || 0) + 1).padStart(4, "0")}`;
    const depositoNombre = depositos.find(d => d.id === Number(depositoId))?.nombre || "";

    setGuardando(true);
    try {
      const nueva = await crearReserva({
        nro,
        fecha: today(),
        clienteId: clienteSelec.id,
        cliente: clienteSelec.nombre,
        lista: listaSeleccionada?.nombre || "",
        items: items.map(i => ({ productoId: i.productoId, nombre: i.nombre, qty: i.qty, precio: i.precio, subtotal: i.subtotal })),
        total,
        depositoId: Number(depositoId),
        depositoNombre,
        usuario: usuarioActivo?.nombre || "",
        observacion: observacion.trim(),
        periodo: today().slice(0, 7),
      }, {
        fecha: today(),
        monto: señaNum,
        formaPago: señaFormaPago,
        observacion: señaObservacion.trim(),
        usuario: usuarioActivo?.nombre || "",
      });
      toast(`Reserva ${nueva.nro} creada. Seña de ${fmt(señaNum)} registrada.`, "success");
      onClose();
    } catch (err) {
      toast(err.message || "Error al crear la reserva.", "error");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal onClose={onClose} size="modal-lg">
      <div className="modal-header">
        <div className="modal-title">Nueva reserva</div>
        <button className="close-btn" onClick={onClose}><Icon name="close" size={16}/></button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Cliente */}
        <div className="form-group" style={{ position: "relative" }}>
          <label className="form-label">Cliente</label>
          <input
            className="form-input"
            placeholder="Buscar por nombre o DNI..."
            value={clienteSelec ? clienteSelec.nombre : clienteInput}
            onChange={e => { setClienteInput(e.target.value); setClienteSelec(null); }}
          />
          {!clienteSelec && clienteInput && clienteSugs.length > 0 && (
            <div style={{
              position: "absolute", zIndex: 20, width: "100%", top: "100%", left: 0,
              background: "var(--bg3)", border: "1px solid var(--border2)", borderRadius: "var(--radius)",
              marginTop: 4, maxHeight: 200, overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            }}>
              {clienteSugs.map(c => (
                <div
                  key={c.id}
                  onMouseDown={e => { e.preventDefault(); setClienteSelec(c); setClienteInput(""); }}
                  style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid var(--border)", fontSize: 13 }}
                  onMouseEnter={e => e.currentTarget.style.background = "color-mix(in srgb, var(--accent) 10%, transparent)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <div style={{ color: "var(--text1)", fontWeight: 500 }}>{c.nombre}</div>
                  <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 1 }}>DNI {c.dni}</div>
                </div>
              ))}
            </div>
          )}
          {clienteSelec && (
            <button type="button" className="btn btn-sm btn-ghost" style={{ marginTop: 4 }}
              onClick={() => { setClienteSelec(null); setClienteInput(""); }}>
              <Icon name="close" size={11}/> Cambiar cliente
            </button>
          )}
        </div>

        {/* Lista + Depósito */}
        <div className="form-row form-row-2">
          <div className="form-group">
            <label className="form-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Lista de precios</span>
              {listaFijadaPorPago && (
                <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "var(--text3)", fontSize: 11 }}>
                  fijada por medio de pago
                </span>
              )}
            </label>
            <select
              className="form-select"
              value={listaId}
              disabled={listaFijadaPorPago}
              style={listaFijadaPorPago ? { opacity: 0.7, cursor: "not-allowed" } : undefined}
              onChange={e => setListaId(Number(e.target.value))}>
              {listas.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Depósito de origen</label>
            <select className="form-select" value={depositoId} onChange={e => { setDepositoId(e.target.value); setItems([]); }}>
              <option value="">— Seleccionar —</option>
              {depositosSeleccionables.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
          </div>
        </div>

        {/* Buscador de productos */}
        <div className="form-group" style={{ position: "relative" }}>
          <label className="form-label">Agregar producto</label>
          <input
            className="form-input"
            placeholder="Buscar por nombre o código..."
            value={busqueda}
            onChange={e => { setBusqueda(e.target.value); setShowResults(true); }}
            onFocus={() => busqueda && setShowResults(true)}
            onBlur={() => setTimeout(() => setShowResults(false), 150)}
          />
          {showResults && resultados.length > 0 && (
            <div style={{
              position: "absolute", zIndex: 20, width: "100%", top: "100%", left: 0,
              background: "var(--bg3)", border: "1px solid var(--border2)", borderRadius: "var(--radius)",
              marginTop: 4, maxHeight: 220, overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            }}>
              {resultados.map(p => (
                <div
                  key={p.id}
                  onMouseDown={e => { e.preventDefault(); addItem(p); }}
                  style={{ padding: "10px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", fontSize: 13 }}
                  onMouseEnter={e => e.currentTarget.style.background = "color-mix(in srgb, var(--accent) 10%, transparent)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <div>
                    <div style={{ color: "var(--text1)", fontWeight: 500 }}>{p.nombre}</div>
                    <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>
                      {p.codigo} · Stock en depósito: {stockEnDeposito(p.id)}
                    </div>
                  </div>
                  <div style={{ color: "var(--accent2)", fontWeight: 600 }}>{fmt(precioDe(p))}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Items */}
        <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
          {items.length === 0 ? (
            <div style={{ padding: 30, textAlign: "center", color: "var(--text3)", fontSize: 13 }}>
              <Icon name="box" size={26}/><br/>Sin productos agregados
            </div>
          ) : items.map(item => (
            <div key={item.productoId} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: "var(--text1)", fontWeight: 500 }}>{item.nombre}</div>
                <div style={{ fontSize: 11, color: "var(--text3)" }}>{fmt(item.precio)} c/u</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <button className="qty-btn" onClick={() => changeQty(item.productoId, -1)}>−</button>
                <span style={{ fontSize: 13, minWidth: 24, textAlign: "center", color: "var(--text1)", fontWeight: 600 }}>{item.qty}</span>
                <button className="qty-btn" onClick={() => changeQty(item.productoId, +1)}>+</button>
              </div>
              <div style={{ minWidth: 80, textAlign: "right", fontWeight: 600, color: "var(--accent2)", flexShrink: 0 }}>{fmt(item.subtotal)}</div>
              <button onClick={() => removeItem(item.productoId)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--red)", padding: 4, flexShrink: 0 }}>
                <Icon name="trash" size={14}/>
              </button>
            </div>
          ))}
        </div>

        <div className="form-group">
          <label className="form-label">Observación <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "var(--text3)" }}>(opcional)</span></label>
          <input className="form-input" value={observacion} onChange={e => setObservacion(e.target.value)} placeholder="Ej: Cliente retira la semana que viene" />
        </div>

        <div style={{ height: 1, background: "var(--border)" }} />

        {/* Primera seña */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text1)", marginBottom: 10 }}>Seña inicial</div>
          <div className="form-row form-row-2" style={{ marginBottom: 10 }}>
            <div className="form-group">
              <label className="form-label">Monto de la seña</label>
              <input className="form-input" type="number" min="0" placeholder="0" value={señaMonto} onChange={e => setSeñaMonto(e.target.value)} />
              {total > 0 && (
                <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 3 }}>
                  Saldo pendiente: <strong style={{ color: saldoPendiente > 0 ? "var(--amber)" : "var(--green)" }}>{fmt(saldoPendiente)}</strong>
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Forma de pago</label>
              <select className="form-select" value={señaFormaPago} onChange={e => setSeñaFormaPago(e.target.value)}>
                {FORMAS_PAGO.filter(f => f !== "Cuenta Corriente").map(f => <option key={f}>{f}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Observación de la seña <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "var(--text3)" }}>(opcional)</span></label>
            <input className="form-input" value={señaObservacion} onChange={e => setSeñaObservacion(e.target.value)} />
          </div>
        </div>

        {/* Resumen */}
        {items.length > 0 && (
          <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "12px 16px" }}>
            {[
              ["Total reserva", fmt(total), "var(--text1)"],
              ["Seña inicial", fmt(señaNum), "var(--green)"],
              ["Saldo pendiente", fmt(saldoPendiente), saldoPendiente > 0 ? "var(--amber)" : "var(--green)"],
            ].map(([k, v, c]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                <span style={{ color: "var(--text2)" }}>{k}</span>
                <span style={{ fontWeight: 700, color: c }}>{v}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="modal-footer">
        <button className="btn btn-sm btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-sm btn-primary" onClick={confirmar} disabled={guardando}>
          <Icon name="check" size={13}/> {guardando ? "Guardando..." : "Confirmar reserva"}
        </button>
      </div>
    </Modal>
  );
}
