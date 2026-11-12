import { useState, useEffect, useMemo } from "react";
import Icon from "../ui/Icon";
import { Modal } from "../ui/Modal";
import { fmt, today } from "../../utils/helpers";
import { LISTAS, FORMAS_PAGO } from "../../constants";
import ModalNuevoCliente from "../clientes/ModalNuevoCliente";
import { useToast } from "../ui/Toast";

export default function ModalNuevaVenta({ clientes, setClientes, productos, setProductos, onClose, onConfirm }) {
  const { toast } = useToast();
  const listaDefault = LISTAS.reduce((a,b) => b.pct > a.pct ? b : a);

  const [clienteInput, setClienteInput] = useState("");
  const [clienteSelec, setClienteSelec] = useState(null); // null = consumidor final
  const [lista, setLista] = useState(listaDefault);
  const [formaPago, setFormaPago] = useState(FORMAS_PAGO[0]);
  const [tipo, setTipo] = useState("Mostrador");
  const [items, setItems] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [showNuevoCliente, setShowNuevoCliente] = useState(false);

  const clienteSugs = useMemo(() =>
    clientes.filter(c =>
      c.nombre.toLowerCase().includes(clienteInput.toLowerCase())
    ).slice(0, 5)
  , [clientes, clienteInput]);

  const resultados = useMemo(() => {
    if (!busqueda.trim()) return [];
    const q = busqueda.toLowerCase();
    return productos.filter(p =>
      (p.tipo || "simple") !== "madre" && (
        p.nombre.toLowerCase().includes(q) ||
        p.codigo.toLowerCase().includes(q) ||
        (p.rubro || p.categoria || "").toLowerCase().includes(q)
      )
    ).slice(0, 8);
  }, [busqueda, productos]);

  const addItem = (prod) => {
    if (prod.stock <= 0) return;
    setItems(prev => {
      const ex = prev.find(i => i.productoId === prod.id);
      if (ex) {
        if (ex.qty >= prod.stock) return prev;
        return prev.map(i => i.productoId === prod.id ? {...i, qty: i.qty+1} : i);
      }
      const precio = Math.round(prod.precio * (1 + lista.pct/100));
      return [...prev, { productoId: prod.id, nombre: prod.nombre, precio, qty: 1, stock: prod.stock }];
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

  const removeItem = (productoId) => setItems(prev => prev.filter(i => i.productoId !== productoId));

  // Recalcular precios al cambiar lista
  useEffect(() => {
    setItems(prev => prev.map(i => {
      const prod = productos.find(p => p.id === i.productoId);
      if (!prod) return i;
      return { ...i, precio: Math.round(prod.precio * (1 + lista.pct/100)) };
    }));
  }, [lista]);

  const subtotal = items.reduce((a,i) => a + i.precio * i.qty, 0);
  const esCtaCte  = formaPago === "Cuenta Corriente";

  const clienteFinal = clienteSelec ? clienteSelec.nombre : "Consumidor Final";

  const confirmar = () => {
    if (items.length === 0) { toast("Agregá al menos un producto.", "error"); return; }
    if (esCtaCte && !clienteSelec) { toast("Para cuenta corriente debés seleccionar un cliente.", "error"); return; }
    // Descontar stock
    setProductos(prev => prev.map(p => {
      const item = items.find(i => i.productoId === p.id);
      if (!item) return p;
      return { ...p, stock: p.stock - item.qty };
    }));
    const venta = {
      fecha: today(),
      cliente: clienteFinal,
      lista: lista.nombre,
      formaPago,
      tipo,
      items: items.map(i => ({ nombre: i.nombre, qty: i.qty, precio: i.precio })),
      total: subtotal,
    };
    onConfirm(venta);
  };

  return (
    <Modal onClose={onClose} size="modal-xl">
      <div className="modal-header">
        <div className="modal-title">Nueva venta</div>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      <div className="venta-layout">

        {/* ── Columna izquierda ── */}
        <div style={{display:"flex",flexDirection:"column",gap:14}}>

          {/* Cliente */}
          <div className="card" style={{padding:"14px 16px"}}>
            <div className="card-title">Cliente</div>
            <div style={{position:"relative"}}>
              <input
                className="form-input"
                placeholder="Buscar cliente o dejar vacío (Consumidor Final)"
                value={clienteInput}
                onChange={e => { setClienteInput(e.target.value); setClienteSelec(null); }}
              />
              {clienteInput && clienteSugs.length > 0 && (
                <div style={{
                  position:"absolute", zIndex:20, width:"100%", top:"100%", left:0,
                  background:"var(--bg3)", border:"1px solid var(--border2)",
                  borderRadius:"var(--radius)", marginTop:4,
                  maxHeight:200, overflowY:"auto",
                  boxShadow:"0 8px 24px rgba(0,0,0,0.4)"
                }}>
                  {clienteSugs.map(c => (
                    <div
                      key={c.id}
                      onMouseDown={e => {
                        e.preventDefault();
                        setClienteSelec(c);
                        setClienteInput(c.nombre);
                      }}
                      style={{
                        padding:"10px 14px", cursor:"pointer",
                        display:"flex", justifyContent:"space-between", alignItems:"center",
                        borderBottom:"1px solid var(--border)", fontSize:13,
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = "color-mix(in srgb, var(--accent) 10%, transparent)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <span style={{color:"var(--text1)",fontWeight:500}}>{c.nombre}</span>
                      <span style={{fontSize:11,color:"var(--text3)"}}>{c.iva} · {c.dni}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{display:"flex",gap:8,marginTop:8,alignItems:"center"}}>
              <span style={{fontSize:12,color:"var(--text3)"}}>
                {clienteSelec
                  ? `Seleccionado: ${clienteSelec.nombre} — ${clienteSelec.iva}`
                  : "Consumidor Final (sin selección)"}
              </span>
              <button
                className="btn btn-sm btn-ghost"
                style={{marginLeft:"auto"}}
                onClick={() => setShowNuevoCliente(true)}
              >
                <Icon name="plus" size={13}/> Nuevo cliente
              </button>
            </div>
          </div>
          {/* fin Cliente */}

          {/* Configuración */}
          <div className="card" style={{padding:"14px 16px"}}>
            <div className="card-title">Configuración</div>
            <div className="form-row form-row-3" style={{gap:10}}>
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
            {esCtaCte && (
              <div style={{marginTop:10,padding:"8px 12px",background:"rgba(245,158,11,0.08)",
                border:"1px solid rgba(245,158,11,0.2)",borderRadius:6,fontSize:12,color:"var(--amber)"}}>
                Cuenta corriente: se registrará saldo pendiente en el cliente seleccionado
              </div>
            )}
          </div>
          {/* fin Configuración */}

          {/* Productos */}
          <div className="card" style={{padding:"14px 16px"}}>
            <div className="card-title">Productos</div>

            {/* Buscador */}
            <div style={{position:"relative",marginBottom:12}}>
              <div style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:"var(--text3)",pointerEvents:"none"}}>
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
                        padding:"10px 14px",
                        cursor: p.stock === 0 ? "not-allowed" : "pointer",
                        display:"flex", justifyContent:"space-between", alignItems:"center",
                        borderBottom:"1px solid var(--border)", fontSize:13,
                        opacity: p.stock === 0 ? 0.5 : 1,
                      }}
                      onMouseEnter={e => { if(p.stock > 0) e.currentTarget.style.background = "color-mix(in srgb, var(--accent) 10%, transparent)"; }}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <div>
                        <div style={{color:"var(--text1)",fontWeight:500}}>{p.nombre}</div>
                        <div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>{p.codigo} · {p.rubro || p.categoria}</div>
                      </div>
                      <div style={{textAlign:"right",flexShrink:0,marginLeft:12}}>
                        <div style={{color:"var(--accent2)",fontWeight:600}}>
                          {fmt(Math.round(p.precio * (1 + lista.pct/100)))}
                        </div>
                        {p.stock === 0
                          ? <div style={{fontSize:11,color:"var(--red)"}}>Sin stock</div>
                          : <div style={{fontSize:11,color:"var(--text3)"}}>Stock: {p.stock}</div>
                        }
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* fin buscador */}

            {/* Items agregados */}
            <div style={{
              background:"var(--bg3)", border:"1px solid var(--border)",
              borderRadius:"var(--radius)", overflow:"hidden"
            }}>
              {items.length === 0 ? (
                <div style={{padding:40, textAlign:"center", color:"var(--text3)", fontSize:13}}>
                  <Icon name="box" size={28}/><br/>
                  Buscá un producto para agregar
                </div>
              ) : (
                items.map(item => (
                  <div key={item.productoId} style={{
                    display:"flex", alignItems:"center", gap:12,
                    padding:"10px 14px", borderBottom:"1px solid var(--border)"
                  }}>
                    <div style={{flex:1, minWidth:0}}>
                      <div style={{
                        fontSize:13, color:"var(--text1)", fontWeight:500,
                        whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"
                      }}>
                        {item.nombre}
                      </div>
                      <div style={{fontSize:11, color:"var(--text3)", marginTop:2}}>
                        {fmt(item.precio)} c/u
                      </div>
                    </div>
                    <div style={{display:"flex", alignItems:"center", gap:6, flexShrink:0}}>
                      <button
                        onClick={() => changeQty(item.productoId, -1)}
                        style={{
                          width:26, height:26, borderRadius:6,
                          border:"1px solid var(--border2)", background:"var(--bg4)",
                          color:"var(--text2)", cursor:"pointer", fontSize:15,
                          display:"flex", alignItems:"center", justifyContent:"center"
                        }}
                      >−</button>
                      <span style={{fontSize:13, minWidth:24, textAlign:"center", color:"var(--text1)", fontWeight:600}}>
                        {item.qty}
                      </span>
                      <button
                        onClick={() => changeQty(item.productoId, +1)}
                        style={{
                          width:26, height:26, borderRadius:6,
                          border:"1px solid var(--border2)", background:"var(--bg4)",
                          color:"var(--text2)", cursor:"pointer", fontSize:15,
                          display:"flex", alignItems:"center", justifyContent:"center"
                        }}
                      >+</button>
                    </div>
                    <div style={{minWidth:80, textAlign:"right", fontWeight:600, color:"var(--accent2)", flexShrink:0}}>
                      {fmt(item.precio * item.qty)}
                    </div>
                    <button
                      onClick={() => removeItem(item.productoId)}
                      style={{
                        background:"none", border:"none", cursor:"pointer",
                        color:"var(--red)", padding:"4px", borderRadius:4,
                        display:"flex", alignItems:"center", flexShrink:0
                      }}
                    >
                      <Icon name="trash" size={14}/>
                    </button>
                  </div>
                ))
              )}
            </div>
            {/* fin items agregados */}

          </div>
          {/* fin card Productos */}

        </div>
        {/* fin columna izquierda */}

        {/* ── Panel derecho ── */}
        <div className="venta-panel">
          <div>
            <div style={{fontSize:11,color:"var(--text3)",marginBottom:16,fontWeight:600,textTransform:"uppercase",letterSpacing:".04em"}}>Resumen</div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"var(--text2)",marginBottom:6}}>
              <span>Cliente</span><span>{clienteFinal}</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"var(--text2)",marginBottom:6}}>
              <span>Lista</span><span>{lista.nombre} {lista.pct > 0 ? `(+${lista.pct}%)` : ""}</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"var(--text2)",marginBottom:6}}>
              <span>Forma de pago</span><span>{formaPago}</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"var(--text2)",marginBottom:6}}>
              <span>Tipo</span><span>{tipo}</span>
            </div>
            <div style={{height:1,background:"var(--border)",margin:"16px 0"}}/>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
              <span style={{fontSize:15,color:"var(--text2)",fontWeight:500}}>Total</span>
              <span style={{fontSize:28,fontWeight:700,color:"var(--accent2)"}}>
                {fmt(subtotal)}
              </span>
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:"auto"}}>
            <button className="btn btn-primary" onClick={confirmar} style={{width:"100%",justifyContent:"center"}}>
              <Icon name="check" size={15}/> Confirmar venta
            </button>
            <button className="btn" onClick={onClose} style={{width:"100%",justifyContent:"center"}}>
              Cancelar
            </button>
          </div>
        </div>
        {/* fin panel derecho */}

      </div>
      {/* fin venta-layout */}

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