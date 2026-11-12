import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { cachedLoad } from '../lib/offlineDb'

function listaFromDB(row) {
  if (!row) return null
  return {
    id:         row.id,
    nombre:     row.nombre,
    pct:        Number(row.pct) || 0,
    activa:     row.activa ?? true,
    formasPago: row.formas_pago || [],
  }
}

function listaToDB(obj) {
  const row = {}
  if (obj.nombre     !== undefined) row.nombre      = obj.nombre
  if (obj.pct        !== undefined) row.pct         = obj.pct
  if (obj.activa     !== undefined) row.activa      = obj.activa
  if (obj.formasPago !== undefined) row.formas_pago = obj.formasPago
  return row
}

function configPreciosFromDB(row) {
  return {
    margenBase: Number(row?.margen_base) || 0,
    permitirStockNegativo: row?.permitir_stock_negativo ?? false,
    diasAvisoActualizarPrecios: row?.dias_aviso_actualizar_precios ?? 15,
    logoBase64: row?.logo_base64 || null,
    permitirEditarPrecioVenta: row?.permitir_editar_precio_venta ?? false,
    // Config global de mora (jsonb). null = todavía no se guardó en la base.
    configMora: row?.config_mora ?? null,
  }
}

export function useListasPrecios() {
  const [listas, setListas]               = useState([])
  const [configPrecios, setConfigPrecios] = useState({ margenBase: 0, permitirStockNegativo: false, diasAvisoActualizarPrecios: 15, permitirEditarPrecioVenta: false })
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState(null)
  const [isFromCache, setIsFromCache]     = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { data, isFromCache: fromCache, refresh } = await cachedLoad('listasPrecios', async () => {
        const [resListas, resConfig] = await Promise.all([
          supabase.from('listas_precios').select('*').order('id'),
          supabase.from('config_precios').select('*').eq('id', 1).maybeSingle(),
        ])
        if (resListas.error) throw new Error(resListas.error.message)
        if (resConfig.error) throw new Error(resConfig.error.message)
        return {
          listas: (resListas.data || []).map(listaFromDB),
          configPrecios: configPreciosFromDB(resConfig.data),
        }
      })
      setListas(data.listas)
      setConfigPrecios(data.configPrecios)
      setIsFromCache(fromCache)
      if (refresh) refresh.then(fresh => { if (fresh) { setListas(fresh.listas); setConfigPrecios(fresh.configPrecios); setIsFromCache(false) } })
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const agregarLista = useCallback(async (lista) => {
    const { data, error } = await supabase.from('listas_precios')
      .insert({ ...listaToDB(lista), activa: lista.activa ?? true }).select().single()
    if (error) throw new Error(error.message)
    const nueva = listaFromDB(data)
    setListas(prev => [...prev, nueva])
    return nueva
  }, [])

  const actualizarLista = useCallback(async (id, cambios) => {
    const { data, error } = await supabase.from('listas_precios')
      .update(listaToDB(cambios)).eq('id', id).select().single()
    if (error) throw new Error(error.message)
    const actualizada = listaFromDB(data)
    setListas(prev => prev.map(l => l.id === id ? actualizada : l))
    return actualizada
  }, [])

  const eliminarLista = useCallback(async (id) => {
    const { error } = await supabase.from('listas_precios').update({ activa: false }).eq('id', id)
    if (error) throw new Error(error.message)
    setListas(prev => prev.map(l => l.id === id ? { ...l, activa: false } : l))
  }, [])

  const actualizarConfigPrecios = useCallback(async (cambios) => {
    const row = {}
    if (cambios.margenBase !== undefined) row.margen_base = cambios.margenBase
    if (cambios.permitirStockNegativo !== undefined) row.permitir_stock_negativo = cambios.permitirStockNegativo
    if (cambios.diasAvisoActualizarPrecios !== undefined) row.dias_aviso_actualizar_precios = cambios.diasAvisoActualizarPrecios
    if (cambios.logoBase64 !== undefined) row.logo_base64 = cambios.logoBase64
    if (cambios.permitirEditarPrecioVenta !== undefined) row.permitir_editar_precio_venta = cambios.permitirEditarPrecioVenta
    if (cambios.configMora !== undefined) row.config_mora = cambios.configMora
    const { data, error } = await supabase.from('config_precios')
      .upsert({ id: 1, ...row, updated_at: new Date().toISOString() })
      .select().single()
    if (error) throw new Error(error.message)
    const actualizada = configPreciosFromDB(data)
    setConfigPrecios(actualizada)
    return actualizada
  }, [])

  return {
    listas, setListas,
    configPrecios, setConfigPrecios,
    loading, error, isFromCache, cargar,
    agregarLista, actualizarLista, eliminarLista,
    actualizarConfigPrecios,
  }
}
