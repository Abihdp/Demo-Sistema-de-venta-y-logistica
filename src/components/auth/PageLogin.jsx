import { useState } from 'react'
import { DEMO_USUARIOS } from '../../lib/demoSeed'

export default function PageLogin({ onLogin, errorAuth }) {
  const [nombre,   setNombre]   = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)

  const handleSubmit = async () => {
    if (!nombre.trim() || !password) {
      setError('Completá el usuario y la contraseña')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await onLogin(nombre.trim(), password)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'var(--bg1)',
    }}>
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg, 12px)', padding: '36px 32px',
        width: '100%', maxWidth: 380,
        boxShadow: '0 24px 48px rgba(0,0,0,0.4)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            fontSize: 28, fontWeight: 800, letterSpacing: '-.02em',
            color: 'var(--text1)', marginBottom: 4,
          }}>
            PECO S.
          </div>
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>
            Sistema de gestión comercial
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Usuario</label>
            <input
              className="form-input"
              type="text"
              autoFocus
              autoComplete="username"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="Tu nombre de usuario"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Contraseña</label>
            <input
              className="form-input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="••••••••"
            />
          </div>

          {(error || errorAuth) && (
            <div style={{
              padding: '10px 12px', borderRadius: 8, fontSize: 13,
              background: 'rgba(242,107,91,0.1)', color: 'var(--red)',
              border: '1px solid rgba(242,107,91,0.2)',
            }}>
              {error || errorAuth}
            </div>
          )}

          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', marginTop: 4, padding: '11px 0' }}
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? 'Iniciando sesión...' : 'Ingresar'}
          </button>
        </div>

        <div style={{
          marginTop: 20, padding: '12px 14px', borderRadius: 8, fontSize: 12,
          background: 'var(--bg3, rgba(255,255,255,0.04))', border: '1px solid var(--border)',
          color: 'var(--text2)', lineHeight: 1.5,
        }}>
          <div style={{ fontWeight: 700, color: 'var(--text1)', marginBottom: 6 }}>
            Versión demo
          </div>
          <div style={{ marginBottom: 8 }}>
            Probá todas las funciones libremente. Los datos se guardan solo en este navegador.
          </div>
          {DEMO_USUARIOS.map(u => (
            <button
              key={u.nombre}
              type="button"
              onClick={() => { setNombre(u.nombre); setPassword(u.password); setError(null) }}
              style={{
                display: 'flex', justifyContent: 'space-between', width: '100%',
                background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0',
                color: 'var(--text2)', fontSize: 12, fontFamily: 'inherit',
              }}
              title="Completar usuario y contraseña"
            >
              <span><b style={{ color: 'var(--text1)' }}>{u.nombre}</b> / {u.password}</span>
              <span style={{ color: 'var(--text3)' }}>{u.rol}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
