import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { api, ApiError } from '../../lib/api'
import { Alert, Spinner } from '../../components/UI'
import { Toggle } from './ServicesTab'
import { WEEKDAYS } from '../../lib/format'
import type { Business, ScheduleDay } from '../../types'

/** Business profile, opening hours, and the printable business QR code (§23). */
export default function BusinessTab() {
  const [b, setB] = useState<Business | null>(null)
  const [settings, setSettings] = useState({ slot_interval_min: 30, almost_turn_ahead: 2 })
  const [days, setDays] = useState<ScheduleDay[]>([])
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [qr, setQr] = useState('')

  const load = () => {
    api.aGet<{ business: Business; settings: typeof settings; schedule: ScheduleDay[] }>('/api/staff/business')
      .then((d) => {
        setB(d.business)
        if (d.settings) setSettings(d.settings)
        const full = Array.from({ length: 7 }, (_, i) =>
          d.schedule.find((s) => s.weekday === i) ?? { weekday: i, is_open: false, open_time: '09:00', close_time: '17:00' }
        )
        setDays(full)
      })
      .catch((e: ApiError) => setMsg(e.message))
  }
  useEffect(load, [])

  useEffect(() => {
    if (b?.slug) {
      QRCode.toDataURL(`${location.origin}/${b.slug}`, { width: 520, margin: 1, errorCorrectionLevel: 'H' })
        .then(setQr).catch(() => {})
    }
  }, [b?.slug])

  const saveProfile = async () => {
    if (!b) return
    setBusy(true); setMsg('')
    try {
      await api.aPut('/api/staff/business', {
        name: b.name, tagline: b.tagline, logo_url: b.logo_url, address: b.address,
        map_url: b.map_url, phone: b.phone, email: b.email, timezone: b.timezone,
        currency: b.currency, counter_label: b.counter_label,
        allow_appointments: b.allow_appointments, allow_queue: b.allow_queue, allow_walkin: b.allow_walkin,
        slot_interval_min: settings.slot_interval_min, almost_turn_ahead: settings.almost_turn_ahead,
      })
      setMsg('Saved.')
    } catch (e) { setMsg((e as ApiError).message) } finally { setBusy(false) }
  }

  const saveHours = async () => {
    setBusy(true); setMsg('')
    try { await api.aPut('/api/staff/schedule', { days }); setMsg('Opening hours saved.') }
    catch (e) { setMsg((e as ApiError).message) } finally { setBusy(false) }
  }

  if (!b) return <Spinner />

  const publicUrl = `${location.origin}/${b.slug}`
  const set = (k: keyof Business) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setB({ ...b, [k]: e.target.value })

  return (
    <div className="space-y-12">
      {msg && <Alert kind="info">{msg}</Alert>}

      {/* PUBLIC LINK + QR */}
      <section className="card text-center">
        <h2 className="mb-1 text-xl font-bold text-slate-900">Your Qlio page</h2>
        <a href={publicUrl} target="_blank" rel="noreferrer" className="break-all font-bold text-brand-600 hover:underline">
          {publicUrl}
        </a>
        {qr && <img src={qr} alt="Business QR code" className="mx-auto mt-6 w-48 rounded-2xl" />}
        <p className="mt-3 text-lg font-bold text-slate-700">Scan to Book</p>
        <p className="mt-1 text-sm text-slate-400">Print this and place it at your entrance or counter.</p>

        <div className="mt-6 grid gap-2 sm:grid-cols-3">
          <button className="btn-secondary !py-3 !text-base" onClick={() => window.print()}>🖨 Print</button>
          <a className="btn-secondary !py-3 !text-base" href={qr} download={`qlio-${b.slug}-qr.png`}>📥 Download QR</a>
          <a className="btn-secondary !py-3 !text-base" href={`/kiosk/${b.slug}`} target="_blank" rel="noreferrer">📱 Kiosk mode</a>
        </div>
        <a className="mt-2 block text-sm font-semibold text-slate-400 hover:underline"
          href={`/display/${b.slug}`} target="_blank" rel="noreferrer">Open waiting-room screen ↗</a>
      </section>

      {/* PROFILE */}
      <section>
        <h2 className="mb-5 text-xl font-bold text-slate-900">Business details</h2>
        <div className="space-y-4">
          <div>
            <label className="label">Business name</label>
            <input className="field" value={b.name} onChange={set('name')} />
          </div>
          <div>
            <label className="label">Tagline</label>
            <input className="field" value={b.tagline} onChange={set('tagline')} placeholder="Optional one-liner" />
          </div>
          <div>
            <label className="label">Logo URL</label>
            <input className="field" value={b.logo_url} onChange={set('logo_url')} placeholder="https://…" />
          </div>
          <div>
            <label className="label">Address</label>
            <textarea className="field min-h-" value={b.address} onChange={set('address')} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Phone</label>
              <input className="field" value={b.phone} onChange={set('phone')} />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="field" value={b.email ?? ''} onChange={set('email')} />
            </div>
          </div>
          <div>
            <label className="label">Google Maps link</label>
            <input className="field" value={b.map_url} onChange={set('map_url')} placeholder="https://maps.google.com/…" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label">Timezone</label>
              <select className="field" value={b.timezone} onChange={set('timezone')}>
                <option value="Asia/Jakarta">Asia/Jakarta</option>
                <option value="Asia/Makassar">Asia/Makassar</option>
                <option value="Asia/Jayapura">Asia/Jayapura</option>
                <option value="Asia/Singapore">Asia/Singapore</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
            <div>
              <label className="label">Currency</label>
              <select className="field" value={b.currency} onChange={set('currency')}>
                <option value="IDR">IDR</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="SGD">SGD</option>
              </select>
            </div>
            <div>
              <label className="label">Call customers to a…</label>
              <input className="field" value={b.counter_label} onChange={set('counter_label')} placeholder="Counter" />
            </div>
          </div>

          <div className="space-y-1 rounded-2xl bg-slate-50 p-4">
            <Toggle label="Accept appointments" on={b.allow_appointments}
              onChange={(v) => setB({ ...b, allow_appointments: v })} />
            <Toggle label="Use a queue" on={b.allow_queue} onChange={(v) => setB({ ...b, allow_queue: v })} />
            <Toggle label="Allow walk-ins at the kiosk" on={b.allow_walkin}
              onChange={(v) => setB({ ...b, allow_walkin: v })} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Appointment slot spacing</label>
              <select className="field" value={settings.slot_interval_min}
                onChange={(e) => setSettings({ ...settings, slot_interval_min: Number(e.target.value) })}>
                <option value={15}>Every 15 minutes</option>
                <option value={20}>Every 20 minutes</option>
                <option value={30}>Every 30 minutes</option>
                <option value={60}>Every hour</option>
              </select>
            </div>
            <div>
              <label className="label">Warn customer when this many ahead</label>
              <input type="number" className="field" value={settings.almost_turn_ahead}
                onChange={(e) => setSettings({ ...settings, almost_turn_ahead: Number(e.target.value) })} />
            </div>
          </div>

          <button className="btn-primary w-full" disabled={busy} onClick={saveProfile}>
            {busy ? 'Saving…' : 'Save details'}
          </button>
        </div>
      </section>

      {/* HOURS */}
      <section>
        <h2 className="mb-5 text-xl font-bold text-slate-900">Opening hours</h2>
        <div className="space-y-2">
          {days.map((d, i) => (
            <div key={d.weekday} className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm">
              <button
                onClick={() => setDays(days.map((x, j) => j === i ? { ...x, is_open: !x.is_open } : x))}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-bold transition ${
                  d.is_open ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'
                }`}
                aria-label={`${WEEKDAYS[d.weekday]} ${d.is_open ? 'open' : 'closed'}`}
              >{d.is_open ? '✓' : '—'}</button>
              <span className="w-24 font-bold text-slate-700">{WEEKDAYS[d.weekday].slice(0, 3)}</span>
              {d.is_open ? (
                <div className="flex flex-1 items-center gap-2">
                  <input type="time" className="field !py-2.5 !text-base" value={d.open_time.slice(0, 5)}
                    onChange={(e) => setDays(days.map((x, j) => j === i ? { ...x, open_time: e.target.value } : x))} />
                  <span className="text-slate-400">—</span>
                  <input type="time" className="field !py-2.5 !text-base" value={d.close_time.slice(0, 5)}
                    onChange={(e) => setDays(days.map((x, j) => j === i ? { ...x, close_time: e.target.value } : x))} />
                </div>
              ) : (
                <span className="flex-1 text-slate-400">Closed</span>
              )}
            </div>
          ))}
        </div>
        <button className="btn-primary mt-5 w-full" disabled={busy} onClick={saveHours}>
          {busy ? 'Saving…' : 'Save opening hours'}
        </button>
      </section>
    </div>
  )
}
