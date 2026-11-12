import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { cachedLoad } from '../lib/offlineDb'
import { enqueue, registerHandler, esErrorDeRed, conTimeout } from '../lib/outbox'

const CAJA_ID = 1 // caja_turno es una tabla de una sola fila: el estado global del turno

const CAJA_DEFAULT = {
  abierta: false, aprobada: false, inicio: 0,
  retiros: [], refuerzos: [], ultimoCierre: null, cierresParciales: [],
}

// OJO: toISOString() da la fecha en UTC, no en horario local — en Argentina
// (UTC-3) cualquier retiro/refuerzo hecho entre las 21:00 y las 23:59 locales
// ya cae en el día SIGUIENTE en UTC, así que quedaba mal fechado (bug real
// encontrado en producción: retiros ya cerrados el día anterior reaparecían
// al otro día porque su `fecha` había quedado un día adelantada). Mismo
// patrón que el `today()` ya usado en el resto de la app (utils/helpers.js).
function hoy() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// "HH:MM:SS" a mano — horaActual() sin argumentos depende
// del idioma de Windows: en una PC en español devuelve "6:37:00 p. m.", y ese
// "p. m." rompe el insert en la columna `hora` (time) con el error de Postgres
// "time zone "p.m." not recognized".
function horaActual() {
  const d = new Date()
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${h}:${m}:${s}`
}

function retiroFromDB(row) {
  if (!row) return null
  return {
    id:             row.id,
    monto:          Number(row.monto) || 0,
    motivo:         row.motivo,
    medio:          row.medio || 'Efectivo',
    cuentaContable: row.cuenta_contable,
    cuentaId:       row.cuenta_id ?? row.cuenta_contable ?? null,
    cuentaNombre:   row.cuenta_nombre ?? null,
    gastoId:        row.gasto_id ?? null,
    hora:           row.hora,
    fecha:          row.fecha,
    usuario:        row.usuario,
    sessionTs:      row.session_ts,
    createdAt:      row.created_at,
  }
}

function refuerzoFromDB(row) {
  if (!row) return null
  return {
    id:        row.id,
    monto:     Number(row.monto) || 0,
    motivo:    row.motivo,
    origen:    row.origen,
    hora:      row.hora,
    fecha:     row.fecha,
    usuario:   row.usuario,
    sessionTs: row.session_ts,
    createdAt: row.created_at,
  }
}

// Reemplazo directo de useLocalStorage("peco_caja", ...): misma forma del
// objeto `caja`, mismo `setCaja` (acepta valor u función updater), pero
// persistido en Supabase y sincronizado en tiempo real entre PCs.
//
// `retiros`/`refuerzos` viven en tablas propias (caja_retiros/caja_refuerzos),
// no en el blob `estado` — cada uno es un insert de fila independiente, así
// que dos PCs agregando un retiro casi al mismo tiempo nunca se pisan entre
// sí (a diferencia del resto de `estado`, que sigue siendo un blob único).
//
// `onCambioRemoto(estadoNuevo, estadoAnterior)` es opcional y se llama solo
// cuando el cambio vino de OTRA pestaña/PC (no cuando lo hicimos nosotros),
// para poder mostrar un aviso ("la caja fue abierta por X", etc.) desde el
// componente que tenga acceso al sistema de Toast.
//
// `onConflicto()` es opcional y se llama cuando `setCaja` intenta escribir
// pero otra PC ya había modificado la caja primero (candado optimista) — el
// cambio local NO se aplicó y conviene avisarle al usuario para que reintente.
export function useCaja({ onCambioRemoto, onConflicto } = {}) {
  const [caja, setCajaState]         = useState(CAJA_DEFAULT)
  const [retiros, setRetiros]        = useState([])
  const [refuerzos, setRefuerzos]    = useState([])
  const [loading, setLoading]        = useState(true)
  const [error, setError]            = useState(null)
  const [isFromCache, setIsFromCache] = useState(false)
  const ultimoWriteLocalRef  = useRef(null)
  const ultimoUpdatedAtRef   = useRef(null) // candado optimista: valor de updated_at que leímos por última vez

  // Última caja conocida, accesible desde el listener de Realtime (que se
  // suscribe una sola vez) sin quedar con un closure viejo.
  const cajaRef = useRef(caja)
  useEffect(() => { cajaRef.current = caja }, [caja])

  const aplicar = useCallback((d) => {
    setCajaState({ ...CAJA_DEFAULT, ...(d.estado || {}) })
    ultimoUpdatedAtRef.current = d.updatedAt
    setRetiros(d.retiros)
    setRefuerzos(d.refuerzos)
  }, [])

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, isFromCache: fromCache, refresh } = await cachedLoad('caja', async () => {
        const cajaRes = await supabase.from('caja_turno').select('*').eq('id', CAJA_ID).single()
        if (cajaRes.error) throw new Error(cajaRes.error.message)
        // Traer retiros/refuerzos desde la apertura de la caja, no solo del día
        // de hoy: si la caja quedó abierta de un día para el otro sin cerrarse,
        // los movimientos de esos días intermedios tienen que seguir viéndose
        // (y sumándose en el próximo cierre) en vez de desaparecer.
        const desde = cajaRes.data.estado?.aperturaTs || `${hoy()}T00:00:00`
        const [retirosRes, refuerzosRes] = await Promise.all([
          supabase.from('caja_retiros').select('*').gte('created_at', desde).order('id'),
          supabase.from('caja_refuerzos').select('*').gte('created_at', desde).order('id'),
        ])
        return {
          estado: cajaRes.data.estado,
          updatedAt: cajaRes.data.updated_at,
          retiros: (retirosRes.data || []).map(retiroFromDB),
          refuerzos: (refuerzosRes.data || []).map(refuerzoFromDB),
        }
      })
      aplicar(data)
      setIsFromCache(fromCache)
      if (refresh) refresh.then(fresh => { if (fresh) { aplicar(fresh); setIsFromCache(false) } })
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }, [aplicar])

  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    const channel = supabase
      .channel('caja_turno_changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'caja_turno', filter: `id=eq.${CAJA_ID}` },
        (payload) => {
          const nuevo = { ...CAJA_DEFAULT, ...(payload.new.estado || {}) }
          const esPropio = payload.new.updated_at === ultimoWriteLocalRef.current
          const anterior = cajaRef.current
          ultimoUpdatedAtRef.current = payload.new.updated_at
          // Actualizar el estado y avisar del cambio remoto como dos pasos
          // separados (no dentro del updater de setCajaState): React prohíbe
          // disparar el setState de OTRO componente (el Toast) desde dentro
          // del cálculo de un updater — rompía el commit del render en Caja.
          setCajaState(nuevo)
          if (!esPropio) onCambioRemoto?.(nuevo, anterior)
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [onCambioRemoto])

  // Retiros/refuerzos agregados desde OTRA PC aparecen acá al instante (o
  // borrados, para el caso de eliminarRetiro) — cada evento es una fila
  // propia, no hay blob que fusionar.
  useEffect(() => {
    const channel = supabase
      .channel('caja_retiros_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'caja_retiros' }, (payload) => {
        const apertura = cajaRef.current.aperturaTs
        if (apertura && payload.new.created_at < apertura) return
        setRetiros(prev => prev.some(r => r.id === payload.new.id) ? prev : [...prev, retiroFromDB(payload.new)])
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'caja_retiros' }, (payload) => {
        setRetiros(prev => prev.filter(r => r.id !== payload.old.id))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel('caja_refuerzos_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'caja_refuerzos' }, (payload) => {
        const apertura = cajaRef.current.aperturaTs
        if (apertura && payload.new.created_at < apertura) return
        setRefuerzos(prev => prev.some(r => r.id === payload.new.id) ? prev : [...prev, refuerzoFromDB(payload.new)])
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  // Misma firma que useState/useLocalStorage: setCaja(objeto) o setCaja(prev => nuevo).
  // Candado optimista: solo escribe si `updated_at` sigue siendo el mismo que
  // leímos por última vez — si otra PC ya escribió mientras tanto, la
  // actualización no toca ninguna fila y avisamos por `onConflicto` en vez
  // de pisar silenciosamente el cambio ajeno.
  const setCaja = useCallback((valorONuevoEstado) => {
    setCajaState(prev => {
      const nuevo = typeof valorONuevoEstado === 'function' ? valorONuevoEstado(prev) : valorONuevoEstado
      const ts = new Date().toISOString()
      const prevUpdatedAt = ultimoUpdatedAtRef.current
      ultimoWriteLocalRef.current = ts
      ultimoUpdatedAtRef.current = ts
      let query = supabase.from('caja_turno').update({ estado: nuevo, updated_at: ts }).eq('id', CAJA_ID)
      if (prevUpdatedAt) query = query.eq('updated_at', prevUpdatedAt)
      query.select('id').then(({ data, error }) => {
        if (error) { console.error('Error al guardar caja en Supabase:', error.message); return }
        if (!data || data.length === 0) {
          // 0 filas afectadas = otra PC ya había escrito antes que nosotros.
          // Nuestro cambio local NO se guardó — recargar el estado real y avisar.
          cargar()
          onConflicto?.()
        }
      })
      return nuevo
    })
  }, [cargar, onConflicto])

  // ── Retiros: fila propia en caja_retiros (no en el blob `estado`) ────────
  // Si falla por red, guarda un registro optimista con id temporal y encola
  // el insert real para cuando vuelva la conexión — `client_op_id` evita que
  // un reintento lo duplique.
  const agregarRetiro = useCallback(async ({ monto, motivo, cuentaContable, cuentaId, cuentaNombre, gastoId, medio, usuario }) => {
    const clientOpId = crypto.randomUUID()
    const fila = {
      monto, motivo, medio: medio || 'Efectivo',
      cuenta_contable: cuentaContable ?? cuentaId ?? null,
      cuenta_id: cuentaId ?? cuentaContable ?? null,
      cuenta_nombre: cuentaNombre ?? null,
      gasto_id: gastoId ?? null,
      hora: horaActual(), fecha: hoy(),
      usuario: usuario || null, session_ts: caja.aperturaTs || null,
      client_op_id: clientOpId,
    }
    try {
      const { data, error } = await conTimeout(() => supabase.from('caja_retiros').insert(fila).select().single())
      if (error) throw new Error(error.message)
      const nuevo = retiroFromDB(data)
      setRetiros(prev => [...prev, nuevo])
      return nuevo
    } catch (err) {
      if (!esErrorDeRed(err)) throw err
      const tempId = `local-${clientOpId}`
      const optimista = retiroFromDB({ id: tempId, created_at: new Date().toISOString(), ...fila })
      setRetiros(prev => [...prev, optimista])
      await enqueue('agregarRetiro', { fila, tempId })
      return optimista
    }
  }, [caja.aperturaTs])

  const eliminarRetiro = useCallback(async (id) => {
    // Un retiro todavía no sincronizado no tiene fila real que borrar en
    // Supabase — alcanza con sacarlo del estado local (su outbox op también
    // se podría descartar, pero no está guardado con esa referencia acá).
    if (String(id).startsWith('local-')) {
      setRetiros(prev => prev.filter(r => r.id !== id))
      return
    }
    const { error } = await supabase.from('caja_retiros').delete().eq('id', id)
    if (error) throw new Error(error.message)
    setRetiros(prev => prev.filter(r => r.id !== id))
  }, [])

  useEffect(() => {
    registerHandler('agregarRetiro', async (payload) => {
      let real
      const { data, error } = await supabase.from('caja_retiros').insert(payload.fila).select().single()
      if (error) {
        if (error.code === '23505') {
          const { data: existente, error: e2 } = await supabase
            .from('caja_retiros').select('*').eq('client_op_id', payload.fila.client_op_id).single()
          if (e2) throw new Error(e2.message)
          real = existente
        } else {
          throw new Error(error.message)
        }
      } else {
        real = data
      }
      const nuevo = retiroFromDB(real)
      setRetiros(prev => prev.map(r => r.id === payload.tempId ? nuevo : r))
    })
  }, [])

  // ── Refuerzos: fila propia en caja_refuerzos ──────────────────────────────
  const agregarRefuerzo = useCallback(async ({ monto, motivo, origen, usuario }) => {
    const clientOpId = crypto.randomUUID()
    const fila = {
      monto, motivo, origen,
      hora: horaActual(), fecha: hoy(),
      usuario: usuario || null, session_ts: caja.aperturaTs || null,
      client_op_id: clientOpId,
    }
    try {
      const { data, error } = await conTimeout(() => supabase.from('caja_refuerzos').insert(fila).select().single())
      if (error) throw new Error(error.message)
      const nuevo = refuerzoFromDB(data)
      setRefuerzos(prev => [...prev, nuevo])
      return nuevo
    } catch (err) {
      if (!esErrorDeRed(err)) throw err
      const tempId = `local-${clientOpId}`
      const optimista = refuerzoFromDB({ id: tempId, created_at: new Date().toISOString(), ...fila })
      setRefuerzos(prev => [...prev, optimista])
      await enqueue('agregarRefuerzo', { fila, tempId })
      return optimista
    }
  }, [caja.aperturaTs])

  useEffect(() => {
    registerHandler('agregarRefuerzo', async (payload) => {
      let real
      const { data, error } = await supabase.from('caja_refuerzos').insert(payload.fila).select().single()
      if (error) {
        if (error.code === '23505') {
          const { data: existente, error: e2 } = await supabase
            .from('caja_refuerzos').select('*').eq('client_op_id', payload.fila.client_op_id).single()
          if (e2) throw new Error(e2.message)
          real = existente
        } else {
          throw new Error(error.message)
        }
      } else {
        real = data
      }
      const nuevo = refuerzoFromDB(real)
      setRefuerzos(prev => prev.map(r => r.id === payload.tempId ? nuevo : r))
    })
  }, [])

  // `retiros`/`refuerzos` en memoria solo tienen los del día de hoy (ver
  // `cargar` más arriba) — para reportes por rango de fechas hace falta traer
  // directamente de la tabla, sin tocar ese estado.
  const cargarRetirosRango = useCallback(async (desde, hasta) => {
    const { data, error } = await supabase.from('caja_retiros').select('*')
      .gte('fecha', desde).lte('fecha', hasta).order('fecha').order('id')
    if (error) throw new Error(error.message)
    return (data || []).map(retiroFromDB)
  }, [])

  return {
    caja, setCaja,
    retiros, setRetiros, agregarRetiro, eliminarRetiro,
    refuerzos, setRefuerzos, agregarRefuerzo,
    loading, error, isFromCache, cargar, cargarRetirosRango,
  }
}
