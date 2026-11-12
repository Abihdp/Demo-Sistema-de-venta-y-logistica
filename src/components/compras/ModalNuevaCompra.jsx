import { useState, useMemo } from "react";
import { saldoDeFuente, opcionesFuente, esFuenteTesoreria, medioInvalidoParaFuente, MEDIOS_POR_FUENTE } from "../../utils/tesoreria.js";
import Icon from "../ui/Icon.jsx";
import { Modal } from "../ui/Modal.jsx";
import { fmt, today, mesLabel, periodoCerrado, normalizarCodigoEscaneado, coincideBusqueda } from "../../utils/helpers.js";
import { useToast } from "../ui/Toast.jsx";
import { FORMAS_PAGO_COMPRA, ALICUOTAS_IVA, TIPOS_FACTURA_COMPRA } from "../../constants/index.js";
import ModalNuevoProveedor from "./ModalNuevoProveedor.jsx";
import ModalProducto from "../productos/ModalProducto.jsx";

// Mensaje cuando la forma de pago no corresponde a la fuente elegida — mismo
// criterio que ModalNuevoGasto.jsx. Caja Salón solo sabe descontar Efectivo o
// Transferencia (es lo único que el panel de Retiro de Caja maneja).
const MSG_MEDIO = {
  caja_salon:        (fp) => `Caja Salón solo puede descontar Efectivo o Transferencia. Un pago en ${fp} no sale de la plata de la caja.`,
  tesoreria:         (fp) => `El efectivo de Tesorería solo paga en Efectivo o Cheque. Para un pago en ${fp}, elegí la cuenta de donde sale.`,
  cta_transferencia: (fp) => `Desde la cuenta de transferencias solo se paga por Transferencia, no en ${fp}.`,
  banco:             ()   => `Si pagás en efectivo, elegí "Caja Salón" o "Efectivo de Tesorería".`,
};

export default function ModalNuevaCompra({ proveedores, agregarProveedor, productos, agregarProducto, depositos = [], stockDepositos = [], actualizarStockDepositoMultiple, onClose, onConfirm, onEditar, editandoCompra, fromRemito, tipoInicial, periodosCerrados = [], cajaAbierta = false, saldosTesoreria = null, nombresCuentas = {} }) {
  const { toast } = useToast();
  const esEdicion = Boolean(editandoCompra);
  const [tipo, setTipo] = useState(
    editandoCompra?.tipo || (fromRemito ? "Factura" : (tipoInicial || "Factura"))
  );
  const [nro, setNro]                       = useState(editandoCompra?.nro || "");
  const [proveedorInput, setProveedorInput] = useState(
    editandoCompra?.proveedor || (fromRemito ? fromRemito.proveedor : "")
  );
  const [proveedorSel, setProveedorSel]     = useState(
    editandoCompra?.proveedorId
      ? (proveedores.find(p => p.id === editandoCompra.proveedorId) || null)
      : null
  );
  const [formaPago, setFormaPago]           = useState(editandoCompra?.formaPago || FORMAS_PAGO_COMPRA[0]);
  const [fuente, setFuente]                 = useState(editandoCompra?.fuente || "caja_salon");
  const [tipoFactura, setTipoFactura]       = useState(editandoCompra?.tipoFactura || "B");
  const [alicuotaIva, setAlicuotaIva]       = useState(editandoCompra?.alicuotaIva || 21);
  const [busqueda, setBusqueda]             = useState("");
  const [showResults, setShowResults]       = useState(false);
  const [items, setItems]                   = useState(() => {
    if (editandoCompra) return editandoCompra.items.map(i => ({ ...i, id: Date.now() + Math.random() }));
    if (fromRemito)     return fromRemito.items.map(i => ({ ...i, id: Date.now() + Math.random() }));
    return [];
  });
  const [showNuevoProv, setShowNuevoProv]   = useState(false);
  const [showNuevoProd, setShowNuevoProd]   = useState(false);
  const [depositoDestino, setDepositoDestino] = useState(
    editandoCompra?.depositoId || fromRemito?.depositoId || (depositos.length === 1 ? depositos[0].id : "")
  );
  // Compra "sin detalle": solo se registra el importe del comprobante (sin
  // productos). Impacta en totales del mes, cta. cte. del proveedor y
  // caja/tesorería, pero NO mueve stock ni costos. Solo para facturas nuevas.
  const [sinDetalle, setSinDetalle]         = useState(false);
  const [importeTotal, setImporteTotal]     = useState("");
  const [descripcion, setDescripcion]       = useState("");

  const provSugs = useMemo(() =>
    proveedores.filter(p => p.nombre.toLowerCase().includes(proveedorInput.toLowerCase())).slice(0, 5),
    [proveedores, proveedorInput]
  );

  const resultados = useMemo(() => {
      if (!busqueda.trim()) return [];
      if (!proveedorSel) return []; // sin proveedor no muestra nada
      const q = normalizarCodigoEscaneado(busqueda.toLowerCase());
      return productos.filter(p =>
        (p.tipo || "simple") !== "madre" &&
        p.proveedorId === proveedorSel.id &&
        coincideBusqueda([p.nombre, p.codigo, p.rubro || p.categoria || ""].join(" "), q)
      ).slice(0, 8);
    }, [busqueda, productos, proveedorSel]);

  const addItem = (prod) => {
    setItems(prev => {
      const ex = prev.find(i => i.productoId === prod.id);
      if (ex) return prev.map(i => i.productoId === prod.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { id: Date.now(), productoId: prod.id, nombre: prod.nombre, qty: 1, costo: prod.costo }];
    });
    setBusqueda("");
    setShowResults(false);
  };

  const changeQty    = (id, d) => setItems(prev => prev.map(i => i.id === id ? { ...i, qty: Math.max(1, i.qty + d) } : i));
  const changeCosto  = (id, v) => setItems(prev => prev.map(i => i.id === id ? { ...i, costo: parseFloat(v) || 0 } : i));
  const removeItem   = (id)    => setItems(prev => prev.filter(i => i.id !== id));

  const handleNuevoProducto = async (data) => {
    try {
      const nuevo = await agregarProducto({ ...data, stock: 0, activo: true });
      addItem(nuevo);
      setShowNuevoProd(false);
    } catch (err) {
      toast(err.message || "Error al guardar el producto.", "error");
    }
  };

  // `costo` de cada ítem se carga sin IVA (ver ModalProducto.jsx: "Costo
  // (compra, sin IVA)"), así que `subtotalNeto` ya es el neto — el IVA se
  // suma encima, nunca se resta (a diferencia del precio de venta al público,
  // que sí viene con el IVA incluido).
  const subtotalNeto   = items.reduce((a, i) => a + i.qty * i.costo, 0);
  const proveedorFinal = proveedorSel ? proveedorSel.nombre : (proveedorInput || "Sin proveedor");
  const nroFinal       = nro || (tipo === "Factura" ? "0001-00000000" : "R-0001-00000000");
  const esFactura      = tipo === "Factura";
  const puedeSinDetalle = esFactura && !fromRemito && !esEdicion;
  const esSinDetalle   = puedeSinDetalle && sinDetalle;
  // Sin detalle se carga el TOTAL del comprobante (lo que efectivamente se
  // pagó) y el neto/IVA se desglosan hacia atrás.
  // Redondeo a centavos: así total = neto + iva exacto y nunca da IVA negativo
  // (p. ej. exento con importe con centavos).
  const r2             = (n) => Math.round(n * 100) / 100;
  const importeNum     = r2(parseFloat(importeTotal) || 0);
  const neto           = esSinDetalle ? r2(importeNum / (1 + alicuotaIva / 100)) : subtotalNeto;
  const iva            = esSinDetalle ? r2(importeNum - neto) : (esFactura ? Math.round(subtotalNeto * (alicuotaIva / 100)) : 0);
  const total          = esSinDetalle ? importeNum : (esFactura ? neto + iva : subtotalNeto);

  // La fuente de fondos solo aplica cuando se factura (el remito no mueve
  // plata) y cuando el pago no queda en cuenta corriente con el proveedor
  // (ahí no hay salida de caja/tesorería inmediata, se paga después con una
  // Orden de Pago).
  const mostrarFuente = esFactura && formaPago !== "Cuenta Corriente Proveedor";
  const FUENTES = opcionesFuente(nombresCuentas);
  // Al cambiar de fuente, si la forma de pago no corresponde, se pasa a la
  // primera válida (ej. Cuenta Transferencia → Transferencia).
  const elegirFuente = (f) => {
    setFuente(f);
    if (medioInvalidoParaFuente(f, formaPago)) {
      setFormaPago(f === "banco" ? "Transferencia" : MEDIOS_POR_FUENTE[f][0]);
    }
  };
  const warnCajaCerrada       = mostrarFuente && fuente === "caja_salon" && !cajaAbierta;
  const warnMedio             = mostrarFuente && medioInvalidoParaFuente(fuente, formaPago);
  // El saldo a validar es el de la cuenta elegida.
  const usaTesoreria          = mostrarFuente && esFuenteTesoreria(fuente);
  const { disponible: saldoTesoreria, donde: dondeSaldo } = saldoDeFuente(saldosTesoreria, fuente, formaPago, nombresCuentas);
  const warnSaldoInsuficiente = usaTesoreria && total > 0 && total > saldoTesoreria;

  const buildCompra = () => {
    if (esSinDetalle) {
      return {
        tipo, nro: nroFinal, fecha: today(),
        proveedor: proveedorFinal, proveedorId: proveedorSel ? proveedorSel.id : null, formaPago, total,
        estado: "recibida",
        items: [],
        sinDetalle: true,
        descripcion: descripcion.trim() || null,
        remitoOrigen: null,
        depositoId: null,
        depositoNombre: "",
        stockActualizado: false,
        tipoFactura, alicuotaIva, neto, iva,
        ...(mostrarFuente ? { fuente } : { fuente: null }),
      };
    }
    const depNombre = depositoDestino
      ? (depositos.find(d => d.id === depositoDestino)?.nombre || "")
      : "";
    return {
      tipo, nro: nroFinal, fecha: esEdicion ? (editandoCompra.fecha || today()) : today(),
      proveedor: proveedorFinal, proveedorId: proveedorSel ? proveedorSel.id : (editandoCompra?.proveedorId ?? fromRemito?.proveedorId ?? null), formaPago, total,
      estado: esEdicion ? editandoCompra.estado : (tipo === "Factura" ? "recibida" : "pendiente_factura"),
      items: items.map(i => ({ nombre: i.nombre, qty: i.qty, costo: i.costo, productoId: i.productoId })),
      remitoOrigen: fromRemito ? fromRemito.nro : (editandoCompra?.remitoOrigen ?? null),
      depositoId: depositoDestino || null,
      depositoNombre: depNombre,
      stockActualizado: esEdicion ? editandoCompra.stockActualizado : true,
      ...(esFactura ? { tipoFactura, alicuotaIva, neto, iva } : {}),
      ...(mostrarFuente ? { fuente } : { fuente: null }),
    };
  };

  const confirmar = () => {
    if (esSinDetalle) {
      if (importeNum <= 0) { toast("Ingresá el importe total de la factura.", "error"); return; }
      if (!proveedorSel)   { toast("Seleccioná el proveedor.", "error"); return; }
    } else {
      if (items.length === 0) { toast("Agregá al menos un producto.", "error"); return; }
      if (depositos.length > 0 && !depositoDestino) { toast("Seleccioná el depósito donde entra la mercadería.", "error"); return; }
    }
    const cerrado = periodoCerrado(today(), periodosCerrados);
    if (cerrado) { toast(`El período ${mesLabel(cerrado.mes)} está cerrado. Pedile al administrador que lo reabra desde Tesorería → Cierre de Período.`, "warning"); return; }
    if (warnCajaCerrada)       { toast("La caja está cerrada. Elegí otra cuenta o abrí la caja antes de facturar.", "error"); return; }
    if (warnMedio)             { toast(MSG_MEDIO[fuente](formaPago), "error"); return; }
    if (warnSaldoInsuficiente) { toast(`Saldo insuficiente en ${dondeSaldo}.`, "error"); return; }

    if (esEdicion) {
      onEditar(buildCompra());
      return;
    }

    // Actualizar stock de depósitos en Supabase
    const yaActualizóStock = fromRemito?.stockActualizado === true;
    if (!esSinDetalle && !yaActualizóStock && depositoDestino && actualizarStockDepositoMultiple) {
      const cambios = items.filter(i => i.productoId).map(item => {
        const sd = stockDepositos.find(s => s.productoId === item.productoId && s.depositoId === depositoDestino);
        return { productoId: item.productoId, depositoId: depositoDestino, cantidad: (sd?.cantidad || 0) + item.qty };
      });
      if (cambios.length) actualizarStockDepositoMultiple(cambios).catch(() => {});
    }

    onConfirm(buildCompra());
  };

  return (
    <Modal onClose={onClose} size="modal-xl">
      <div className="modal-header">
        <div className="modal-title">
          {fromRemito ? `Facturar remito ${fromRemito.nro}` : esEdicion ? `Editar ${tipo}` : `Nuevo ${tipo}`}
        </div>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      <div style={{display:"grid", gridTemplateColumns:"1fr 300px", gap:20}}>

        {/* ── Columna izquierda ── */}
        <div style={{display:"flex", flexDirection:"column", gap:14}}>

          {/* Tipo de documento / forma de pago */}
          <div className="card" style={{padding:"14px 16px"}}>
            <div className="card-title">{fromRemito ? "Pago de la factura" : "Tipo de documento"}</div>
            <div className={fromRemito ? "form-row" : "form-row form-row-3"} style={{gap:10}}>
              {!fromRemito && (
                <>
                  <div className="form-group">
                    <label className="form-label">Tipo</label>
                    <select className="form-select" value={tipo} onChange={e => setTipo(e.target.value)}>
                      <option>Remito</option>
                      <option>Factura</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">N° de comprobante</label>
                    <input className="form-input" value={nro} onChange={e => setNro(e.target.value)}
                      placeholder={tipo === "Factura" ? "0001-00005345" : "R-0001-00000211"}/>
                  </div>
                </>
              )}
              <div className="form-group">
                <label className="form-label">Forma de pago</label>
                <select className="form-select" value={formaPago} onChange={e => setFormaPago(e.target.value)}>
                  {FORMAS_PAGO_COMPRA.map(f => <option key={f}>{f}</option>)}
                </select>
              </div>
            </div>

            {/* ── Fuente de fondos — solo al facturar ── */}
            {mostrarFuente && (
              <div style={{marginTop:12}}>
                <label className="form-label">¿De dónde sale el dinero?</label>
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  {FUENTES.map(f => (
                    <label
                      key={f.value}
                      style={{
                        display:"flex", alignItems:"flex-start", gap:10,
                        padding:"9px 12px", borderRadius:8, cursor:"pointer",
                        border:`1px solid ${fuente === f.value ? "var(--accent)" : "var(--border)"}`,
                        background: fuente === f.value ? "color-mix(in srgb, var(--accent) 8%, transparent)" : "var(--bg3)",
                      }}
                    >
                      <input
                        type="radio"
                        name="fuente"
                        value={f.value}
                        checked={fuente === f.value}
                        onChange={() => elegirFuente(f.value)}
                        style={{ marginTop:2, accentColor:"var(--accent)" }}
                      />
                      <div>
                        <div style={{ fontSize:13, fontWeight:600, color:"var(--text1)" }}>{f.label}</div>
                        <div style={{ fontSize:11, color:"var(--text3)", marginTop:1 }}>{f.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>

                {warnCajaCerrada && (
                  <div style={{ marginTop:8, padding:"8px 12px", borderRadius:6, background:"rgba(242,107,91,0.08)", border:"1px solid rgba(242,107,91,0.25)", fontSize:12, color:"var(--red)" }}>
                    La caja está cerrada. Elegí otra cuenta, o abrí la caja antes de facturar.
                  </div>
                )}
                {warnMedio && (
                  <div style={{ marginTop:8, padding:"8px 12px", borderRadius:6, background:"rgba(242,107,91,0.08)", border:"1px solid rgba(242,107,91,0.25)", fontSize:12, color:"var(--red)" }}>
                    {MSG_MEDIO[fuente](formaPago)}
                  </div>
                )}
                {usaTesoreria && (
                  <div style={{ marginTop:8, padding:"8px 12px", borderRadius:6, background:"var(--bg3)", border:"1px solid var(--border)", fontSize:12, color:"var(--text2)", display:"flex", justifyContent:"space-between" }}>
                    <span>Saldo disponible en {dondeSaldo}</span>
                    <span style={{ fontWeight:700, color: warnSaldoInsuficiente ? "var(--red)" : "var(--green)" }}>{fmt(saldoTesoreria)}</span>
                  </div>
                )}
                {warnSaldoInsuficiente && (
                  <div style={{ marginTop:8, padding:"8px 12px", borderRadius:6, background:"rgba(242,107,91,0.08)", border:"1px solid rgba(242,107,91,0.25)", fontSize:12, color:"var(--red)" }}>
                    Saldo insuficiente. El total de {fmt(total)} supera el disponible de {fmt(saldoTesoreria)} en {dondeSaldo}. Elegí otra cuenta.
                  </div>
                )}
              </div>
            )}

            {!fromRemito && tipo === "Remito" && (
              <div style={{marginTop:10, padding:"8px 12px", background:"rgba(96,165,250,0.07)",
                border:"1px solid rgba(96,165,250,0.2)", borderRadius:6, fontSize:12, color:"var(--blue)"}}>
                El remito actualiza el stock y los costos de los productos. Cuando llegue la factura, podés generarla desde el remito.
              </div>
            )}
            {!fromRemito && tipo === "Factura" && !esSinDetalle && (
              <div style={{marginTop:10, padding:"8px 12px", background:"rgba(62,207,142,0.07)",
                border:"1px solid rgba(62,207,142,0.2)", borderRadius:6, fontSize:12, color:"var(--green)"}}>
                La factura actualiza el stock y los costos de los productos.
              </div>
            )}

            {puedeSinDetalle && (
              <label style={{
                marginTop:10, display:"flex", alignItems:"flex-start", gap:10, cursor:"pointer",
                padding:"9px 12px", borderRadius:8,
                border:`1px solid ${sinDetalle ? "var(--amber)" : "var(--border)"}`,
                background: sinDetalle ? "rgba(245,158,11,0.08)" : "var(--bg3)",
              }}>
                <input
                  type="checkbox"
                  checked={sinDetalle}
                  onChange={e => setSinDetalle(e.target.checked)}
                  style={{ marginTop:2, accentColor:"var(--amber)" }}
                />
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:"var(--text1)" }}>Cargar sin detalle de productos</div>
                  <div style={{ fontSize:11, color:"var(--text3)", marginTop:1 }}>
                    Solo se registra el importe. Cuenta en los totales del mes, la deuda con el proveedor y la caja, pero <b>no suma stock ni actualiza costos</b>.
                  </div>
                </div>
              </label>
            )}
          </div>
          {/* fin tipo documento */}

          {/* IVA discriminado — solo para Factura */}
          {esFactura && (
            <div className="card" style={{padding:"14px 16px"}}>
              <div className="card-title">IVA discriminado</div>
              <div className="form-row form-row-2" style={{gap:10}}>
                <div className="form-group">
                  <label className="form-label">Tipo de factura</label>
                  <select className="form-select" value={tipoFactura} onChange={e => setTipoFactura(e.target.value)}>
                    {TIPOS_FACTURA_COMPRA.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Alícuota IVA</label>
                  <select className="form-select" value={alicuotaIva} onChange={e => setAlicuotaIva(parseFloat(e.target.value))}>
                    {ALICUOTAS_IVA.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Proveedor */}
          <div className="card" style={{padding:"14px 16px"}}>
            <div className="card-title">Proveedor</div>
            {!fromRemito ? (
              <div style={{position:"relative"}}>
                <input
                  className="form-input"
                  placeholder="Buscar proveedor..."
                  value={proveedorInput}
                  onChange={e => { setProveedorInput(e.target.value); setProveedorSel(null); }}
                />
                {proveedorInput && !proveedorSel && provSugs.length > 0 && (
                  <div style={{
                    position:"absolute", zIndex:20, width:"100%", top:"100%", left:0,
                    background:"var(--bg3)", border:"1px solid var(--border2)",
                    borderRadius:"var(--radius)", marginTop:4,
                    maxHeight:200, overflowY:"auto",
                    boxShadow:"0 8px 24px rgba(0,0,0,0.4)"
                  }}>
                    {provSugs.map(p => (
                      <div
                        key={p.id}
                        onMouseDown={e => {
                          e.preventDefault();
                          setProveedorSel(p);
                          setProveedorInput(p.nombre);
                        }}
                        style={{
                          padding:"10px 14px", cursor:"pointer",
                          display:"flex", justifyContent:"space-between", alignItems:"center",
                          borderBottom:"1px solid var(--border)", fontSize:13,
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = "color-mix(in srgb, var(--accent) 10%, transparent)"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      >
                        <span style={{color:"var(--text1)", fontWeight:500}}>{p.nombre}</span>
                        <span style={{fontSize:11, color:"var(--text3)"}}>{p.cuit} · {p.iva}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{display:"flex", gap:8, marginTop:8, alignItems:"center"}}>
                  <span style={{fontSize:12, color:"var(--text3)"}}>
                    {proveedorSel ? `${proveedorSel.nombre} — CUIT: ${proveedorSel.cuit}` : "Sin selección"}
                  </span>
                  <button className="btn btn-sm btn-ghost" style={{marginLeft:"auto"}}
                    onClick={() => setShowNuevoProv(true)}>
                    <Icon name="plus" size={13}/> Nuevo proveedor
                  </button>
                </div>
              </div>
            ) : (
              <div style={{fontSize:13, color:"var(--text1)", fontWeight:500}}>{fromRemito.proveedor}</div>
            )}
          </div>
          {/* fin proveedor */}

          {/* Importe — compra sin detalle */}
          {esSinDetalle && (
            <div className="card" style={{padding:"14px 16px"}}>
              <div className="card-title">Importe de la factura</div>
              <div className="form-row form-row-2" style={{gap:10}}>
                <div className="form-group">
                  <label className="form-label">Total del comprobante (con IVA) *</label>
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={importeTotal}
                    onChange={e => setImporteTotal(e.target.value)}
                    placeholder="0"
                    autoFocus
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">¿Qué se compró? (opcional)</label>
                  <input
                    className="form-input"
                    value={descripcion}
                    onChange={e => setDescripcion(e.target.value)}
                    placeholder="Ej: jeans y remeras temporada verano"
                    maxLength={200}
                  />
                </div>
              </div>
              <div style={{marginTop:8, padding:"8px 12px", borderRadius:6, background:"rgba(245,158,11,0.08)", border:"1px solid rgba(245,158,11,0.25)", fontSize:12, color:"var(--amber)"}}>
                Esta mercadería no va a figurar en el stock. Si después se vende, el stock queda desfasado.
              </div>
            </div>
          )}

          {/* Depósito de entrada */}
          {!esSinDetalle && depositos.length > 0 && (
            <div className="card" style={{padding:"14px 16px"}}>
              <div className="card-title">Depósito de entrada</div>
              <div className="form-group">
                <label className="form-label">¿Dónde entra la mercadería? *</label>
                <select
                  className="form-select"
                  value={depositoDestino}
                  onChange={e => setDepositoDestino(Number(e.target.value) || "")}
                  disabled={fromRemito?.stockActualizado === true}
                >
                  <option value="">Seleccionar depósito...</option>
                  {depositos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                </select>
                {fromRemito?.stockActualizado && (
                  <div style={{fontSize:12, color:"var(--text3)", marginTop:4}}>
                    El depósito se fijó al registrar el remito original. El stock ya fue acreditado.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Productos */}
          {!esSinDetalle && (
          <div className="card" style={{padding:"14px 16px"}}>
            <div className="card-title">Productos</div>

            {/* Buscador */}
            <div style={{position:"relative", marginBottom:12}}>
              {!proveedorSel && !fromRemito ? (
                <div style={{
                  padding:"12px 14px", borderRadius:"var(--radius-sm)",
                  background:"rgba(245,158,11,0.08)", border:"1px solid rgba(245,158,11,0.2)",
                  fontSize:12, color:"var(--amber)", display:"flex", alignItems:"center", gap:8
                }}>
                  <Icon name="warning" size={14}/> Seleccioná un proveedor primero para ver sus artículos
                </div>
              ) : (
                <>
                  <div style={{position:"absolute", left:10, top:"50%", transform:"translateY(-50%)",
                    color:"var(--text3)", pointerEvents:"none"}}>
                    <Icon name="search" size={14}/>
                  </div>
                  <input
                    className="form-input"
                    style={{paddingLeft:32}}
                    placeholder="Buscar por nombre, código o rubro..."
                    value={busqueda}
                    onChange={e => { setBusqueda(e.target.value); setShowResults(true); }}
                    onFocus={() => busqueda && setShowResults(true)}
                    onBlur={() => setTimeout(() => setShowResults(false), 150)}
                  />
                  {showResults && resultados.length > 0 && (
                    <div style={{
                      position:"absolute", zIndex:20, width:"100%", top:"100%", left:0,
                      background:"var(--bg3)", border:"1px solid var(--border2)",
                      borderRadius:"var(--radius)", marginTop:4,
                      maxHeight:220, overflowY:"auto",
                      boxShadow:"0 8px 24px rgba(0,0,0,0.4)"
                    }}>
                      {resultados.map(p => (
                        <div
                          key={p.id}
                          onMouseDown={e => {
                            e.preventDefault();
                            addItem(p);
                            setBusqueda("");
                            setShowResults(false);
                          }}
                          style={{
                            padding:"10px 14px", cursor:"pointer",
                            display:"flex", justifyContent:"space-between", alignItems:"center",
                            borderBottom:"1px solid var(--border)", fontSize:13,
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = "color-mix(in srgb, var(--accent) 10%, transparent)"}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                        >
                          <div>
                            <div style={{color:"var(--text1)", fontWeight:500}}>{p.nombre}</div>
                            <div style={{fontSize:11, color:"var(--text3)", marginTop:2}}>{p.codigo} · {p.rubro || p.categoria}</div>
                          </div>
                          <div style={{textAlign:"right", flexShrink:0, marginLeft:12}}>
                            <div style={{fontSize:12, color:"var(--text2)"}}>Costo: {fmt(p.costo)}</div>
                            <div style={{fontSize:11, color:"var(--text3)"}}>Stock: {p.stock}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {showResults && busqueda && resultados.length === 0 && (
                    <div style={{
                      position:"absolute", zIndex:20, width:"100%", top:"100%", left:0,
                      background:"var(--bg3)", border:"1px solid var(--border2)",
                      borderRadius:"var(--radius)", marginTop:4,
                      padding:"14px", fontSize:13, color:"var(--text3)",
                      boxShadow:"0 8px 24px rgba(0,0,0,0.4)"
                    }}>
                      Sin resultados para "{busqueda}" en artículos de {proveedorSel?.nombre}
                    </div>
                  )}
                </>
              )}
            </div>
            {/* fin buscador */}

            <div style={{display:"flex", justifyContent:"flex-end", marginBottom:8}}>
              <button className="btn btn-sm btn-ghost" onClick={() => setShowNuevoProd(true)}>
                <Icon name="plus" size={13}/> Nuevo producto
              </button>
            </div>

            {/* Items */}
            <div style={{background:"var(--bg3)", border:"1px solid var(--border)",
              borderRadius:"var(--radius)", overflow:"hidden"}}>
              {items.length === 0 ? (
                <div style={{padding:40, textAlign:"center", color:"var(--text3)", fontSize:13}}>
                  <Icon name="box" size={28}/><br/>
                  Buscá un producto para agregar
                </div>
              ) : (
                items.map(item => (
                  <div key={item.id} style={{
                    display:"flex", alignItems:"center", gap:12,
                    padding:"10px 14px", borderBottom:"1px solid var(--border)"
                  }}>
                    {/* Nombre */}
                    <div style={{flex:1, minWidth:0}}>
                      <div style={{fontSize:13, color:"var(--text1)", fontWeight:500,
                        whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>
                        {item.nombre}
                      </div>
                    </div>

                    {/* Cantidad */}
                    <div style={{display:"flex", alignItems:"center", gap:6, flexShrink:0}}>
                      <button onClick={() => changeQty(item.id, -1)} style={{
                        width:26, height:26, borderRadius:6,
                        border:"1px solid var(--border2)", background:"var(--bg4)",
                        color:"var(--text2)", cursor:"pointer", fontSize:15,
                        display:"flex", alignItems:"center", justifyContent:"center"
                      }}>−</button>
                      <span style={{fontSize:13, minWidth:24, textAlign:"center",
                        color:"var(--text1)", fontWeight:600}}>
                        {item.qty}
                      </span>
                      <button onClick={() => changeQty(item.id, +1)} style={{
                        width:26, height:26, borderRadius:6,
                        border:"1px solid var(--border2)", background:"var(--bg4)",
                        color:"var(--text2)", cursor:"pointer", fontSize:15,
                        display:"flex", alignItems:"center", justifyContent:"center"
                      }}>+</button>
                    </div>

                    {/* Costo editable */}
                    <div style={{flexShrink:0, width:110}}>
                      <div style={{fontSize:10, color:"var(--text3)", marginBottom:2}}>Costo unit.{esFactura ? " (sin IVA)" : ""}</div>
                      <input
                        className="form-input"
                        type="number"
                        style={{padding:"4px 8px", fontSize:12}}
                        value={item.costo}
                        onChange={e => changeCosto(item.id, e.target.value)}
                      />
                    </div>

                    {/* Subtotal */}
                    <div style={{minWidth:80, textAlign:"right",
                      fontWeight:600, color:"var(--accent2)", flexShrink:0}}>
                      {fmt(item.qty * item.costo)}
                    </div>

                    {/* Eliminar */}
                    <button onClick={() => removeItem(item.id)} style={{
                      background:"none", border:"none", cursor:"pointer",
                      color:"var(--red)", padding:"4px", borderRadius:4,
                      display:"flex", alignItems:"center", flexShrink:0
                    }}>
                      <Icon name="trash" size={14}/>
                    </button>
                  </div>
                ))
              )}
            </div>
            {/* fin items */}

          </div>
          )}
          {/* fin card productos */}

        </div>
        {/* fin columna izquierda */}

        {/* ── Panel derecho ── */}
        <div className="venta-panel">
          <div>
            <div style={{fontSize:11, color:"var(--text3)", marginBottom:16,
              fontWeight:600, textTransform:"uppercase", letterSpacing:".04em"}}>
              Resumen
            </div>
            <div style={{display:"flex", justifyContent:"space-between", fontSize:13, color:"var(--text2)", marginBottom:6}}>
              <span>Tipo</span>
              <span>{fromRemito ? "Factura (desde remito)" : tipo}</span>
            </div>
            <div style={{display:"flex", justifyContent:"space-between", fontSize:13, color:"var(--text2)", marginBottom:6}}>
              <span>Proveedor</span>
              <span style={{fontSize:11, textAlign:"right", maxWidth:140}}>{proveedorFinal}</span>
            </div>
            <div style={{display:"flex", justifyContent:"space-between", fontSize:13, color:"var(--text2)", marginBottom:6}}>
              <span>Forma de pago</span>
              <span>{formaPago}</span>
            </div>
            {mostrarFuente && (
              <div style={{display:"flex", justifyContent:"space-between", fontSize:13, color:"var(--text2)", marginBottom:6}}>
                <span>Sale de</span>
                <span>{FUENTES.find(f => f.value === fuente)?.label}</span>
              </div>
            )}
            {fromRemito && (
              <div style={{display:"flex", justifyContent:"space-between", fontSize:13, color:"var(--text2)", marginBottom:6}}>
                <span>Remito origen</span>
                <span style={{fontSize:11}}>{fromRemito.nro}</span>
              </div>
            )}
            {!esSinDetalle && depositoDestino && depositos.length > 0 && (
              <div style={{display:"flex", justifyContent:"space-between", fontSize:13, color:"var(--text2)", marginBottom:6}}>
                <span>Depósito</span>
                <span style={{fontSize:11, textAlign:"right", maxWidth:140}}>
                  {depositos.find(d => d.id === depositoDestino)?.nombre || "—"}
                </span>
              </div>
            )}
            <div style={{height:1, background:"var(--border)", margin:"16px 0"}}/>
            <div style={{display:"flex", justifyContent:"space-between", fontSize:13, color:"var(--text2)", marginBottom:6}}>
              <span>Artículos</span>
              {esSinDetalle
                ? <span className="badge badge-warn">Sin detalle</span>
                : <span>{items.reduce((a, i) => a + i.qty, 0)}</span>}
            </div>
            {esFactura && (
              <>
                <div style={{display:"flex", justifyContent:"space-between", fontSize:13, color:"var(--text2)", marginBottom:6}}>
                  <span>Neto</span>
                  <span style={{color:"var(--text1)"}}>{fmt(neto)}</span>
                </div>
                <div style={{display:"flex", justifyContent:"space-between", fontSize:13, color:"var(--text2)", marginBottom:6}}>
                  <span>IVA ({alicuotaIva}%)</span>
                  <span style={{color:"var(--text1)"}}>{fmt(iva)}</span>
                </div>
                <div style={{height:1, background:"var(--border)", margin:"10px 0"}}/>
              </>
            )}
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline"}}>
              <span style={{fontSize:15, color:"var(--text2)", fontWeight:500}}>Total</span>
              <span style={{fontSize:28, fontWeight:700, color:"var(--accent2)"}}>
                {fmt(total)}
              </span>
            </div>
          </div>
          <div style={{display:"flex", flexDirection:"column", gap:8, marginTop:"auto"}}>
            <button className="btn btn-primary" onClick={confirmar}
              disabled={warnCajaCerrada || warnMedio || warnSaldoInsuficiente}
              style={{width:"100%", justifyContent:"center"}}>
              <Icon name="check" size={15}/> {esEdicion ? "Guardar cambios" : `Confirmar ${fromRemito ? "factura" : tipo}`}
            </button>
            <button className="btn" onClick={onClose}
              style={{width:"100%", justifyContent:"center"}}>
              Cancelar
            </button>
          </div>
        </div>
        {/* fin panel derecho */}

      </div>
      {/* fin grid */}

      {showNuevoProv && (
        <ModalNuevoProveedor
          onClose={() => setShowNuevoProv(false)}
          onGuardar={async (p) => {
            const nuevo = await agregarProveedor(p);
            setProveedorSel(nuevo);
            setProveedorInput(nuevo.nombre);
            setShowNuevoProv(false);
          }}
        />
      )}

      {showNuevoProd && (
        <ModalProducto
          producto={proveedorSel ? { proveedorId: proveedorSel.id } : {}}
          proveedores={proveedores}
          onGuardar={handleNuevoProducto}
          onClose={() => setShowNuevoProd(false)}
        />
      )}

    </Modal>
  );
}