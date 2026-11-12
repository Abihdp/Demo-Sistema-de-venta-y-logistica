import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const SESSION_KEY = 'peco_auth_session'

async function hashPassword(password) {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function usuarioFromRow(row) {
  return {
    id:       row.id,
    nombre:   row.nombre,
    email:    row.email || '',
    rol:      row.rol,
    color:    row.color || '#7c6fef',
    permisos: row.permisos || {},
    activo:   row.activo,
  }
}

export function useAuth() {
  const [usuarioActivo, setUsuarioActivo] = useState(null)
  const [usuarios,      setUsuarios]      = useState([])
  const [loadingAuth,   setLoadingAuth]   = useState(true)
  const [errorAuth,     setErrorAuth]     = useState(null)

  // Restaurar sesión guardada en localStorage. Siempre se revalida contra
  // Supabase (por si el usuario fue desactivado entre tanto) — pero si esa
  // revalidación no responde a tiempo (sin conexión), se confía de entrada en
  // la sesión guardada para no dejar TODA la app trabada en "Verificando
  // sesión..." esperando una red que no está — la revalidación real sigue en
  // curso igual y corrige el estado si llega a completarse después.
  useEffect(() => {
    const stored = localStorage.getItem(SESSION_KEY)
    if (!stored) { setLoadingAuth(false); return }
    let saved
    try { saved = JSON.parse(stored) }
    catch { localStorage.removeItem(SESSION_KEY); setLoadingAuth(false); return }

    let resuelto = false
    let fallbackUsado = false
    const timeoutId = setTimeout(() => {
      if (resuelto) return
      fallbackUsado = true
      // Confiar en la sesión guardada solo si tiene la forma esperada — una
      // sesión corrupta o incompleta no debe hacer caer el resto de la app.
      if (saved?.id != null && saved?.nombre) setUsuarioActivo(saved)
      setLoadingAuth(false)
    }, 4000)

    supabase.from('usuarios').select('*').eq('id', saved.id).single()
      .then(({ data }) => {
        resuelto = true
        clearTimeout(timeoutId)
        if (data && data.activo !== false) {
          // Respuesta real y válida: confirma/refresca la sesión (llegue
          // rápido o tarde, incluso después de haber usado el fallback).
          setUsuarioActivo(usuarioFromRow(data))
        } else if (!fallbackUsado) {
          // Sin fallback de por medio, esta es la única respuesta que vamos a
          // tener — si dice que el usuario no existe o está desactivado, es
          // información real, no un problema de red: cerrar la sesión.
          localStorage.removeItem(SESSION_KEY)
          setUsuarioActivo(null)
        }
        // Si ya se usó el fallback y la respuesta tardía viene con error, no
        // se toca nada: no hay forma confiable de distinguir "el usuario ya
        // no existe" de "no se pudo llegar a Supabase" — y desloguear a un
        // cajero en medio de un corte de conexión sería peor que esperar a
        // la próxima revalidación real.
        setLoadingAuth(false)
      })
      .catch(() => {}) // fetch rechazado (sin red) — ya lo cubrió el timeout de arriba
  }, [])

  const cargarUsuarios = useCallback(async () => {
    const { data, error } = await supabase
      .from('usuarios').select('*').order('nombre')
    if (error) throw new Error(error.message)
    setUsuarios((data || []).map(usuarioFromRow))
  }, [])

  const login = useCallback(async (nombre, password) => {
    setErrorAuth(null)
    const hash = await hashPassword(password)
    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .ilike('nombre', nombre.trim())
      .eq('contrasena', hash)
      .neq('activo', false)
      .maybeSingle()
    if (error) throw new Error('Error al iniciar sesión')
    if (!data) throw new Error('Usuario o contraseña incorrectos')
    const user = usuarioFromRow(data)
    setUsuarioActivo(user)
    localStorage.setItem(SESSION_KEY, JSON.stringify(user))
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY)
    setUsuarioActivo(null)
  }, [])

  const invitarUsuario = useCallback(async (datosUsuario) => {
    const hash = datosUsuario.password
      ? await hashPassword(datosUsuario.password)
      : null
    const { data, error } = await supabase.from('usuarios')
      .insert({
        nombre:     datosUsuario.nombre,
        email:      datosUsuario.email || null,
        rol:        datosUsuario.rol,
        color:      datosUsuario.color || '#7c6fef',
        permisos:   datosUsuario.permisos || {},
        activo:     true,
        contrasena: hash,
        pin:        '0000',
      })
      .select().single()
    if (error) throw new Error(error.message)
    await cargarUsuarios()
    return data
  }, [cargarUsuarios])

  const actualizarUsuario = useCallback(async (id, cambios) => {
    const row = { updated_at: new Date().toISOString() }
    if (cambios.nombre   !== undefined) row.nombre   = cambios.nombre
    if (cambios.rol      !== undefined) row.rol      = cambios.rol
    if (cambios.color    !== undefined) row.color    = cambios.color
    if (cambios.permisos !== undefined) row.permisos = cambios.permisos
    if (cambios.activo   !== undefined) row.activo   = cambios.activo
    const { data, error } = await supabase.from('usuarios')
      .update(row).eq('id', id).select().single()
    if (error) throw new Error(error.message)
    await cargarUsuarios()
    if (usuarioActivo?.id === id) {
      const updated = { ...usuarioActivo, ...cambios }
      setUsuarioActivo(updated)
      localStorage.setItem(SESSION_KEY, JSON.stringify(updated))
    }
    return data
  }, [cargarUsuarios, usuarioActivo])

  const cambiarPassword = useCallback(async (nuevaPassword) => {
    if (!usuarioActivo) throw new Error('No hay usuario activo')
    const hash = await hashPassword(nuevaPassword)
    const { error } = await supabase.from('usuarios')
      .update({ contrasena: hash }).eq('id', usuarioActivo.id)
    if (error) throw new Error(error.message)
  }, [usuarioActivo])

  const resetearPassword = useCallback(async () => {
    throw new Error('Contactá al administrador para restablecer tu contraseña.')
  }, [])

  return {
    session:      usuarioActivo ? { user: { id: usuarioActivo.id } } : null,
    usuarioActivo,
    usuarios,
    loadingAuth,
    errorAuth,
    login,
    logout,
    invitarUsuario,
    actualizarUsuario,
    cambiarPassword,
    resetearPassword,
    cargarUsuarios,
  }
}
