import { useState, useEffect } from 'react'
import { getDb } from './offlineDb'

// Cola de operaciones offline: cada "operación" es una acción de negocio
// completa (una venta, un retiro, etc.), guardada en IndexedDB para
// sobrevivir a un refresh, y reproducida contra Supabase apenas vuelve la
// conexión. `runSync` procesa de a una por vez, en el orden en que se
// crearon — nunca en paralelo, porque una operación puede depender del id
// real que asignó una anterior (ver `idMap` en offlineDb.js).
//
// Cada hook que quiere poder encolar operaciones registra, al montarse, un
// handler por tipo (`registerHandler`) — la función real que hace el insert
// en Supabase y actualiza el estado de React correspondiente. `outbox.js` no
// sabe nada de Ventas/Caja/Recibos en particular, solo orquesta cuándo
// correr cada handler y qué hacer si falla.

const handlers = new Map() // type -> async (payload, op) => void
const listeners = new Set()
let syncing = false

function notify() {
  listeners.forEach(fn => fn())
}

export function registerHandler(type, handlerFn) {
  handlers.set(type, handlerFn)
}

// El intento online "abandonado" por conTimeout (ver más abajo) sigue
// corriendo de fondo, y mientras tanto la cola offline puede arrancar su
// propio reintento para la MISMA operación (mismo clientOpId) — sin este
// candado, ambas ejecuciones concurrentes podrían aplicar dos veces un paso
// que no es idempotente por sí solo (un delta de stock, un insert de items).
// `conMutex` asegura que solo la primera ejecución para un `clientOpId`
// corre de verdad — cualquier otra simplemente espera y reutiliza su
// resultado.
const enCurso = new Map()
export function conMutex(clientOpId, fn) {
  const existente = enCurso.get(clientOpId)
  if (existente) return existente
  const promesa = Promise.resolve().then(fn).finally(() => enCurso.delete(clientOpId))
  enCurso.set(clientOpId, promesa)
  return promesa
}

const WRITE_TIMEOUT_MS = 6000
export async function conTimeout(promiseFactory, ms = WRITE_TIMEOUT_MS) {
  let timeoutId
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const err = new Error('Tiempo de espera agotado (sin conexión)')
      err.name = 'NetworkTimeoutError'
      reject(err)
    }, ms)
  })
  try {
    return await Promise.race([promiseFactory(), timeout])
  } finally {
    clearTimeout(timeoutId)
  }
}

// Heurística: un error de red (sin conexión, fetch abortado) no debe
// marcarse como "falló de verdad" — se reintenta solo, en silencio, cuando
// vuelva la conexión. Cualquier otro error (validación, constraint) sí es
// un fallo real que hay que mostrarle a alguien. Exportada porque los hooks
// mutadores (useVentas, useCaja, useRecibos) la usan para decidir si un
// intento online fallido debe caer al camino offline o simplemente propagar
// el error (p.ej. un error de validación no debería encolarse).
export function esErrorDeRed(err) {
  if (err?.name === 'NetworkTimeoutError') return true
  const msg = (err?.message || '').toLowerCase()
  return msg.includes('fetch') || msg.includes('network') || msg.includes('timeout') || msg.includes('failed to fetch')
}

// `progresoInicial` permite arrancar la cola ya sabiendo qué pasos de la
// operación se alcanzaron a completar en el intento online que falló a
// mitad de camino (ver useVentas.js) — evita repetir un paso no-idempotente
// (como aplicar un delta de stock) que ya se había aplicado antes de que la
// conexión se cortara.
export async function enqueue(type, payload, progresoInicial = {}) {
  const db = await getDb()
  const opId = crypto.randomUUID()
  const op = { opId, type, payload, status: 'pending', createdAt: new Date().toISOString(), error: null, progress: progresoInicial }
  await db.put('outbox', op)
  notify()
  runSync() // no bloqueante — quien encola no necesita esperar la sincronización real
  return opId
}

// Persiste el progreso de una operación a mitad de ejecución — así, si se
// corta la conexión (o se cierra la pestaña) entre un paso y el siguiente,
// el próximo intento retoma desde el último paso confirmado en vez de
// repetir efectos que no son idempotentes (p.ej. un delta de stock).
export async function actualizarProgreso(opId, progreso) {
  const db = await getDb()
  const op = await db.get('outbox', opId)
  if (!op) return
  await db.put('outbox', { ...op, progress: { ...(op.progress || {}), ...progreso } })
}

export async function listaOps() {
  const db = await getDb()
  const all = await db.getAll('outbox')
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function descartarOp(opId) {
  const db = await getDb()
  await db.delete('outbox', opId)
  notify()
}

export async function reintentarOp(opId) {
  const db = await getDb()
  const op = await db.get('outbox', opId)
  if (!op) return
  await db.put('outbox', { ...op, status: 'pending', error: null })
  notify()
  runSync()
}

export async function runSync() {
  if (syncing) return
  syncing = true
  try {
    const db = await getDb()
    const ops = (await db.getAll('outbox'))
      .filter(op => op.status !== 'failed')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    for (const op of ops) {
      const handler = handlers.get(op.type)
      if (!handler) break // el hook dueño de este tipo todavía no se montó — reintentar en la próxima corrida
      try {
        await db.put('outbox', { ...op, status: 'syncing' })
        notify()
        // La conexión puede colgarse (no solo cortarse limpio) también
        // durante la sincronización misma — sin este límite, un handler
        // colgado dejaría `syncing` en true para siempre y trabaría toda la
        // cola detrás de él.
        await conTimeout(() => handler(op.payload, op))
        await db.delete('outbox', op.opId)
        notify()
      } catch (err) {
        const reintentable = esErrorDeRed(err)
        await db.put('outbox', { ...op, status: reintentable ? 'pending' : 'failed', error: err.message })
        notify()
        break // el orden importa — no seguir con lo que viene después de un fallo
      }
    }
  } finally {
    syncing = false
  }
}

// Hook para la insignia de la barra superior: cantidad de operaciones
// pendientes/en curso y si hay alguna que falló de verdad (necesita que
// alguien la mire, no se va a reintentar sola).
export function useOutboxStatus() {
  const [ops, setOps] = useState([])
  useEffect(() => {
    let vivo = true
    const actualizar = () => { listaOps().then(o => { if (vivo) setOps(o) }) }
    actualizar()
    const unsub = (() => { listeners.add(actualizar); return () => listeners.delete(actualizar) })()
    return () => { vivo = false; unsub() }
  }, [])
  return {
    ops,
    pendientes: ops.filter(o => o.status === 'pending' || o.status === 'syncing').length,
    fallidas: ops.filter(o => o.status === 'failed'),
  }
}
