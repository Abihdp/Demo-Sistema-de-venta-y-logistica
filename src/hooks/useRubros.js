import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

function rubroFromDB(row, subrubros = []) {
  return {
    id:        row.id,
    nombre:    row.nombre,
    activo:    row.activo ?? true,
    orden:     row.orden ?? 0,
    margen:    row.margen != null ? Number(row.margen) : null,
    subrubros: subrubros,
  }
}

export function useRubros() {
  const [rubros,    setRubros]    = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)

    const [resRubros, resSubrubros] = await Promise.all([
      supabase.from('rubros').select('*').eq('activo', true).order('orden').order('nombre'),
      supabase.from('subrubros').select('*').eq('activo', true).order('orden').order('nombre'),
    ])

    if (resRubros.error)     { setError(resRubros.error.message);     setLoading(false); return }
    if (resSubrubros.error)  { setError(resSubrubros.error.message);  setLoading(false); return }

    const subrubrosMap = {}
    ;(resSubrubros.data || []).forEach(s => {
      if (!subrubrosMap[s.rubro_id]) subrubrosMap[s.rubro_id] = []
      subrubrosMap[s.rubro_id].push({ id: s.id, nombre: s.nombre, orden: s.orden, activo: s.activo })
    })

    const mapped = (resRubros.data || []).map(r =>
      rubroFromDB(r, subrubrosMap[r.id] || [])
    )
    setRubros(mapped)
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  // ── Rubros ────────────────────────────────────────────────
  const agregarRubro = useCallback(async (nombre) => {
    const { data, error } = await supabase
      .from('rubros')
      .insert({ nombre: nombre.trim().toUpperCase(), activo: true })
      .select()
      .single()
    if (error) throw new Error(error.message)
    const nuevo = rubroFromDB(data, [])
    setRubros(prev => [...prev, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre)))
    return nuevo
  }, [])

  const editarRubro = useCallback(async (id, cambios) => {
    const row = {}
    if (cambios.nombre !== undefined) row.nombre = cambios.nombre.trim().toUpperCase()
    if (cambios.margen !== undefined) row.margen = cambios.margen
    const { data, error } = await supabase
      .from('rubros')
      .update(row)
      .eq('id', id)
      .select()
      .single()
    if (error) throw new Error(error.message)
    const margen = data.margen != null ? Number(data.margen) : null
    setRubros(prev => prev.map(r => r.id === id ? { ...r, nombre: data.nombre, margen } : r))
    return data
  }, [])

  const desactivarRubro = useCallback(async (id) => {
    const { error } = await supabase
      .from('rubros')
      .update({ activo: false })
      .eq('id', id)
    if (error) throw new Error(error.message)
    setRubros(prev => prev.filter(r => r.id !== id))
  }, [])

  // ── Subrubros ─────────────────────────────────────────────
  const agregarSubrubro = useCallback(async (rubroId, nombre) => {
    const { data, error } = await supabase
      .from('subrubros')
      .insert({ rubro_id: rubroId, nombre: nombre.trim().toUpperCase(), activo: true })
      .select()
      .single()
    if (error) throw new Error(error.message)
    const nuevo = { id: data.id, nombre: data.nombre, orden: data.orden, activo: true }
    setRubros(prev => prev.map(r =>
      r.id === rubroId
        ? { ...r, subrubros: [...r.subrubros, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre)) }
        : r
    ))
    return nuevo
  }, [])

  const editarSubrubro = useCallback(async (rubroId, subrubroId, nombre) => {
    const { data, error } = await supabase
      .from('subrubros')
      .update({ nombre: nombre.trim().toUpperCase() })
      .eq('id', subrubroId)
      .select()
      .single()
    if (error) throw new Error(error.message)
    setRubros(prev => prev.map(r =>
      r.id === rubroId
        ? { ...r, subrubros: r.subrubros.map(s => s.id === subrubroId ? { ...s, nombre: data.nombre } : s) }
        : r
    ))
    return data
  }, [])

  const desactivarSubrubro = useCallback(async (rubroId, subrubroId) => {
    const { error } = await supabase
      .from('subrubros')
      .update({ activo: false })
      .eq('id', subrubroId)
    if (error) throw new Error(error.message)
    setRubros(prev => prev.map(r =>
      r.id === rubroId
        ? { ...r, subrubros: r.subrubros.filter(s => s.id !== subrubroId) }
        : r
    ))
  }, [])

  // Helper para obtener solo los nombres (compatibilidad con código existente)
  const nombresRubros = rubros.map(r => r.nombre)
  const subrubrosDeRubro = (nombreRubro) => {
    const r = rubros.find(r => r.nombre === nombreRubro)
    return r ? r.subrubros.map(s => s.nombre) : []
  }

  return {
    rubros,
    nombresRubros,
    subrubrosDeRubro,
    loading,
    error,
    cargar,
    agregarRubro,
    editarRubro,
    desactivarRubro,
    agregarSubrubro,
    editarSubrubro,
    desactivarSubrubro,
  }
}
