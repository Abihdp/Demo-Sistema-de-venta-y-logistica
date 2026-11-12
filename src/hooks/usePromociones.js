import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

function promocionFromDB(row) {
  if (!row) return null
  return {
    id:     row.id,
    nombre: row.nombre,
    pct:    Number(row.pct) || 0,
    activa: row.activa ?? true,
  }
}

function promocionToDB(obj) {
  const row = {}
  if (obj.nombre !== undefined) row.nombre = obj.nombre
  if (obj.pct    !== undefined) row.pct    = obj.pct
  if (obj.activa !== undefined) row.activa = obj.activa
  return row
}

// Descuentos manuales aplicables por artículo al vender (ej: "Ropa Casual
// -15%") — independiente de listas_precios, que ajusta toda la venta. Si la
// tabla `promociones` todavía no existe en Supabase (falta correr la
// migración), no bloquea el resto de la app: queda como función no
// disponible hasta que se cree la tabla.
export function usePromociones() {
  const [promociones, setPromociones] = useState([])
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('promociones').select('*').order('id')
    if (error) {
      console.warn('No se pudo cargar "promociones" (¿falta correr la migración de la tabla?):', error.message)
      setPromociones([])
      setLoading(false)
      return
    }
    setPromociones((data || []).map(promocionFromDB))
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const agregarPromocion = useCallback(async (promocion) => {
    const { data, error } = await supabase.from('promociones')
      .insert({ ...promocionToDB(promocion), activa: promocion.activa ?? true }).select().single()
    if (error) throw new Error(error.message)
    const nueva = promocionFromDB(data)
    setPromociones(prev => [...prev, nueva])
    return nueva
  }, [])

  const actualizarPromocion = useCallback(async (id, cambios) => {
    const { data, error } = await supabase.from('promociones')
      .update(promocionToDB(cambios)).eq('id', id).select().single()
    if (error) throw new Error(error.message)
    const actualizada = promocionFromDB(data)
    setPromociones(prev => prev.map(p => p.id === id ? actualizada : p))
    return actualizada
  }, [])

  const eliminarPromocion = useCallback(async (id) => {
    const { error } = await supabase.from('promociones').update({ activa: false }).eq('id', id)
    if (error) throw new Error(error.message)
    setPromociones(prev => prev.map(p => p.id === id ? { ...p, activa: false } : p))
  }, [])

  return {
    promociones, setPromociones,
    loading, cargar,
    agregarPromocion, actualizarPromocion, eliminarPromocion,
  }
}
