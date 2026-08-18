import type { Session } from '../types'

const TOKEN_KEY = 'qlio_session'

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

export function setSession(s: Session) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(s))
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  code: string
  status: number
  constructor(status: number, code: string, message: string) {
    super(message)
    this.code = code
    this.status = status
  }
}

async function request<T>(path: string, init: RequestInit = {}, auth = false): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (init.headers) Object.assign(headers, init.headers as Record<string, string>)
  if (auth) {
    const s = getSession()
    if (s?.token) headers.Authorization = `Bearer ${s.token}`
  }

  const res = await fetch(path, { ...init, headers })

  if (res.status === 401 && auth) {
    clearSession()
    if (!location.pathname.startsWith('/biz/login')) location.href = '/biz/login'
    throw new ApiError(401, 'unauthorized', 'Your session expired. Please sign in again.')
  }

  let body: any = null
  const text = await res.text()
  if (text) {
    try { body = JSON.parse(text) } catch { body = { message: text } }
  }

  if (!res.ok) {
    throw new ApiError(
      res.status,
      body?.error || 'error',
      body?.message || 'Something went wrong. Please try again.'
    )
  }
  return body as T
}

export const api = {
  get:  <T>(p: string) => request<T>(p, { method: 'GET' }),
  post: <T>(p: string, b?: unknown) => request<T>(p, { method: 'POST', body: JSON.stringify(b ?? {}) }),

  // authenticated
  aGet:  <T>(p: string) => request<T>(p, { method: 'GET' }, true),
  aPost: <T>(p: string, b?: unknown) => request<T>(p, { method: 'POST', body: JSON.stringify(b ?? {}) }, true),
  aPut:  <T>(p: string, b?: unknown) => request<T>(p, { method: 'PUT', body: JSON.stringify(b ?? {}) }, true),
  aDel:  <T>(p: string) => request<T>(p, { method: 'DELETE' }, true),
}

/** Open a WebSocket against the current origin, upgrading scheme for https. */
export function openSocket(path: string): WebSocket {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return new WebSocket(`${proto}//${location.host}${path}`)
}
