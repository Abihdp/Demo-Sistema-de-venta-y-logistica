import { useState } from "react";
import Icon from "../ui/Icon";
import { Modal } from "../ui/Modal";
import { COND_IVA } from "../../constants";
import { today } from "../../utils/helpers";
import { useToast } from "../ui/Toast";

export default function ModalNuevoProveedor({ onClose, onGuardar, proveedorEditar }) {
  const { toast } = useToast();
  const esEdicion = !!proveedorEditar;
  const [form, setForm] = useState(
    proveedorEditar
      ? { ...proveedorEditar }
      : { nombre:"", cuit:"", tel:"", dir:"", iva:"Responsable Inscripto", email:"", proximoViaje:"", diasColchon:5, margen:null }
  );
  const set = (k,v) => setForm(p=>({...p,[k]:v}));
  const guardar = async () => {
    if (!form.nombre.trim()) { toast("El nombre es obligatorio.", "error"); return; }
    try {
      await onGuardar(form);
    } catch (err) {
      toast(err.message || "Error al guardar el proveedor.", "error");
    }
  };
  return (
    <Modal onClose={onClose} size="modal-sm">
      <div className="modal-header">
        <div className="modal-title">{esEdicion ? "Editar proveedor" : "Nuevo proveedor"}</div>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div className="form-row form-row-2">
          <div className="form-group">
            <label className="form-label">Razón social *</label>
            <input className="form-input" value={form.nombre} onChange={e=>set("nombre",e.target.value)} placeholder="Ej: TextilSur S.R.L."/>
          </div>
          <div className="form-group">
            <label className="form-label">CUIT</label>
            <input className="form-input" value={form.cuit} onChange={e=>set("cuit",e.target.value)} placeholder="30-55512345-9"/>
          </div>
        </div>
        <div className="form-row form-row-2">
          <div className="form-group">
            <label className="form-label">Teléfono</label>
            <input className="form-input" value={form.tel} onChange={e=>set("tel",e.target.value)} placeholder="381-444-0000"/>
          </div>
          <div className="form-group">
            <label className="form-label">Condición ante IVA</label>
            <select className="form-select" value={form.iva} onChange={e=>set("iva",e.target.value)}>
              {COND_IVA.map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Email</label>
          <input className="form-input" value={form.email} onChange={e=>set("email",e.target.value)} placeholder="ventas@proveedor.com"/>
        </div>
        <div className="form-group">
          <label className="form-label">Dirección</label>
          <input className="form-input" value={form.dir} onChange={e=>set("dir",e.target.value)} placeholder="Av. San Martín 1234"/>
        </div>

        <div style={{height:1, background:"var(--border)", margin:"4px 0"}}/>
        <div style={{fontSize:11, color:"var(--text3)", textTransform:"uppercase", letterSpacing:".04em", fontWeight:600}}>
          Reposición de stock
        </div>
        <div className="form-row form-row-2">
          <div className="form-group">
            <label className="form-label">Próximo viaje / compra</label>
            <input className="form-input" type="date" min={today()} value={form.proximoViaje || ""} onChange={e=>set("proximoViaje",e.target.value)}/>
          </div>
          <div className="form-group">
            <label className="form-label">Días de colchón</label>
            <input className="form-input" type="number" min="0" value={form.diasColchon ?? 5} onChange={e=>set("diasColchon", parseInt(e.target.value) || 0)} placeholder="5"/>
          </div>
        </div>
        <div style={{fontSize:11, color:"var(--text3)"}}>
          La fecha de próximo viaje se usa para calcular cuánto pedir de cada producto de este proveedor.
        </div>

        <div style={{height:1, background:"var(--border)", margin:"4px 0"}}/>
        <div style={{fontSize:11, color:"var(--text3)", textTransform:"uppercase", letterSpacing:".04em", fontWeight:600}}>
          Precios
        </div>
        <div className="form-group">
          <label className="form-label">Margen propio (opcional)</label>
          <input
            className="form-input" type="number" min="0"
            value={form.margen ?? ""}
            onChange={e=>set("margen", e.target.value === "" ? null : Number(e.target.value))}
            placeholder="Usa el margen global"
          />
        </div>
        <div style={{fontSize:11, color:"var(--text3)"}}>
          Si lo dejás vacío, los productos de este proveedor usan el margen base general (o el de su rubro, si tiene uno propio).
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={guardar}><Icon name="check" size={14}/> {esEdicion ? "Guardar cambios" : "Guardar"}</button>
      </div>
    </Modal>
  );
}

