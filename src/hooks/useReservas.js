import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

function reservaFromDB(row, señas = []) {
  return {
    id:              row.id,
    nro:             row.nro,
    fecha:           row.fecha,
    clienteId:       row.cliente_id,
    cliente:         row.cliente,
    lista:           row.lista || '',
    items:           row.items || [],
    total:           Number(row.total) || 0,
    totalSeñas:      Number(row.total_senas) || 0,
    saldoPendiente:  Number(row.saldo_pendiente) || 0,
    estado:          row.estado || 'pendiente',
    depositoId:      row.deposito_id,
    depositoNombre:  row.deposito_nombre,
    usuario:         row.usuario,
    fechaCompletada: row.fecha_completada,
    ventaId:         row.venta_id,
    observacion:     row.observacion,
    periodo:         row.periodo,
    señas:           señas,
    retiros:         row.retiros || [],
  }
}

function señaFromDB(row) {
  return {
    id:          row.id,
    reservaId:   row.reserva_id,
    nro:         row.nro,
    fecha:       row.fecha,
    hora:        row.hora,
    monto:       Number(row.monto) || 0,
    formaPago:   row.forma_pago || 'Efectivo',
    observacion: row.observacion,
    usuario:     row.usuario,
  }
}

export function useReservas() {
  const [reservas, setReservas] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)

    const [resReservas, resSeñas] = await Promise.all([
      supabase.from('reservas').select('*').order('fecha', { ascending: false }).order('id', { ascending: false }),
      supabase.from('reserva_senas').select('*').order('fecha', { ascending: true }).order('id', { ascending: true }),
    ])

    if (resReservas.error) { setError(resReservas.error.message); setLoading(false); return }
    if (resSeñas.error)    { setError(resSeñas.error.message);    setLoading(false); return }

    const señasMap = {}
    ;(resSeñas.data || []).forEach(s => {
      if (!señasMap[s.reserva_id]) señasMap[s.reserva_id] = []
      señasMap[s.reserva_id].push(señaFromDB(s))
    })

    setReservas((resReservas.data || []).map(r => reservaFromDB(r, señasMap[r.id] || [])))
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  // ── Crear reserva nueva (con su primera seña) ──────────────
  const crearReserva = useCallback(async (reserva, primeraSeña) => {
    const { data: resData, error: resErr } = await supabase
      .from('reservas')
      .insert({
        nro:             reserva.nro,
        fecha:           reserva.fecha,
        cliente_id:      reserva.clienteId,
        cliente:         reserva.cliente,
        lista:           reserva.lista,
        items:           reserva.items,
        total:           reserva.total,
        total_senas:     primeraSeña.monto,
        estado:          'pendiente',
        deposito_id:     reserva.depositoId,
        deposito_nombre: reserva.depositoNombre,
        usuario:         reserva.usuario,
        observacion:     reserva.observacion,
        periodo:         reserva.periodo,
      })
      .select()
      .single()
    if (resErr) throw new Error(resErr.message)

    const nroSeña = `SÑA-${String(1).padStart(4, '0')}`
    const { data: señaData, error: señaErr } = await supabase
      .from('reserva_senas')
      .insert({
        reserva_id:  resData.id,
        nro:         nroSeña,
        fecha:       primeraSeña.fecha,
        monto:       primeraSeña.monto,
        forma_pago:  primeraSeña.formaPago,
        observacion: primeraSeña.observacion,
        usuario:     primeraSeña.usuario,
      })
      .select()
      .single()
    if (señaErr) throw new Error(señaErr.message)

    const nueva = reservaFromDB(resData, [señaFromDB(señaData)])
    setReservas(prev => [nueva, ...prev])
    return nueva
  }, [])

  // ── Agregar una seña adicional a una reserva existente ─────
  const agregarSeña = useCallback(async (reservaId, seña) => {
    const actual = await supabase
      .from('reservas')
      .select('total_senas, reserva_senas(id)')
      .eq('id', reservaId)
      .single()
    if (actual.error) throw new Error(actual.error.message)

    const cantSeñas  = (actual.data?.reserva_senas?.length || 0) + 1
    const nroSeña     = `SÑA-${String(cantSeñas).padStart(4, '0')}`
    const totalSeñas  = Number(actual.data?.total_senas || 0) + Number(seña.monto)

    const { data: señaData, error: señaErr } = await supabase
      .from('reserva_senas')
      .insert({
        reserva_id:  reservaId,
        nro:         nroSeña,
        fecha:       seña.fecha,
        monto:       seña.monto,
        forma_pago:  seña.formaPago,
        observacion: seña.observacion,
        usuario:     seña.usuario,
      })
      .select()
      .single()
    if (señaErr) throw new Error(señaErr.message)

    const { error: updErr } = await supabase
      .from('reservas')
      .update({ total_senas: totalSeñas, updated_at: new Date().toISOString() })
      .eq('id', reservaId)
    if (updErr) throw new Error(updErr.message)

    const nueva = señaFromDB(señaData)
    setReservas(prev => prev.map(r => r.id === reservaId
      ? { ...r, totalSeñas, saldoPendiente: r.total - totalSeñas, señas: [...r.señas, nueva] }
      : r
    ))
    return nueva
  }, [])

  // ── Recalcular precios de una reserva pendiente (ej. cambiar a la lista
  // de un medio de pago distinto al de la seña original, o repreciar
  // después de mucho tiempo) — actualiza `items` y `total`; `saldo_pendiente`
  // es una columna generada en la base (total - total_señas), se recalcula
  // solo del lado del servidor. ─────
  const editarPreciosReserva = useCallback(async (reservaId, { lista, items, total }) => {
    const { error } = await supabase
      .from('reservas')
      .update({ lista, items, total, updated_at: new Date().toISOString() })
      .eq('id', reservaId)
    if (error) throw new Error(error.message)

    setReservas(prev => prev.map(r => r.id === reservaId
      ? { ...r, lista, items, total, saldoPendiente: total - r.totalSeñas }
      : r
    ))
  }, [])

  // ── Registrar un retiro (total o parcial) de mercadería ─────
  // Cada retiro genera su propia venta (armada afuera, en TabReservas) y
  // acá solo se anota en `reservas.retiros` — qué items salieron, con qué
  // venta y con qué pagos (señas ya cobradas) se lo asoció. Si con este
  // retiro no queda ningún item pendiente, la reserva pasa a "completada".
  const registrarRetiroReserva = useCallback(async (reservaId, retiro) => {
    const { data: actual, error: fetchErr } = await supabase
      .from('reservas')
      .select('retiros')
      .eq('id', reservaId)
      .single()
    if (fetchErr) throw new Error(fetchErr.message)

    const retirosPrevios = actual.retiros || []
    const nuevoRetiro = {
      nro:            `RET-${String(retirosPrevios.length + 1).padStart(4, '0')}`,
      fecha:          retiro.fecha,
      ventaId:        retiro.ventaId,
      items:          retiro.items,
      pagosAsignados: retiro.pagosAsignados,
      usuario:        retiro.usuario,
    }
    const retiros = [...retirosPrevios, nuevoRetiro]

    const updates = { retiros, updated_at: new Date().toISOString() }
    if (retiro.cierraReserva) {
      updates.estado           = 'completada'
      updates.fecha_completada = retiro.fecha
      updates.venta_id         = retiro.ventaId
    }

    const { error: updErr } = await supabase.from('reservas').update(updates).eq('id', reservaId)
    if (updErr) throw new Error(updErr.message)

    setReservas(prev => prev.map(r => r.id === reservaId
      ? {
          ...r, retiros,
          ...(retiro.cierraReserva
            ? { estado: 'completada', fechaCompletada: retiro.fecha, ventaId: retiro.ventaId }
            : {}),
        }
      : r
    ))
  }, [])

  // ── Cancelar reserva ────────────────────────────────────────
  const cancelarReserva = useCallback(async (reservaId, motivo) => {
    const { error } = await supabase
      .from('reservas')
      .update({ estado: 'cancelada', observacion: motivo, updated_at: new Date().toISOString() })
      .eq('id', reservaId)
    if (error) throw new Error(error.message)

    setReservas(prev => prev.map(r => r.id === reservaId ? { ...r, estado: 'cancelada', observacion: motivo } : r))
  }, [])

  return {
    reservas,
    setReservas,
    loading,
    error,
    cargar,
    crearReserva,
    agregarSeña,
    editarPreciosReserva,
    registrarRetiroReserva,
    cancelarReserva,
  }
}
