import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { cachedLoad } from '../lib/offlineDb'
import { registrarCobroMora, revertirCobroMora } from '../utils/helpers'

function clienteFromDB(row) {
  if (!row) return null
  return {
    id:         row.id,
    nombre:     row.nombre,
    dni:        row.dni || '',
    tel:        row.tel || '',
    dir:        row.dir || '',
    email:      row.email || '',
    iva:        row.iva || 'Consumidor Final',
    configMora: row.config_mora || { usarGlobal: true },
    limiteCtaCte: row.limite_ctacte ?? null,
    activo:     row.activo ?? true,
    createdAt:  row.created_at,
  }
}

function clienteToDB(obj) {
  const row = {}
  if (obj.nombre       !== undefined) row.nombre        = obj.nombre
  if (obj.dni          !== undefined) row.dni            = obj.dni
  if (obj.tel          !== undefined) row.tel            = obj.tel
  if (obj.dir          !== undefined) row.dir            = obj.dir
  if (obj.email        !== undefined) row.email          = obj.email
  if (obj.iva          !== undefined) row.iva            = obj.iva
  if (obj.configMora   !== undefined) row.config_mora    = obj.configMora
  if (obj.limiteCtaCte !== undefined) row.limite_ctacte  = obj.limiteCtaCte
  if (obj.activo       !== undefined) row.activo         = obj.activo
  return row
}

function pagoFromDB(row) {
  if (!row) return null
  return {
    id:          row.id,
    clienteId:   row.cliente_id,
    fecha:       row.fecha,
    monto:       Number(row.monto) || 0,
    formaPago:   row.forma_pago || 'Efectivo',
    observacion: row.observacion || '',
    usuario:     row.usuario || '',
    reciboId:    row.recibo_id ?? null,
  }
}

// `reciboId` liga el pago al recibo que lo generó (cuando corresponde) —
// vínculo robusto por id, en vez de tener que parsear el texto de
// `observacion` para encontrarlo de nuevo al editar/anular un recibo.
function pagoToDB(obj) {
  const row = {
    cliente_id:  obj.clienteId,
    fecha:       obj.fecha,
    monto:       obj.monto,
    forma_pago:  obj.formaPago || 'Efectivo',
    observacion: obj.observacion || '',
    usuario:     obj.usuario || '',
  }
  if (obj.reciboId !== undefined) row.recibo_id = obj.reciboId
  return row
}

export function useClientes() {
  const [clientes, setClientes]       = useState([])
  const [pagosCtaCte, setPagosCtaCte] = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)
  const [isFromCache, setIsFromCache] = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, isFromCache: fromCache, refresh } = await cachedLoad('clientes', async () => {
        const [resClientes, resPagos] = await Promise.all([
          supabase.from('clientes').select('*').order('nombre'),
          supabase.from('pagos_ctacte').select('*').order('fecha'),
        ])
        if (resClientes.error) throw new Error(resClientes.error.message)
        if (resPagos.error)    throw new Error(resPagos.error.message)
        return {
          clientes: (resClientes.data || []).map(clienteFromDB),
          pagosCtaCte: (resPagos.data || []).map(pagoFromDB),
        }
      })
      setClientes(data.clientes)
      setPagosCtaCte(data.pagosCtaCte)
      setIsFromCache(fromCache)
      if (refresh) refresh.then(fresh => { if (fresh) { setClientes(fresh.clientes); setPagosCtaCte(fresh.pagosCtaCte); setIsFromCache(false) } })
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const agregarCliente = useCallback(async (cliente) => {
    const { data, error } = await supabase
      .from('clientes')
      .insert(clienteToDB(cliente))
      .select()
      .single()
    if (error) throw new Error(error.message)
    const nuevo = clienteFromDB(data)
    setClientes(prev => [...prev, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre)))
    return nuevo
  }, [])

  const actualizarCliente = useCallback(async (id, cambios) => {
    const { data, error } = await supabase
      .from('clientes')
      .update({ ...clienteToDB(cambios), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw new Error(error.message)
    const actualizado = clienteFromDB(data)
    setClientes(prev => prev.map(c => c.id === id ? actualizado : c))
    return actualizado
  }, [])

  const desactivarCliente = useCallback(async (id) => {
    return actualizarCliente(id, { activo: false })
  }, [actualizarCliente])

  const agregarPagoCtaCte = useCallback(async (pago) => {
    const { data, error } = await supabase
      .from('pagos_ctacte')
      .insert(pagoToDB(pago))
      .select()
      .single()
    if (error) throw new Error(error.message)
    const nuevo = pagoFromDB(data)
    setPagosCtaCte(prev => [...prev, nuevo])
    return nuevo
  }, [])

  const eliminarPagoCtaCte = useCallback(async (id) => {
    const { error } = await supabase
      .from('pagos_ctacte')
      .delete()
      .eq('id', id)
    if (error) throw new Error(error.message)
    setPagosCtaCte(prev => prev.filter(p => p.id !== id))
  }, [])

  // Modifica config_mora partiendo de lo que hay HOY en la base (no de la
  // copia en memoria), para no pisar cargos de mora cargados desde otra PC
  // o en otra pestaña mientras tanto.
  const modificarConfigMora = useCallback(async (clienteId, transformar) => {
    const { data: fila, error: errLeer } = await supabase
      .from('clientes').select('config_mora').eq('id', clienteId).single()
    if (errLeer) throw new Error(errLeer.message)
    const actual = fila?.config_mora || { usarGlobal: true }
    return actualizarCliente(clienteId, { configMora: transformar(actual) })
  }, [actualizarCliente])

  // Mora incluida en un recibo (ver registrarCobroMora en helpers)
  const registrarMoraCobrada = useCallback((clienteId, datos) =>
    modificarConfigMora(clienteId, cfg => registrarCobroMora(cfg, datos)), [modificarConfigMora])

  // Al anular un recibo que incluía mora
  const revertirMoraCobrada = useCallback((clienteId, reciboId) =>
    modificarConfigMora(clienteId, cfg => revertirCobroMora(cfg, reciboId)), [modificarConfigMora])

  return {
    clientes,
    setClientes,
    pagosCtaCte,
    setPagosCtaCte,
    loading,
    error,
    isFromCache,
    cargar,
    agregarCliente,
    actualizarCliente,
    desactivarCliente,
    agregarPagoCtaCte,
    eliminarPagoCtaCte,
    modificarConfigMora,
    registrarMoraCobrada,
    revertirMoraCobrada,
  }
}
