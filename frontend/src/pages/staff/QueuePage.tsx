import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, getSession } from '../../lib/api'
import { Spinner, ErrorBox, Alert, LiveDot, EmptyState, Modal } from '../../components/UI'
import { useLiveSocket, usePolling } from '../../hooks/useLive'
import type { QueueSnapshot, Counter, Ticket } from '../../types'

/**
 * Live queue board for reception (§18). Large type, large controls,
 * minimal distractions. Every action is one tap.
 */
export default function QueuePage() {
  const [q, setQ] = useState<QueueSnapshot | null>(null)
  const [counters, setCounters] = useState<Counter[]>([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [activeCounter, setActiveCounter] = useState<number | null>(null)
  const [transfer, setTransfer] = useState<Ticket | null>(null)

  const session = getSession()

  const load = useCallback(() => {
    api.aGet<QueueSnapshot>('/api/staff/queue')
      .then((d) => { setQ(d); setErr('') })
      .catch((e: ApiError) => setErr(e.message))
  }, [])

  useEffect(() => {
    load()
    api.aGet<{ counters: Counter[] }>('/api/staff/counters')
      .then((d) => {
        const active = d.counters.filter((c) => c.is_active)
        setCounters(active)
        // remember the desk this device is working
        const saved = localStorage.getItem('qlio_counter')
        if (saved && active.some((c) => String(c.id) === saved)) setActiveCounter(Number(saved))
        else if (active.length === 1) setActiveCounter(active[0].id)
      })
      .catch(() => { /* receptionists may lack config access */ })
  }, [load])

  const connected = useLiveSocket(
    session?.token ? `/api/staff/queue/ws?token=${encodeURIComponent(session.token)}` : null,
    () => load()
  )
  usePolling(load, connected ? 25000 : 8000)

  const pickCounter = (id: number | null) => {
    setActiveCounter(id)
    if (id) localStorage.setItem('qlio_counter', String(id))
    else localStorage.removeItem('qlio_counter')
  }

  const act = async (fn: () => Promise<unknown>, okMsg?: string) => {
    setBusy(true); setMsg('')
    try {
      await fn()
      if (okMsg) setMsg(okMsg)
      load()
    } catch (e) { setMsg((e as ApiError).message) } finally { setBusy(false) }
  }

  const callNext = () => act(
    () => api.aPost('/api/staff/queue/call-next', { counter_id: activeCounter }),
    undefined
  )
  const ticketAction = (t: Ticket, action: string) => act(
    () => api.aPost(`/api/staff/queue/${t.id}/${action}`)
  )
  const doTransfer = (counterId: number) => {
    if (!transfer) return
    const t = transfer
    setTransfer(null)
    act(() => api.aPost(`/api/staff/queue/${t.id}/transfer`, { counter_id: counterId }), 'Ticket moved.')
  }

  if (err) return <ErrorBox message={err} onRetry={load} />
  if (!q) return <Spinner />

  return (
    <div className="mx-auto max-w-5xl px-5 py-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Live Queue</h1>
          <p className="text-slate-500">
            {q.waiting_count} waiting · {q.completed} completed today
          </p>
        </div>
        <LiveDot on={connected} />
      </header>

      {/* Which desk is this device working? */}
      {counters.length > 1 && (
        <div className="mb-6">
          <p className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">Serving from</p>
          <div className="flex flex-wrap gap-2">
            {counters.map((c) => (
              <button key={c.id} onClick={() => pickCounter(c.id)}
                className={`rounded-xl border-2 px-4 py-2.5 text-base font-bold transition ${
                  activeCounter === c.id ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-600'
                }`}>{c.name}</button>
            ))}
            {activeCounter && (
              <button onClick={() => pickCounter(null)} className="px-3 text-sm font-semibold text-slate-400 hover:underline">clear</button>
            )}
          </div>
        </div>
      )}

      {msg && <div className="mb-5"><Alert kind="info">{msg}</Alert></div>}

      {/* CALL NEXT — the primary action */}
      <button className="btn-primary btn-lg mb-8 w-full" disabled={busy || q.waiting_count === 0} onClick={callNext}>
        {q.waiting_count === 0 ? 'No one waiting' : '📣 Call Next'}
      </button>

      {/* NOW SERVING */}
      <section className="mb-10">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-slate-400">Now Serving</h2>
        {q.now_serving.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-slate-200 py-12 text-center text-lg font-semibold text-slate-400">
            Nobody is being served
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {q.now_serving.map((t) => (
              <div key={t.id} className="card border-2 border-brand-200 bg-brand-50">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="ticket-num text-5xl text-brand-900">{t.ticket_number}</p>
                    <p className="mt-1 font-bold text-slate-800">{t.customer_name}</p>
                    <p className="text-sm text-slate-500">{t.service_name}</p>
                  </div>
                  <div className="text-right">
                    {t.counter_name && <p className="font-bold text-brand-700">{t.counter_name}</p>}
                    <p className="mt-1 text-xs font-bold uppercase text-slate-400">
                      {t.state === 'serving' ? 'Serving' : 'Called'}
                    </p>
                    {t.recall_count > 0 && <p className="text-xs text-amber-600">recalled ×{t.recall_count}</p>}
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-2">
                  {t.state === 'called' && (
                    <button className="btn-secondary !py-3 !text-base" disabled={busy}
                      onClick={() => ticketAction(t, 'serving')}>Start</button>
                  )}
                  <button className="btn-primary !py-3 !text-base" disabled={busy}
                    onClick={() => ticketAction(t, 'complete')}>✓ Complete</button>
                  <button className="btn-secondary !py-3 !text-base" disabled={busy}
                    onClick={() => ticketAction(t, 'recall')}>🔔 Recall</button>
                  <button className="btn-secondary !py-3 !text-base" disabled={busy}
                    onClick={() => ticketAction(t, 'skip')}>No show</button>
                  {counters.length > 1 && (
                    <button className="btn-ghost !py-3 !text-base" disabled={busy}
                      onClick={() => setTransfer(t)}>Move</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* WAITING */}
      <section>
        <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-slate-400">
          Waiting ({q.waiting_count})
        </h2>
        {q.waiting.length === 0 ? (
          <EmptyState icon="🎉" title="Queue is empty" message="Everyone has been served." />
        ) : (
          <ul className="space-y-2">
            {q.waiting.map((t, i) => (
              <li key={t.id} className="flex items-center gap-4 rounded-2xl bg-white px-5 py-4 shadow-sm">
                <span className="w-8 text-center text-sm font-bold text-slate-300">{i + 1}</span>
                <span className="ticket-num w-24 text-2xl text-slate-900">{t.ticket_number}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-slate-800">{t.customer_name}</span>
                  <span className="block truncate text-sm text-slate-500">
                    {t.service_name}
                    {t.kind === 'appointment' && t.scheduled_time && ` · booked ${t.scheduled_time}`}
                  </span>
                </span>
                {t.state === 'almost' && <span className="chip-call">next</span>}
                <button className="btn-ghost !min-h-0 !px-3 !py-2 !text-sm" disabled={busy}
                  onClick={() => ticketAction(t, 'cancel')}>Cancel</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal open={!!transfer} onClose={() => setTransfer(null)} title={`Move ${transfer?.ticket_number ?? ''}`}>
        <div className="space-y-2">
          {counters.map((c) => (
            <button key={c.id} className="card-pick !p-4" onClick={() => doTransfer(c.id)}>
              <span className="text-lg font-bold">{c.name}</span>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  )
}
