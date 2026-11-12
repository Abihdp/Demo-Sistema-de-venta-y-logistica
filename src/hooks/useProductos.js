import { useState, useEffect, useCallback } from 'react'
import { supabase, fetchAll } from '../lib/supabase'
import { cachedLoad } from '../lib/offlineDb'

function fromDB(row) {
  if (!row) return null
  return {
    id:               row.id,
    tipo:             row.tipo || 'simple',
    productoMadreId:  row.producto_madre_id,
    codigoBase:       row.codigo_base,
    codigo:           row.codigo,
    nombre:           row.nombre,
    rubro:            row.rubro,
    subrubro:         row.subrubro,
    color:            row.color || '',
    talle:            row.talle || '',
    version:          row.version || '',
    costo:            Number(row.costo) || 0,
    precio:           Number(row.precio) || 0,
    precioBase:       row.precio_base != null ? Number(row.precio_base) : null,
    margen:           row.margen != null ? Number(row.margen) : null,
    stock:            Number(row.stock) || 0,
    stockMinimo:      Number(row.stock_minimo) || 0,
    proveedorId:      row.proveedor_id,
    activo:           row.activo ?? true,
    precios:          row.precios_por_lista || {},
    createdAt:        row.created_at,
    updatedAt:        row.updated_at,
  }
}

function toDB(obj) {
  const row = {}
  if (obj.tipo             !== undefined) row.tipo              = obj.tipo
  if (obj.productoMadreId  !== undefined) row.producto_madre_id = obj.productoMadreId
  if (obj.codigoBase       !== undefined) row.codigo_base       = obj.codigoBase
  if (obj.codigo           !== undefined) row.codigo            = obj.codigo
  if (obj.nombre           !== undefined) row.nombre            = obj.nombre
  if (obj.rubro            !== undefined) row.rubro             = obj.rubro
  if (obj.subrubro         !== undefined) row.subrubro          = obj.subrubro
  if (obj.color            !== undefined) row.color             = obj.color
  if (obj.talle            !== undefined) row.talle             = obj.talle
  if (obj.version          !== undefined) row.version           = obj.version
  if (obj.costo            !== undefined) row.costo             = obj.costo
  if (obj.precio           !== undefined) row.precio            = obj.precio
  if (obj.precioBase       !== undefined) row.precio_base       = obj.precioBase
  if (obj.margen           !== undefined) row.margen            = obj.margen
  if (obj.stock            !== undefined) row.stock             = obj.stock
  if (obj.stockMinimo      !== undefined) row.stock_minimo      = obj.stockMinimo
  if (obj.proveedorId      !== undefined) row.proveedor_id      = obj.proveedorId
  if (obj.activo           !== undefined) row.activo            = obj.activo
  if (obj.precios          !== undefined) row.precios_por_lista = obj.precios
  return row
}

export function useProductos() {
  const [productos, setProductos] = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [isFromCache, setIsFromCache] = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, isFromCache: fromCache, refresh } = await cachedLoad('productos', async () => {
        const raw = await fetchAll(() => supabase.from('productos').select('*').order('nombre'))
        return raw.map(fromDB)
      })
      setProductos(data)
      setIsFromCache(fromCache)
      if (refresh) refresh.then(fresh => { if (fresh) { setProductos(fresh); setIsFromCache(false) } })
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const agregarProducto = useCallback(async (producto) => {
    const { data, error } = await supabase
      .from('productos')
      .insert(toDB(producto))
      .select()
      .single()
    if (error) throw new Error(error.message)
    const nuevo = fromDB(data)
    setProductos(prev => [...prev, nuevo])
    return nuevo
  }, [])

  const actualizarProducto = useCallback(async (id, cambios) => {
    const { data, error } = await supabase
      .from('productos')
      .update({ ...toDB(cambios), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw new Error(error.message)
    const actualizado = fromDB(data)
    setProductos(prev => prev.map(p => p.id === id ? actualizado : p))
    return actualizado
  }, [])

  const actualizarStock = useCallback(async (id, nuevoStock) => {
    return actualizarProducto(id, { stock: nuevoStock })
  }, [actualizarProducto])

  const actualizarStockMultiple = useCallback(async (cambios) => {
    await Promise.all(cambios.map(c => actualizarStock(c.id, c.stock)))
  }, [actualizarStock])

  // Variante segura para escrituras concurrentes (2 PCs vendiendo/cambiando el
  // mismo producto en simultáneo): suma/resta vía `aplicar_delta_stock_producto`
  // (RPC, atómica en Postgres) en vez de escribir una cantidad absoluta
  // calculada acá con el stock que haya en el estado local en ese momento —
  // ese cálculo puede estar desactualizado y pisar un cambio concurrente,
  // que es como productos.stock terminó desincronizado de stock_depositos en
  // varios productos (ver auditoría de ago/2026). Mismo patrón que
  // aplicarDeltaStockMultiple en useDepositos.js, pero para el total.
  const aplicarDeltaStockProductoMultiple = useCallback(async (cambios) => {
    if (!cambios?.length) return
    const { error } = await supabase.rpc('aplicar_delta_stock_producto', {
      cambios: cambios.map(c => ({ productoId: c.productoId, delta: c.delta })),
    })
    if (error) throw new Error(error.message)
    setProductos(prev => prev.map(p => {
      const c = cambios.find(c => c.productoId === p.id)
      return c ? { ...p, stock: p.stock + c.delta } : p
    }))
  }, [])

  const desactivarProducto = useCallback(async (id) => {
    return actualizarProducto(id, { activo: false })
  }, [actualizarProducto])

  // Borrado definitivo — solo debe invocarse para productos sin movimientos ni
  // stock (la UI ya lo valida). Se limpian primero sus filas de stock por
  // depósito (siempre en 0 si nunca tuvo movimiento) para no chocar con la FK.
  const eliminarProducto = useCallback(async (id) => {
    const { error: stockError } = await supabase.from('stock_depositos').delete().eq('producto_id', id)
    if (stockError) throw new Error(stockError.message)
    const { error } = await supabase.from('productos').delete().eq('id', id)
    if (error) throw new Error(error.message)
    setProductos(prev => prev.filter(p => p.id !== id))
  }, [])

  return {
    productos,
    setProductos,
    loading,
    error,
    isFromCache,
    cargar,
    agregarProducto,
    actualizarProducto,
    actualizarStock,
    actualizarStockMultiple,
    aplicarDeltaStockProductoMultiple,
    desactivarProducto,
    eliminarProducto,
  }
}
