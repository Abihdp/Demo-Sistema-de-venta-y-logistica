import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Tabla real: columna "periodo" (no "mes") y sin horaCierre/horaReapertura
// (la UI nunca mostró la hora, solo la fecha, así que no hace falta guardarla).
function periodoFromDB(row) {
  if (!row) return null
  return {
    id:              row.id,
    mes:             row.periodo,
    cerrado:         row.cerrado,
    cerradoPor:      row.cerrado_por,
    fechaCierre:     row.fecha_cierre,
    reabiertoPor:    row.reabierto_por,
    fechaReapertura: row.fecha_reapertura,
    resumen:         row.resumen || {},
  }
}

function periodoToDB(obj) {
  return {
    periodo:           obj.mes,
    cerrado:           obj.cerrado,
    cerrado_por:       obj.cerradoPor ?? null,
    fecha_cierre:      obj.fechaCierre ?? null,
    reabierto_por:     obj.reabiertoPor ?? null,
    fecha_reapertura:  obj.fechaReapertura ?? null,
    resumen:           obj.resumen || {},
  }
}

export function usePeriodosCerrados() {
  const [periodosCerrados, setPeriodosCerrados] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('periodos_cerrados')
      .select('*')
      .order('periodo', { ascending: false })
    if (error) { setError(error.message); setLoading(false); return }
    setPeriodosCerrados((data || []).map(periodoFromDB))
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  // Cierra (o vuelve a cerrar tras una reapertura) un período: reemplaza
  // por completo la fila de ese mes — mismo comportamiento que tenía el
  // estado local de antes, que también pisaba el registro entero.
  const cerrarPeriodo = useCallback(async (registro) => {
    const { data, error } = await supabase
      .from('periodos_cerrados')
      .upsert(periodoToDB(registro), { onConflict: 'periodo' })
      .select()
      .single()
    if (error) throw new Error(error.message)
    const nuevo = periodoFromDB(data)
    setPeriodosCerrados(prev => [...(prev || []).filter(p => p.mes !== nuevo.mes), nuevo])
    return nuevo
  }, [])

  // Reabrir solo toca cerrado/reabiertoPor/fechaReapertura — a diferencia de
  // cerrarPeriodo, conserva quién y cuándo se cerró originalmente.
  const reabrirPeriodo = useCallback(async (mes, { reabiertoPor, fechaReapertura }) => {
    const { data, error } = await supabase
      .from('periodos_cerrados')
      .update({ cerrado: false, reabierto_por: reabiertoPor, fecha_reapertura: fechaReapertura })
      .eq('periodo', mes)
      .select()
      .single()
    if (error) throw new Error(error.message)
    const actualizado = periodoFromDB(data)
    setPeriodosCerrados(prev => prev.map(p => p.mes === mes ? actualizado : p))
    return actualizado
  }, [])

  return {
    periodosCerrados,
    setPeriodosCerrados,
    loading,
    error,
    cargar,
    cerrarPeriodo,
    reabrirPeriodo,
  }
}
