import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

function tarjetaFromDB(row, cuotas = []) {
  return {
    id:     row.id,
    nombre: row.nombre,
    banco:  row.banco || '',
    activa: row.activa ?? true,
    orden:  row.orden ?? 0,
    cuotas: cuotas,
  }
}

function cuotaFromDB(row) {
  return {
    id:         row.id,
    cuotas:     Number(row.cuotas) || 1,
    interesPct: Number(row.interes_pct) || 0,
    orden:      row.orden ?? 0,
  }
}

export function useTarjetas() {
  const [tarjetas, setTarjetas] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)

    const [resTarjetas, resCuotas] = await Promise.all([
      supabase.from('tarjetas').select('*').eq('activa', true).order('orden').order('nombre'),
      supabase.from('tarjeta_cuotas').select('*').order('orden').order('cuotas'),
    ])

    if (resTarjetas.error) { setError(resTarjetas.error.message); setLoading(false); return }
    if (resCuotas.error)   { setError(resCuotas.error.message);   setLoading(false); return }

    const cuotasMap = {}
    ;(resCuotas.data || []).forEach(c => {
      if (!cuotasMap[c.tarjeta_id]) cuotasMap[c.tarjeta_id] = []
      cuotasMap[c.tarjeta_id].push(cuotaFromDB(c))
    })

    const mapped = (resTarjetas.data || []).map(t =>
      tarjetaFromDB(t, cuotasMap[t.id] || [])
    )
    setTarjetas(mapped)
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  // ── Tarjetas ──────────────────────────────────────────────
  const agregarTarjeta = useCallback(async ({ nombre, banco }) => {
    const { data, error } = await supabase
      .from('tarjetas')
      .insert({ nombre: nombre.trim(), banco: (banco || '').trim(), activa: true })
      .select()
      .single()
    if (error) throw new Error(error.message)
    const nueva = tarjetaFromDB(data, [])
    setTarjetas(prev => [...prev, nueva].sort((a, b) => a.nombre.localeCompare(b.nombre)))
    return nueva
  }, [])

  const editarTarjeta = useCallback(async (id, cambios) => {
    const row = {}
    if (cambios.nombre !== undefined) row.nombre = cambios.nombre.trim()
    if (cambios.banco  !== undefined) row.banco  = (cambios.banco || '').trim()
    const { data, error } = await supabase
      .from('tarjetas')
      .update(row)
      .eq('id', id)
      .select()
      .single()
    if (error) throw new Error(error.message)
    setTarjetas(prev => prev.map(t => t.id === id ? { ...t, nombre: data.nombre, banco: data.banco || '' } : t))
    return data
  }, [])

  const desactivarTarjeta = useCallback(async (id) => {
    const { error } = await supabase
      .from('tarjetas')
      .update({ activa: false })
      .eq('id', id)
    if (error) throw new Error(error.message)
    setTarjetas(prev => prev.filter(t => t.id !== id))
  }, [])

  // ── Cuotas / interés ─────────────────────────────────────────
  const agregarCuota = useCallback(async (tarjetaId, { cuotas, interesPct }) => {
    const { data, error } = await supabase
      .from('tarjeta_cuotas')
      .insert({ tarjeta_id: tarjetaId, cuotas, interes_pct: interesPct })
      .select()
      .single()
    if (error) throw new Error(error.message)
    const nueva = cuotaFromDB(data)
    setTarjetas(prev => prev.map(t =>
      t.id === tarjetaId
        ? { ...t, cuotas: [...t.cuotas, nueva].sort((a, b) => a.cuotas - b.cuotas) }
        : t
    ))
    return nueva
  }, [])

  const editarCuota = useCallback(async (tarjetaId, cuotaId, { cuotas, interesPct }) => {
    const row = {}
    if (cuotas     !== undefined) row.cuotas      = cuotas
    if (interesPct !== undefined) row.interes_pct = interesPct
    const { data, error } = await supabase
      .from('tarjeta_cuotas')
      .update(row)
      .eq('id', cuotaId)
      .select()
      .single()
    if (error) throw new Error(error.message)
    setTarjetas(prev => prev.map(t =>
      t.id === tarjetaId
        ? { ...t, cuotas: t.cuotas.map(c => c.id === cuotaId ? cuotaFromDB(data) : c).sort((a, b) => a.cuotas - b.cuotas) }
        : t
    ))
    return data
  }, [])

  const eliminarCuota = useCallback(async (tarjetaId, cuotaId) => {
    const { error } = await supabase
      .from('tarjeta_cuotas')
      .delete()
      .eq('id', cuotaId)
    if (error) throw new Error(error.message)
    setTarjetas(prev => prev.map(t =>
      t.id === tarjetaId
        ? { ...t, cuotas: t.cuotas.filter(c => c.id !== cuotaId) }
        : t
    ))
  }, [])

  return {
    tarjetas,
    loading,
    error,
    cargar,
    agregarTarjeta,
    editarTarjeta,
    desactivarTarjeta,
    agregarCuota,
    editarCuota,
    eliminarCuota,
  }
}
