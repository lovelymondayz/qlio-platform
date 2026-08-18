import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import QRCode from 'qrcode'
import { api, ApiError, getSession, setSession } from '../../lib/api'
import { Alert, Spinner, Steps } from '../../components/UI'
import { BUSINESS_CATEGORIES, WEEKDAYS } from '../../lib/format'

/**
 * The 5-step setup wizard (§22). A business owner gets a working Qlio page
 * without ever seeing a complicated admin screen first.
 */
export default function SetupWizard() {
  const nav = useNavigate()
  const session = getSession()
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const [category, setCategory] = useState('other')
  const [services, setServices] = useState([{ name: '', duration_min: 30, price: '' }])
  const [days, setDays] = useState(
    Array.from({ length: 7 }, (_, i) => ({
      weekday: i, is_open: i >= 1 && i <= 5, open_time: '09:00', close_time: '17:00',
    }))
  )
  const [useQueue, setUseQueue] = useState(true)
  const [counterCount, setCounterCount] = useState(1)
  const [slug, setSlug] = useState(session?.business_slug ?? '')
  const [qr, setQr] = useState('')

  useEffect(() => {
    if (!session) nav('/biz/login', { replace: true })
  }, [])

  useEffect(() => {
    if (step === 4 && slug) {
      QRCode.toDataURL(`${location.origin}/${slug}`, { width: 460, margin: 1, errorCorrectionLevel: 'H' })
        .then(setQr).catch(() => {})
    }
  }, [step, slug])

  const labels = ['Business type', 'Your services', 'Opening hours', 'Queue', 'Ready']

  const saveCategory = async () => {
    setBusy(true); setErr('')
    try {
      await api.aPut('/api/staff/business', { category, setup_step: 2 })
      setStep(1)
    } catch (e) { setErr((e as ApiError).message) } finally { setBusy(false) }
  }

  const saveServices = async () => {
    const valid = services.filter((s) => s.name.trim())
    if (valid.length === 0) { setErr('Please add at least one service.'); return }
    setBusy(true); setErr('')
    try {
      for (const s of valid) {
        await api.aPost('/api/staff/services', {
          name: s.name.trim(),
          duration_min: s.duration_min || 30,
          price_cents: Math.round(Number(s.price || 0)),
          allow_appointment: true,
          allow_queue: true,
          ticket_prefix: s.name.trim()[0].toUpperCase(),
        })
      }
      await api.aPut('/api/staff/business', { setup_step: 3 })
      setStep(2)
    } catch (e) { setErr((e as ApiError).message) } finally { setBusy(false) }
  }

  const saveHours = async () => {
    setBusy(true); setErr('')
    try {
      await api.aPut('/api/staff/schedule', { days })
      await api.aPut('/api/staff/business', { setup_step: 4 })
      setStep(3)
    } catch (e) { setErr((e as ApiError).message) } finally { setBusy(false) }
  }

  const saveQueue = async () => {
    setBusy(true); setErr('')
    try {
      await api.aPut('/api/staff/business', { allow_queue: useQueue, allow_walkin: useQueue, setup_step: 5 })
      if (useQueue && counterCount > 1) {
        const existing = await api.aGet<{ counters: { id: number }[] }>('/api/staff/counters')
        for (let i = existing.counters.length; i < counterCount; i++) {
          await api.aPost('/api/staff/counters', { name: `Counter ${i + 1}`, kind: 'counter', sort_order: i + 1 })
        }
      }
      const me = await api.aGet<{ business_slug: string }>('/api/staff/me')
      setSlug(me.business_slug)
      if (session) setSession({ ...session, setup_step: 5 })
      setStep(4)
    } catch (e) { setErr((e as ApiError).message) } finally { setBusy(false) }
  }

  if (!session) return <Spinner />

  const publicUrl = `${location.origin}/${slug}`

  return (
    <div className="mx-auto min-h-screen max-w-xl px-5 py-10">
      <p className="mb-6 text-center text-2xl font-black text-brand-600">Qlio</p>
      <Steps current={step} total={5} labels={labels} />

      {err && <div className="mb-5"><Alert kind="error">{err}</Alert></div>}

      {/* STEP 1 — CATEGORY */}
      {step === 0 && (
        <section>
          <h1 className="mb-1 text-2xl font-black text-slate-900">What kind of business are you?</h1>
          <p className="mb-6 text-slate-500">This helps us set sensible defaults.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {BUSINESS_CATEGORIES.map((c) => (
              <button key={c.id} onClick={() => setCategory(c.id)}
                className={`rounded-2xl border-2 p-4 text-center transition ${
                  category === c.id ? 'border-brand-600 bg-brand-50' : 'border-slate-200 bg-white'
                }`}>
                <span className="mb-1 block text-3xl" aria-hidden>{c.icon}</span>
                <span className="block text-sm font-bold text-slate-700">{c.label}</span>
              </button>
            ))}
          </div>
          <button className="btn-primary mt-8 w-full" disabled={busy} onClick={saveCategory}>Continue</button>
        </section>
      )}

      {/* STEP 2 — SERVICES */}
      {step === 1 && (
        <section>
          <h1 className="mb-1 text-2xl font-black text-slate-900">What services do you offer?</h1>
          <p className="mb-6 text-slate-500">You can add more later.</p>

          <div className="space-y-4">
            {services.map((s, i) => (
              <div key={i} className="card !p-5">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-bold uppercase tracking-wide text-slate-400">Service {i + 1}</span>
                  {services.length > 1 && (
                    <button className="text-sm font-semibold text-rose-500"
                      onClick={() => setServices(services.filter((_, j) => j !== i))}>Remove</button>
                  )}
                </div>
                <input className="field mb-3" placeholder="Service name (e.g. Oil Change)"
                  value={s.name}
                  onChange={(e) => setServices(services.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-semibold text-slate-500">Minutes</label>
                    <input type="number" inputMode="numeric" className="field !py-3" value={s.duration_min}
                      onChange={(e) => setServices(services.map((x, j) => j === i ? { ...x, duration_min: Number(e.target.value) } : x))} />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold text-slate-500">Price (optional)</label>
                    <input type="number" inputMode="numeric" className="field !py-3" placeholder="150000" value={s.price}
                      onChange={(e) => setServices(services.map((x, j) => j === i ? { ...x, price: e.target.value } : x))} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button className="btn-secondary mt-4 w-full !text-base"
            onClick={() => setServices([...services, { name: '', duration_min: 30, price: '' }])}>
            + Add another service
          </button>
          <button className="btn-primary mt-6 w-full" disabled={busy} onClick={saveServices}>
            {busy ? 'Saving…' : 'Continue'}
          </button>
        </section>
      )}

      {/* STEP 3 — HOURS */}
      {step === 2 && (
        <section>
          <h1 className="mb-1 text-2xl font-black text-slate-900">When are you open?</h1>
          <p className="mb-6 text-slate-500">Tap a day to open or close it.</p>

          <div className="space-y-2">
            {days.map((d, i) => (
              <div key={d.weekday} className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm">
                <button
                  onClick={() => setDays(days.map((x, j) => j === i ? { ...x, is_open: !x.is_open } : x))}
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-bold transition ${
                    d.is_open ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'
                  }`}
                  aria-label={`${WEEKDAYS[d.weekday]} ${d.is_open ? 'open' : 'closed'}`}
                >{d.is_open ? '✓' : '—'}</button>
                <span className="w-24 font-bold text-slate-700">{WEEKDAYS[d.weekday].slice(0, 3)}</span>
                {d.is_open ? (
                  <div className="flex flex-1 items-center gap-2">
                    <input type="time" className="field !py-2.5 !text-base" value={d.open_time}
                      onChange={(e) => setDays(days.map((x, j) => j === i ? { ...x, open_time: e.target.value } : x))} />
                    <span className="text-slate-400">—</span>
                    <input type="time" className="field !py-2.5 !text-base" value={d.close_time}
                      onChange={(e) => setDays(days.map((x, j) => j === i ? { ...x, close_time: e.target.value } : x))} />
                  </div>
                ) : (
                  <span className="flex-1 text-slate-400">Closed</span>
                )}
              </div>
            ))}
          </div>

          <button className="btn-primary mt-6 w-full" disabled={busy} onClick={saveHours}>
            {busy ? 'Saving…' : 'Continue'}
          </button>
        </section>
      )}

      {/* STEP 4 — QUEUE */}
      {step === 3 && (
        <section>
          <h1 className="mb-1 text-2xl font-black text-slate-900">Do you use a queue?</h1>
          <p className="mb-6 text-slate-500">Queues let walk-in customers take a number.</p>

          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setUseQueue(true)}
              className={`rounded-2xl border-2 p-6 text-center ${useQueue ? 'border-brand-600 bg-brand-50' : 'border-slate-200 bg-white'}`}>
              <span className="mb-1 block text-3xl" aria-hidden>🎟️</span>
              <span className="font-bold text-slate-800">Yes</span>
            </button>
            <button onClick={() => setUseQueue(false)}
              className={`rounded-2xl border-2 p-6 text-center ${!useQueue ? 'border-brand-600 bg-brand-50' : 'border-slate-200 bg-white'}`}>
              <span className="mb-1 block text-3xl" aria-hidden>📅</span>
              <span className="font-bold text-slate-800">Appointments only</span>
            </button>
          </div>

          {useQueue && (
            <div className="mt-8">
              <p className="label">How many counters serve customers?</p>
              <div className="flex gap-2">
                {[1, 2, 3, 4].map((n) => (
                  <button key={n} onClick={() => setCounterCount(n)}
                    className={`flex-1 rounded-2xl border-2 py-4 text-xl font-black transition ${
                      counterCount === n ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-700'
                    }`}>{n === 4 ? '4+' : n}</button>
                ))}
              </div>
            </div>
          )}

          <button className="btn-primary mt-8 w-full" disabled={busy} onClick={saveQueue}>
            {busy ? 'Finishing…' : 'Finish setup'}
          </button>
        </section>
      )}

      {/* STEP 5 — READY */}
      {step === 4 && (
        <section className="text-center">
          <p className="text-5xl" aria-hidden>🎉</p>
          <h1 className="mt-3 text-3xl font-black text-slate-900">Your Qlio is ready</h1>
          <p className="mt-2 text-lg text-slate-500">Share this link or print the QR code.</p>

          <div className="mt-8 rounded-3xl bg-white p-6 shadow-lg">
            <p className="break-all text-lg font-bold text-brand-600">{publicUrl}</p>
            {qr && <img src={qr} alt="Your business QR code" className="mx-auto mt-6 w-56 rounded-2xl" />}
            <p className="mt-4 text-base font-bold text-slate-700">Scan to Book</p>
          </div>

          <div className="mt-8 space-y-3">
            <a href={publicUrl} target="_blank" rel="noreferrer" className="btn-secondary w-full">
              Preview my page ↗
            </a>
            <button className="btn-primary w-full" onClick={() => nav('/biz', { replace: true })}>
              Go to my dashboard
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
