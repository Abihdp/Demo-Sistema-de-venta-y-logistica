import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

function fromDB(row) {
  if (!row) return null
  return {
    id:           row.id,
    nombre:       row.nombre,
    cuit:         row.cuit          || '',
    tel:          row.tel           || '',
    dir:          row.dir           || '',
    email:        row.email         || '',
    iva:          row.iva           || 'Responsable Inscripto',
    proximoViaje: row.proximo_viaje || null,
    diasColchon:  Number(row.dias_colchon) || 5,
    activo:       row.activo        ?? true,
    margen:       row.margen != null ? Number(row.margen) : null,
    createdAt:    row.created_at,
  }
}

function toDB(obj) {
  const row = {}
  if (obj.nombre       !== undefined) row.nombre        = obj.nombre
  if (obj.cuit         !== undefined) row.cuit          = obj.cuit
  if (obj.tel          !== undefined) row.tel           = obj.tel
  if (obj.dir          !== undefined) row.dir           = obj.dir
  if (obj.email        !== undefined) row.email         = obj.email
  if (obj.iva          !== undefined) row.iva           = obj.iva
  if (obj.proximoViaje !== undefined) row.proximo_viaje = obj.proximoViaje || null
  if (obj.diasColchon  !== undefined) row.dias_colchon  = obj.diasColchon
  if (obj.activo       !== undefined) row.activo        = obj.activo
  if (obj.margen       !== undefined) row.margen        = obj.margen
  return row
}

export function useProveedores() {
  const [proveedores, setProveedores] = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('proveedores')
      .select('*')
      .order('nombre')
    if (error) { setError(error.message); setLoading(false); return }
    setProveedores((data || []).map(fromDB))
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const agregarProveedor = useCallback(async (proveedor) => {
    const { data, error } = await supabase
      .from('proveedores')
      .insert(toDB(proveedor))
      .select()
      .single()
    if (error) throw new Error(error.message)
    const nuevo = fromDB(data)
    setProveedores(prev => [...prev, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre)))
    return nuevo
  }, [])

  const actualizarProveedor = useCallback(async (id, cambios) => {
    const { data, error } = await supabase
      .from('proveedores')
      .update({ ...toDB(cambios), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw new Error(error.message)
    const actualizado = fromDB(data)
    setProveedores(prev => prev.map(p => p.id === id ? actualizado : p))
    return actualizado
  }, [])

  const desactivarProveedor = useCallback(async (id) => {
    return actualizarProveedor(id, { activo: false })
  }, [actualizarProveedor])

  return {
    proveedores,
    setProveedores,
    loading,
    error,
    cargar,
    agregarProveedor,
    actualizarProveedor,
    desactivarProveedor,
  }
}
