import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

function cuentaFromDB(row) {
  if (!row) return null
  return { id: row.id, codigo: row.codigo, nombre: row.nombre, tipo: row.tipo, nivel: Number(row.nivel), imputable: row.imputable ?? false }
}

function asientoFromDB(row) {
  if (!row) return null
  return { id: row.id, fecha: row.fecha, descripcion: row.descripcion, lineas: row.lineas || [], usuario: row.usuario, periodo: row.periodo }
}

function movimientoFromDB(row) {
  if (!row) return null
  return {
    id:            row.id,
    tipo:          row.tipo,
    fecha:         row.fecha,
    hora:          row.hora,
    horaCierre:    row.hora_cierre,
    monto:         Number(row.monto) || 0,
    montoEfectivo: Number(row.monto_efectivo)  || 0,
    montoTarjeta:  Number(row.monto_tarjeta)   || 0,
    montoTarjetaD: Number(row.monto_tarjeta_d) || 0,
    montoTarjetaC: Number(row.monto_tarjeta_c) || 0,
    montoTransf:   Number(row.monto_transf)    || 0,
    montoCheque:   Number(row.monto_cheque)    || 0,
    montoMpago:    Number(row.monto_mpago)     || 0,
    diferencia:    row.diferencia    != null ? Number(row.diferencia)    : undefined,
    saldoInicial:  row.saldo_inicial != null ? Number(row.saldo_inicial) : undefined,
    formaPago:     row.forma_pago,
    concepto:      row.concepto,
    destinatario:  row.destinatario,
    estado:        row.estado,
    cierreId:      row.cierre_id,
    gastoId:       row.gasto_id,
    detalle:       row.detalle,
  }
}

function movimientoToDB(obj) {
  const row = {}
  if (obj.tipo          !== undefined) row.tipo            = obj.tipo
  if (obj.fecha         !== undefined) row.fecha           = obj.fecha
  if (obj.hora          !== undefined) row.hora            = obj.hora
  if (obj.horaCierre    !== undefined) row.hora_cierre     = obj.horaCierre
  if (obj.monto         !== undefined) row.monto           = obj.monto
  if (obj.montoEfectivo !== undefined) row.monto_efectivo  = obj.montoEfectivo
  if (obj.montoTarjeta  !== undefined) row.monto_tarjeta   = obj.montoTarjeta
  if (obj.montoTarjetaD !== undefined) row.monto_tarjeta_d = obj.montoTarjetaD
  if (obj.montoTarjetaC !== undefined) row.monto_tarjeta_c = obj.montoTarjetaC
  if (obj.montoTransf   !== undefined) row.monto_transf    = obj.montoTransf
  if (obj.montoCheque   !== undefined) row.monto_cheque    = obj.montoCheque
  if (obj.montoMpago    !== undefined) row.monto_mpago     = obj.montoMpago
  if (obj.diferencia    !== undefined) row.diferencia      = obj.diferencia
  if (obj.saldoInicial  !== undefined) row.saldo_inicial   = obj.saldoInicial
  if (obj.formaPago     !== undefined) row.forma_pago      = obj.formaPago
  if (obj.concepto      !== undefined) row.concepto        = obj.concepto
  if (obj.destinatario  !== undefined) row.destinatario    = obj.destinatario
  if (obj.estado        !== undefined) row.estado          = obj.estado
  if (obj.cierreId      !== undefined) row.cierre_id       = obj.cierreId
  if (obj.gastoId       !== undefined) row.gasto_id        = obj.gastoId
  if (obj.detalle       !== undefined) row.detalle         = obj.detalle
  return row
}

export function useTesoreria() {
  const [planCuentas, setPlanCuentas]           = useState([])
  const [asientosManuales, setAsientosManuales] = useState([])
  const [tesoreria, setTesoreria]               = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const cargar = useCallback(async () => {
    setLoading(true); setError(null)
    const [resCuentas, resAsientos, resTesoreria] = await Promise.all([
      supabase.from('plan_cuentas').select('*').order('codigo'),
      supabase.from('asientos_manuales').select('*').order('fecha', { ascending: false }),
      supabase.from('tesoreria_movimientos').select('*').order('fecha', { ascending: false }).order('id', { ascending: false }),
    ])
    if (resCuentas.error)   { setError(resCuentas.error.message);   setLoading(false); return }
    if (resAsientos.error)  { setError(resAsientos.error.message);  setLoading(false); return }
    if (resTesoreria.error) { setError(resTesoreria.error.message); setLoading(false); return }
    setPlanCuentas((resCuentas.data || []).map(cuentaFromDB))
    setAsientosManuales((resAsientos.data || []).map(asientoFromDB))
    setTesoreria((resTesoreria.data || []).map(movimientoFromDB))
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const agregarCuenta = useCallback(async (cuenta) => {
    const { data, error } = await supabase.from('plan_cuentas')
      .insert({ id: cuenta.id, codigo: cuenta.codigo, nombre: cuenta.nombre, tipo: cuenta.tipo, nivel: cuenta.nivel, imputable: cuenta.imputable ?? false })
      .select().single()
    if (error) throw new Error(error.message)
    const nueva = cuentaFromDB(data)
    setPlanCuentas(prev => [...prev, nueva].sort((a, b) => a.codigo.localeCompare(b.codigo)))
    return nueva
  }, [])

  const actualizarCuenta = useCallback(async (id, cambios) => {
    const { data, error } = await supabase.from('plan_cuentas')
      .update({ nombre: cambios.nombre, imputable: cambios.imputable }).eq('id', id).select().single()
    if (error) throw new Error(error.message)
    const actualizada = cuentaFromDB(data)
    setPlanCuentas(prev => prev.map(c => c.id === id ? actualizada : c))
    return actualizada
  }, [])

  const agregarAsiento = useCallback(async (asiento) => {
    const { data, error } = await supabase.from('asientos_manuales')
      .insert({ fecha: asiento.fecha, descripcion: asiento.descripcion, lineas: asiento.lineas || [], usuario: asiento.usuario, periodo: asiento.periodo })
      .select().single()
    if (error) throw new Error(error.message)
    const nuevo = asientoFromDB(data)
    setAsientosManuales(prev => [nuevo, ...prev])
    return nuevo
  }, [])

  const eliminarAsiento = useCallback(async (id) => {
    const { error } = await supabase.from('asientos_manuales').delete().eq('id', id)
    if (error) throw new Error(error.message)
    setAsientosManuales(prev => prev.filter(a => a.id !== id))
  }, [])

  const agregarMovimientoTesoreria = useCallback(async (movimiento) => {
    const { data, error } = await supabase.from('tesoreria_movimientos')
      .insert(movimientoToDB(movimiento))
      .select().single()
    if (error) throw new Error(error.message)
    const nuevo = movimientoFromDB(data)
    setTesoreria(prev => [...(prev || []), nuevo])
    return nuevo
  }, [])

  const actualizarMovimientoTesoreria = useCallback(async (id, cambios) => {
    const { data, error } = await supabase.from('tesoreria_movimientos')
      .update({ ...movimientoToDB(cambios), updated_at: new Date().toISOString() })
      .eq('id', id).select().single()
    if (error) throw new Error(error.message)
    const actualizado = movimientoFromDB(data)
    setTesoreria(prev => prev.map(t => t.id === id ? actualizado : t))
    return actualizado
  }, [])

  return {
    planCuentas, setPlanCuentas,
    asientosManuales, setAsientosManuales,
    tesoreria, setTesoreria,
    loading, error, cargar,
    agregarCuenta, actualizarCuenta, agregarAsiento, eliminarAsiento,
    agregarMovimientoTesoreria, actualizarMovimientoTesoreria,
  }
}
