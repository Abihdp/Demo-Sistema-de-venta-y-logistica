import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

function compraFromDB(row, items = []) {
  if (!row) return null
  return {
    id:           row.id,
    tipo:         row.tipo || 'Factura',
    nro:          row.nro,
    fecha:        row.fecha,
    proveedorId:  row.proveedor_id,
    proveedor:    row.proveedor,
    formaPago:    row.forma_pago || 'Efectivo',
    tipoFactura:  row.tipo_factura,
    alicuotaIva:  Number(row.alicuota_iva) || 0,
    neto:         Number(row.neto) || 0,
    iva:          Number(row.iva) || 0,
    total:        Number(row.total) || 0,
    estado:       row.estado || 'recibida',
    remitoOrigen: row.remito_origen,
    depositoId:   row.deposito_id,
    usuario:      row.usuario,
    periodo:      row.periodo,
    fuente:       row.fuente || null,
    sinDetalle:   row.sin_detalle === true,
    descripcion:  row.descripcion || '',
    items,
  }
}

function compraToDB(obj) {
  const row = {}
  if (obj.tipo         !== undefined) row.tipo          = obj.tipo
  if (obj.nro          !== undefined) row.nro           = obj.nro
  if (obj.fecha        !== undefined) row.fecha         = obj.fecha
  if (obj.proveedorId  !== undefined) row.proveedor_id  = obj.proveedorId
  if (obj.proveedor    !== undefined) row.proveedor     = obj.proveedor
  if (obj.formaPago    !== undefined) row.forma_pago    = obj.formaPago
  if (obj.tipoFactura  !== undefined) row.tipo_factura  = obj.tipoFactura
  if (obj.alicuotaIva  !== undefined) row.alicuota_iva  = obj.alicuotaIva
  if (obj.neto         !== undefined) row.neto          = obj.neto
  if (obj.iva          !== undefined) row.iva           = obj.iva
  if (obj.total        !== undefined) row.total         = obj.total
  if (obj.estado       !== undefined) row.estado        = obj.estado
  if (obj.remitoOrigen !== undefined) row.remito_origen = obj.remitoOrigen
  if (obj.depositoId   !== undefined) row.deposito_id   = obj.depositoId
  if (obj.usuario      !== undefined) row.usuario       = obj.usuario
  if (obj.periodo      !== undefined) row.periodo       = obj.periodo
  // De qué cuenta salió el pago (caja_salon, tesoreria, cta_transferencia,
  // banco, sin_impacto). Solo se envía si hay valor: las compras en cuenta
  // corriente no tienen fuente.
  if (obj.fuente) row.fuente = obj.fuente
  // Solo se envían cuando la compra es sin detalle, así las compras normales
  // siguen funcionando aunque todavía no se haya corrido la migración SQL.
  if (obj.sinDetalle) {
    row.sin_detalle = true
    row.descripcion = obj.descripcion ?? null
  }
  return row
}

function ordenFromDB(row) {
  if (!row) return null
  return {
    id:          row.id,
    nro:         row.nro,
    fecha:       row.fecha,
    hora:        row.hora,
    proveedorId: row.proveedor_id,
    proveedor:   row.proveedor,
    comprasIds:  row.compras_ids || [],
    monto:       Number(row.monto) || 0,
    formaPago:   row.forma_pago || 'Transferencia',
    referencia:  row.referencia || '',
    estado:      row.estado || 'emitida',
    usuario:     row.usuario,
  }
}

function ordenToDB(obj) {
  const row = {}
  if (obj.nro         !== undefined) row.nro          = obj.nro
  if (obj.fecha       !== undefined) row.fecha        = obj.fecha
  if (obj.hora        !== undefined) row.hora         = obj.hora
  if (obj.proveedorId !== undefined) row.proveedor_id = obj.proveedorId
  if (obj.proveedor   !== undefined) row.proveedor    = obj.proveedor
  if (obj.comprasIds  !== undefined) row.compras_ids  = obj.comprasIds
  if (obj.monto       !== undefined) row.monto        = obj.monto
  if (obj.formaPago   !== undefined) row.forma_pago   = obj.formaPago
  if (obj.referencia  !== undefined) row.referencia   = obj.referencia
  if (obj.estado      !== undefined) row.estado       = obj.estado
  if (obj.usuario     !== undefined) row.usuario      = obj.usuario
  return row
}

export function useCompras() {
  const [compras, setCompras]         = useState([])
  const [ordenesPago, setOrdenesPago] = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [resCompras, resOrdenes] = await Promise.all([
      supabase
        .from('compras')
        .select('*, compra_items(*)')
        .order('fecha', { ascending: false }),
      supabase
        .from('ordenes_pago')
        .select('*')
        .order('fecha', { ascending: false }),
    ])
    if (resCompras.error) { setError(resCompras.error.message); setLoading(false); return }
    if (resOrdenes.error) { setError(resOrdenes.error.message); setLoading(false); return }

    const comprasMapeadas = (resCompras.data || []).map(row => {
      const items = (row.compra_items || []).map(it => ({
        id:         it.id,
        nombre:     it.nombre,
        qty:        it.qty,
        costo:      Number(it.costo) || 0,
        productoId: it.producto_id,
      }))
      return compraFromDB(row, items)
    })

    setCompras(comprasMapeadas)
    setOrdenesPago((resOrdenes.data || []).map(ordenFromDB))
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const agregarCompra = useCallback(async (compra) => {
    const { data: compraData, error: compraError } = await supabase
      .from('compras')
      .insert(compraToDB(compra))
      .select()
      .single()
    if (compraError) throw new Error(compraError.message)

    if (compra.items && compra.items.length > 0) {
      const itemsDB = compra.items.map(it => ({
        compra_id:   compraData.id,
        nombre:      it.nombre,
        qty:         it.qty,
        costo:       it.costo,
        producto_id: it.productoId || null,
      }))
      const { error: itemsError } = await supabase
        .from('compra_items')
        .insert(itemsDB)
      if (itemsError) throw new Error(itemsError.message)
    }

    await cargar()
    return compraData
  }, [cargar])

  const actualizarEstadoCompra = useCallback(async (id, estado) => {
    const { error } = await supabase
      .from('compras')
      .update({ estado, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw new Error(error.message)
    setCompras(prev => prev.map(c => c.id === id ? { ...c, estado } : c))
  }, [])

  const facturarRemito = useCallback(async (remitoId, facturaData) => {
    await actualizarEstadoCompra(remitoId, 'recibida')
    await agregarCompra(facturaData)
  }, [actualizarEstadoCompra, agregarCompra])

  const agregarOrdenPago = useCallback(async (orden) => {
    const { data, error } = await supabase
      .from('ordenes_pago')
      .insert(ordenToDB(orden))
      .select()
      .single()
    if (error) throw new Error(error.message)
    const nueva = ordenFromDB(data)
    setOrdenesPago(prev => [nueva, ...prev])
    return nueva
  }, [])

  const actualizarEstadoOrden = useCallback(async (id, estado) => {
    const { error } = await supabase
      .from('ordenes_pago')
      .update({ estado })
      .eq('id', id)
    if (error) throw new Error(error.message)
    setOrdenesPago(prev => prev.map(o => o.id === id ? { ...o, estado } : o))
  }, [])

  const anularOrdenPago = useCallback(async (id) => {
    return actualizarEstadoOrden(id, 'anulada')
  }, [actualizarEstadoOrden])

  return {
    compras,
    setCompras,
    ordenesPago,
    setOrdenesPago,
    loading,
    error,
    cargar,
    agregarCompra,
    actualizarEstadoCompra,
    facturarRemito,
    agregarOrdenPago,
    actualizarEstadoOrden,
    anularOrdenPago,
  }
}
