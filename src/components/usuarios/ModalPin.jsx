import { useState } from "react";
import Icon from "../ui/Icon.jsx";
import { Modal } from "../ui/Modal.jsx";

// Confirma el PIN del usuario elegido antes de activarlo como usuario actual.
export default function ModalPin({ usuario, onClose, onSuccess }) {
  const [pin, setPin]   = useState("");
  const [error, setError] = useState("");

  const confirmar = () => {
    if (pin !== (usuario.pin || "")) {
      setError("PIN incorrecto");
      setPin("");
      return;
    }
    onSuccess();
  };

  return (
    <Modal onClose={onClose} size="modal-sm">
      <div className="modal-header">
        <div className="modal-title">Ingresar como {usuario.nombre}</div>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>
      <div className="form-group">
        <label className="form-label">PIN</label>
        <input
          autoFocus
          className="form-input"
          type="password"
          inputMode="numeric"
          maxLength={6}
          placeholder="••••"
          value={pin}
          onChange={e => { setPin(e.target.value.replace(/\D/g, "")); setError(""); }}
          onKeyDown={e => e.key === "Enter" && confirmar()}
        />
        {error && <div style={{ fontSize: 12, color: "var(--red)", marginTop: 6 }}>{error}</div>}
      </div>
      <div className="modal-footer">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={confirmar}>
          <Icon name="check" size={14}/> Ingresar
        </button>
      </div>
    </Modal>
  );
}
