import { useState, useEffect, useCallback } from 'react'
import { supabase, fetchAll } from '../lib/supabase'
import { cachedLoad } from '../lib/offlineDb'

function depositoFromDB(row) {
  if (!row) return null
  return {
    id:     row.id,
    nombre: row.nombre,
    tipo:   row.tipo || 'normal',
    activo: row.activo ?? true,
  }
}

function stockFromDB(row) {
  if (!row) return null
  return {
    id:         row.id,
    productoId: row.producto_id,
    depositoId: row.deposito_id,
    cantidad:   Number(row.cantidad) || 0,
    updatedAt:  row.updated_at,
  }
}

function movimientoFromDB(row) {
  if (!row) return null
  return {
    id:           row.id,
    fecha:        row.fecha,
    productoId:   row.producto_id,
    depositoId:   row.deposito_id,
    tipo:         row.tipo,
    origen:       row.origen,
    origenId:     row.origen_id,
    cantidad:     Number(row.cantidad) || 0,
    stockAntes:   Number(row.stock_antes) || 0,
    stockDespues: Number(row.stock_despues) || 0,
    motivo:       row.motivo,
    usuario:      row.usuario,
  }
}

function paseFromDB(row) {
  if (!row) return null
  return {
    id:                    row.id,
    fecha:                 row.fecha,
    productoId:            row.producto_id,
    nombreProducto:        row.nombre_producto,
    depositoOrigenId:      row.deposito_origen_id,
    depositoOrigenNombre:  row.deposito_origen_nombre,
    depositoDestinoId:     row.deposito_destino_id,
    depositoDestinoNombre: row.deposito_destino_nombre,
    cantidad:              Number(row.cantidad) || 0,
    motivo:                row.motivo,
    usuario:               row.usuario,
    items:                 row.items || undefined,
    estado:                row.estado || undefined,
    observacion:           row.observacion,
    usuarioEnvio:          row.usuario_envio,
    fechaRecepcion:        row.fecha_recepcion,
    usuarioRecepcion:      row.usuario_recepcion,
    fechaAnulacion:        row.fecha_anulacion,
  }
}

export function useDepositos() {
  const [depositos,        setDepositos]        = useState([])
  const [stockDepositos,   setStockDepositos]   = useState([])
  const [movimientosStock, setMovimientosStock] = useState([])
  const [pasesDeposito,    setPasesDeposito]    = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [isFromCache, setIsFromCache] = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const { data, isFromCache: fromCache, refresh } = await cachedLoad('depositos', async () => {
        const [resDepositos, stockData, resMovimientos, resPases] = await Promise.all([
          supabase.from('depositos').select('*').order('nombre'),
          fetchAll(() => supabase.from('stock_depositos').select('*')),
          supabase.from('movimientos_stock').select('*')
            .order('created_at', { ascending: false }).limit(500),
          supabase.from('pases_deposito').select('*')
            .order('fecha', { ascending: false }),
        ])
        if (resDepositos.error)   throw new Error(resDepositos.error.message)
        if (resMovimientos.error) throw new Error(resMovimientos.error.message)
        if (resPases.error)       throw new Error(resPases.error.message)
        return {
          depositos: (resDepositos.data || []).map(depositoFromDB),
          stockDepositos: stockData.map(stockFromDB),
          movimientosStock: (resMovimientos.data || []).map(movimientoFromDB),
          pasesDeposito: (resPases.data || []).map(paseFromDB),
        }
      })
      setDepositos(data.depositos)
      setStockDepositos(data.stockDepositos)
      setMovimientosStock(data.movimientosStock)
      setPasesDeposito(data.pasesDeposito)
      setIsFromCache(fromCache)
      if (refresh) refresh.then(fresh => {
        if (fresh) {
          setDepositos(fresh.depositos); setStockDepositos(fresh.stockDepositos)
          setMovimientosStock(fresh.movimientosStock); setPasesDeposito(fresh.pasesDeposito)
          setIsFromCache(false)
        }
      })
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  // ── Depósitos ─────────────────────────────────────────────
  const agregarDeposito = useCallback(async (deposito) => {
    const { data, error } = await supabase
      .from('depositos')
      .insert({ nombre: deposito.nombre, tipo: deposito.tipo || 'normal' })
      .select()
      .single()
    if (error) throw new Error(error.message)
    const nuevo = depositoFromDB(data)
    setDepositos(prev => [...prev, nuevo])

    // Crear filas de stock vacías para todos los productos existentes
    supabase.from('productos').select('id').then(({ data: prods }) => {
      if (!prods?.length) return
      const filas = prods.map(p => ({
        producto_id: p.id,
        deposito_id: nuevo.id,
        cantidad:    0,
      }))
      supabase.from('stock_depositos').insert(filas).then(() => {
        setStockDepositos(prev => [
          ...prev,
          ...prods.map(p => ({ productoId: p.id, depositoId: nuevo.id, cantidad: 0 }))
        ])
      })
    })

    return nuevo
  }, [])

  // ── Stock por depósito ────────────────────────────────────
  const actualizarStockDeposito = useCallback(async (productoId, depositoId, nuevaCantidad) => {
    const { error } = await supabase
      .from('stock_depositos')
      .upsert(
        { producto_id: productoId, deposito_id: depositoId, cantidad: nuevaCantidad,
          updated_at: new Date().toISOString() },
        { onConflict: 'producto_id,deposito_id' }
      )
    if (error) throw new Error(error.message)
    setStockDepositos(prev => {
      const existe = prev.find(s => s.productoId === productoId && s.depositoId === depositoId)
      if (existe) {
        return prev.map(s =>
          s.productoId === productoId && s.depositoId === depositoId
            ? { ...s, cantidad: nuevaCantidad }
            : s
        )
      }
      return [...prev, { productoId, depositoId, cantidad: nuevaCantidad }]
    })
  }, [])

  const actualizarStockDepositoMultiple = useCallback(async (cambios) => {
    if (!cambios?.length) return
    const filas = cambios.map(c => ({
      producto_id: c.productoId,
      deposito_id: c.depositoId,
      cantidad:    c.cantidad,
      updated_at:  new Date().toISOString(),
    }))
    const { error } = await supabase
      .from('stock_depositos')
      .upsert(filas, { onConflict: 'producto_id,deposito_id' })
    if (error) throw new Error(error.message)
    setStockDepositos(prev => {
      let actualizado = [...prev]
      cambios.forEach(c => {
        const idx = actualizado.findIndex(
          s => s.productoId === c.productoId && s.depositoId === c.depositoId
        )
        if (idx >= 0) {
          actualizado[idx] = { ...actualizado[idx], cantidad: c.cantidad }
        } else {
          actualizado.push({ productoId: c.productoId, depositoId: c.depositoId, cantidad: c.cantidad })
        }
      })
      return actualizado
    })
  }, [])

  // Variante segura para escrituras concurrentes (2 PCs vendiendo en simultáneo):
  // resta/suma vía la función `aplicar_delta_stock` (RPC, atómica en Postgres) en
  // vez de escribir una cantidad absoluta calculada acá — así dos ventas casi
  // simultáneas del mismo producto no se pisan entre sí. Usada por Ventas/Caja;
  // el resto de las pantallas sigue con actualizarStockDepositoMultiple.
  const aplicarDeltaStockMultiple = useCallback(async (cambios) => {
    if (!cambios?.length) return
    const { error } = await supabase.rpc('aplicar_delta_stock', {
      cambios: cambios.map(c => ({
        productoId: c.productoId,
        depositoId: c.depositoId,
        delta:      c.delta,
      })),
    })
    if (error) throw new Error(error.message)
    setStockDepositos(prev => {
      let actualizado = [...prev]
      cambios.forEach(c => {
        const idx = actualizado.findIndex(
          s => s.productoId === c.productoId && s.depositoId === c.depositoId
        )
        if (idx >= 0) {
          actualizado[idx] = { ...actualizado[idx], cantidad: actualizado[idx].cantidad + c.delta }
        } else {
          actualizado.push({ productoId: c.productoId, depositoId: c.depositoId, cantidad: c.delta })
        }
      })
      return actualizado
    })
  }, [])

  // ── Movimientos de stock ──────────────────────────────────
  const registrarMovimiento = useCallback(async (movimiento) => {
    const { data, error } = await supabase
      .from('movimientos_stock')
      .insert({
        fecha:         movimiento.fecha,
        producto_id:   movimiento.productoId,
        deposito_id:   movimiento.depositoId,
        tipo:          movimiento.tipo,
        origen:        movimiento.origen,
        origen_id:     movimiento.origenId,
        cantidad:      movimiento.cantidad,
        stock_antes:   movimiento.stockAntes,
        stock_despues: movimiento.stockDespues,
        motivo:        movimiento.motivo,
        usuario:       movimiento.usuario,
      })
      .select()
      .single()
    if (error) throw new Error(error.message)
    setMovimientosStock(prev => [movimientoFromDB(data), ...prev])
    return data
  }, [])

  // ── Pases entre depósitos ─────────────────────────────────
  const registrarPase = useCallback(async (pase) => {
    const { data, error } = await supabase
      .from('pases_deposito')
      .insert({
        fecha:               pase.fecha,
        producto_id:         pase.productoId,
        nombre_producto:     pase.nombreProducto,
        deposito_origen_id:  pase.depositoOrigenId,
        deposito_destino_id: pase.depositoDestinoId,
        cantidad:            pase.cantidad,
        motivo:              pase.motivo,
        usuario:             pase.usuario,
      })
      .select()
      .single()
    if (error) throw new Error(error.message)

    // Actualizar stock en ambos depósitos
    const sdOrigen  = stockDepositos.find(
      s => s.productoId === pase.productoId && s.depositoId === pase.depositoOrigenId
    )
    const sdDestino = stockDepositos.find(
      s => s.productoId === pase.productoId && s.depositoId === pase.depositoDestinoId
    )
    await actualizarStockDepositoMultiple([
      { productoId: pase.productoId, depositoId: pase.depositoOrigenId,  cantidad: (sdOrigen?.cantidad  || 0) - pase.cantidad },
      { productoId: pase.productoId, depositoId: pase.depositoDestinoId, cantidad: (sdDestino?.cantidad || 0) + pase.cantidad },
    ])

    setPasesDeposito(prev => [paseFromDB(data), ...prev])
    return data
  }, [stockDepositos, actualizarStockDepositoMultiple])

  // Pase multi-ítem con ciclo de vida (en_transito → recibido/anulado),
  // usado por la pantalla "Pases de Depósito". No toca stock — eso ya lo
  // maneja el llamador vía actualizarStockDepositoMultiple.
  const agregarPase = useCallback(async (pase) => {
    const { data, error } = await supabase
      .from('pases_deposito')
      .insert({
        fecha:                   pase.fecha,
        deposito_origen_id:      pase.depositoOrigenId,
        deposito_origen_nombre:  pase.depositoOrigenNombre,
        deposito_destino_id:     pase.depositoDestinoId,
        deposito_destino_nombre: pase.depositoDestinoNombre,
        cantidad:                0,
        items:                   pase.items,
        estado:                  pase.estado || 'en_transito',
        observacion:             pase.observacion,
        usuario_envio:           pase.usuarioEnvio,
      })
      .select()
      .single()
    if (error) throw new Error(error.message)
    const nuevo = paseFromDB(data)
    setPasesDeposito(prev => [nuevo, ...prev])
    return nuevo
  }, [])

  const actualizarPase = useCallback(async (id, cambios) => {
    const row = {}
    if (cambios.estado           !== undefined) row.estado             = cambios.estado
    if (cambios.fechaRecepcion   !== undefined) row.fecha_recepcion    = cambios.fechaRecepcion
    if (cambios.usuarioRecepcion !== undefined) row.usuario_recepcion  = cambios.usuarioRecepcion
    if (cambios.fechaAnulacion   !== undefined) row.fecha_anulacion    = cambios.fechaAnulacion
    const { data, error } = await supabase
      .from('pases_deposito')
      .update(row)
      .eq('id', id)
      .select()
      .single()
    if (error) throw new Error(error.message)
    const actualizado = paseFromDB(data)
    setPasesDeposito(prev => prev.map(p => p.id === id ? actualizado : p))
    return actualizado
  }, [])

  return {
    depositos,        setDepositos,
    stockDepositos,   setStockDepositos,
    movimientosStock, setMovimientosStock,
    pasesDeposito,    setPasesDeposito,
    loading,
    error,
    isFromCache,
    cargar,
    agregarDeposito,
    actualizarStockDeposito,
    actualizarStockDepositoMultiple,
    aplicarDeltaStockMultiple,
    registrarMovimiento,
    registrarPase,
    agregarPase,
    actualizarPase,
  }
}
