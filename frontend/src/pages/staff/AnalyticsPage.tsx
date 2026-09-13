import { useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { Spinner, ErrorBox, EmptyState } from '../../components/UI'
import { shortDate } from '../../lib/format'
import type { AnalyticsResponse } from '../../types'

/** Simple analytics (§33) — operational insight, not a BI product. */
export default function AnalyticsPage() {
  const [days, setDays] = useState(7)
  const [d, setD] = useState<AnalyticsResponse | null>(null)
  const [err, setErr] = useState('')

  const load = () => {
    setD(null)
    api.aGet<AnalyticsResponse>(`/api/staff/analytics?days=${days}`)
      .then((r) => { setD(r); setErr('') })
      .catch((e: ApiError) => setErr(e.message))
  }
  useEffect(load, [days])

  if (err) return <ErrorBox message={err} onRetry={load} />
  if (!d) return <Spinner />

  const maxDaily = Math.max(1, ...d.daily.map((x) => x.total))
  const maxHour = Math.max(1, ...d.peak_hours.map((x) => x.count))
  const maxSvc = Math.max(1, ...d.top_services.map((x) => x.count))

  return (
    <div className="mx-auto max-w-3xl px-5 py-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-black text-slate-900">Analytics</h1>
        <div className="flex gap-1 rounded-2xl bg-slate-100 p-1.5">
          {[7, 30].map((n) => (
            <button key={n} onClick={() => setDays(n)}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                days === n ? 'bg-white text-brand-700 shadow' : 'text-slate-500'
              }`}>{n} days</button>
          ))}
        </div>
      </header>

      {d.total === 0 ? (
        <EmptyState icon="📊" title="No data yet" message="Once customers start booking, their patterns show up here." />
      ) : (
        <div className="space-y-10">
          {/* Headline numbers */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Customers" value={d.total} />
            <Stat label="Completed" value={d.completed} />
            <Stat label="No shows" value={d.no_show} />
            <Stat label="No-show rate" value={`${d.no_show_rate.toFixed(0)}%`}
              warn={d.no_show_rate > 15} />
          </div>

          <p className="rounded-2xl bg-slate-100 p-4 text-center text-base font-medium text-slate-600">
            Average service time <strong>{d.avg_service_min} minutes</strong> — used to estimate customer wait times.
          </p>

          {/* Daily volume */}
          <section>
            <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-slate-400">Daily volume</h2>
            <div className="flex items-end gap-1.5" style={{ height: 160 }}>
              {d.daily.map((x) => (
                <div key={x.date} className="flex flex-1 flex-col items-center justify-end gap-1">
                  <span className="text-xs font-bold text-slate-500">{x.total}</span>
                  <div className="w-full overflow-hidden rounded-t-lg bg-slate-100"
                    style={{ height: `${(x.total / maxDaily) * 110}px`, minHeight: 4 }}>
                    <div className="w-full bg-brand-500"
                      style={{ height: `${x.total ? (x.completed / x.total) * 100 : 0}%` }} />
                  </div>
                  <span className="text- font-semibold text-slate-400">{shortDate(x.date)}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-center text-xs text-slate-400">
              Solid = completed · light = booked but not completed
            </p>
          </section>

          {/* Peak hours */}
          {d.peak_hours.length > 0 && (
            <section>
              <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-slate-400">Busiest hours</h2>
              <div className="space-y-1.5">
                {d.peak_hours.map((h) => (
                  <div key={h.hour} className="flex items-center gap-3">
                    <span className="w-14 text-sm font-bold tabular-nums text-slate-500">
                      {String(h.hour).padStart(2, '0')}:00
                    </span>
                    <div className="h-7 flex-1 overflow-hidden rounded-lg bg-slate-100">
                      <div className="flex h-full items-center justify-end rounded-lg bg-brand-500 pr-2 text-xs font-bold text-white"
                        style={{ width: `${Math.max((h.count / maxHour) * 100, 8)}%` }}>
                        {h.count}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Top services */}
          {d.top_services.length > 0 && (
            <section>
              <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-slate-400">Most requested</h2>
              <div className="space-y-1.5">
                {d.top_services.map((s) => (
                  <div key={s.service} className="flex items-center gap-3">
                    <span className="w-32 truncate text-sm font-semibold text-slate-600">{s.service}</span>
                    <div className="h-7 flex-1 overflow-hidden rounded-lg bg-slate-100">
                      <div className="flex h-full items-center justify-end rounded-lg bg-emerald-500 pr-2 text-xs font-bold text-white"
                        style={{ width: `${Math.max((s.count / maxSvc) * 100, 8)}%` }}>
                        {s.count}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, warn }: { label: string; value: number | string; warn?: boolean }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`ticket-num mt-1 text-3xl ${warn ? 'text-amber-600' : 'text-slate-900'}`}>{value}</p>
    </div>
  )
}
