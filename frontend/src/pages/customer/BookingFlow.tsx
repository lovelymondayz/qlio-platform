import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { money, duration, prettyDate, todayISO, addDaysISO, shortDate, waitText, WEEKDAYS_SHORT } from '../../lib/format'
import { Spinner, ErrorBox, Alert, Steps, BackButton } from '../../components/UI'
import type { PublicBusinessResponse, Service, SlotsResponse } from '../../types'

type Mode = 'appointment' | 'queue'

/**
 * The booking wizard: Service → When → Details → Confirm.
 * One obvious primary action per screen (§34).
 */
export default function BookingFlow() {
  const { slug = '' } = useParams()
  const [sp] = useSearchParams()
  const nav = useNavigate()

  const [data, setData] = useState<PublicBusinessResponse | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [step, setStep] = useState(0)

  const [mode, setMode] = useState<Mode>((sp.get('mode') as Mode) || 'appointment')
  const [service, setService] = useState<Service | null>(null)
  const [date, setDate] = useState(todayISO())
  const [time, setTime] = useState('')
  const [slots, setSlots] = useState<SlotsResponse | null>(null)
  const [slotsLoading, setSlotsLoading] = useState(false)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [fieldErr, setFieldErr] = useState<Record<string, boolean>>({})

  const [submitting, setSubmitting] = useState(false)
  const [submitErr, setSubmitErr] = useState('')

  const load = () => {
    setLoadErr('')
    api.get<PublicBusinessResponse>(`/api/public/b/${slug}`)
      .then(setData)
      .catch((e: ApiError) => setLoadErr(e.message))
  }
  useEffect(load, [slug])

  // Fetch slots whenever the service or date changes on an appointment booking
  useEffect(() => {
    if (mode !== 'appointment' || !service) return
    setSlotsLoading(true)
    setTime('')
    api.get<SlotsResponse>(`/api/public/b/${slug}/slots?service_id=${service.id}&date=${date}`)
      .then(setSlots)
      .catch(() => setSlots(null))
      .finally(() => setSlotsLoading(false))
  }, [slug, service, date, mode])

  if (loadErr) return <ErrorBox title="Page not found" message={loadErr} onRetry={load} />
  if (!data) return <Spinner />

  const b = data.business
  const available = data.services.filter((s) =>
    mode === 'queue' ? s.allow_queue : s.allow_appointment
  )
  const bothModes = b.allow_appointments && b.allow_queue
  const labels = mode === 'queue'
    ? ['Choose service', 'Your details', 'Confirm']
    : ['Choose service', 'Pick a time', 'Your details', 'Confirm']
  const totalSteps = labels.length

  const goBack = () => {
    if (step === 0) nav(`/${slug}`)
    else setStep(step - 1)
  }

  const validateDetails = () => {
    const errs: Record<string, boolean> = {}
    if (name.trim().length < 2) errs.name = true
    if (phone.replace(/\D/g, '').length < 8) errs.phone = true
    setFieldErr(errs)
    return Object.keys(errs).length === 0
  }

  const submit = async () => {
    setSubmitting(true)
    setSubmitErr('')
    try {
      const res = await api.post<{ receipt_token: string }>(`/api/public/b/${slug}/book`, {
        service_id: service!.id,
        kind: mode,
        date: mode === 'queue' ? todayISO() : date,
        time: mode === 'queue' ? '' : time,
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        notes: notes.trim(),
        origin: 'online',
      })
      nav(`/r/${res.receipt_token}?new=1`, { replace: true })
    } catch (e) {
      const err = e as ApiError
      setSubmitErr(err.message)
      // a taken slot means the customer must pick again
      if (err.code === 'slot_taken') {
        setStep(1)
        setTime('')
        api.get<SlotsResponse>(`/api/public/b/${slug}/slots?service_id=${service!.id}&date=${date}`)
          .then(setSlots).catch(() => {})
      }
    } finally {
      setSubmitting(false)
    }
  }

  // date strip for the next 14 days
  const dates = Array.from({ length: 14 }, (_, i) => addDaysISO(todayISO(), i))

  return (
    <div className="mx-auto min-h-screen max-w-xl px-5 pb-24 pt-8">
      <BackButton onClick={goBack} />
      <Steps current={step} total={totalSteps} labels={labels} />

      {submitErr && step === totalSteps - 1 && (
        <div className="mb-5"><Alert kind="error">{submitErr}</Alert></div>
      )}

      {/* ---------- STEP 0: SERVICE ---------- */}
      {step === 0 && (
        <section>
          <h1 className="mb-1 text-2xl font-black text-slate-900">Choose a service</h1>
          <p className="mb-6 text-slate-500">Tap the one you need.</p>

          {bothModes && (
            <div className="mb-6 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1.5">
              <button
                onClick={() => { setMode('appointment'); setService(null) }}
                className={`rounded-xl py-3 text-base font-bold transition ${mode === 'appointment' ? 'bg-white text-brand-700 shadow' : 'text-slate-500'}`}
              >📅 Appointment</button>
              <button
                onClick={() => { setMode('queue'); setService(null) }}
                className={`rounded-xl py-3 text-base font-bold transition ${mode === 'queue' ? 'bg-white text-brand-700 shadow' : 'text-slate-500'}`}
              >🎟️ Queue</button>
            </div>
          )}

          {mode === 'queue' && (
            <div className="mb-6 rounded-2xl bg-brand-50 p-4 text-center">
              <p className="text-sm font-bold uppercase tracking-wide text-brand-700">Currently serving</p>
              <p className="ticket-num my-1 text-4xl text-brand-900">{data.now_serving || '—'}</p>
              <p className="text-base text-brand-700">
                {data.waiting} {data.waiting === 1 ? 'person' : 'people'} waiting · {waitText(data.est_wait)}
              </p>
            </div>
          )}

          {available.length === 0 ? (
            <Alert kind="warn">No services are available for this option right now.</Alert>
          ) : (
            <div className="space-y-3">
              {available.map((s) => (
                <button
                  key={s.id}
                  onClick={() => { setService(s); setStep(1) }}
                  className={`card-pick ${service?.id === s.id ? 'card-pick-active' : ''}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="flex items-center gap-2 text-xl font-bold text-slate-900">
                        {s.icon && <span aria-hidden>{s.icon}</span>}{s.name}
                      </p>
                      {s.description && <p className="mt-1 text-base text-slate-500">{s.description}</p>}
                      <p className="mt-2 text-sm font-semibold text-slate-400">{duration(s.duration_min)}</p>
                    </div>
                    <div className="text-right">
                      {s.price_cents > 0 && (
                        <p className="text-lg font-black text-slate-900">{money(s.price_cents, b.currency)}</p>
                      )}
                      <span className="mt-2 inline-block text-sm font-bold text-brand-600">Select →</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ---------- STEP 1 (appointment only): TIME ---------- */}
      {step === 1 && mode === 'appointment' && (
        <section>
          <h1 className="mb-1 text-2xl font-black text-slate-900">Pick a time</h1>
          <p className="mb-6 text-slate-500">{service?.name} · {duration(service?.duration_min ?? 30)}</p>

          <div className="mb-6 -mx-5 overflow-x-auto px-5">
            <div className="flex gap-2 pb-2">
              {dates.map((d) => {
                const dd = new Date(d + 'T00:00:00')
                const on = d === date
                return (
                  <button
                    key={d}
                    onClick={() => setDate(d)}
                    className={`flex min-w-[72px] flex-col items-center rounded-2xl border-2 px-3 py-3 transition ${
                      on ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    <span className="text-xs font-bold uppercase opacity-70">{WEEKDAYS_SHORT[dd.getDay()]}</span>
                    <span className="text-lg font-black">{dd.getDate()}</span>
                    <span className="text-xs opacity-70">{shortDate(d).split(' ')[1]}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {slotsLoading ? (
            <Spinner label="Checking availability…" />
          ) : !slots?.is_open ? (
            <Alert kind="warn">Closed on {prettyDate(date)}. Please choose another day.</Alert>
          ) : slots.slots.filter((s) => s.available).length === 0 ? (
            <Alert kind="warn">No times left on {prettyDate(date)}. Please choose another day.</Alert>
          ) : (
            <>
              <p className="mb-3 font-bold text-slate-700">{prettyDate(date)}</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {slots.slots.map((s) => (
                  <button
                    key={s.time}
                    disabled={!s.available}
                    onClick={() => setTime(s.time)}
                    className={`rounded-2xl border-2 py-4 text-lg font-bold transition ${
                      time === s.time
                        ? 'border-brand-600 bg-brand-600 text-white'
                        : s.available
                        ? 'border-slate-200 bg-white text-slate-800 hover:border-brand-400'
                        : 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300 line-through'
                    }`}
                  >{s.time}</button>
                ))}
              </div>
            </>
          )}

          <div className="mt-8">
            <button className="btn-primary w-full" disabled={!time} onClick={() => setStep(2)}>
              Continue
            </button>
          </div>
        </section>
      )}

      {/* ---------- DETAILS ---------- */}
      {((mode === 'appointment' && step === 2) || (mode === 'queue' && step === 1)) && (
        <section>
          <h1 className="mb-1 text-2xl font-black text-slate-900">Your details</h1>
          <p className="mb-6 text-slate-500">Just two things — no account needed.</p>

          <div className="space-y-5">
            <div>
              <label className="label" htmlFor="f-name">Full name</label>
              <input
                id="f-name" className={`field ${fieldErr.name ? 'field-error' : ''}`}
                value={name} onChange={(e) => { setName(e.target.value); setFieldErr({ ...fieldErr, name: false }) }}
                placeholder="e.g. Arji Surya" autoComplete="name" enterKeyHint="next"
              />
              {fieldErr.name && <p className="mt-1.5 text-sm font-semibold text-rose-600">Please enter your name.</p>}
            </div>

            <div>
              <label className="label" htmlFor="f-phone">Phone number</label>
              <input
                id="f-phone" type="tel" className={`field ${fieldErr.phone ? 'field-error' : ''}`}
                value={phone} onChange={(e) => { setPhone(e.target.value); setFieldErr({ ...fieldErr, phone: false }) }}
                placeholder="08xxxxxxxxxx" autoComplete="tel" inputMode="tel"
              />
              {fieldErr.phone && <p className="mt-1.5 text-sm font-semibold text-rose-600">Please enter a valid phone number.</p>}
            </div>

            <div>
              <label className="label" htmlFor="f-email">Email <span className="font-normal text-slate-400">(optional)</span></label>
              <input id="f-email" type="email" className="field" value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
            </div>

            <div>
              <label className="label" htmlFor="f-notes">Notes <span className="font-normal text-slate-400">(optional)</span></label>
              <textarea id="f-notes" className="field min-h-[100px]" value={notes}
                onChange={(e) => setNotes(e.target.value)} placeholder="Anything the staff should know?" />
            </div>
          </div>

          <button
            className="btn-primary mt-8 w-full"
            onClick={() => { if (validateDetails()) setStep(step + 1) }}
          >Continue</button>
        </section>
      )}

      {/* ---------- CONFIRM ---------- */}
      {step === totalSteps - 1 && (
        <section>
          <h1 className="mb-1 text-2xl font-black text-slate-900">Confirm your booking</h1>
          <p className="mb-6 text-slate-500">Please check the details below.</p>

          <dl className="card space-y-0 divide-y divide-slate-100">
            <Row label="Business" value={b.name} />
            <Row label="Service" value={service?.name ?? ''} />
            {mode === 'appointment' ? (
              <Row label="When" value={`${prettyDate(date)} · ${time}`} />
            ) : (
              <Row label="Queue" value={`Today · ${data.waiting} ahead of you`} />
            )}
            <Row label="Name" value={name} />
            <Row label="Phone" value={phone} />
            {email && <Row label="Email" value={email} />}
            {notes && <Row label="Notes" value={notes} />}
            {(service?.price_cents ?? 0) > 0 && (
              <Row label="Price" value={money(service!.price_cents, b.currency)} strong />
            )}
          </dl>

          {(service?.price_cents ?? 0) > 0 && (
            <p className="mt-4 rounded-2xl bg-slate-100 p-4 text-center text-sm font-medium text-slate-600">
              Payment is made at the business — nothing to pay now.
            </p>
          )}

          <button className="btn-primary btn-lg mt-8 w-full" disabled={submitting} onClick={submit}>
            {submitting ? 'Booking…' : mode === 'queue' ? 'Join Queue' : 'Confirm Booking'}
          </button>
          <button className="btn-ghost mt-2 w-full" onClick={goBack} disabled={submitting}>Go back</button>
        </section>
      )}
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
      <dt className="text-base text-slate-500">{label}</dt>
      <dd className={`text-right text-base ${strong ? 'text-xl font-black text-slate-900' : 'font-semibold text-slate-800'}`}>{value}</dd>
    </div>
  )
}
