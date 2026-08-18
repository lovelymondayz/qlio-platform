import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { categoryIcon, money, waitText } from '../../lib/format'
import { Spinner, ErrorBox } from '../../components/UI'
import type { PublicBusinessResponse } from '../../types'

/**
 * The business entry page — qlio.arjism.com/tokobudi
 * One question, three big answers. No account, no menu, no jargon.
 */
export default function BusinessEntry() {
  const { slug = '' } = useParams()
  const nav = useNavigate()
  const [data, setData] = useState<PublicBusinessResponse | null>(null)
  const [err, setErr] = useState('')

  const load = () => {
    setErr('')
    api.get<PublicBusinessResponse>(`/api/public/b/${slug}`)
      .then(setData)
      .catch((e: ApiError) => setErr(e.message))
  }

  useEffect(load, [slug])

  if (err) return <ErrorBox title="Page not found" message={err} onRetry={load} />
  if (!data) return <Spinner label="Loading…" />

  const { business: b, services, now_serving, waiting, est_wait } = data
  const hasQueue = b.allow_queue && services.some((s) => s.allow_queue)
  const hasAppt = b.allow_appointments && services.some((s) => s.allow_appointment)

  return (
    <div className="mx-auto min-h-screen max-w-xl px-5 pb-16 pt-10">
      {/* Business identity */}
      <header className="mb-10 text-center">
        {b.logo_url ? (
          <img src={b.logo_url} alt="" className="mx-auto mb-4 h-20 w-20 rounded-2xl object-cover shadow-md" />
        ) : (
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-brand-100 text-4xl" aria-hidden>
            {categoryIcon(b.category)}
          </div>
        )}
        <h1 className="text-3xl font-black leading-tight text-slate-900 sm:text-4xl">{b.name}</h1>
        {b.tagline && <p className="mt-2 text-lg text-slate-500">{b.tagline}</p>}
      </header>

      {/* Live queue status — only when it's meaningful */}
      {hasQueue && (now_serving || waiting > 0) && (
        <div className="mb-8 rounded-3xl border-2 border-brand-100 bg-brand-50 p-5">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="mb-1 text-sm font-bold uppercase tracking-wide text-brand-700">Now serving</p>
              <p className="ticket-num text-4xl text-brand-900">{now_serving || '—'}</p>
            </div>
            <div>
              <p className="mb-1 text-sm font-bold uppercase tracking-wide text-brand-700">Waiting</p>
              <p className="ticket-num text-4xl text-brand-900">{waiting}</p>
            </div>
          </div>
          {waiting > 0 && (
            <p className="mt-3 text-center text-base font-medium text-brand-700">
              Estimated wait {waitText(est_wait)} <span className="text-brand-400">(estimate)</span>
            </p>
          )}
        </div>
      )}

      <h2 className="mb-5 text-center text-xl font-bold text-slate-700">What would you like to do?</h2>

      <div className="space-y-4">
        {hasAppt && (
          <button onClick={() => nav(`/${slug}/book?mode=appointment`)} className="card-pick flex items-center gap-4">
            <span className="text-4xl" aria-hidden>📅</span>
            <span className="flex-1">
              <span className="block text-xl font-bold text-slate-900">Book an Appointment</span>
              <span className="block text-base text-slate-500">Choose a service and time.</span>
            </span>
            <span className="text-2xl text-slate-300" aria-hidden>›</span>
          </button>
        )}

        {hasQueue && (
          <button onClick={() => nav(`/${slug}/book?mode=queue`)} className="card-pick flex items-center gap-4">
            <span className="text-4xl" aria-hidden>🎟️</span>
            <span className="flex-1">
              <span className="block text-xl font-bold text-slate-900">Join the Queue</span>
              <span className="block text-base text-slate-500">Get a queue number for today.</span>
            </span>
            <span className="text-2xl text-slate-300" aria-hidden>›</span>
          </button>
        )}

        <button onClick={() => nav(`/${slug}/find`)} className="card-pick flex items-center gap-4">
          <span className="text-4xl" aria-hidden>🔎</span>
          <span className="flex-1">
            <span className="block text-xl font-bold text-slate-900">Check My Booking</span>
            <span className="block text-base text-slate-500">Find an existing booking using your receipt.</span>
          </span>
          <span className="text-2xl text-slate-300" aria-hidden>›</span>
        </button>
      </div>

      {!hasAppt && !hasQueue && (
        <div className="mt-8 rounded-2xl bg-amber-50 p-5 text-center text-amber-900">
          <p className="font-semibold">This business is not accepting bookings online right now.</p>
          {b.phone && <p className="mt-2">Please call {b.phone}.</p>}
        </div>
      )}

      {/* Services preview — shows the customer what's on offer before committing */}
      {services.length > 0 && (
        <section className="mt-12">
          <h3 className="mb-4 text-base font-bold uppercase tracking-wide text-slate-400">Services</h3>
          <ul className="space-y-2">
            {services.slice(0, 6).map((s) => (
              <li key={s.id} className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm">
                <span className="flex items-center gap-3">
                  {s.icon && <span aria-hidden>{s.icon}</span>}
                  <span className="font-semibold text-slate-800">{s.name}</span>
                </span>
                <span className="text-sm font-medium text-slate-500">
                  {s.price_cents > 0 ? money(s.price_cents, b.currency) : `${s.duration_min} min`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Location */}
      {(b.address || b.phone) && (
        <footer className="mt-12 border-t border-slate-200 pt-6 text-center text-slate-500">
          {b.address && <p className="mb-2 whitespace-pre-line">{b.address}</p>}
          {b.phone && <a href={`tel:${b.phone}`} className="font-semibold text-brand-600">{b.phone}</a>}
          {b.map_url && (
            <p className="mt-3">
              <a href={b.map_url} target="_blank" rel="noreferrer" className="btn-secondary !py-3 !text-base">
                📍 Get Directions
              </a>
            </p>
          )}
        </footer>
      )}

      <p className="mt-10 text-center text-sm text-slate-400">
        Powered by <Link to="/" className="font-semibold text-slate-500 hover:text-brand-600">Qlio</Link>
      </p>
    </div>
  )
}
