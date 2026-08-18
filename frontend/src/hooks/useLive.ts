import { useEffect, useRef, useState } from 'react'
import { openSocket } from '../lib/api'

type Handler = (type: string, payload: any) => void

/**
 * Live socket with automatic reconnect and backoff. Falls back silently —
 * the caller always keeps its polling safety net so the UI never freezes.
 */
export function useLiveSocket(path: string | null, onEvent: Handler) {
  const [connected, setConnected] = useState(false)
  const handlerRef = useRef(onEvent)
  handlerRef.current = onEvent

  useEffect(() => {
    if (!path) return
    let ws: WebSocket | null = null
    let timer: number | undefined
    let attempt = 0
    let closed = false

    const connect = () => {
      if (closed) return
      try {
        ws = openSocket(path)
      } catch {
        schedule()
        return
      }

      ws.onopen = () => {
        attempt = 0
        setConnected(true)
      }
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          handlerRef.current(msg.type, msg.payload)
        } catch { /* ignore malformed frame */ }
      }
      ws.onclose = () => {
        setConnected(false)
        schedule()
      }
      ws.onerror = () => { try { ws?.close() } catch { /* noop */ } }
    }

    const schedule = () => {
      if (closed) return
      attempt++
      const delay = Math.min(1000 * 2 ** Math.min(attempt, 5), 20000)
      timer = window.setTimeout(connect, delay)
    }

    connect()
    return () => {
      closed = true
      if (timer) clearTimeout(timer)
      try { ws?.close() } catch { /* noop */ }
    }
  }, [path])

  return connected
}

/** Polls a fetcher on an interval, pausing while the tab is hidden to save battery. */
export function usePolling(fn: () => void, ms: number, enabled = true) {
  const ref = useRef(fn)
  ref.current = fn

  useEffect(() => {
    if (!enabled) return
    let timer = window.setInterval(() => {
      if (!document.hidden) ref.current()
    }, ms)
    const onVis = () => { if (!document.hidden) ref.current() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [ms, enabled])
}

/** Browser notification permission + a helper to fire one (§28). */
export function useBrowserNotify() {
  const [granted, setGranted] = useState(
    typeof Notification !== 'undefined' && Notification.permission === 'granted'
  )

  const request = async () => {
    if (typeof Notification === 'undefined') return false
    if (Notification.permission === 'granted') { setGranted(true); return true }
    if (Notification.permission === 'denied') return false
    const p = await Notification.requestPermission()
    const ok = p === 'granted'
    setGranted(ok)
    return ok
  }

  const notify = (title: string, body: string) => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    try {
      new Notification(title, { body, icon: '/favicon.svg', tag: 'qlio-queue', renotify: true } as NotificationOptions)
    } catch { /* some browsers require a service worker */ }
  }

  return { granted, request, notify }
}
