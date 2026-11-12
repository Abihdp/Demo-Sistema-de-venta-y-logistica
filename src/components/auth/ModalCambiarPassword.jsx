import { useState } from 'react'
import Icon from '../ui/Icon.jsx'
import { Modal } from '../ui/Modal.jsx'
import { useToast } from '../ui/Toast.jsx'

export default function ModalCambiarPassword({ onClose, onConfirm }) {
  const { toast }  = useToast()
  const [nueva,    setNueva]    = useState('')
  const [confirma, setConfirma] = useState('')
  const [loading,  setLoading]  = useState(false)

  const guardar = async () => {
    if (!nueva) { toast('Ingresá la nueva contraseña.', 'error'); return }
    if (nueva.length < 6) { toast('La contraseña debe tener al menos 6 caracteres.', 'error'); return }
    if (nueva !== confirma) { toast('Las contraseñas no coinciden.', 'error'); return }
    setLoading(true)
    try {
      await onConfirm(nueva)
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal onClose={onClose} size="modal-sm">
      <div className="modal-header">
        <div className="modal-title">Cambiar contraseña</div>
        <button className="close-btn" onClick={onClose}><Icon name="close" size={16}/></button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="form-group">
          <label className="form-label">Nueva contraseña</label>
          <input
            className="form-input" type="password"
            placeholder="Mínimo 6 caracteres"
            value={nueva} onChange={e => setNueva(e.target.value)}
            autoFocus
          />
        </div>
        <div className="form-group">
          <label className="form-label">Confirmar contraseña</label>
          <input
            className="form-input" type="password"
            placeholder="Repetir contraseña"
            value={confirma} onChange={e => setConfirma(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && guardar()}
          />
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={guardar} disabled={loading}>
          <Icon name="check" size={14}/> {loading ? 'Guardando...' : 'Cambiar contraseña'}
        </button>
      </div>
    </Modal>
  )
}
