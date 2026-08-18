import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { Spinner, ErrorBox } from '../../components/UI'
import { useLiveSocket, usePolling } from '../../hooks/useLive'
import type { QueueSnapshot } from '../../types'

interface DisplayResponse {
  business_name: string
  counter_label: string
  queue: QueueSnapshot
}

/**
 * Waiting-room TV screen. Read from across the room: giant type, dark theme,
 * no interaction. Auto-reconnects and never needs a person to touch it.
 */
export default function DisplayScreen() {
  const { slug = '' } = useParams()
  const [d, setD] = useState<DisplayResponse | null>(null)
  const [err, setErr] = useState('')
  const [flash, setFlash] = useState('')

  const load = useCallback(() => {
    api.get<DisplayResponse>(`/api/public/b/${slug}/display`)
      .then((r) => { setD(r); setErr('') })
      .catch((e: ApiError) => setErr(e.message))
  }, [slug])

  useEffect(() => { load() }, [load])

  const connected = useLiveSocket(`/api/public/b/${slug}/display/ws`, (type, payload) => {
    load()
    if (type === 'queue.changed' && payload?.event === 'called' && payload?.ticket) {
      setFlash(payload.ticket)
      // chime on call — many waiting rooms rely on sound
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.frequency.value = 880
        gain.gain.setValueAtTime(0.25, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8)
        osc.start(); osc.stop(ctx.currentTime + 0.8)
      } catch { /* autoplay blocked until first interaction */ }
      setTimeout(() => setFlash(''), 6000)
    }
  })

  usePolling(load, connected ? 20000 : 8000)

  if (err) return <ErrorBox title="Display unavailable" message={err} onRetry={load} />
  if (!d) return <Spinner />

  const serving = d.queue.now_serving
  const next = d.queue.waiting.slice(0, 5)

  return (
    <div className="min-h-screen bg-slate-900 px-8 py-8 text-white">
      <header className="mb-10 flex items-center justify-between border-b border-white/10 pb-6">
        <h1 className="text-3xl font-black tracking-tight">{d.business_name}</h1>
        <div className="flex items-center gap-6 text-white/50">
          <span className="text-2xl font-bold tabular-nums">
            {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <span className={`h-3 w-3 rounded-full ${connected ? 'animate-pulse bg-emerald-400' : 'bg-slate-600'}`} />
        </div>
      </header>

      {flash && (
        <div className="mb-8 animate-ring-flash rounded-3xl bg-brand-600 py-8 text-center">
          <p className="text-3xl font-bold uppercase tracking-widest">Now calling</p>
          <p className="ticket-num text-9xl">{flash}</p>
        </div>
      )}

      <p className="mb-6 text-center text-2xl font-bold uppercase tracking-[0.3em] text-white/40">Now Serving</p>

      {serving.length === 0 ? (
        <p className="py-20 text-center text-5xl font-bold text-white/25">Please wait</p>
      ) : (
        <div className={`grid gap-6 ${serving.length > 2 ? 'sm:grid-cols-3' : serving.length === 2 ? 'sm:grid-cols-2' : ''}`}>
          {serving.map((t) => (
            <div key={t.id} className="rounded-3xl bg-white/5 py-10 text-center ring-1 ring-white/10">
              <p className="ticket-num text-8xl text-white">{t.ticket_number}</p>
              {t.counter_name && (
                <p className="mt-4 text-3xl font-bold text-brand-300">{t.counter_name}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {next.length > 0 && (
        <section className="mt-16">
          <p className="mb-5 text-center text-xl font-bold uppercase tracking-[0.3em] text-white/40">Next</p>
          <div className="flex flex-wrap justify-center gap-4">
            {next.map((t) => (
              <span key={t.id} className="ticket-num rounded-2xl bg-white/5 px-8 py-4 text-4xl text-white/60 ring-1 ring-white/10">
                {t.ticket_number}
              </span>
            ))}
          </div>
        </section>
      )}

      <footer className="mt-16 flex justify-center gap-12 border-t border-white/10 pt-8 text-center">
        <Stat label="Waiting" value={String(d.queue.waiting_count)} />
        <Stat label="Completed today" value={String(d.queue.completed)} />
        <Stat label={d.counter_label + 's open'} value={String(d.queue.active_desks)} />
      </footer>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="ticket-num text-4xl text-white/80">{value}</p>
      <p className="mt-1 text-sm font-bold uppercase tracking-wide text-white/35">{label}</p>
    </div>
  )
}
