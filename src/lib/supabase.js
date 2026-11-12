// src/lib/supabase.js — VERSIÓN DEMO
//
// Reemplazo del cliente de Supabase que guarda todo en localStorage del
// navegador. Implementa el subconjunto de la API que usa la app:
//   from(tabla).select/insert/update/upsert/delete
//   filtros: eq, neq, gt, gte, lt, lte, like, ilike, in, is
//   order, limit, range, single, maybeSingle, abortSignal
//   select embebido de hijos: '*, venta_items(*)'
//   rpc(...) para numeradores y deltas de stock
//   channel(...).on(...).subscribe() — sincroniza entre pestañas abiertas
//
// Los datos de cada tabla viven en localStorage bajo `pecos_demo:<tabla>`.
// Cada visitante tiene su propia copia: nada sale del navegador.

import { seedDemo, DEMO_VERSION } from './demoSeed'

const PREFIX = 'pecos_demo:'
const META_KEY = `${PREFIX}__meta`

// ── Almacenamiento ──────────────────────────────────────────────────────────
function leer(tabla) {
  try {
    const raw = localStorage.getItem(PREFIX + tabla)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function escribir(tabla, filas) {
  try {
    localStorage.setItem(PREFIX + tabla, JSON.stringify(filas))
  } catch (e) {
    console.error(`[demo] No se pudo guardar "${tabla}" en localStorage:`, e)
    throw new Error('El almacenamiento del navegador está lleno. Usá "Restablecer demo" para liberar espacio.', { cause: e })
  }
}

function leerMeta() {
  try { return JSON.parse(localStorage.getItem(META_KEY)) || {} } catch { return {} }
}
function escribirMeta(meta) {
  try { localStorage.setItem(META_KEY, JSON.stringify(meta)) } catch { /* ignore */ }
}

function clonar(v) {
  return v == null ? v : JSON.parse(JSON.stringify(v))
}

// Borra todas las tablas de la demo y vuelve a cargar los datos de ejemplo.
export function resetDemo() {
  Object.keys(localStorage)
    .filter(k => k.startsWith(PREFIX))
    .forEach(k => localStorage.removeItem(k))
  inicializar()
}

function inicializar() {
  const meta = leerMeta()
  if (meta.version === DEMO_VERSION) return
  Object.keys(localStorage)
    .filter(k => k.startsWith(PREFIX))
    .forEach(k => localStorage.removeItem(k))
  const tablas = seedDemo()
  Object.entries(tablas).forEach(([tabla, filas]) => escribir(tabla, filas))
  escribirMeta({ version: DEMO_VERSION, contadores: {} })
}

if (typeof window !== 'undefined') inicializar()

// ── Realtime entre pestañas ─────────────────────────────────────────────────
// BroadcastChannel no le entrega el mensaje a la pestaña que lo envía, igual
// que Supabase Realtime: cada pestaña ve solo los cambios hechos en las otras.
const canalBC = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('pecos_demo') : null
const canales = new Set()

function emitir(tabla, eventType, nuevo, viejo) {
  canalBC?.postMessage({ tabla, eventType, new: nuevo || {}, old: viejo || {} })
}

canalBC?.addEventListener('message', ({ data }) => {
  canales.forEach(ch => ch._despachar(data))
})

class Canal {
  constructor(nombre) { this.nombre = nombre; this.handlers = [] }
  on(_tipo, filtro, cb) { this.handlers.push({ filtro: filtro || {}, cb }); return this }
  subscribe(cb) { canales.add(this); cb?.('SUBSCRIBED'); return this }
  unsubscribe() { canales.delete(this); return Promise.resolve('ok') }
  _despachar(msg) {
    this.handlers.forEach(({ filtro, cb }) => {
      if (filtro.table && filtro.table !== msg.tabla) return
      if (filtro.event && filtro.event !== '*' && filtro.event !== msg.eventType) return
      try {
        cb({ eventType: msg.eventType, new: msg.new, old: msg.old, table: msg.tabla, schema: 'public' })
      } catch (e) { console.error(e) }
    })
  }
}

// ── Utilidades de comparación ───────────────────────────────────────────────
const RE_FECHA_HORA = /^\d{4}-\d{2}-\d{2}T/

function comparar(a, b) {
  if (a == null && b == null) return 0
  if (a == null) return 1   // NULLS LAST (default de Postgres en ASC)
  if (b == null) return -1
  if (typeof a === 'string' && typeof b === 'string') {
    if (RE_FECHA_HORA.test(a) && RE_FECHA_HORA.test(b)) {
      const da = Date.parse(a), db = Date.parse(b)
      if (!isNaN(da) && !isNaN(db)) return da - db
    }
    const na = Number(a), nb = Number(b)
    if (a.trim() !== '' && b.trim() !== '' && !isNaN(na) && !isNaN(nb)) return na - nb
    return a < b ? -1 : a > b ? 1 : 0
  }
  if (typeof a === 'number' || typeof b === 'number') return Number(a) - Number(b)
  if (typeof a === 'boolean' || typeof b === 'boolean') return Number(a) - Number(b)
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0
}

function iguales(a, b) {
  if (a == null || b == null) return false // en SQL, NULL = x nunca es verdadero
  if (typeof a === 'object' || typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b)
  return String(a) === String(b)
}

function likeARegex(patron, flags) {
  const esc = String(patron).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.')
  return new RegExp(`^${esc}$`, flags)
}

const FILTROS = {
  eq:    (v, x) => iguales(v, x),
  neq:   (v, x) => v != null && x != null && !iguales(v, x),
  gt:    (v, x) => v != null && comparar(v, x) > 0,
  gte:   (v, x) => v != null && comparar(v, x) >= 0,
  lt:    (v, x) => v != null && comparar(v, x) < 0,
  lte:   (v, x) => v != null && comparar(v, x) <= 0,
  like:  (v, x) => v != null && likeARegex(x).test(String(v)),
  ilike: (v, x) => v != null && likeARegex(x, 'i').test(String(v)),
  in:    (v, x) => v != null && (x || []).some(y => iguales(v, y)),
  is:    (v, x) => (x === null ? v == null : v === x),
}

// Separa "a, b, hijos(x, y)" respetando paréntesis.
function partirColumnas(sel) {
  const partes = []
  let prof = 0, actual = ''
  for (const ch of sel) {
    if (ch === '(') prof++
    if (ch === ')') prof--
    if (ch === ',' && prof === 0) { partes.push(actual.trim()); actual = '' }
    else actual += ch
  }
  if (actual.trim()) partes.push(actual.trim())
  return partes
}

// ventas → venta, compras → compra, reservas → reserva (FK: venta_id, etc.)
function singular(tabla) {
  return tabla.replace(/s$/, '')
}

function proyectar(filas, tabla, sel) {
  if (!sel || sel.trim() === '*') return filas
  const cols = partirColumnas(sel)
  return filas.map(fila => {
    let out = {}
    cols.forEach(col => {
      const m = col.match(/^(\w+)\s*\((.*)\)$/)
      if (m) {
        const [, hija, sub] = m
        const fk = `${singular(tabla)}_id`
        const hijos = leer(hija).filter(h => iguales(h[fk], fila.id))
        out[hija] = proyectar(hijos, hija, sub)
      } else if (col === '*') {
        out = { ...fila, ...out }
      } else {
        out[col] = fila[col] ?? null
      }
    })
    return out
  })
}

function siguienteId(filas) {
  let max = 0
  filas.forEach(f => { const n = Number(f.id); if (Number.isFinite(n) && n > max) max = n })
  return max + 1
}

// Restricciones UNIQUE que la app usa para detectar reintentos (código 23505).
const UNICAS = ['client_op_id']

function errorUnico(col) {
  return { message: `duplicate key value violates unique constraint (${col})`, code: '23505' }
}

// ── Query builder ───────────────────────────────────────────────────────────
class Consulta {
  constructor(tabla) {
    this.tabla = tabla
    this.op = null
    this.payload = null
    this.opciones = {}
    this.filtros = []
    this.ordenes = []
    this.rango = null
    this.limite = null
    this.modoUnico = null
    this.seleccion = '*'
    this.devolver = false
    this.head = false
    this.contar = false
  }

  select(cols = '*', opts = {}) {
    if (this.op) this.devolver = true
    else this.op = 'select'
    this.seleccion = cols
    if (opts.head) this.head = true
    if (opts.count) this.contar = true
    return this
  }
  insert(valores, opts = {})  { this.op = 'insert'; this.payload = valores; this.opciones = opts; return this }
  upsert(valores, opts = {})  { this.op = 'upsert'; this.payload = valores; this.opciones = opts; return this }
  update(valores, opts = {})  { this.op = 'update'; this.payload = valores; this.opciones = opts; return this }
  delete(opts = {})           { this.op = 'delete'; this.opciones = opts; return this }

  _filtro(tipo, col, val) { this.filtros.push({ tipo, col, val }); return this }
  eq(c, v)    { return this._filtro('eq', c, v) }
  neq(c, v)   { return this._filtro('neq', c, v) }
  gt(c, v)    { return this._filtro('gt', c, v) }
  gte(c, v)   { return this._filtro('gte', c, v) }
  lt(c, v)    { return this._filtro('lt', c, v) }
  lte(c, v)   { return this._filtro('lte', c, v) }
  like(c, v)  { return this._filtro('like', c, v) }
  ilike(c, v) { return this._filtro('ilike', c, v) }
  in(c, v)    { return this._filtro('in', c, v) }
  is(c, v)    { return this._filtro('is', c, v) }
  match(obj)  { Object.entries(obj).forEach(([c, v]) => this.eq(c, v)); return this }

  order(col, { ascending = true } = {}) { this.ordenes.push({ col, ascending }); return this }
  limit(n)            { this.limite = n; return this }
  range(desde, hasta) { this.rango = [desde, hasta]; return this }
  single()            { this.modoUnico = 'single'; return this }
  maybeSingle()       { this.modoUnico = 'maybe'; return this }
  abortSignal()       { return this }
  throwOnError()      { this._throw = true; return this }

  _cumple(fila) {
    return this.filtros.every(({ tipo, col, val }) => FILTROS[tipo](fila[col], val))
  }

  _ejecutar() {
    const ahora = new Date().toISOString()
    let filas = leer(this.tabla)
    let resultado = []

    if (this.op === 'select' || !this.op) {
      resultado = filas.filter(f => this._cumple(f))
    } else if (this.op === 'insert' || this.op === 'upsert') {
      const lista = Array.isArray(this.payload) ? this.payload : [this.payload]
      const claves = this.op === 'upsert'
        ? (this.opciones.onConflict || 'id').split(',').map(s => s.trim())
        : null
      for (const valor of lista) {
        const nuevo = clonar(valor)
        if (claves) {
          const idx = filas.findIndex(f => claves.every(k => nuevo[k] !== undefined && iguales(f[k], nuevo[k])))
          if (idx >= 0) {
            const viejo = filas[idx]
            filas[idx] = { ...viejo, ...nuevo }
            resultado.push(filas[idx])
            emitir(this.tabla, 'UPDATE', filas[idx], viejo)
            continue
          }
        }
        for (const col of UNICAS) {
          if (nuevo[col] != null && filas.some(f => f[col] === nuevo[col])) {
            return { data: null, error: errorUnico(col) }
          }
        }
        if (nuevo.id == null) nuevo.id = siguienteId(filas)
        if (nuevo.created_at == null) nuevo.created_at = ahora
        filas.push(nuevo)
        resultado.push(nuevo)
        emitir(this.tabla, 'INSERT', nuevo)
      }
      escribir(this.tabla, filas)
    } else if (this.op === 'update') {
      filas = filas.map(f => {
        if (!this._cumple(f)) return f
        const actualizado = { ...f, ...clonar(this.payload) }
        resultado.push(actualizado)
        emitir(this.tabla, 'UPDATE', actualizado, f)
        return actualizado
      })
      escribir(this.tabla, filas)
    } else if (this.op === 'delete') {
      const quedan = []
      filas.forEach(f => {
        if (this._cumple(f)) { resultado.push(f); emitir(this.tabla, 'DELETE', null, f) }
        else quedan.push(f)
      })
      escribir(this.tabla, quedan)
    }

    // Las mutaciones solo devuelven filas si se encadenó .select()
    if (this.op !== 'select' && this.op && !this.devolver) {
      return { data: null, error: null, count: null }
    }

    if (this.ordenes.length) {
      resultado = [...resultado].sort((a, b) => {
        for (const { col, ascending } of this.ordenes) {
          const c = comparar(a[col], b[col])
          if (c !== 0) return ascending ? c : -c
        }
        return 0
      })
    }
    const total = resultado.length
    if (this.rango) resultado = resultado.slice(this.rango[0], this.rango[1] + 1)
    if (this.limite != null) resultado = resultado.slice(0, this.limite)

    let data = clonar(proyectar(resultado, this.tabla, this.seleccion))
    const count = this.contar ? total : null
    if (this.head) return { data: null, error: null, count }

    if (this.modoUnico) {
      if (data.length > 1) return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } }
      if (data.length === 0) {
        return this.modoUnico === 'maybe'
          ? { data: null, error: null, count }
          : { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } }
      }
      data = data[0]
    }
    return { data, error: null, count }
  }

  then(resolve, reject) {
    let res
    try {
      res = this._ejecutar()
    } catch (e) {
      res = { data: null, error: { message: e.message } }
    }
    if (this._throw && res.error) return Promise.reject(new Error(res.error.message)).then(resolve, reject)
    // Pequeña demora asíncrona para imitar la red (y no romper efectos que
    // asumen que la respuesta llega después del render).
    return new Promise(r => setTimeout(() => r(res), 0)).then(resolve, reject)
  }
  catch(reject)   { return this.then(undefined, reject) }
  finally(fn)     { return this.then(v => { fn?.(); return v }, e => { fn?.(); throw e }) }
}

// ── RPC (funciones de Postgres) ─────────────────────────────────────────────
function siguienteContador(clave) {
  const meta = leerMeta()
  meta.contadores = meta.contadores || {}
  meta.contadores[clave] = (meta.contadores[clave] || 0) + 1
  escribirMeta(meta)
  return meta.contadores[clave]
}

const pad = n => String(n).padStart(4, '0')

const RPCS = {
  siguiente_numero_cierre() {
    return `C-${pad(siguienteContador('cierre'))}`
  },
  siguiente_nro_cambio({ p_diferencia } = {}) {
    const pref = p_diferencia < 0 ? 'NC' : p_diferencia > 0 ? 'ND' : 'CB'
    return `${pref}-${pad(siguienteContador('cambio'))}`
  },
  siguiente_numero_recibo({ p_tipo } = {}) {
    const pref = p_tipo === 'Recibo' || !p_tipo ? 'RC' : 'ND'
    return `${pref}-${pad(siguienteContador(`recibo_${p_tipo || 'Recibo'}`))}`
  },
  aplicar_delta_stock({ cambios = [] } = {}) {
    const filas = leer('stock_depositos')
    const ahora = new Date().toISOString()
    cambios.forEach(({ productoId, depositoId, delta }) => {
      const f = filas.find(s => iguales(s.producto_id, productoId) && iguales(s.deposito_id, depositoId))
      if (f) { f.cantidad = (Number(f.cantidad) || 0) + Number(delta); f.updated_at = ahora }
      else filas.push({ id: siguienteId(filas), producto_id: productoId, deposito_id: depositoId, cantidad: Number(delta), updated_at: ahora, created_at: ahora })
    })
    escribir('stock_depositos', filas)
    return null
  },
  aplicar_delta_stock_producto({ cambios = [] } = {}) {
    const filas = leer('productos')
    cambios.forEach(({ productoId, delta }) => {
      const p = filas.find(x => iguales(x.id, productoId))
      if (p) p.stock = (Number(p.stock) || 0) + Number(delta)
    })
    escribir('productos', filas)
    return null
  },
}

// ── Cliente público ─────────────────────────────────────────────────────────
export const supabase = {
  from: tabla => new Consulta(tabla),
  rpc(nombre, args) {
    const fn = RPCS[nombre]
    let res
    if (!fn) res = { data: null, error: { message: `Función "${nombre}" no disponible en la demo` } }
    else {
      try { res = { data: fn(args), error: null } }
      catch (e) { res = { data: null, error: { message: e.message } } }
    }
    return Promise.resolve(res)
  },
  channel: nombre => new Canal(nombre),
  removeChannel: ch => { canales.delete(ch); return Promise.resolve('ok') },
  removeAllChannels: () => { canales.clear(); return Promise.resolve([]) },
}

// Igual que la versión real: pagina con .range() hasta traer todas las filas.
const FETCH_ALL_PAGE_SIZE = 1000

export async function fetchAll(buildQuery) {
  let rows = []
  let from = 0
  while (true) {
    const { data, error } = await buildQuery().range(from, from + FETCH_ALL_PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    rows = rows.concat(data || [])
    if (!data || data.length < FETCH_ALL_PAGE_SIZE) break
    from += FETCH_ALL_PAGE_SIZE
  }
  return rows
}
