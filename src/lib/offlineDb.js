import { openDB } from 'idb'

const DB_NAME = 'peco_offline'
const DB_VERSION = 1
const CACHE_TIMEOUT_MS = 4000

let dbPromise = null

// Exportada para que outbox.js (Etapa 3) reuse la misma conexión en vez de
// abrir la base de nuevo.
export function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('cache')) {
          db.createObjectStore('cache', { keyPath: 'key' })
        }
        // Cola de operaciones offline (Etapa 3) — creada ya para no tener que
        // subir la versión de la base más adelante.
        if (!db.objectStoreNames.contains('outbox')) {
          const store = db.createObjectStore('outbox', { keyPath: 'opId' })
          store.createIndex('status', 'status')
          store.createIndex('createdAt', 'createdAt')
        }
        // Mapeo id local → id real de Postgres tras sincronizar (Etapa 3).
        if (!db.objectStoreNames.contains('idMap')) {
          db.createObjectStore('idMap', { keyPath: ['entity', 'localId'] })
        }
      },
    })
  }
  return dbPromise
}

export async function setCache(key, data) {
  try {
    const db = await getDb()
    await db.put('cache', { key, data, updatedAt: new Date().toISOString() })
  } catch {
    // IndexedDB no disponible (modo privado, cuota, etc.) — el caché es un
    // best-effort, no debe romper el guardado real en Supabase.
  }
}

export async function getCache(key) {
  try {
    const db = await getDb()
    const row = await db.get('cache', key)
    return row?.data ?? null
  } catch {
    return null
  }
}

// Corre `fetchFn` con un límite de tiempo corto solo para decidir QUÉ MOSTRAR
// PRIMERO — no para descartar la llamada real. Si `fetchFn` no respondió a
// tiempo, se cae al último dato guardado en IndexedDB para esa `key` (si hay)
// y se devuelve de inmediato, pero `fetchFn` sigue corriendo en segundo plano:
// si más tarde termina bien (conexión lenta, no caída), `refresh` es esa
// promesa para que quien llama actualice el estado con el dato fresco sin
// haber tenido que esperarlo. Así una conexión simplemente lenta no termina
// mostrando datos viejos más tiempo del necesario, y una conexión realmente
// caída no deja a nadie esperando para siempre.
//
// Devuelve `{ data, isFromCache, refresh }`. Si no hay caché disponible,
// espera la llamada real igual (no hay nada mejor que mostrar) y relanza el
// error si también falla.
export async function cachedLoad(key, fetchFn, { timeoutMs = CACHE_TIMEOUT_MS } = {}) {
  const fetchPromise = fetchFn().then(data => { setCache(key, data); return data })
  let timeoutId
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('timeout')), timeoutMs)
  })
  try {
    const data = await Promise.race([fetchPromise, timeout])
    clearTimeout(timeoutId)
    return { data, isFromCache: false, refresh: null }
  } catch {
    clearTimeout(timeoutId)
    const cached = await getCache(key)
    if (cached !== null) {
      return { data: cached, isFromCache: true, refresh: fetchPromise.catch(() => null) }
    }
    const data = await fetchPromise // sin caché no hay alternativa — esperar la real (o que falle)
    return { data, isFromCache: false, refresh: null }
  }
}
