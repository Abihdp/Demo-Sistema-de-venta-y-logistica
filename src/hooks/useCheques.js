import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

function chequeFromDB(row) {
  if (!row) return null
  return {
    id:               row.id,
    tipo:             row.tipo || 'recibido',
    numero:           row.numero,
    banco:            row.banco,
    monto:            Number(row.monto) || 0,
    fechaRecepcion:   row.fecha_recepcion,
    fechaVencimiento: row.fecha_vencimiento,
    clienteId:        row.cliente_id,
    cliente:          row.cliente,
    proveedorId:      row.proveedor_id,
    proveedor:        row.proveedor,
    observacion:      row.observacion || '',
    estado:           row.estado || 'en_cartera',
    usuario:          row.usuario,
  }
}

function chequeToDB(obj) {
  const row = {}
  if (obj.tipo             !== undefined) row.tipo              = obj.tipo
  if (obj.numero           !== undefined) row.numero            = obj.numero
  if (obj.banco            !== undefined) row.banco             = obj.banco
  if (obj.monto            !== undefined) row.monto             = obj.monto
  if (obj.fechaRecepcion   !== undefined) row.fecha_recepcion   = obj.fechaRecepcion
  if (obj.fechaVencimiento !== undefined) row.fecha_vencimiento = obj.fechaVencimiento
  if (obj.clienteId        !== undefined) row.cliente_id        = obj.clienteId
  if (obj.cliente          !== undefined) row.cliente           = obj.cliente
  if (obj.proveedorId      !== undefined) row.proveedor_id      = obj.proveedorId
  if (obj.proveedor        !== undefined) row.proveedor         = obj.proveedor
  if (obj.observacion      !== undefined) row.observacion       = obj.observacion
  if (obj.estado           !== undefined) row.estado            = obj.estado
  if (obj.usuario          !== undefined) row.usuario           = obj.usuario
  return row
}

export function useCheques() {
  const [cheques, setCheques] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('cheques')
      .select('*')
      .order('fecha_vencimiento', { ascending: true })
    if (error) { setError(error.message); setLoading(false); return }
    setCheques((data || []).map(chequeFromDB))
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const agregarCheque = useCallback(async (cheque) => {
    const { data, error } = await supabase
      .from('cheques')
      .insert(chequeToDB(cheque))
      .select()
      .single()
    if (error) throw new Error(error.message)
    const nuevo = chequeFromDB(data)
    setCheques(prev => [...prev, nuevo].sort((a, b) =>
      (a.fechaVencimiento || '').localeCompare(b.fechaVencimiento || '')
    ))
    return nuevo
  }, [])

  const cambiarEstadoCheque = useCallback(async (id, estado) => {
    const { error } = await supabase
      .from('cheques')
      .update({ estado, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw new Error(error.message)
    setCheques(prev => prev.map(c => c.id === id ? { ...c, estado } : c))
  }, [])

  return {
    cheques,
    setCheques,
    loading,
    error,
    cargar,
    agregarCheque,
    cambiarEstadoCheque,
  }
}
