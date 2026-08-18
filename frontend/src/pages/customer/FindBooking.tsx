import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { Alert, BackButton } from '../../components/UI'

/**
 * Booking recovery without an account (§29).
 * Requires phone AND booking ID together — phone alone would let anyone
 * enumerate other customers' bookings.
 */
export default function FindBooking() {
  const { slug = '' } = useParams()
  const nav = useNavigate()
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    if (!phone.trim() || !code.trim()) {
      setErr('Please enter both your phone number and booking ID.')
      return
    }
    setBusy(true)
    try {
      const res = await api.post<{ receipt_token: string }>('/api/public/find', { phone, code })
      nav(`/r/${res.receipt_token}`)
    } catch (e) {
      setErr((e as ApiError).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto min-h-screen max-w-md px-5 pt-8">
      <BackButton onClick={() => nav(slug ? `/${slug}` : '/')} />

      <h1 className="mb-1 text-3xl font-black text-slate-900">Find My Booking</h1>
      <p className="mb-8 text-lg text-slate-500">
        Enter the phone number you booked with and your booking ID.
      </p>

      <form onSubmit={submit} className="space-y-5">
        <div>
          <label className="label" htmlFor="p">Phone number</label>
          <input id="p" type="tel" inputMode="tel" className="field" value={phone}
            onChange={(e) => setPhone(e.target.value)} placeholder="08xxxxxxxxxx" autoComplete="tel" />
        </div>

        <div>
          <label className="label" htmlFor="c">Booking ID</label>
          <input id="c" className="field uppercase" value={code}
            onChange={(e) => setCode(e.target.value)} placeholder="QL-8F29A4" autoCapitalize="characters" />
          <p className="mt-1.5 text-sm text-slate-400">It looks like QL-8F29A4 and is printed on your receipt.</p>
        </div>

        {err && <Alert kind="error">{err}</Alert>}

        <button className="btn-primary w-full" disabled={busy}>
          {busy ? 'Searching…' : 'Find My Booking'}
        </button>
      </form>

      <p className="mt-8 text-center text-sm text-slate-400">
        Lost your booking ID? Please contact the business directly.
      </p>
    </div>
  )
}
