import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { api, ApiError } from '../../lib/api'
import { money, waitText, todayISO } from '../../lib/format'
import { Spinner, ErrorBox, Alert } from '../../components/UI'
import type { PublicBusinessResponse, Service } from '../../types'

/**
 * Walk-in kiosk (§11) — a tablet at reception. Big targets, auto-reset,
 * shows the ticket on screen plus a QR the customer can photograph.
 */
export default function KioskPage() {
  const { slug = '' } = useParams()
  const [data, setData] = useState<PublicBusinessResponse | null>(null)
  const [err, setErr] = useState('')
  const [step, setStep] = useState<'idle' | 'service' | 'details' | 'done'>('idle')
  const [service, setService] = useState<Service | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [submitErr, setSubmitErr] = useState('')
  const [result, setResult] = useState<{ ticket: string; code: string; token: string } | null>(null)
  const [qr, setQr] = useState('')

  const load = () => {
    api.get<PublicBusinessResponse>(`/api/public/b/${slug}`).then(setData).catch((e: ApiError) => setErr(e.message))
  }
  useEffect(load, [slug])

  const reset = () => {
    setStep('idle'); setService(null); setName(''); setPhone('')
    setResult(null); setQr(''); setSubmitErr('')
    load()
  }

  // Auto-return to the welcome screen so the kiosk is always ready
  useEffect(() => {
    if (step === 'done') {
      const t = setTimeout(reset, 45000)
      return () => clearTimeout(t)
    }
    if (step !== 'idle') {
      const t = setTimeout(reset, 180000)
      return () => clearTimeout(t)
    }
  }, [step])

  useEffect(() => {
    if (result) {
      QRCode.toDataURL(`${location.origin}/r/${result.token}`, { width: 420, margin: 1, errorCorrectionLevel: 'H' })
        .then(setQr).catch(() => {})
    }
  }, [result])

  if (err) return <ErrorBox title="Kiosk unavailable" message={err} onRetry={load} />
  if (!data) return <Spinner />

  const b = data.business
  const queueServices = data.services.filter((s) => s.allow_queue)

  const submit = async () => {
    if (name.trim().length < 2 || phone.replace(/\D/g, '').length < 8) {
      setSubmitErr('Please enter your name and phone number.')
      return
    }
    setBusy(true); setSubmitErr('')
    try {
      const res = await api.post<{ receipt_token: string; booking_code: string }>(
        `/api/public/b/${slug}/book`,
        { service_id: service!.id, kind: 'queue', date: todayISO(), name: name.trim(), phone: phone.trim(), origin: 'kiosk' }
      )
      const rec = await api.get<{ ticket_number: string }>(`/api/public/receipt/${res.receipt_token}`)
      setResult({ ticket: rec.ticket_number, code: res.booking_code, token: res.receipt_token })
      setStep('done')
    } catch (e) {
      setSubmitErr((e as ApiError).message)
    } finally { setBusy(false) }
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-brand-50 to-white">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-8 py-10">

        {/* WELCOME */}
        {step === 'idle' && (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <h1 className="text-5xl font-black text-slate-900 sm:text-6xl">{b.name}</h1>
            <p className="mt-6 text-2xl text-slate-500">Need a service?</p>
            <button onClick={() => setStep('service')} className="btn-primary btn-lg mt-12 w-full max-w-md !text-3xl">
              Tap to Join the Queue
            </button>
            {data.now_serving && (
              <div className="mt-16 rounded-3xl bg-white px-10 py-6 shadow-lg">
                <p className="text-base font-bold uppercase tracking-widest text-slate-400">Now serving</p>
                <p className="ticket-num mt-1 text-6xl text-brand-600">{data.now_serving}</p>
                <p className="mt-2 text-lg text-slate-500">{data.waiting} waiting · {waitText(data.est_wait)}</p>
              </div>
            )}
          </div>
        )}

        {/* SERVICE */}
        {step === 'service' && (
          <div>
            <h2 className="mb-8 text-4xl font-black text-slate-900">What do you need?</h2>
            {queueServices.length === 0 ? (
              <Alert kind="warn">No walk-in services are available right now.</Alert>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {queueServices.map((s) => (
                  <button key={s.id} onClick={() => { setService(s); setStep('details') }}
                    className="card-pick !p-8 text-center">
                    {s.icon && <span className="mb-2 block text-5xl" aria-hidden>{s.icon}</span>}
                    <span className="block text-2xl font-bold text-slate-900">{s.name}</span>
                    {s.price_cents > 0 && (
                      <span className="mt-2 block text-lg font-semibold text-slate-500">{money(s.price_cents, b.currency)}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
            <button onClick={reset} className="btn-ghost mt-10 !text-xl">← Start over</button>
          </div>
        )}

        {/* DETAILS */}
        {step === 'details' && (
          <div>
            <h2 className="mb-2 text-4xl font-black text-slate-900">Your details</h2>
            <p className="mb-8 text-xl text-slate-500">{service?.name}</p>

            <div className="space-y-6">
              <div>
                <label className="label !text-xl" htmlFor="k-n">Your name</label>
                <input id="k-n" className="field !py-6 !text-2xl" value={name}
                  onChange={(e) => setName(e.target.value)} placeholder="Type your name" autoFocus />
              </div>
              <div>
                <label className="label !text-xl" htmlFor="k-p">Phone number</label>
                <input id="k-p" type="tel" inputMode="tel" className="field !py-6 !text-2xl" value={phone}
                  onChange={(e) => setPhone(e.target.value)} placeholder="08xxxxxxxxxx" />
              </div>
              {submitErr && <Alert kind="error">{submitErr}</Alert>}
            </div>

            <button className="btn-primary btn-lg mt-10 w-full !text-3xl" disabled={busy} onClick={submit}>
              {busy ? 'Getting your ticket…' : 'Get My Ticket'}
            </button>
            <button onClick={reset} className="btn-ghost mt-3 w-full !text-xl">Cancel</button>
          </div>
        )}

        {/* TICKET ISSUED */}
        {step === 'done' && result && (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <p className="text-3xl font-bold text-emerald-600">✓ You're in the queue</p>
            <p className="mt-8 text-xl font-bold uppercase tracking-widest text-slate-400">Your ticket</p>
            <p className="ticket-num text-[10rem] leading-none text-slate-900">{result.ticket}</p>

            {qr && <img src={qr} alt="Your QR code" className="mt-8 w-56 rounded-2xl border-8 border-white shadow-xl" />}

            <p className="mt-8 max-w-lg text-2xl font-bold text-slate-700">
              Photograph this code, then show it at reception.
            </p>
            <p className="mt-3 text-lg text-slate-400">Booking ID · {result.code}</p>

            <button onClick={reset} className="btn-secondary mt-12 !text-xl">Done</button>
          </div>
        )}
      </div>
    </div>
  )
}
