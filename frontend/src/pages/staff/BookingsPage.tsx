import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { Spinner, ErrorBox, EmptyState, StatusChip, Alert } from '../../components/UI'
import { todayISO, addDaysISO, prettyDate, money, WEEKDAYS_SHORT } from '../../lib/format'
import type { BookingRow } from '../../types'

type View = 'day' | 'week' | 'month'

/** Appointment calendar (§31) with day / week / month views. */
export default function BookingsPage() {
  const [view, setView] = useState<View>('day')
  const [anchor, setAnchor] = useState(todayISO())
  const [rows, setRows] = useState<BookingRow[]>([])
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  const range = (() => {
    if (view === 'day') return { from: anchor, to: anchor }
    if (view === 'week') {
      const d = new Date(anchor + 'T00:00:00')
      const start = addDaysISO(anchor, -d.getDay())
      return { from: start, to: addDaysISO(start, 6) }
    }
    const d = new Date(anchor + 'T00:00:00')
    const first = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    return { from: first, to: `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${last.getDate()}` }
  })()

  const load = useCallback(() => {
    setLoading(true)
    api.aGet<{ bookings: BookingRow[] }>(`/api/staff/bookings?from=${range.from}&to=${range.to}`)
      .then((d) => { setRows(d.bookings); setErr('') })
      .catch((e: ApiError) => setErr(e.message))
      .finally(() => setLoading(false))
  }, [range.from, range.to])

  useEffect(() => { load() }, [load])

  const shift = (dir: number) => {
    if (view === 'day') setAnchor(addDaysISO(anchor, dir))
    else if (view === 'week') setAnchor(addDaysISO(anchor, dir * 7))
    else {
      const d = new Date(anchor + 'T00:00:00')
      d.setMonth(d.getMonth() + dir)
      setAnchor(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`)
    }
  }

  const action = async (r: BookingRow, kind: 'checkin' | 'cancel') => {
    setMsg('')
    try {
      if (kind === 'checkin') {
        const res = await api.aPost<{ ticket_number: string }>('/api/staff/checkin', { code: r.booking_code, method: 'manual' })
        setMsg(`${r.customer_name} checked in — ticket ${res.ticket_number}.`)
      }
      load()
    } catch (e) { setMsg((e as ApiError).message) }
  }

  const byDate = rows.reduce<Record<string, BookingRow[]>>((acc, r) => {
    ;(acc[r.service_date] ||= []).push(r)
    return acc
  }, {})

  return (
    <div className="mx-auto max-w-5xl px-5 py-6">
      <header className="mb-6">
        <h1 className="mb-4 text-2xl font-black text-slate-900">Bookings</h1>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-2xl bg-slate-100 p-1.5">
            {(['day', 'week', 'month'] as View[]).map((v) => (
              <button key={v} onClick={() => setView(v)}
                className={`rounded-xl px-4 py-2 text-sm font-bold capitalize transition ${
                  view === v ? 'bg-white text-brand-700 shadow' : 'text-slate-500'
                }`}>{v}</button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => shift(-1)} className="rounded-xl border-2 border-slate-200 bg-white px-4 py-2 font-bold text-slate-600">←</button>
            <button onClick={() => setAnchor(todayISO())} className="rounded-xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600">Today</button>
            <button onClick={() => shift(1)} className="rounded-xl border-2 border-slate-200 bg-white px-4 py-2 font-bold text-slate-600">→</button>
          </div>
        </div>

        <p className="mt-4 text-lg font-bold text-slate-600">
          {view === 'day' ? prettyDate(anchor) : `${prettyDate(range.from)} — ${prettyDate(range.to)}`}
          <span className="ml-2 font-medium text-slate-400">({rows.length})</span>
        </p>
      </header>

      {msg && <div className="mb-5"><Alert kind="info">{msg}</Alert></div>}
      {err && <ErrorBox message={err} onRetry={load} />}

      {loading ? <Spinner /> : rows.length === 0 ? (
        <EmptyState icon="📅" title="No bookings" message="Nothing scheduled in this period." />
      ) : (
        <div className="space-y-8">
          {Object.keys(byDate).sort().map((date) => (
            <section key={date}>
              {view !== 'day' && (
                <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-400">
                  {WEEKDAYS_SHORT[new Date(date + 'T00:00:00').getDay()]} · {prettyDate(date)}
                  <span className="font-medium normal-case text-slate-300">({byDate[date].length})</span>
                </h2>
              )}
              <ul className="space-y-2">
                {byDate[date].map((r) => (
                  <li key={r.id} className="rounded-2xl bg-white p-4 shadow-sm sm:flex sm:items-center sm:gap-4">
                    <span className="mb-2 block w-20 text-lg font-black tabular-nums text-slate-700 sm:mb-0">
                      {r.scheduled_time || (r.kind === 'queue' ? '🎟️' : '—')}
                    </span>
                    <span className="mb-3 block min-w-0 flex-1 sm:mb-0">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-bold text-slate-800">{r.customer_name}</span>
                        {r.ticket_number && <span className="ticket-num text-sm text-brand-600">{r.ticket_number}</span>}
                      </span>
                      <span className="block truncate text-sm text-slate-500">
                        {r.service_name}
                        {r.staff_name && ` · ${r.staff_name}`}
                        {r.price_cents > 0 && ` · ${money(r.price_cents)}`}
                      </span>
                      <span className="block text-xs text-slate-400">{r.booking_code} · {r.customer_phone}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <StatusChip status={r.status} />
                      {r.status === 'pending_checkin' && (
                        <button className="btn-primary !min-h-0 !px-4 !py-2 !text-sm" onClick={() => action(r, 'checkin')}>
                          Check in
                        </button>
                      )}
                      <a href={`/r/${r.receipt_token}`} target="_blank" rel="noreferrer"
                        className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" title="View receipt">↗</a>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
