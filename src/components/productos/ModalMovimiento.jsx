import { useState, useEffect } from "react";
import Icon from "../ui/Icon.jsx";
import { MOTIVOS_ENTRADA, MOTIVOS_SALIDA } from "../../constants/index.js";
import { useToast } from "../ui/Toast.jsx";

export default function ModalMovimiento({
  tipoInicial,
  productoInicial,
  productos,
  depositos,
  stockDepositos,
  permitirStockNegativo = false,
  onGuardar,
  onClose,
}) {
  const [form, setForm] = useState({
    tipo:        tipoInicial   || "entrada",
    productoId:  productoInicial ? String(productoInicial) : "",
    depositoId:  depositos[0]?.id ? String(depositos[0].id) : "",
    cantidad:    "",
    motivo:      tipoInicial === "salida" ? MOTIVOS_SALIDA[0] : MOTIVOS_ENTRADA[0],
    observacion: "",
  });

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  // Reset motivo when tipo changes
  useEffect(() => {
    set("motivo", form.tipo === "salida" ? MOTIVOS_SALIDA[0] : MOTIVOS_ENTRADA[0]);
  }, [form.tipo]); // eslint-disable-line react-hooks/exhaustive-deps

  const motivos = form.tipo === "salida" ? MOTIVOS_SALIDA : MOTIVOS_ENTRADA;
  const esEntrada = form.tipo === "entrada";

  const stockEnDeposito = () => {
    if (!form.productoId || !form.depositoId) return null;
    const sd = stockDepositos.find(
      s => s.productoId === Number(form.productoId) && s.depositoId === Number(form.depositoId)
    );
    return sd ? sd.cantidad : 0;
  };

  const { toast } = useToast();
  const productoSeleccionado = productos.find(p => p.id === Number(form.productoId));
  const stock = stockEnDeposito();

  const guardar = () => {
    if (!form.productoId)  { toast("Seleccioná un producto.", "error"); return; }
    if (!form.depositoId)  { toast("Seleccioná un depósito.", "error"); return; }
    const cant = parseInt(form.cantidad);
    if (!cant || cant <= 0) { toast("La cantidad debe ser mayor a 0.", "error"); return; }
    if (!esEntrada && stock !== null && cant > stock) {
      if (!permitirStockNegativo) {
        toast(`Stock insuficiente en el depósito (disponible: ${stock}).`, "error"); return;
      }
      toast(`Stock insuficiente — se registra igual, quedará en ${stock - cant} en el depósito.`, "warning");
    }

    onGuardar({
      tipo:        form.tipo,
      productoId:  Number(form.productoId),
      depositoId:  Number(form.depositoId),
      cantidad:    cant,
      motivo:      form.motivo,
      observacion: form.observacion.trim(),
    });
  };

  const accentColor = esEntrada ? "var(--green)" : "var(--red)";
  const accentBg    = esEntrada ? "rgba(62,207,142,0.12)" : "rgba(242,107,91,0.12)";
  const accentBorder= esEntrada ? "rgba(62,207,142,0.3)"  : "rgba(242,107,91,0.3)";

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title" style={{color: accentColor}}>
            {esEntrada ? "↑ Entrada de stock" : "↓ Salida de stock"}
          </div>
          <button className="close-btn" onClick={onClose}>
            <Icon name="close" size={16}/>
          </button>
        </div>

        <div style={{display:"flex", flexDirection:"column", gap:14}}>

          {/* Tipo */}
          <div className="form-group">
            <label className="form-label">Tipo de movimiento</label>
            <div className="segmented-control">
              <button
                className={`segmented-btn ${esEntrada ? "active" : ""}`}
                style={esEntrada ? {background:"rgba(62,207,142,0.2)", color:"var(--green)"} : {}}
                onClick={() => set("tipo", "entrada")}
              >
                ↑ Entrada
              </button>
              <button
                className={`segmented-btn ${!esEntrada ? "active" : ""}`}
                style={!esEntrada ? {background:"rgba(242,107,91,0.2)", color:"var(--red)"} : {}}
                onClick={() => set("tipo", "salida")}
              >
                ↓ Salida
              </button>
            </div>
          </div>

          {/* Producto */}
          <div className="form-group">
            <label className="form-label">Producto</label>
            <select className="form-select" value={form.productoId} onChange={e => set("productoId", e.target.value)}>
              <option value="">Seleccionar producto...</option>
              {productos.map(p => (
                <option key={p.id} value={p.id}>{p.nombre} — {p.codigo}</option>
              ))}
            </select>
          </div>

          {/* Depósito */}
          <div className="form-group">
            <label className="form-label">Depósito</label>
            <select className="form-select" value={form.depositoId} onChange={e => set("depositoId", e.target.value)}>
              {depositos.map(d => (
                <option key={d.id} value={d.id}>{d.nombre}</option>
              ))}
            </select>
          </div>

          {/* Stock actual en ese depósito */}
          {productoSeleccionado && stock !== null && (
            <div style={{
              display:"flex", justifyContent:"space-between", alignItems:"center",
              padding:"10px 14px", borderRadius:"var(--radius-sm)",
              background: stock === 0 ? "rgba(242,107,91,0.06)" : "rgba(255,255,255,0.02)",
              border:"1px solid var(--border)", fontSize:13,
            }}>
              <span style={{color:"var(--text3)"}}>Stock en depósito seleccionado</span>
              <span style={{
                fontWeight:700, fontFamily:"'DM Mono',monospace",
                color: stock === 0 ? "var(--red)" : "var(--text1)"
              }}>
                {stock}
              </span>
            </div>
          )}

          {/* Cantidad */}
          <div className="form-group">
            <label className="form-label">Cantidad</label>
            <input
              className="form-input"
              type="number"
              min="1"
              placeholder="0"
              value={form.cantidad}
              onChange={e => set("cantidad", e.target.value)}
              style={{fontFamily:"'DM Mono',monospace", fontSize:16}}
            />
          </div>

          {/* Motivo */}
          <div className="form-group">
            <label className="form-label">Motivo</label>
            <select className="form-select" value={form.motivo} onChange={e => set("motivo", e.target.value)}>
              {motivos.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          {/* Observación */}
          <div className="form-group">
            <label className="form-label">Observación <span style={{fontWeight:400, textTransform:"none", letterSpacing:0, color:"var(--text3)"}}>(opcional)</span></label>
            <input
              className="form-input"
              placeholder="Detalle adicional..."
              value={form.observacion}
              onChange={e => set("observacion", e.target.value)}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-sm btn-ghost" onClick={onClose}>Cancelar</button>
          <button
            className="btn btn-sm"
            style={{background: accentBg, borderColor: accentBorder, color: accentColor}}
            onClick={guardar}
          >
            <Icon name="check" size={13}/>
            Confirmar {esEntrada ? "entrada" : "salida"}
          </button>
        </div>
      </div>
    </div>
  );
}
