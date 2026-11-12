import { useState } from "react";
import Icon from "../ui/Icon.jsx";
import { Modal } from "../ui/Modal.jsx";
import { ROLES, COLORES_USUARIO } from "../../constants/index.js";
import { useToast } from "../ui/Toast.jsx";

export default function ModalUsuario({ usuario, onClose, onGuardar }) {
  const { toast } = useToast();
  const esEdicion = !!usuario;
  const [form, setForm] = useState({
    nombre:    usuario?.nombre || "",
    email:     usuario?.email  || "",
    rol:       usuario?.rol    || "cajero",
    color:     usuario?.color  || COLORES_USUARIO[0],
    password:  "",
  });

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const guardar = () => {
    if (!form.nombre.trim()) { toast("El nombre es obligatorio.", "error"); return; }
    if (!esEdicion && !form.password) { toast("La contraseña es obligatoria.", "error"); return; }
    if (!esEdicion && form.password.length < 4) { toast("La contraseña debe tener al menos 4 caracteres.", "error"); return; }
    onGuardar({ ...form, nombre: form.nombre.trim(), email: form.email.trim() });
  };

  return (
    <Modal onClose={onClose} size="modal-sm">
      <div className="modal-header">
        <div className="modal-title">{esEdicion ? "Editar usuario" : "Nuevo usuario"}</div>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

        <div className="form-group">
          <label className="form-label">Nombre *</label>
          <input
            className="form-input"
            value={form.nombre}
            onChange={e => set("nombre", e.target.value)}
            placeholder="Ej: Juan Pérez"
          />
        </div>

        {!esEdicion && (
          <div className="form-group">
            <label className="form-label">Contraseña *</label>
            <input
              className="form-input"
              type="password"
              value={form.password}
              onChange={e => set("password", e.target.value)}
              placeholder="Mínimo 4 caracteres"
              autoComplete="new-password"
            />
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Email <span style={{ fontSize: 11, color: "var(--text3)" }}>(opcional)</span></label>
          <input
            className="form-input"
            type="email"
            value={form.email}
            onChange={e => set("email", e.target.value)}
            placeholder="contacto@email.com"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Rol</label>
          <select className="form-select" value={form.rol} onChange={e => set("rol", e.target.value)}>
            {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Color</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {COLORES_USUARIO.map(c => (
              <div
                key={c}
                onClick={() => set("color", c)}
                style={{
                  width: 26, height: 26, borderRadius: "50%", background: c, cursor: "pointer",
                  border: form.color === c ? "2px solid var(--text1)" : "2px solid transparent",
                  boxShadow: form.color === c ? "0 0 0 2px var(--bg2)" : "none",
                }}
              />
            ))}
          </div>
        </div>

      </div>
      <div className="modal-footer">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={guardar}>
          <Icon name="check" size={14}/> {esEdicion ? "Guardar cambios" : "Crear usuario"}
        </button>
      </div>
    </Modal>
  );
}
