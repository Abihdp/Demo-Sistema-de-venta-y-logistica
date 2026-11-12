import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { cachedLoad } from '../lib/offlineDb'
import { enqueue, registerHandler, actualizarProgreso, esErrorDeRed, conTimeout, conMutex } from '../lib/outbox'
import { useToast } from '../components/ui/Toast.jsx'

function reciboFromDB(row) {
  if (!row) return null
  return {
    id:          row.id,
    numero:      row.numero,
    tipo:        row.tipo || 'Recibo',
    fecha:       row.fecha,
    hora:        row.hora,
    clienteId:   row.cliente_id,
    cliente:     row.cliente,
    monto:       Number(row.monto) || 0,
    formaPago:   row.forma_pago,
    observacion: row.observacion || '',
    usuario:     row.usuario,
    estado:      row.estado || 'activa',
    motivoAnulacion: row.motivo_anulacion || '',
    ventaId:     row.venta_id,
    itemsDevueltos: row.items_devueltos || null,
    createdAt:   row.created_at,
  }
}

function reciboToDB(obj) {
  const row = {}
  if (obj.numero      !== undefined) row.numero      = obj.numero
  if (obj.tipo        !== undefined) row.tipo        = obj.tipo
  if (obj.fecha       !== undefined) row.fecha       = obj.fecha
  if (obj.hora        !== undefined) row.hora        = obj.hora
  if (obj.clienteId   !== undefined) row.cliente_id  = obj.clienteId
  if (obj.cliente     !== undefined) row.cliente     = obj.cliente
  if (obj.monto       !== undefined) row.monto       = obj.monto
  if (obj.formaPago   !== undefined) row.forma_pago  = obj.formaPago
  if (obj.observacion !== undefined) row.observacion = obj.observacion
  if (obj.usuario     !== undefined) row.usuario     = obj.usuario
  if (obj.estado      !== undefined) row.estado      = obj.estado
  if (obj.motivoAnulacion !== undefined) row.motivo_anulacion = obj.motivoAnulacion
  if (obj.ventaId     !== undefined) row.venta_id    = obj.ventaId
  if (obj.itemsDevueltos !== undefined) row.items_devueltos = obj.itemsDevueltos
  return row
}

// `agregarPagoCtaCte`/`aplicarDeltaStockMultiple` se reciben del llamador
// (App.jsx, que ya tiene useClientes/useDepositos instanciados) — así emitir
// un comprobante puede efectuar su ajuste de cuenta corriente y devolución
// de stock (NC) como parte de la MISMA operación encolable, sin que este
// hook necesite conocer los otros hooks directamente.
// `registrarMoraCobrada` (useClientes) anota la parte de mora de un recibo en
// la ficha del cliente, separada del pago de la deuda.
export function useRecibos({ agregarPagoCtaCte, aplicarDeltaStockMultiple, registrarMoraCobrada } = {}) {
  const [recibos, setRecibos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [isFromCache, setIsFromCache] = useState(false)
  const { toast } = useToast()

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, isFromCache: fromCache, refresh } = await cachedLoad('recibos', async () => {
        const { data, error } = await supabase.from('recibos').select('*').order('fecha', { ascending: false })
        if (error) throw new Error(error.message)
        return (data || []).map(reciboFromDB)
      })
      setRecibos(data)
      setIsFromCache(fromCache)
      if (refresh) refresh.then(fresh => { if (fresh) { setRecibos(fresh); setIsFromCache(false) } })
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  // El número se pide siempre acá vía RPC (contador atómico en Postgres) y
  // pisa cualquier `numero` que traiga `recibo` — los llamadores (PageClientes,
  // useGestionSeñaVenta) lo calculaban antes contando el array local
  // `recibos`, que no es atómico entre pestañas/usuarios y generó decenas de
  // números de recibo duplicados en producción (ver auditoría de cta. cte.).
  const agregarRecibo = useCallback(async (recibo) => {
    const { data: numero, error: errNumero } = await supabase.rpc('siguiente_numero_recibo', { p_tipo: recibo.tipo })
    if (errNumero) throw new Error(errNumero.message)
    const { data, error } = await supabase
      .from('recibos')
      .insert(reciboToDB({ ...recibo, numero }))
      .select()
      .single()
    if (error) throw new Error(error.message)
    const nuevo = reciboFromDB(data)
    setRecibos(prev => [nuevo, ...prev])
    return nuevo
  }, [])

  // Emitir un comprobante (Recibo/NC/ND) como una sola operación idempotente:
  // pide el número real (RPC), inserta el recibo, ajusta cuenta corriente si
  // corresponde, y devuelve stock si es una NC con mercadería devuelta. Usada
  // tanto por el camino online normal como para "resumir" una operación
  // encolada tras un corte de conexión — por eso cada paso chequea si ya se
  // hizo antes de repetirlo (ver `progreso`).
  const ejecutarEmitirComprobante = useCallback(async (data, clientOpId, progresoInicial = {}, onProgreso) => {
    let progreso = { ...progresoInicial }
    const marcar = async (p) => { progreso = { ...progreso, ...p }; await onProgreso?.(progreso) }

    // 1) Número real — pedido una sola vez (si ya se pidió, no se vuelve a
    // pedir: el contador es un recurso compartido, pedirlo de nuevo en un
    // reintento quemaría un número sin usar).
    let numero = progreso.numero
    if (!numero) {
      const { data: n, error } = await supabase.rpc('siguiente_numero_recibo', { p_tipo: data.tipo })
      if (error) throw new Error(error.message)
      numero = n
      await marcar({ numero })
    }

    // 2) Insertar el recibo — idempotente vía client_op_id.
    let reciboData
    if (progreso.reciboId) {
      const { data: existente, error } = await supabase.from('recibos').select('*').eq('id', progreso.reciboId).single()
      if (error) throw new Error(error.message)
      reciboData = existente
    } else {
      const fila = { ...reciboToDB({ ...data, numero, observacion: data.observacion || data.concepto || '' }), client_op_id: clientOpId }
      const { data: insertada, error } = await supabase.from('recibos').insert(fila).select().single()
      if (error) {
        if (error.code === '23505') {
          const { data: existente, error: e2 } = await supabase.from('recibos').select('*').eq('client_op_id', clientOpId).single()
          if (e2) throw new Error(e2.message)
          reciboData = existente
        } else {
          throw new Error(error.message)
        }
      } else {
        reciboData = insertada
      }
      await marcar({ reciboId: reciboData.id })
    }

    // 3) Cuenta corriente — Recibo con cliente, o NC/ND con forma "Cuenta
    // Corriente". Un error de red acá hace reintentar todo el paso más
    // tarde; cualquier otro error se avisa pero no bloquea el comprobante
    // (mismo comportamiento que tenía esto antes de encolarse).
    if (!progreso.ctaCteListo) {
      const esRecibo = data.tipo === "Recibo"
      // La mora incluida en un recibo NO es pago de la deuda: se registra
      // aparte (paso 3b). Si se sumara acá, sobraría y quedaría como saldo
      // a favor del cliente.
      const montoDeuda = esRecibo ? data.monto - (data.moraIncluida || 0) : data.monto
      const aplicaCtaCte = agregarPagoCtaCte && data.clienteId && montoDeuda > 0 &&
        (esRecibo || data.formaPago === "Cuenta Corriente")
      if (aplicaCtaCte) {
        try {
          await agregarPagoCtaCte({
            clienteId:   data.clienteId,
            fecha:       data.fecha,
            monto:       esRecibo ? montoDeuda : (data.tipo === "Nota de Crédito" ? data.monto : -data.monto),
            formaPago:   data.formaPago,
            observacion: `${esRecibo ? "Recibo" : data.tipo} ${numero} — ${data.concepto}`,
            usuario:     data.usuario || '',
            reciboId:    reciboData.id,
          })
        } catch (err) {
          if (esErrorDeRed(err)) throw err
          toast(`${esRecibo ? "Recibo" : data.tipo} guardado. Error al actualizar la cuenta corriente: ${err.message}`, "warning")
        }
      }
      await marcar({ ctaCteListo: true })
    }

    // 3b) Mora incluida en el recibo — se anota en la ficha del cliente.
    if (!progreso.moraListo) {
      if (data.tipo === "Recibo" && data.clienteId && data.moraIncluida > 0 && registrarMoraCobrada) {
        try {
          await registrarMoraCobrada(data.clienteId, {
            monto: data.moraIncluida, reciboId: reciboData.id,
            fecha: data.fecha, deudaDesde: data.moraDeudaDesde || null,
            // Cargos de mora manual cobrados (los de las facturas pagadas);
            // undefined = todos los activos.
            cargoIds: data.moraCargoIds,
          })
        } catch (err) {
          if (esErrorDeRed(err)) throw err
          toast(`Recibo guardado. Error al registrar la mora cobrada (${err.message}) — avisá a un admin para quitarla a mano.`, "warning")
        }
      }
      await marcar({ moraListo: true })
    }

    // 4) Stock — Nota de Crédito que devuelve mercadería.
    if (!progreso.stockListo) {
      if (data.tipo === "Nota de Crédito" && data.itemsDevueltos?.length > 0 && data.depositoId && aplicarDeltaStockMultiple) {
        const cambiosStock = data.itemsDevueltos
          .filter(it => it.productoId)
          .map(it => ({ productoId: it.productoId, depositoId: data.depositoId, delta: it.qty }))
        if (cambiosStock.length) {
          try {
            await aplicarDeltaStockMultiple(cambiosStock)
          } catch (err) {
            if (esErrorDeRed(err)) throw err
            toast(`${data.tipo} guardada. Error al devolver el stock: ${err.message}`, "warning")
          }
        }
      }
      await marcar({ stockListo: true })
    }

    return reciboFromDB(reciboData)
  }, [agregarPagoCtaCte, aplicarDeltaStockMultiple, registrarMoraCobrada, toast])

  // Punto de entrada usado por Caja: intenta el camino online; si falla por
  // red (o ya está offline), guarda un comprobante optimista con id y número
  // provisorios y encola la operación real para cuando vuelva la conexión.
  const emitirRecibo = useCallback(async (data) => {
    const clientOpId = crypto.randomUUID()
    let progresoParcial = {}
    try {
      const nuevo = await conTimeout(() => conMutex(clientOpId,
        () => ejecutarEmitirComprobante(data, clientOpId, {}, (p) => { progresoParcial = p })
      ))
      setRecibos(prev => prev.find(r => r.id === nuevo.id) ? prev : [nuevo, ...prev])
      return nuevo
    } catch (err) {
      if (!esErrorDeRed(err)) throw err
      const tempId = `local-${clientOpId}`
      const optimista = {
        ...data, id: tempId, numero: 'Pendiente de sincronizar',
        observacion: data.observacion || data.concepto || '', estado: 'activa',
        createdAt: new Date().toISOString(),
      }
      setRecibos(prev => [optimista, ...prev])
      await enqueue('emitirRecibo', { data, clientOpId, tempId }, progresoParcial)
      return optimista
    }
  }, [ejecutarEmitirComprobante])

  const ejecutarEmitirComprobanteRef = useRef(ejecutarEmitirComprobante)
  useEffect(() => { ejecutarEmitirComprobanteRef.current = ejecutarEmitirComprobante }, [ejecutarEmitirComprobante])
  useEffect(() => {
    registerHandler('emitirRecibo', async (payload, op) => {
      const nuevo = await conMutex(payload.clientOpId, () => ejecutarEmitirComprobanteRef.current(
        payload.data, payload.clientOpId, op.progress || {}, (p) => actualizarProgreso(op.opId, p)
      ))
      setRecibos(prev => prev.map(r => r.id === payload.tempId ? nuevo : r))
    })
  }, [])

  const editarRecibo = useCallback(async (id, cambios) => {
    const { data, error } = await supabase
      .from('recibos')
      .update(reciboToDB(cambios))
      .eq('id', id)
      .select()
      .single()
    if (error) throw new Error(error.message)
    const actualizado = reciboFromDB(data)
    setRecibos(prev => prev.map(r => r.id === id ? actualizado : r))
    return actualizado
  }, [])

  const anularRecibo = useCallback(async (id, motivo) => {
    const { data, error } = await supabase
      .from('recibos')
      .update({ estado: 'anulada', motivo_anulacion: motivo || '' })
      .eq('id', id)
      .select()
      .single()
    if (error) throw new Error(error.message)
    const actualizado = reciboFromDB(data)
    setRecibos(prev => prev.map(r => r.id === id ? actualizado : r))
    return actualizado
  }, [])

  return {
    recibos,
    setRecibos,
    loading,
    error,
    isFromCache,
    cargar,
    agregarRecibo,
    emitirRecibo,
    editarRecibo,
    anularRecibo,
  }
}
