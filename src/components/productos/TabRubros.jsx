import { useState } from 'react'
import Icon from '../ui/Icon.jsx'
import { useToast } from '../ui/Toast.jsx'
import { useConfirm } from '../ui/Confirm.jsx'

export default function TabRubros({
  rubros,
  agregarRubro, editarRubro, desactivarRubro,
  agregarSubrubro, editarSubrubro, desactivarSubrubro,
}) {
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [rubroSelId, setRubroSelId]   = useState(rubros[0]?.id ?? null)
  const [editandoRubro, setEditandoRubro] = useState(null)  // { id, nombre }
  const [editandoMargen, setEditandoMargen] = useState(null) // { id, valor }
  const [nuevoRubro, setNuevoRubro]   = useState('')
  const [editandoSub, setEditandoSub] = useState(null)      // { id, nombre }
  const [nuevoSub, setNuevoSub]       = useState('')
  const [loading, setLoading]         = useState(false)

  const rubroSel = rubros.find(r => r.id === rubroSelId) || null

  const handleAgregarRubro = async () => {
    if (!nuevoRubro.trim()) return
    setLoading(true)
    try {
      const nuevo = await agregarRubro(nuevoRubro)
      setNuevoRubro('')
      setRubroSelId(nuevo.id)
    } catch (err) {
      toast('Error al agregar rubro: ' + err.message, 'error')
    } finally { setLoading(false) }
  }

  const handleEditarRubro = async (id, nombre) => {
    setLoading(true)
    try {
      await editarRubro(id, { nombre })
      setEditandoRubro(null)
    } catch (err) {
      toast('Error al editar rubro: ' + err.message, 'error')
    } finally { setLoading(false) }
  }

  const handleGuardarMargen = async (id, valor) => {
    const margen = valor.trim() === '' ? null : Number(valor)
    if (margen !== null && (isNaN(margen) || margen < 0)) {
      toast('El margen debe ser un número mayor o igual a 0 (o vacío para usar el margen global).', 'error')
      return
    }
    setLoading(true)
    try {
      await editarRubro(id, { margen })
      setEditandoMargen(null)
    } catch (err) {
      toast('Error al editar el margen: ' + err.message, 'error')
    } finally { setLoading(false) }
  }

  const handleDesactivarRubro = async (r) => {
    if (!await confirm(`¿Desactivar el rubro "${r.nombre}"? Los productos que lo usan no se modifican.`, { danger: true, confirmLabel: 'Desactivar' })) return
    try {
      await desactivarRubro(r.id)
      if (rubroSelId === r.id) setRubroSelId(null)
    } catch (err) {
      toast('Error al desactivar rubro: ' + err.message, 'error')
    }
  }

  const handleAgregarSub = async () => {
    if (!nuevoSub.trim() || !rubroSelId) return
    setLoading(true)
    try {
      await agregarSubrubro(rubroSelId, nuevoSub)
      setNuevoSub('')
    } catch (err) {
      toast('Error al agregar subrubro: ' + err.message, 'error')
    } finally { setLoading(false) }
  }

  const handleEditarSub = async (rubroId, subId, nombre) => {
    setLoading(true)
    try {
      await editarSubrubro(rubroId, subId, nombre)
      setEditandoSub(null)
    } catch (err) {
      toast('Error al editar subrubro: ' + err.message, 'error')
    } finally { setLoading(false) }
  }

  const handleDesactivarSub = async (rubroId, s) => {
    if (!await confirm(`¿Eliminar el subrubro "${s.nombre}"?`, { danger: true, confirmLabel: 'Eliminar' })) return
    try {
      await desactivarSubrubro(rubroId, s.id)
    } catch (err) {
      toast('Error al eliminar subrubro: ' + err.message, 'error')
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16, alignItems: 'start' }}>

      {/* ── Columna izquierda: Rubros ── */}
      <div className="card" style={{ margin: 0 }}>
        <div className="card-title">Rubros</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
          {rubros.map(r => (
            <div
              key={r.id}
              onClick={() => { setRubroSelId(r.id); setEditandoSub(null) }}
              style={{
                display: 'flex', flexDirection: 'column', gap: 4,
                padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                background: r.id === rubroSelId ? 'rgba(124,111,239,0.12)' : 'var(--bg3)',
                border: `1px solid ${r.id === rubroSelId ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                {editandoRubro?.id === r.id ? (
                  <input
                    className="form-input"
                    style={{ padding: '3px 8px', fontSize: 13, flex: 1, marginRight: 6 }}
                    value={editandoRubro.nombre}
                    autoFocus
                    onChange={e => setEditandoRubro({ ...editandoRubro, nombre: e.target.value })}
                    onKeyDown={e => {
                      if (e.key === 'Enter')  handleEditarRubro(r.id, editandoRubro.nombre)
                      if (e.key === 'Escape') setEditandoRubro(null)
                    }}
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <span style={{ fontSize: 13, color: 'var(--text1)', fontWeight: r.id === rubroSelId ? 600 : 400, flex: 1 }}>
                    {r.nombre}
                    <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 6 }}>({r.subrubros.length})</span>
                  </span>
                )}

                <div style={{ display: 'flex', gap: 2 }} onClick={e => e.stopPropagation()}>
                  {editandoRubro?.id === r.id ? (
                    <>
                      <button className="btn btn-sm btn-primary" style={{ padding: '2px 8px' }}
                        onClick={() => handleEditarRubro(r.id, editandoRubro.nombre)}>✓</button>
                      <button className="btn btn-sm btn-ghost" style={{ padding: '2px 8px' }}
                        onClick={() => setEditandoRubro(null)}>✕</button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-sm btn-ghost" title="Editar rubro"
                        onClick={() => setEditandoRubro({ id: r.id, nombre: r.nombre })}>
                        <Icon name="edit" size={12} />
                      </button>
                      <button className="btn btn-sm btn-ghost" title="Desactivar rubro"
                        onClick={() => handleDesactivarRubro(r)}>
                        <Icon name="close" size={12} color="var(--red)" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Margen propio del rubro — opcional, pisa el margen global si está seteado */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={e => e.stopPropagation()}>
                {editandoMargen?.id === r.id ? (
                  <>
                    <input
                      type="number" min={0}
                      className="form-input mono"
                      style={{ padding: '3px 8px', fontSize: 12, width: 70 }}
                      value={editandoMargen.valor}
                      autoFocus
                      placeholder="Auto"
                      onChange={e => setEditandoMargen({ ...editandoMargen, valor: e.target.value })}
                      onKeyDown={e => {
                        if (e.key === 'Enter')  handleGuardarMargen(r.id, editandoMargen.valor)
                        if (e.key === 'Escape') setEditandoMargen(null)
                      }}
                    />
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>%</span>
                    <button className="btn btn-sm btn-primary" style={{ padding: '2px 8px' }}
                      onClick={() => handleGuardarMargen(r.id, editandoMargen.valor)}>✓</button>
                    <button className="btn btn-sm btn-ghost" style={{ padding: '2px 8px' }}
                      onClick={() => setEditandoMargen(null)}>✕</button>
                  </>
                ) : (
                  <span
                    style={{ fontSize: 11, color: r.margen != null ? 'var(--accent2)' : 'var(--text3)', cursor: 'pointer' }}
                    title="Click para editar el margen propio de este rubro"
                    onClick={() => setEditandoMargen({ id: r.id, valor: r.margen != null ? String(r.margen) : '' })}
                  >
                    <Icon name="tag" size={10} /> Margen: {r.margen != null ? `${r.margen}%` : 'usa el global'}
                  </span>
                )}
              </div>
            </div>
          ))}
          {rubros.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--text3)', padding: '12px 0' }}>
              Sin rubros todavía — agregá el primero abajo
            </div>
          )}
        </div>

        {/* Input para agregar rubro nuevo */}
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            className="form-input"
            placeholder="Nuevo rubro..."
            value={nuevoRubro}
            onChange={e => setNuevoRubro(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAgregarRubro()}
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary btn-sm" disabled={!nuevoRubro.trim() || loading}
            onClick={handleAgregarRubro}>
            <Icon name="plus" size={13} />
          </button>
        </div>
      </div>

      {/* ── Columna derecha: Subrubros del rubro seleccionado ── */}
      <div className="card" style={{ margin: 0 }}>
        <div className="card-title">
          Subrubros
          {rubroSel && (
            <span style={{ fontWeight: 400, color: 'var(--accent)', marginLeft: 8 }}>
              — {rubroSel.nombre}
            </span>
          )}
        </div>

        {!rubroSel ? (
          <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
            Seleccioná un rubro para ver sus subrubros
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
              {rubroSel.subrubros.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text3)', padding: '12px 0' }}>
                  Sin subrubros todavía — agregá el primero abajo
                </div>
              ) : rubroSel.subrubros.map(s => (
                <div key={s.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 10px', borderRadius: 8,
                  background: 'var(--bg3)', border: '1px solid var(--border)',
                }}>
                  {editandoSub?.id === s.id ? (
                    <input
                      className="form-input"
                      style={{ padding: '3px 8px', fontSize: 13, flex: 1, marginRight: 6 }}
                      value={editandoSub.nombre}
                      autoFocus
                      onChange={e => setEditandoSub({ ...editandoSub, nombre: e.target.value })}
                      onKeyDown={e => {
                        if (e.key === 'Enter')  handleEditarSub(rubroSel.id, s.id, editandoSub.nombre)
                        if (e.key === 'Escape') setEditandoSub(null)
                      }}
                    />
                  ) : (
                    <span style={{ fontSize: 13, color: 'var(--text1)', flex: 1 }}>{s.nombre}</span>
                  )}

                  <div style={{ display: 'flex', gap: 2 }}>
                    {editandoSub?.id === s.id ? (
                      <>
                        <button className="btn btn-sm btn-primary" style={{ padding: '2px 8px' }}
                          onClick={() => handleEditarSub(rubroSel.id, s.id, editandoSub.nombre)}>✓</button>
                        <button className="btn btn-sm btn-ghost" style={{ padding: '2px 8px' }}
                          onClick={() => setEditandoSub(null)}>✕</button>
                      </>
                    ) : (
                      <>
                        <button className="btn btn-sm btn-ghost" title="Editar subrubro"
                          onClick={() => setEditandoSub({ id: s.id, nombre: s.nombre })}>
                          <Icon name="edit" size={12} />
                        </button>
                        <button className="btn btn-sm btn-ghost" title="Eliminar subrubro"
                          onClick={() => handleDesactivarSub(rubroSel.id, s)}>
                          <Icon name="trash" size={12} color="var(--red)" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Input para agregar subrubro nuevo */}
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                className="form-input"
                placeholder={`Nuevo subrubro en ${rubroSel.nombre}...`}
                value={nuevoSub}
                onChange={e => setNuevoSub(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAgregarSub()}
                style={{ flex: 1 }}
              />
              <button className="btn btn-primary btn-sm" disabled={!nuevoSub.trim() || loading}
                onClick={handleAgregarSub}>
                <Icon name="plus" size={13} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
