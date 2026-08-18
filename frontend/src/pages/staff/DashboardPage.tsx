import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError, getSession } from '../../lib/api'
import { Spinner, ErrorBox, EmptyState, StatusChip } from '../../components/UI'
import { usePolling } from '../../hooks/useLive'
import { todayISO, prettyDate } from '../../lib/format'
import type { DashboardStats, BookingRow } from '../../types'

export default function DashboardPage() {
  const [s, setS] = useState<DashboardStats | null>(null)
  const [rows, setRows] = useState<BookingRow[]>([])
  const [err, setErr] = useState('')
  const session = getSession()

  const load = useCallback(() => {
    Promise.all([
      api.aGet<DashboardStats>('/api/staff/dashboard'),
      api.aGet<{ bookings: BookingRow[] }>(`/api/staff/bookings?from=${todayISO()}`),
    ])
      .then(([d, b]) => { setS(d); setRows(b.bookings); setErr('') })
      .catch((e: ApiError) => setErr(e.message))
  }, [])

  useEffect(() => { load() }, [load])
  usePolling(load, 30000)

  if (err) return <ErrorBox message={err} onRetry={load} />
  if (!s) return <Spinner />

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 18) return 'Good afternoon'
    return 'Good evening'
  })()

  const upcoming = rows.filter((r) => r.status === 'pending_checkin')

  return (
    <div className="mx-auto max-w-5xl px-5 py-6">
      <header className="mb-8">
        <h1 className="text-2xl font-black text-slate-900">{greeting} 👋</h1>
        <p className="text-slate-500">{prettyDate(s.date)} · {session?.name}</p>
      </header>

      {/* Today at a glance */}
      <section className="mb-8">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-slate-400">Today</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Appointments" value={s.appointments} />
          <Stat label="Waiting" value={s.waiting} accent={s.waiting > 0} />
          <Stat label="Serving" value={s.serving} />
          <Stat label="Completed" value={s.completed} />
        </div>
      </section>

      {/* Quick actions */}
      <section className="mb-10 grid gap-3 sm:grid-cols-3">
        <Link to="/biz/scan" className="card-pick flex items-center gap-3 !p-5">
          <span className="text-3xl" aria-hidden>📷</span>
          <span>
            <span className="block font-bold text-slate-900">Scan Customer</span>
            <span className="block text-sm text-slate-500">Check someone in</span>
          </span>
        </Link>
        <Link to="/biz/queue" className="card-pick flex items-center gap-3 !p-5">
          <span className="text-3xl" aria-hidden>🎟️</span>
          <span>
            <span className="block font-bold text-slate-900">Live Queue</span>
            <span className="block text-sm text-slate-500">
              {s.now_serving ? `Now serving ${s.now_serving}` : 'Call next customer'}
            </span>
          </span>
        </Link>
        <Link to="/biz/bookings" className="card-pick flex items-center gap-3 !p-5">
          <span className="text-3xl" aria-hidden>📅</span>
          <span>
            <span className="block font-bold text-slate-900">Calendar</span>
            <span className="block text-sm text-slate-500">All bookings</span>
          </span>
        </Link>
      </section>

      {/* Performance today */}
      {(s.avg_wait_min > 0 || s.avg_service_min > 0) && (
        <section className="mb-10">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-slate-400">Performance</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Avg wait" value={`${s.avg_wait_min}m`} />
            <Stat label="Avg service" value={`${s.avg_service_min}m`} />
            <Stat label="Walk-ins" value={s.walkins} />
            <Stat label="No shows" value={s.no_show} />
          </div>
        </section>
      )}

      {/* Expected today */}
      <section>
        <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-slate-400">
          Expected today ({upcoming.length})
        </h2>
        {upcoming.length === 0 ? (
          <EmptyState icon="✅" title="Nobody left to check in" message="Every booking for today has arrived or finished." />
        ) : (
          <ul className="space-y-2">
            {upcoming.slice(0, 12).map((r) => (
              <li key={r.id} className="flex items-center gap-4 rounded-2xl bg-white px-5 py-4 shadow-sm">
                <span className="w-16 text-lg font-black tabular-nums text-slate-700">
                  {r.scheduled_time || '—'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-slate-800">{r.customer_name}</span>
                  <span className="block truncate text-sm text-slate-500">{r.service_name}</span>
                </span>
                <StatusChip status={r.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl p-5 ${accent ? 'bg-brand-600 text-white' : 'bg-white shadow-sm'}`}>
      <p className={`text-xs font-bold uppercase tracking-wide ${accent ? 'text-white/70' : 'text-slate-400'}`}>{label}</p>
      <p className={`ticket-num mt-1 text-3xl ${accent ? 'text-white' : 'text-slate-900'}`}>{value}</p>
    </div>
  )
}
