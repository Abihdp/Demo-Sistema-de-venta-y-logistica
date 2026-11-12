import { useState, useEffect } from 'react'
import { supabase } from './supabase'

const PROBE_TIMEOUT_MS = 5000
const POLL_INTERVAL_MS = 15000

// navigator.onLine solo dice si hay un link de red activo — da falso positivo
// en un WiFi sin salida real a internet (portal cautivo, router caído, etc.).
// Esto confirma conectividad real pegándole a Supabase.
export async function probeConexion() {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    const { error } = await supabase
      .from('caja_turno')
      .select('id', { head: true })
      .eq('id', 1)
      .abortSignal(controller.signal)
    return !error
  } catch {
    return false
  } finally {
    clearTimeout(timeoutId)
  }
}

// Estado compartido a nivel módulo — un solo probe/poll para toda la app,
// sin importar cuántos componentes usen useConnectivity().
let isOnline = typeof navigator === 'undefined' || navigator.onLine
const listeners = new Set()
let started = false

function notify() {
  listeners.forEach(fn => fn(isOnline))
}

async function chequear() {
  const ok = await probeConexion()
  if (ok !== isOnline) { isOnline = ok; notify() }
  return ok
}

function iniciar() {
  if (started || typeof window === 'undefined') return
  started = true
  window.addEventListener('online', chequear)
  window.addEventListener('offline', () => { isOnline = false; notify() })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') chequear()
  })
  chequear()
  setInterval(chequear, POLL_INTERVAL_MS)
}

// Hook: conexión real (no solo navigator.onLine), actualizada por eventos del
// navegador + un ping periódico a Supabase mientras la pestaña está visible.
export function useConnectivity() {
  const [online, setOnline] = useState(isOnline)
  useEffect(() => {
    iniciar()
    listeners.add(setOnline)
    return () => listeners.delete(setOnline)
  }, [])
  return online
}
