import { useState } from 'react'
import Icon from '../ui/Icon.jsx'
import { useToast } from '../ui/Toast.jsx'
import { useConfirm } from '../ui/Confirm.jsx'

export default function TabTarjetas({
  tarjetas,
  agregarTarjeta, editarTarjeta, desactivarTarjeta,
  agregarCuota, editarCuota, eliminarCuota,
}) {
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [tarjetaSelId, setTarjetaSelId]     = useState(tarjetas[0]?.id ?? null)
  const [editandoTarjeta, setEditandoTarjeta] = useState(null) // { id, nombre, banco }
  const [nuevoNombre, setNuevoNombre]       = useState('')
  const [nuevoBanco, setNuevoBanco]         = useState('')
  const [editandoCuota, setEditandoCuota]   = useState(null)   // { id, cuotas, interesPct }
  const [nuevaCuota, setNuevaCuota]         = useState({ cuotas: '', interesPct: '' })
  const [loading, setLoading]               = useState(false)

  const tarjetaSel = tarjetas.find(t => t.id === tarjetaSelId) || null

  const handleAgregarTarjeta = async () => {
    if (!nuevoNombre.trim()) return
    setLoading(true)
    try {
      const nueva = await agregarTarjeta({ nombre: nuevoNombre, banco: nuevoBanco })
      setNuevoNombre('')
      setNuevoBanco('')
      setTarjetaSelId(nueva.id)
    } catch (err) {
      toast('Error al agregar tarjeta: ' + err.message, 'error')
    } finally { setLoading(false) }
  }

  const handleEditarTarjeta = async (id, nombre, banco) => {
    if (!nombre.trim()) { toast('El nombre de la tarjeta no puede estar vacío.', 'error'); return }
    setLoading(true)
    try {
      await editarTarjeta(id, { nombre, banco })
      setEditandoTarjeta(null)
    } catch (err) {
      toast('Error al editar tarjeta: ' + err.message, 'error')
    } finally { setLoading(false) }
  }

  const handleDesactivarTarjeta = async (t) => {
    if (!await confirm(`¿Desactivar "${t.nombre}"? Ya no va a aparecer como opción al cobrar en Ventas.`, { danger: true, confirmLabel: 'Desactivar' })) return
    try {
      await desactivarTarjeta(t.id)
      if (tarjetaSelId === t.id) setTarjetaSelId(null)
    } catch (err) {
      toast('Error al desactivar tarjeta: ' + err.message, 'error')
    }
  }

  const handleAgregarCuota = async () => {
    const cuotas = Number(nuevaCuota.cuotas)
    const interesPct = nuevaCuota.interesPct.trim() === '' ? 0 : Number(nuevaCuota.interesPct)
    if (!cuotas || cuotas < 1 || isNaN(cuotas)) { toast('La cantidad de cuotas debe ser un número mayor a 0.', 'error'); return }
    if (isNaN(interesPct) || interesPct < 0) { toast('El interés debe ser un número mayor o igual a 0.', 'error'); return }
    if (!tarjetaSelId) return
    if (tarjetaSel?.cuotas.some(c => c.cuotas === cuotas)) { toast(`"${tarjetaSel.nombre}" ya tiene cargada la opción de ${cuotas} cuota${cuotas !== 1 ? 's' : ''}.`, 'error'); return }
    setLoading(true)
    try {
      await agregarCuota(tarjetaSelId, { cuotas, interesPct })
      setNuevaCuota({ cuotas: '', interesPct: '' })
    } catch (err) {
      toast('Error al agregar la cuota: ' + err.message, 'error')
    } finally { setLoading(false) }
  }

  const handleEditarCuota = async (tarjetaId, cuotaId, cuotas, interesPct) => {
    const cNum = Number(cuotas)
    const iNum = Number(interesPct)
    if (!cNum || cNum < 1 || isNaN(cNum)) { toast('La cantidad de cuotas debe ser un número mayor a 0.', 'error'); return }
    if (isNaN(iNum) || iNum < 0) { toast('El interés debe ser un número mayor o igual a 0.', 'error'); return }
    setLoading(true)
    try {
      await editarCuota(tarjetaId, cuotaId, { cuotas: cNum, interesPct: iNum })
      setEditandoCuota(null)
    } catch (err) {
      toast('Error al editar la cuota: ' + err.message, 'error')
    } finally { setLoading(false) }
  }

  const handleEliminarCuota = async (tarjetaId, c) => {
    if (!await confirm(`¿Eliminar la opción de ${c.cuotas} cuota${c.cuotas !== 1 ? 's' : ''}?`, { danger: true, confirmLabel: 'Eliminar' })) return
    try {
      await eliminarCuota(tarjetaId, c.id)
    } catch (err) {
      toast('Error al eliminar: ' + err.message, 'error')
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, alignItems: 'start' }}>

      {/* ── Columna izquierda: Tarjetas ── */}
      <div className="card" style={{ margin: 0 }}>
        <div className="card-title">Tarjetas</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
          {tarjetas.map(t => (
            <div
              key={t.id}
              onClick={() => setTarjetaSelId(t.id)}
              style={{
                display: 'flex', flexDirection: 'column', gap: 4,
                padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                background: t.id === tarjetaSelId ? 'rgba(124,111,239,0.12)' : 'var(--bg3)',
                border: `1px solid ${t.id === tarjetaSelId ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                {editandoTarjeta?.id === t.id ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, marginRight: 6 }} onClick={e => e.stopPropagation()}>
                    <input
                      className="form-input"
                      style={{ padding: '3px 8px', fontSize: 13 }}
                      value={editandoTarjeta.nombre}
                      autoFocus
                      placeholder="Nombre (ej: Visa)"
                      onChange={e => setEditandoTarjeta({ ...editandoTarjeta, nombre: e.target.value })}
                      onKeyDown={e => e.key === 'Escape' && setEditandoTarjeta(null)}
                    />
                    <input
                      className="form-input"
                      style={{ padding: '3px 8px', fontSize: 12 }}
                      value={editandoTarjeta.banco}
                      placeholder="Banco (opcional)"
                      onChange={e => setEditandoTarjeta({ ...editandoTarjeta, banco: e.target.value })}
                      onKeyDown={e => {
                        if (e.key === 'Enter')  handleEditarTarjeta(t.id, editandoTarjeta.nombre, editandoTarjeta.banco)
                        if (e.key === 'Escape') setEditandoTarjeta(null)
                      }}
                    />
                  </div>
                ) : (
                  <span style={{ fontSize: 13, color: 'var(--text1)', fontWeight: t.id === tarjetaSelId ? 600 : 400, flex: 1 }}>
                    {t.nombre}
                    {t.banco && <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 6 }}>({t.banco})</span>}
                    <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 6 }}>— {t.cuotas.length} opción{t.cuotas.length !== 1 ? 'es' : ''}</span>
                  </span>
                )}

                <div style={{ display: 'flex', gap: 2, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  {editandoTarjeta?.id === t.id ? (
                    <>
                      <button className="btn btn-sm btn-primary" style={{ padding: '2px 8px' }}
                        onClick={() => handleEditarTarjeta(t.id, editandoTarjeta.nombre, editandoTarjeta.banco)}>✓</button>
                      <button className="btn btn-sm btn-ghost" style={{ padding: '2px 8px' }}
                        onClick={() => setEditandoTarjeta(null)}>✕</button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-sm btn-ghost" title="Editar tarjeta"
                        onClick={() => setEditandoTarjeta({ id: t.id, nombre: t.nombre, banco: t.banco })}>
                        <Icon name="edit" size={12} />
                      </button>
                      <button className="btn btn-sm btn-ghost" title="Desactivar tarjeta"
                        onClick={() => handleDesactivarTarjeta(t)}>
                        <Icon name="close" size={12} color="var(--red)" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
          {tarjetas.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--text3)', padding: '12px 0' }}>
              Sin tarjetas todavía — agregá la primera abajo
            </div>
          )}
        </div>

        {/* Alta de tarjeta nueva */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input
            className="form-input"
            placeholder="Nombre (ej: Visa, Mastercard...)"
            value={nuevoNombre}
            onChange={e => setNuevoNombre(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAgregarTarjeta()}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              className="form-input"
              placeholder="Banco (opcional)"
              value={nuevoBanco}
              onChange={e => setNuevoBanco(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAgregarTarjeta()}
              style={{ flex: 1 }}
            />
            <button className="btn btn-primary btn-sm" disabled={!nuevoNombre.trim() || loading}
              onClick={handleAgregarTarjeta}>
              <Icon name="plus" size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Columna derecha: Cuotas / interés de la tarjeta seleccionada ── */}
      <div className="card" style={{ margin: 0 }}>
        <div className="card-title">
          Cuotas e interés
          {tarjetaSel && (
            <span style={{ fontWeight: 400, color: 'var(--accent)', marginLeft: 8 }}>
              — {tarjetaSel.nombre}
            </span>
          )}
        </div>

        {!tarjetaSel ? (
          <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
            Seleccioná una tarjeta para ver o cargar sus cuotas
          </div>
        ) : (
          <>
            <div className="table-wrap" style={{ marginBottom: 14 }}>
              <table>
                <thead>
                  <tr>
                    <th>Cuotas</th>
                    <th>Interés (%)</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {tarjetaSel.cuotas.length === 0 ? (
                    <tr>
                      <td colSpan={3} style={{ textAlign: 'center', color: 'var(--text3)', padding: '16px 0', fontSize: 13 }}>
                        Sin cuotas todavía — agregá la primera abajo
                      </td>
                    </tr>
                  ) : tarjetaSel.cuotas.map(c => (
                    <tr key={c.id}>
                      {editandoCuota?.id === c.id ? (
                        <>
                          <td>
                            <input
                              type="number" min={1} className="form-input mono"
                              style={{ width: 80, padding: '4px 8px', fontSize: 13 }}
                              value={editandoCuota.cuotas}
                              autoFocus
                              onChange={e => setEditandoCuota({ ...editandoCuota, cuotas: e.target.value })}
                            />
                          </td>
                          <td>
                            <input
                              type="number" min={0} className="form-input mono"
                              style={{ width: 90, padding: '4px 8px', fontSize: 13 }}
                              value={editandoCuota.interesPct}
                              onChange={e => setEditandoCuota({ ...editandoCuota, interesPct: e.target.value })}
                              onKeyDown={e => {
                                if (e.key === 'Enter')  handleEditarCuota(tarjetaSel.id, c.id, editandoCuota.cuotas, editandoCuota.interesPct)
                                if (e.key === 'Escape') setEditandoCuota(null)
                              }}
                            />
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                              <button className="btn btn-sm btn-primary" style={{ padding: '2px 8px' }}
                                onClick={() => handleEditarCuota(tarjetaSel.id, c.id, editandoCuota.cuotas, editandoCuota.interesPct)}>✓</button>
                              <button className="btn btn-sm btn-ghost" style={{ padding: '2px 8px' }}
                                onClick={() => setEditandoCuota(null)}>✕</button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td style={{ color: 'var(--text1)', fontWeight: 500 }}>{c.cuotas} cuota{c.cuotas !== 1 ? 's' : ''}</td>
                          <td style={{ color: c.interesPct > 0 ? 'var(--amber)' : 'var(--green)', fontWeight: 600 }}>
                            {c.interesPct > 0 ? `+${c.interesPct}%` : 'Sin interés'}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                              <button className="btn btn-sm btn-ghost" title="Editar"
                                onClick={() => setEditandoCuota({ id: c.id, cuotas: String(c.cuotas), interesPct: String(c.interesPct) })}>
                                <Icon name="edit" size={12} />
                              </button>
                              <button className="btn btn-sm btn-ghost" title="Eliminar"
                                onClick={() => handleEliminarCuota(tarjetaSel.id, c)}>
                                <Icon name="trash" size={12} color="var(--red)" />
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Alta de cuota nueva */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div className="form-group" style={{ width: 110, marginBottom: 0 }}>
                <label className="form-label">Cuotas</label>
                <input
                  type="number" min={1} className="form-input mono"
                  placeholder="Ej: 6"
                  value={nuevaCuota.cuotas}
                  onChange={e => setNuevaCuota({ ...nuevaCuota, cuotas: e.target.value })}
                  onKeyDown={e => e.key === 'Enter' && handleAgregarCuota()}
                />
              </div>
              <div className="form-group" style={{ width: 130, marginBottom: 0 }}>
                <label className="form-label">Interés (%)</label>
                <input
                  type="number" min={0} className="form-input mono"
                  placeholder="Ej: 15"
                  value={nuevaCuota.interesPct}
                  onChange={e => setNuevaCuota({ ...nuevaCuota, interesPct: e.target.value })}
                  onKeyDown={e => e.key === 'Enter' && handleAgregarCuota()}
                />
              </div>
              <button className="btn btn-primary btn-sm" disabled={loading} onClick={handleAgregarCuota}>
                <Icon name="plus" size={13} /> Agregar
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>
              El % de interés se suma al total de la venta cuando se cobra con esta tarjeta en esa cantidad de cuotas. Dejalo en 0 para "sin interés".
            </div>
          </>
        )}
      </div>
    </div>
  )
}
