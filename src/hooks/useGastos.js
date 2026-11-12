import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

function gastoFromDB(row) {
  if (!row) return null
  return {
    id:          row.id,
    nro:         row.nro,
    fecha:       row.fecha,
    cuentaId:    row.cuenta_id,
    concepto:    row.concepto,
    monto:       Number(row.monto) || 0,
    formaPago:   row.forma_pago || 'Efectivo',
    proveedorId: row.proveedor_id,
    proveedor:   row.proveedor,
    referencia:  row.referencia || '',
    recurrente:  row.recurrente || false,
    estado:      row.estado || 'registrado',
    usuario:     row.usuario,
    periodo:     row.periodo,
    fuente:      row.fuente,
  }
}

function gastoToDB(obj) {
  const row = {}
  if (obj.nro         !== undefined) row.nro          = obj.nro
  if (obj.fecha       !== undefined) row.fecha        = obj.fecha
  if (obj.cuentaId    !== undefined) row.cuenta_id    = obj.cuentaId
  if (obj.concepto    !== undefined) row.concepto     = obj.concepto
  if (obj.monto       !== undefined) row.monto        = obj.monto
  if (obj.formaPago   !== undefined) row.forma_pago   = obj.formaPago
  if (obj.proveedorId !== undefined) row.proveedor_id = obj.proveedorId
  if (obj.proveedor   !== undefined) row.proveedor    = obj.proveedor
  if (obj.referencia  !== undefined) row.referencia   = obj.referencia
  if (obj.recurrente  !== undefined) row.recurrente   = obj.recurrente
  if (obj.estado      !== undefined) row.estado       = obj.estado
  if (obj.usuario     !== undefined) row.usuario      = obj.usuario
  if (obj.periodo     !== undefined) row.periodo      = obj.periodo
  if (obj.fuente      !== undefined) row.fuente       = obj.fuente
  return row
}

export function useGastos() {
  const [gastos, setGastos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('gastos')
      .select('*')
      .order('fecha', { ascending: false })
    if (error) { setError(error.message); setLoading(false); return }
    setGastos((data || []).map(gastoFromDB))
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const agregarGasto = useCallback(async (gasto) => {
    const { data, error } = await supabase
      .from('gastos')
      .insert(gastoToDB(gasto))
      .select()
      .single()
    if (error) throw new Error(error.message)
    const nuevo = gastoFromDB(data)
    setGastos(prev => [nuevo, ...prev])
    return nuevo
  }, [])

  const anularGasto = useCallback(async (id) => {
    const { error } = await supabase
      .from('gastos')
      .update({ estado: 'anulado' })
      .eq('id', id)
    if (error) throw new Error(error.message)
    setGastos(prev => prev.map(g => g.id === id ? { ...g, estado: 'anulado' } : g))
  }, [])

  return {
    gastos,
    setGastos,
    loading,
    error,
    cargar,
    agregarGasto,
    anularGasto,
  }
}
