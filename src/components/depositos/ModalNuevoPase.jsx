import { useState, useMemo } from "react";
import Icon from "../ui/Icon.jsx";
import { Modal } from "../ui/Modal.jsx";
import { useToast } from "../ui/Toast.jsx";
import { normalizarCodigoEscaneado, coincideBusqueda } from "../../utils/helpers.js";

export default function ModalNuevoPase({ depositos, stockDepositos, productos, permitirStockNegativo = false, onGuardar, onClose }) {
  const { toast } = useToast();
  // El depósito de tránsito es de sistema: no se elige como origen ni destino
  const depositosSeleccionables = depositos.filter(d => d.tipo !== "transito");

  const [depositoOrigenId,  setDepositoOrigenId]  = useState(depositosSeleccionables[0]?.id ?? "");
  const [depositoDestinoId, setDepositoDestinoId] = useState(depositosSeleccionables[1]?.id ?? depositosSeleccionables[0]?.id ?? "");
  const [busqueda, setBusqueda]         = useState("");
  const [showResults, setShowResults]  = useState(false);
  const [items, setItems]              = useState([]);
  const [observacion, setObservacion]  = useState("");

  const getStock = (productoId, depositoId) => {
    const r = stockDepositos.find(s => s.productoId === productoId && s.depositoId === depositoId);
    return r ? r.cantidad : 0;
  };

  const resultados = useMemo(() => {
    if (!busqueda.trim() || !depositoOrigenId) return [];
    const q = normalizarCodigoEscaneado(busqueda.toLowerCase());
    return productos.filter(p =>
      p.activo !== false && coincideBusqueda([p.nombre, p.codigo].join(" "), q)
    ).slice(0, 8);
  }, [busqueda, productos, depositoOrigenId]);

  const addItem = (prod) => {
    const disponible = getStock(prod.id, Number(depositoOrigenId));
    if (disponible <= 0) {
      if (!permitirStockNegativo) { toast(`"${prod.nombre}" no tiene stock disponible en el depósito de origen.`, "error"); return; }
      toast(`"${prod.nombre}" no tiene stock disponible en el depósito de origen — se agrega igual.`, "warning");
    }
    setItems(prev => {
      const ex = prev.find(i => i.productoId === prod.id);
      if (ex) {
        const nueva = permitirStockNegativo ? ex.cantidad + 1 : Math.min(disponible, ex.cantidad + 1);
        return prev.map(i => i.productoId === prod.id ? { ...i, cantidad: nueva } : i);
      }
      return [...prev, { productoId: prod.id, nombre: prod.nombre, codigo: prod.codigo, cantidad: 1, disponible }];
    });
    setBusqueda("");
    setShowResults(false);
  };

  const changeCantidad = (productoId, d) => setItems(prev => prev.map(i => {
    if (i.productoId !== productoId) return i;
    const nueva = permitirStockNegativo ? Math.max(1, i.cantidad + d) : Math.max(1, Math.min(i.disponible, i.cantidad + d));
    return { ...i, cantidad: nueva };
  }));
  const removeItem = (productoId) => setItems(prev => prev.filter(i => i.productoId !== productoId));

  const guardar = () => {
    if (!depositoOrigenId || !depositoDestinoId) { toast("Seleccioná depósito de origen y de destino.", "error"); return; }
    if (String(depositoOrigenId) === String(depositoDestinoId)) { toast("El depósito de origen y destino no pueden ser el mismo.", "error"); return; }
    if (items.length === 0) { toast("Agregá al menos un producto.", "error"); return; }
    onGuardar({
      depositoOrigenId:  Number(depositoOrigenId),
      depositoDestinoId: Number(depositoDestinoId),
      items: items.map(i => ({ productoId: i.productoId, cantidad: i.cantidad })),
      observacion: observacion.trim(),
    });
  };

  return (
    <Modal onClose={onClose} size="modal-lg">
      <div className="modal-header">
        <div className="modal-title">Nuevo pase de depósito</div>
        <button className="close-btn" onClick={onClose}><Icon name="close" size={16}/></button>
      </div>

      <div className="form-row form-row-2" style={{marginBottom:14}}>
        <div className="form-group">
          <label className="form-label">Depósito origen</label>
          <select
            className="form-select"
            value={depositoOrigenId}
            onChange={e => { setDepositoOrigenId(e.target.value); setItems([]); }}
          >
            {depositosSeleccionables.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Depósito destino</label>
          <select className="form-select" value={depositoDestinoId} onChange={e => setDepositoDestinoId(e.target.value)}>
            {depositosSeleccionables.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
          </select>
        </div>
      </div>

      {/* Buscador de productos */}
      <div className="form-group" style={{position:"relative", marginBottom:12}}>
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
            position:"absolute", zIndex:20, width:"100%", top:"100%", left:0,
            background:"var(--bg3)", border:"1px solid var(--border2)", borderRadius:"var(--radius)",
            marginTop:4, maxHeight:220, overflowY:"auto", boxShadow:"0 8px 24px rgba(0,0,0,0.4)",
          }}>
            {resultados.map(p => {
              const disp = getStock(p.id, Number(depositoOrigenId));
              return (
                <div
                  key={p.id}
                  onMouseDown={e => { e.preventDefault(); addItem(p); }}
                  style={{
                    padding:"10px 14px", cursor:"pointer", display:"flex", justifyContent:"space-between",
                    alignItems:"center", borderBottom:"1px solid var(--border)", fontSize:13,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "color-mix(in srgb, var(--accent) 10%, transparent)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <div>
                    <div style={{color:"var(--text1)", fontWeight:500}}>{p.nombre}</div>
                    <div style={{fontSize:11, color:"var(--text3)", marginTop:2}}>{p.codigo}</div>
                  </div>
                  <div style={{fontSize:11, color: disp > 0 ? "var(--text3)" : "var(--red)"}}>
                    Disponible: {disp}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {showResults && busqueda && resultados.length === 0 && (
          <div style={{
            position:"absolute", zIndex:20, width:"100%", top:"100%", left:0,
            background:"var(--bg3)", border:"1px solid var(--border2)", borderRadius:"var(--radius)",
            marginTop:4, padding:14, fontSize:13, color:"var(--text3)",
            boxShadow:"0 8px 24px rgba(0,0,0,0.4)",
          }}>
            Sin resultados para "{busqueda}"
          </div>
        )}
      </div>

      {/* Items */}
      <div style={{
        background:"var(--bg3)", border:"1px solid var(--border)",
        borderRadius:"var(--radius)", overflow:"hidden", marginBottom:14,
      }}>
        {items.length === 0 ? (
          <div style={{padding:30, textAlign:"center", color:"var(--text3)", fontSize:13}}>
            <Icon name="box" size={26}/><br/>Sin productos agregados
          </div>
        ) : (
          items.map(item => (
            <div key={item.productoId} style={{
              display:"flex", alignItems:"center", gap:12,
              padding:"10px 14px", borderBottom:"1px solid var(--border)",
            }}>
              <div style={{flex:1, minWidth:0}}>
                <div style={{fontSize:13, color:"var(--text1)", fontWeight:500}}>{item.nombre}</div>
                <div style={{fontSize:11, color: item.cantidad > item.disponible ? "var(--amber)" : "var(--text3)"}}>
                  Disponible en origen: {item.disponible}
                  {item.cantidad > item.disponible && ` — quedará en ${item.disponible - item.cantidad}`}
                </div>
              </div>
              <div style={{display:"flex", alignItems:"center", gap:6, flexShrink:0}}>
                <button className="qty-btn" onClick={() => changeCantidad(item.productoId, -1)}>−</button>
                <span style={{fontSize:13, minWidth:24, textAlign:"center", color:"var(--text1)", fontWeight:600}}>
                  {item.cantidad}
                </span>
                <button className="qty-btn" onClick={() => changeCantidad(item.productoId, +1)}>+</button>
              </div>
              <button
                onClick={() => removeItem(item.productoId)}
                style={{background:"none", border:"none", cursor:"pointer", color:"var(--red)", padding:4, borderRadius:4, display:"flex", flexShrink:0}}
              >
                <Icon name="trash" size={14}/>
              </button>
            </div>
          ))
        )}
      </div>

      <div className="form-group" style={{marginBottom:4}}>
        <label className="form-label">
          Observación <span style={{fontWeight:400, textTransform:"none", letterSpacing:0, color:"var(--text3)"}}>(opcional)</span>
        </label>
        <input
          className="form-input"
          value={observacion}
          onChange={e => setObservacion(e.target.value)}
          placeholder="Ej: Reposición semanal"
        />
      </div>

      <div className="modal-footer">
        <button className="btn btn-sm btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-sm btn-primary" onClick={guardar}>
          <Icon name="check" size={13}/> Enviar pase
        </button>
      </div>
    </Modal>
  );
}
