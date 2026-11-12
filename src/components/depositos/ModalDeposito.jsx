import { useState } from "react";
import Icon from "../ui/Icon.jsx";
import { Modal } from "../ui/Modal.jsx";
import { useToast } from "../ui/Toast.jsx";

const TIPOS = [
  { value:"normal",  label:"Normal"   },
  { value:"reserva", label:"Reservas" },
];

export default function ModalDeposito({ deposito, onGuardar, onClose }) {
  const { toast } = useToast();
  const esTransito = deposito?.tipo === "transito";
  const [form, setForm] = useState({
    nombre: deposito?.nombre || "",
    tipo:   deposito?.tipo   || "normal",
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const guardar = () => {
    if (!form.nombre.trim()) { toast("El nombre es obligatorio.", "error"); return; }
    onGuardar({ id: deposito?.id, nombre: form.nombre.trim(), tipo: form.tipo });
  };

  return (
    <Modal onClose={onClose} size="modal-sm">
      <div className="modal-header">
        <div className="modal-title">{deposito?.id ? "Editar depósito" : "Nuevo depósito"}</div>
        <button className="close-btn" onClick={onClose}><Icon name="close" size={16}/></button>
      </div>

      <div style={{display:"flex", flexDirection:"column", gap:14}}>
        <div className="form-group">
          <label className="form-label">Nombre</label>
          <input
            className="form-input"
            value={form.nombre}
            onChange={e => set("nombre", e.target.value)}
            placeholder="Ej: Depósito Norte"
            autoFocus
          />
        </div>

        <div className="form-group">
          <label className="form-label">Tipo</label>
          {esTransito ? (
            <div style={{
              padding:"9px 12px", background:"var(--bg3)", border:"1px solid var(--border)",
              borderRadius:"var(--radius-sm)", fontSize:13, color:"var(--text3)",
            }}>
              Tránsito (depósito de sistema, no editable)
            </div>
          ) : (
            <select className="form-select" value={form.tipo} onChange={e => set("tipo", e.target.value)}>
              {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="modal-footer">
        <button className="btn btn-sm btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-sm btn-primary" onClick={guardar}>
          <Icon name="check" size={13}/> Guardar
        </button>
      </div>
    </Modal>
  );
}
