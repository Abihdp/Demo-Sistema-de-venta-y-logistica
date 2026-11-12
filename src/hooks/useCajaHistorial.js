import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

function cierreFromDB(row) {
  if (!row) return null
  return {
    id:                 row.id,
    numero:             row.numero,
    fecha:              row.fecha,
    horaApertura:       row.hora_apertura,
    horaCierre:         row.hora_cierre,
    aperturaTs:         row.apertura_ts,
    cierreTs:           row.cierre_ts,
    usuario:            row.usuario,
    inicio:             Number(row.inicio) || 0,
    totalEfectivo:      Number(row.total_efectivo) || 0,
    totalTarjeta:       Number(row.total_tarjeta) || 0,
    totalTransferencia: Number(row.total_transferencia) || 0,
    totalCheque:        Number(row.total_cheque) || 0,
    totalMpago:         Number(row.total_mpago) || 0,
    totalCtaCte:        Number(row.total_ctacte) || 0,
    retiros:            row.retiros || [],
    totalRetiros:       Number(row.total_retiros) || 0,
    refuerzos:          row.refuerzos || [],
    totalRefuerzos:     Number(row.total_refuerzos) || 0,
    esperado:           Number(row.esperado) || 0,
    real:               Number(row.real) || 0,
    diferencia:         Number(row.diferencia) || 0,
    cantVentas:         Number(row.cant_ventas) || 0,
    totalVendido:       Number(row.total_vendido) || 0,
    comprobantes:       row.comprobantes || [],
  }
}

function cierreToDB(obj) {
  return {
    numero:              obj.numero,
    fecha:               obj.fecha,
    hora_apertura:       obj.horaApertura,
    hora_cierre:         obj.horaCierre,
    apertura_ts:         obj.aperturaTs || null,
    cierre_ts:           obj.cierreTs || null,
    usuario:             obj.usuario,
    inicio:              obj.inicio || 0,
    total_efectivo:      obj.totalEfectivo || 0,
    total_tarjeta:       obj.totalTarjeta || 0,
    total_transferencia: obj.totalTransferencia || 0,
    total_cheque:        obj.totalCheque || 0,
    total_mpago:         obj.totalMpago || 0,
    total_ctacte:        obj.totalCtaCte || 0,
    retiros:             obj.retiros || [],
    total_retiros:       obj.totalRetiros || 0,
    refuerzos:           obj.refuerzos || [],
    total_refuerzos:     obj.totalRefuerzos || 0,
    esperado:            obj.esperado || 0,
    real:                obj.real || 0,
    diferencia:          obj.diferencia || 0,
    cant_ventas:         obj.cantVentas || 0,
    total_vendido:       obj.totalVendido || 0,
    comprobantes:        obj.comprobantes || [],
  }
}

export function useCajaHistorial() {
  const [historialCierres, setHistorialCierres] = useState([])
  const [loading, setLoading]                   = useState(true)
  const [error, setError]                       = useState(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('historial_cierres')
      .select('*')
      .order('fecha', { ascending: false })
      .order('id',    { ascending: false })
    if (error) { setError(error.message); setLoading(false); return }
    setHistorialCierres((data || []).map(cierreFromDB))
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const guardarCierre = useCallback(async (cierre) => {
    const { data, error } = await supabase
      .from('historial_cierres')
      .insert(cierreToDB(cierre))
      .select()
      .single()
    if (error) throw new Error(error.message)
    const nuevo = cierreFromDB(data)
    setHistorialCierres(prev => [nuevo, ...prev])
    return nuevo
  }, [])

  return {
    historialCierres,
    setHistorialCierres,
    loading,
    error,
    cargar,
    guardarCierre,
  }
}
