import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, fetchAll } from '../lib/supabase'
import { cachedLoad } from '../lib/offlineDb'
import { enqueue, registerHandler, actualizarProgreso, esErrorDeRed, conTimeout, conMutex } from '../lib/outbox'

function ventaFromDB(row, items = []) {
  if (!row) return null
  return {
    id:             row.id,
    fecha:          row.fecha,
    periodo:        row.periodo,
    clienteId:      row.cliente_id,
    cliente:        row.cliente || 'Consumidor Final',
    lista:          row.lista,
    formaPago:      row.forma_pago,
    pagos:          row.pagos || [],
    tipo:           row.tipo || 'Mostrador',
    descripcion:    row.descripcion || '',
    tipoFactura:    row.tipo_factura,
    nroComprobante: row.nro_comprobante,
    alicuotaIva:    Number(row.alicuota_iva) || 0,
    neto:           Number(row.neto) || 0,
    iva:            Number(row.iva) || 0,
    total:          Number(row.total) || 0,
    depositoId:     row.deposito_id,
    depositoNombre: row.deposito_nombre,
    usuario:        row.usuario,
    estado:         row.estado || 'activa',
    esSeña:         row.es_sena || false,
    fechaCompletada: row.fecha_completada,
    createdAt:      row.created_at,
    retiros:        row.retiros || [],
    items,
  }
}

function ventaToDB(obj) {
  const row = {}
  if (obj.fecha          !== undefined) row.fecha           = obj.fecha
  if (obj.periodo        !== undefined) row.periodo         = obj.periodo
  if (obj.clienteId      !== undefined) row.cliente_id      = obj.clienteId
  if (obj.cliente        !== undefined) row.cliente         = obj.cliente
  if (obj.lista          !== undefined) row.lista           = obj.lista
  if (obj.formaPago      !== undefined) row.forma_pago      = obj.formaPago
  if (obj.pagos          !== undefined) row.pagos           = obj.pagos
  if (obj.tipo           !== undefined) row.tipo            = obj.tipo
  if (obj.descripcion    !== undefined) row.descripcion     = obj.descripcion
  if (obj.tipoFactura    !== undefined) row.tipo_factura    = obj.tipoFactura
  if (obj.nroComprobante !== undefined) row.nro_comprobante = obj.nroComprobante
  if (obj.alicuotaIva    !== undefined) row.alicuota_iva    = obj.alicuotaIva
  if (obj.neto           !== undefined) row.neto            = obj.neto
  if (obj.iva            !== undefined) row.iva             = obj.iva
  if (obj.total          !== undefined) row.total           = obj.total
  if (obj.depositoId     !== undefined) row.deposito_id     = obj.depositoId
  if (obj.depositoNombre !== undefined) row.deposito_nombre = obj.depositoNombre
  if (obj.usuario        !== undefined) row.usuario         = obj.usuario
  if (obj.estado         !== undefined) row.estado          = obj.estado
  if (obj.esSeña         !== undefined) row.es_sena         = obj.esSeña
  if (obj.fechaCompletada !== undefined) row.fecha_completada = obj.fechaCompletada
  return row
}

function anulacionFromDB(row) {
  if (!row) return null
  return {
    id:      row.id,
    ventaId: row.venta_id,
    fecha:   row.fecha,
    hora:    row.hora,
    motivo:  row.motivo,
    usuario: row.usuario,
    tipo:    row.tipo || 'directa',
    nroNc:   row.nro_nc,
    createdAt: row.created_at,
  }
}

function cambioFromDB(row) {
  if (!row) return null
  return {
    id:                     row.id,
    nro:                    row.nro,
    fecha:                  row.fecha,
    hora:                   row.hora,
    ventaOriginalId:        row.venta_original_id,
    ventaOriginalCliente:   row.venta_original_cliente,
    ventaOriginalClienteId: row.venta_original_cliente_id,
    itemViejo:              row.item_viejo || {},
    productoNuevoId:        row.producto_nuevo_id,
    productoNuevo:          { id: row.producto_nuevo_id, nombre: row.producto_nuevo_nombre },
    qtyNuevo:               row.qty_nuevo,
    totalViejo:             Number(row.total_viejo) || 0,
    totalNuevo:             Number(row.total_nuevo) || 0,
    diferencia:             Number(row.diferencia) || 0,
    formaPagoDif:           row.forma_pago_dif,
    motivo:                 row.motivo,
    depositoId:             row.deposito_id,
    usuario:                row.usuario,
    estado:                 row.estado || 'emitida',
    createdAt:              row.created_at,
  }
}

export function useVentas() {
  const [ventas, setVentas]                   = useState([])
  const [anulaciones, setAnulaciones]         = useState([])
  const [cambiosArticulo, setCambiosArticulo] = useState([])
  const [loading, setLoading]                 = useState(true)
  const [error, setError]                     = useState(null)
  const [isFromCache, setIsFromCache]         = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, isFromCache: fromCache, refresh } = await cachedLoad('ventas', async () => {
        // PostgREST limita cada query a 1000 filas (db-max-rows) — con más de
        // 1000 ventas cargadas, una query simple corta en silencio las más
        // antiguas y esas ventas (y su cta. cte.) dejan de verse en la app
        // aunque sigan en Supabase. `fetchAll` pagina con .range() para traer
        // todo.
        const [ventasRows, anulacionesRows, cambiosRows] = await Promise.all([
          fetchAll(() => supabase
            .from('ventas')
            .select('*, venta_items(*)')
            .order('fecha', { ascending: false })
            .order('id',    { ascending: false })),
          fetchAll(() => supabase
            .from('anulaciones')
            .select('*')
            .order('created_at', { ascending: false })),
          fetchAll(() => supabase
            .from('cambios_articulo')
            .select('*')
            .order('created_at', { ascending: false })),
        ])

        const ventasMapeadas = ventasRows.map(row => {
          const items = (row.venta_items || []).map(it => ({
            id:         it.id,
            nombre:     it.nombre,
            qty:        it.qty,
            precio:     Number(it.precio) || 0,
            productoId: it.producto_id,
          }))
          return ventaFromDB(row, items)
        })
        return {
          ventas: ventasMapeadas,
          anulaciones: anulacionesRows.map(anulacionFromDB),
          cambiosArticulo: cambiosRows.map(cambioFromDB),
        }
      })
      setVentas(data.ventas)
      setAnulaciones(data.anulaciones)
      setCambiosArticulo(data.cambiosArticulo)
      setIsFromCache(fromCache)
      if (refresh) refresh.then(fresh => {
        if (fresh) { setVentas(fresh.ventas); setAnulaciones(fresh.anulaciones); setCambiosArticulo(fresh.cambiosArticulo); setIsFromCache(false) }
      })
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  // Realtime: cuando otra PC registra o modifica una venta, este cliente se
  // actualiza solo sin necesidad de recargar la página.
  useEffect(() => {
    const channel = supabase
      .channel('ventas_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ventas' },
        async (payload) => {
          const { data: itemsRows } = await supabase
            .from('venta_items')
            .select('*')
            .eq('venta_id', payload.new.id)
          const items = (itemsRows || []).map(it => ({
            id: it.id, nombre: it.nombre, qty: it.qty,
            precio: Number(it.precio) || 0, productoId: it.producto_id,
          }))
          const ventaNueva = ventaFromDB(payload.new, items)
          setVentas(prev => prev.find(v => v.id === ventaNueva.id) ? prev : [ventaNueva, ...prev])
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'ventas' },
        (payload) => {
          setVentas(prev => prev.map(v => v.id === payload.new.id ? ventaFromDB(payload.new, v.items) : v))
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const agregarVenta = useCallback(async (venta) => {
    const { data: ventaData, error: ventaError } = await supabase
      .from('ventas')
      .insert(ventaToDB(venta))
      .select()
      .single()
    if (ventaError) throw new Error(ventaError.message)

    if (venta.items && venta.items.length > 0) {
      const itemsDB = venta.items.map(it => ({
        venta_id:    ventaData.id,
        nombre:      it.nombre,
        qty:         it.qty,
        precio:      it.precio,
        producto_id: it.productoId || null,
      }))
      const { error: itemsError } = await supabase.from('venta_items').insert(itemsDB)
      if (itemsError) throw new Error(itemsError.message)
    }

    const nueva = ventaFromDB(ventaData, venta.items || [])
    // El broadcast de Realtime para este mismo INSERT puede llegar antes que
    // esta respuesta y ya haberla agregado — no duplicar en ese caso.
    setVentas(prev => prev.find(v => v.id === nueva.id) ? prev : [nueva, ...prev])
    return nueva
  }, [])

  // Inserta venta + items + descuenta stock (depósito y total) como una sola
  // operación idempotente — usada tanto por el camino online normal como
  // para "resumir" una operación encolada en el outbox, así la lógica no se
  // duplica entre ambos casos. `clientOpId` es la clave de idempotencia para
  // el insert de la venta (columna única); `progresoInicial`/`onProgreso`
  // cubren los pasos que NO son idempotentes por sí solos (los deltas de
  // stock) — sin esto, reintentar tras un corte a mitad de camino podría
  // descontar el stock dos veces.
  const ejecutarConfirmarVenta = useCallback(async ({ venta, cambiosStock }, clientOpId, progresoInicial = {}, onProgreso) => {
    let progreso = { ...progresoInicial }
    const marcar = async (p) => { progreso = { ...progreso, ...p }; await onProgreso?.(progreso) }

    // 1) Venta — si ya se insertó en un intento anterior (progreso.ventaId),
    // se recupera por id. Si no, se inserta con client_op_id: si choca por
    // unique (23505), es que otro intento ya la insertó — se recupera por
    // client_op_id en vez de fallar.
    let ventaData
    if (progreso.ventaId) {
      const { data, error } = await supabase.from('ventas').select('*').eq('id', progreso.ventaId).single()
      if (error) throw new Error(error.message)
      ventaData = data
    } else {
      const { data: insertada, error: ventaError } = await supabase
        .from('ventas')
        .insert({ ...ventaToDB(venta), client_op_id: clientOpId })
        .select()
        .single()
      if (ventaError) {
        if (ventaError.code === '23505') {
          const { data: existente, error: buscarError } = await supabase
            .from('ventas').select('*').eq('client_op_id', clientOpId).single()
          if (buscarError) throw new Error(buscarError.message)
          ventaData = existente
        } else {
          throw new Error(ventaError.message)
        }
      } else {
        ventaData = insertada
      }
      await marcar({ ventaId: ventaData.id })
    }

    // 2) Items — solo si todavía no existen para esta venta.
    if (!progreso.itemsListos) {
      if (venta.items?.length > 0) {
        const { count } = await supabase
          .from('venta_items').select('id', { count: 'exact', head: true }).eq('venta_id', ventaData.id)
        if (!count) {
          const itemsDB = venta.items.map(it => ({
            venta_id: ventaData.id, nombre: it.nombre, qty: it.qty,
            precio: it.precio, producto_id: it.productoId || null,
          }))
          const { error: itemsError } = await supabase.from('venta_items').insert(itemsDB)
          if (itemsError) throw new Error(itemsError.message)
        }
      }
      await marcar({ itemsListos: true })
    }

    // 3) Stock por depósito (delta, atómico) — solo si no se aplicó ya.
    if (!progreso.stockDepositoListo) {
      if (cambiosStock?.length) {
        const { error } = await supabase.rpc('aplicar_delta_stock', { cambios: cambiosStock })
        if (error) throw new Error(error.message)
      }
      await marcar({ stockDepositoListo: true })
    }

    // 4) Stock total del producto (delta, atómico) — solo si no se aplicó ya.
    if (!progreso.stockProductoListo) {
      if (cambiosStock?.length) {
        const cambiosProducto = cambiosStock.map(c => ({ productoId: c.productoId, delta: c.delta }))
        const { error } = await supabase.rpc('aplicar_delta_stock_producto', { cambios: cambiosProducto })
        if (error) throw new Error(error.message)
      }
      await marcar({ stockProductoListo: true })
    }

    return ventaFromDB(ventaData, venta.items || [])
  }, [])

  // Punto de entrada usado por la pantalla de Ventas para una venta normal
  // (no seña): intenta el camino online de siempre; si falla por red (o si
  // ya está offline), guarda un registro optimista con id temporal y encola
  // la operación para cuando vuelva la conexión — arrancando desde lo que ya
  // se haya alcanzado a confirmar en el intento que acaba de fallar.
  const confirmarVenta = useCallback(async (venta, cambiosStock) => {
    const clientOpId = crypto.randomUUID()
    let progresoParcial = {}
    try {
      const nueva = await conTimeout(() => conMutex(clientOpId,
        () => ejecutarConfirmarVenta({ venta, cambiosStock }, clientOpId, {}, (p) => { progresoParcial = p })
      ))
      setVentas(prev => prev.find(v => v.id === nueva.id) ? prev : [nueva, ...prev])
      return nueva
    } catch (err) {
      if (!esErrorDeRed(err)) throw err
      const tempId = `local-${crypto.randomUUID()}`
      const optimista = { ...venta, id: tempId, createdAt: new Date().toISOString() }
      setVentas(prev => [optimista, ...prev])
      await enqueue('confirmarVenta', { venta, cambiosStock, clientOpId, tempId }, progresoParcial)
      return optimista
    }
  }, [ejecutarConfirmarVenta])

  // Handler que corre `runSync()` cuando a esta operación le toca el turno
  // en la cola — retoma desde `op.progress` y reemplaza el id temporal por
  // el real en el estado una vez confirmada.
  const ejecutarConfirmarVentaRef = useRef(ejecutarConfirmarVenta)
  useEffect(() => { ejecutarConfirmarVentaRef.current = ejecutarConfirmarVenta }, [ejecutarConfirmarVenta])
  useEffect(() => {
    registerHandler('confirmarVenta', async (payload, op) => {
      const nueva = await conMutex(payload.clientOpId, () => ejecutarConfirmarVentaRef.current(
        { venta: payload.venta, cambiosStock: payload.cambiosStock },
        payload.clientOpId,
        op.progress || {},
        (progreso) => actualizarProgreso(op.opId, progreso)
      ))
      setVentas(prev => prev.map(v => v.id === payload.tempId ? nueva : v))
    })
  }, [])

  const editarVenta = useCallback(async (id, cambios) => {
    const { data, error } = await supabase
      .from('ventas')
      .update({ ...ventaToDB(cambios), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw new Error(error.message)
    setVentas(prev => prev.map(v => v.id !== id ? v : { ...v, ...ventaFromDB(data, v.items) }))
  }, [])

  // Edita una venta Y reemplaza por completo sus items (se borran los viejos
  // y se insertan los nuevos) — usado por el editor de venta que permite
  // agregar/quitar productos, no solo cambiar datos generales.
  const editarVentaConItems = useCallback(async (id, cambios, nuevosItems) => {
    const { data, error } = await supabase
      .from('ventas')
      .update({ ...ventaToDB(cambios), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw new Error(error.message)

    const { error: delError } = await supabase.from('venta_items').delete().eq('venta_id', id)
    if (delError) throw new Error(delError.message)

    let itemsGuardados = []
    if (nuevosItems.length > 0) {
      const { data: itemsData, error: insError } = await supabase
        .from('venta_items')
        .insert(nuevosItems.map(it => ({
          venta_id:    id,
          nombre:      it.nombre,
          qty:         it.qty,
          precio:      it.precio,
          producto_id: it.productoId || null,
        })))
        .select()
      if (insError) throw new Error(insError.message)
      itemsGuardados = (itemsData || []).map(it => ({
        id: it.id, nombre: it.nombre, qty: it.qty,
        precio: Number(it.precio) || 0, productoId: it.producto_id,
      }))
    }

    const actualizada = ventaFromDB(data, itemsGuardados)
    setVentas(prev => prev.map(v => v.id === id ? actualizada : v))
    return actualizada
  }, [])

  const anularVenta = useCallback(async (ventaId, datosAnulacion) => {
    const { error: ventaError } = await supabase
      .from('ventas')
      .update({ estado: 'anulada', updated_at: new Date().toISOString() })
      .eq('id', ventaId)
    if (ventaError) throw new Error(ventaError.message)

    const { data: anulData, error: anulError } = await supabase
      .from('anulaciones')
      .insert({
        venta_id: ventaId,
        fecha:    datosAnulacion.fecha,
        hora:     datosAnulacion.hora,
        motivo:   datosAnulacion.motivo,
        usuario:  datosAnulacion.usuario,
        tipo:     datosAnulacion.tipo || 'directa',
        nro_nc:   datosAnulacion.nroNc || null,
      })
      .select()
      .single()
    if (anulError) throw new Error(anulError.message)

    setVentas(prev => prev.map(v => v.id === ventaId ? { ...v, estado: 'anulada' } : v))
    setAnulaciones(prev => [anulacionFromDB(anulData), ...prev])
  }, [])

  // ── Registrar un retiro (total o parcial) de una venta con seña pendiente
  // ("Venta con retiro después"). Igual que registrarRetiroReserva en
  // useReservas.js, pero sobre `ventas` — acá NO hace falta generar una
  // venta nueva por cada entrega parcial (ya es una venta), así que solo se
  // anota en `ventas.retiros` qué salió y cuándo. Si con este retiro no
  // queda ningún item pendiente, pasa a "activa" (retirada por completo).
  const registrarRetiroSeña = useCallback(async (ventaId, retiro) => {
    const { data: actual, error: fetchErr } = await supabase
      .from('ventas')
      .select('retiros')
      .eq('id', ventaId)
      .single()
    if (fetchErr) throw new Error(fetchErr.message)

    const retirosPrevios = actual.retiros || []
    const nuevoRetiro = {
      nro:     `RET-${String(retirosPrevios.length + 1).padStart(4, '0')}`,
      fecha:   retiro.fecha,
      items:   retiro.items,
      usuario: retiro.usuario,
    }
    const retiros = [...retirosPrevios, nuevoRetiro]

    const updates = { retiros, updated_at: new Date().toISOString() }
    if (retiro.cierraVenta) {
      updates.estado           = 'activa'
      updates.fecha_completada = retiro.fecha
    }

    const { error: updErr } = await supabase.from('ventas').update(updates).eq('id', ventaId)
    if (updErr) throw new Error(updErr.message)

    setVentas(prev => prev.map(v => v.id === ventaId
      ? { ...v, retiros, ...(retiro.cierraVenta ? { estado: 'activa', fechaCompletada: retiro.fecha } : {}) }
      : v
    ))
  }, [])

  // ── Registrar un pago parcial (o el saldo completo) de una venta con seña
  // pendiente, sin tocar los items ni marcarla como retirada — el retiro de
  // mercadería es una acción totalmente aparte (ver registrarRetiroSeña).
  // `total` puede subir si el pago trae un recargo por financiación en
  // tarjeta (mismo cálculo que antes tenía handleCompletarRetiro), pero
  // nunca se toca "a mano": es siempre resultado de esta cuenta.
  const registrarPagoSeña = useCallback(async (ventaId, pago) => {
    const { data: actual, error: fetchErr } = await supabase
      .from('ventas')
      .select('pagos, total')
      .eq('id', ventaId)
      .single()
    if (fetchErr) throw new Error(fetchErr.message)

    const pagosPrevios = actual.pagos || []
    const nuevoPago = {
      formaPago: pago.formaPago,
      monto:     pago.monto,
      fecha:     pago.fecha,
      ...(pago.tarjetaInfo || {}),
    }
    const pagos = [...pagosPrevios, nuevoPago]
    const formaPago = pagos.length === 1 ? pagos[0].formaPago : 'Pago combinado'
    const total = Number(actual.total) + (pago.recargo || 0)

    const { error: updErr } = await supabase
      .from('ventas')
      .update({ pagos, forma_pago: formaPago, total, updated_at: new Date().toISOString() })
      .eq('id', ventaId)
    if (updErr) throw new Error(updErr.message)

    setVentas(prev => prev.map(v => v.id === ventaId ? { ...v, pagos, formaPago, total } : v))
  }, [])

  const agregarCambioArticulo = useCallback(async (cambio) => {
    const { data, error } = await supabase
      .from('cambios_articulo')
      .insert({
        nro:                       cambio.nro,
        fecha:                     cambio.fecha,
        hora:                      cambio.hora,
        venta_original_id:         cambio.ventaOriginalId,
        venta_original_cliente:    cambio.ventaOriginalCliente,
        venta_original_cliente_id: cambio.ventaOriginalClienteId,
        item_viejo:                cambio.itemViejo,
        producto_nuevo_id:         cambio.productoNuevo?.id || null,
        producto_nuevo_nombre:     cambio.productoNuevo?.nombre || '',
        qty_nuevo:                 cambio.qtyNuevo,
        total_viejo:               cambio.totalViejo,
        total_nuevo:               cambio.totalNuevo,
        diferencia:                cambio.diferencia,
        forma_pago_dif:            cambio.formaPagoDif,
        motivo:                    cambio.motivo,
        deposito_id:               cambio.depositoId,
        usuario:                   cambio.usuario,
        estado:                    cambio.estado || 'emitida',
      })
      .select()
      .single()
    if (error) throw new Error(error.message)
    const nuevo = cambioFromDB(data)
    setCambiosArticulo(prev => [nuevo, ...prev])
    return nuevo
  }, [])

  // Anula TODAS las filas de cambios_articulo que comparten un mismo "nro"
  // (un cambio con varios artículos queda emitido como varias filas — ver
  // agregarCambioArticulo — así que anularlo es una operación por grupo).
  const anularCambioArticulo = useCallback(async (nro, motivo) => {
    const { data, error } = await supabase
      .from('cambios_articulo')
      .update({ estado: 'anulada', motivo })
      .eq('nro', nro)
      .select()
    if (error) throw new Error(error.message)
    const actualizados = (data || []).map(cambioFromDB)
    setCambiosArticulo(prev => prev.map(c => actualizados.find(a => a.id === c.id) || c))
    return actualizados
  }, [])

  return {
    ventas,
    setVentas,
    anulaciones,
    setAnulaciones,
    cambiosArticulo,
    setCambiosArticulo,
    loading,
    error,
    isFromCache,
    cargar,
    agregarVenta,
    confirmarVenta,
    editarVenta,
    editarVentaConItems,
    anularVenta,
    registrarRetiroSeña,
    registrarPagoSeña,
    agregarCambioArticulo,
    anularCambioArticulo,
  }
}
