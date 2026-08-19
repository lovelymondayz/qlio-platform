import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import QRCode from 'qrcode'
import { api, ApiError } from '../../lib/api'
import { money, prettyDate, waitText, receiptURL } from '../../lib/format'
import { downloadTicket, shareTicket, downloadICS } from '../../lib/ticket'
import { Spinner, ErrorBox, Alert, StatusChip, LiveDot } from '../../components/UI'
import { useLiveSocket, usePolling, useBrowserNotify } from '../../hooks/useLive'
import type { Receipt } from '../../types'

/**
 * The digital receipt at /r/:token — booking confirmation, queue ticket,
 * check-in pass and live queue view in one page. Works with no account.
 */
export default function ReceiptPage() {
  const { token = '' } = useParams()
  const [sp] = useSearchParams()
  const isNew = sp.get('new') === '1'

  const [r, setR] = useState<Receipt | null>(null)
  const [err, setErr] = useState('')
  const [qr, setQr] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState('')
  const prevStatus = useRef<string>('')

  const { granted, request: askNotify, notify } = useBrowserNotify()

  const load = useCallback(() => {
    api.get<Receipt>(`/api/public/receipt/${token}`)
      .then((d) => { setR(d); setErr('') })
      .catch((e: ApiError) => setErr(e.message))
  }, [token])

  useEffect(() => { load() }, [load])

  // The QR encodes the receipt URL. Staff scanners read the token out of it;
  // the payload itself carries no customer data (§21).
  useEffect(() => {
    QRCode.toDataURL(receiptURL(token), {
      width: 640, margin: 1, errorCorrectionLevel: 'H',
      color: { dark: '#0f172a', light: '#ffffff' },
    }).then(setQr).catch(() => {})
  }, [token])

  // Live updates, with polling as the safety net
  const connected = useLiveSocket(`/api/public/receipt/${token}/ws`, () => load())
  usePolling(load, connected ? 45000 : 12000)

  // Fire a browser notification the moment the status becomes "called"
  useEffect(() => {
    if (!r) return
    if (prevStatus.current && prevStatus.current !== r.status) {
      if (r.status === 'called') {
        notify("🔔 It's your turn!", r.counter_name ? `Please go to ${r.counter_name}` : `Ticket ${r.ticket_number}`)
        try { navigator.vibrate?.([300, 120, 300]) } catch { /* noop */ }
      } else if (r.status === 'almost') {
        notify('Almost your turn', `You are next in line — ticket ${r.ticket_number}`)
      }
    }
    prevStatus.current = r.status
  }, [r?.status])

  if (err) return <ErrorBox title="Receipt not found" message={err} onRetry={load} />
  if (!r) return <Spinner label="Loading your ticket…" />

  const called = r.status === 'called' || r.status === 'serving'
  const almost = r.status === 'almost'
  const closed = ['completed', 'cancelled', 'no_show'].includes(r.status)

  const doSave = async () => {
    setBusy(true)
    try {
      await downloadTicket(r, receiptURL(token))
      setSaved('Ticket image saved. Show it at the counter when you arrive.')
    } catch {
      setSaved('Could not create the image. You can screenshot this page instead.')
    } finally { setBusy(false) }
  }

  const doShare = async () => {
    setBusy(true)
    const ok = await shareTicket(r, receiptURL(token))
    if (!ok) {
      try {
        await navigator.clipboard.writeText(receiptURL(token))
        setSaved('Receipt link copied.')
      } catch { setSaved('Copy this page URL to keep your ticket.') }
    }
    setBusy(false)
  }

  // §30 Get Directions — prefer the business's own map link, otherwise search
  // its address. Undefined when we have neither, so the button is not rendered.
  const directionsHref = r.business.map_url
    || (r.business.address
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            `${r.business.name} ${r.business.address}`)}`
        : undefined)

  return (
    <div className="mx-auto min-h-screen max-w-lg px-4 pb-16 pt-6">
      {isNew && !closed && (
        <div className="mb-5 animate-slide-up rounded-3xl bg-emerald-50 p-5 text-center">
          <p className="text-3xl" aria-hidden>🎉</p>
          <p className="mt-1 text-xl font-black text-emerald-900">You're booked!</p>
        </div>
      )}

      {/* IT'S YOUR TURN — impossible to miss (§16) */}
      {called && (
        <div className="mb-5 animate-ring-flash rounded-3xl bg-brand-600 p-8 text-center text-white shadow-2xl shadow-brand-600/40">
          <p className="text-2xl font-black">🔔 It's Your Turn!</p>
          <p className="ticket-num my-3 text-6xl">{r.ticket_number}</p>
          {r.counter_name && (
            <>
              <p className="text-base font-semibold uppercase tracking-wide opacity-80">Please go to</p>
              <p className="text-4xl font-black">{r.counter_name}</p>
            </>
          )}
        </div>
      )}

      {almost && (
        <div className="mb-5"><Alert kind="warn"><strong>Almost your turn.</strong> Please stay nearby.</Alert></div>
      )}

      {/* THE TICKET */}
      <div className="overflow-hidden rounded-3xl bg-white shadow-xl">
        <div className="bg-brand-600 px-6 py-5 text-center text-white">
          <p className="text-xl font-black">{r.business.name}</p>
          <p className="mt-0.5 text-base opacity-85">{r.service_name}</p>
          <p className="mt-2 text-lg font-bold">
            {prettyDate(r.service_date)}{r.scheduled_time && ` · ${r.scheduled_time}`}
          </p>
        </div>

        <div className="px-6 py-7 text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-slate-400">
            {r.ticket_number ? 'Your Ticket' : 'Booking'}
          </p>
          <p className="ticket-num my-2 text-7xl text-slate-900">
            {r.ticket_number || r.booking_code.replace('QL-', '')}
          </p>
          <div className="mt-3 flex justify-center"><StatusChip status={r.status} /></div>
        </div>

        {/* QR — large and high-contrast so it scans off a phone screen */}
        {!closed && (
          <div className="border-t-2 border-dashed border-slate-200 px-6 py-7">
            {qr ? (
              <img src={qr} alt={`QR code for booking ${r.booking_code}`} className="mx-auto w-full max-w-[280px] rounded-2xl border-4 border-white shadow-md" />
            ) : (
              <div className="mx-auto h-[280px] w-[280px] animate-pulse rounded-2xl bg-slate-100" />
            )}
            <p className="mt-5 text-center text-lg font-bold text-slate-700">Show this QR code when you arrive.</p>
            <p className="mt-1 text-center text-sm text-slate-400">Booking ID · {r.booking_code}</p>
          </div>
        )}

        {/* LIVE QUEUE (§14) */}
        {r.ticket_number && !closed && !called && (
          <div className="border-t border-slate-100 bg-slate-50 px-6 py-6">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-bold uppercase tracking-wide text-slate-500">Live queue</p>
              <LiveDot on={connected} />
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <Stat label="Now serving" value={r.now_serving || '—'} />
              <Stat label="You are" value={r.position ? `#${r.position}` : '—'} accent />
              <Stat label="Ahead of you" value={String(r.people_ahead)} />
            </div>
            {r.checked_in && r.people_ahead > 0 && (
              <p className="mt-5 text-center text-lg font-bold text-slate-700">
                Estimated wait {waitText(r.est_wait_min)}
                <span className="ml-1 text-sm font-medium text-slate-400">(estimate)</span>
              </p>
            )}
            {!r.checked_in && (
              <p className="mt-5 rounded-2xl bg-amber-50 p-4 text-center text-base font-semibold text-amber-900">
                Your place in the queue starts once staff scan you in.
              </p>
            )}
          </div>
        )}

        {/* Details */}
        <div className="border-t border-slate-100 px-6 py-5 text-sm">
          <Line label="Name" value={r.customer_name} />
          <Line label="Phone" value={r.phone_masked} />
          {r.staff_name && <Line label="With" value={r.staff_name} />}
          {r.counter_name && !called && <Line label={r.business.counter_label} value={r.counter_name} />}
          {r.price_cents > 0 && <Line label="Price" value={money(r.price_cents, r.business.currency)} />}
          {r.notes && <Line label="Notes" value={r.notes} />}
        </div>

        {r.business.address && (
          <div className="border-t border-slate-100 px-6 py-5 text-center text-sm text-slate-500">
            <p className="whitespace-pre-line">{r.business.address}</p>
            {r.business.phone && <a href={`tel:${r.business.phone}`} className="mt-1 inline-block font-bold text-brand-600">{r.business.phone}</a>}
          </div>
        )}
      </div>

      {saved && <div className="mt-5"><Alert kind="info">{saved}</Alert></div>}

      {/* ACTIONS */}
      {!closed && (
        <div className="no-print mt-6 space-y-3">
          <button className="btn-primary w-full" disabled={busy} onClick={doSave}>
            📥 Save Ticket as Image
          </button>
          <p className="text-center text-sm text-slate-500">
            Save it to your gallery and show the image at the counter — works without internet.
          </p>

          {/* §30 — Get Directions, Share and Add to Calendar are all required.
              Directions is no longer a fallback for the no-appointment case: an
              appointment customer needs the address just as much. */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button className="btn-secondary !text-base" disabled={busy} onClick={doShare}>↗ Share</button>
            {r.scheduled_time && (
              <button className="btn-secondary !text-base" onClick={() => downloadICS(r)}>📅 Add to Calendar</button>
            )}
            {directionsHref
              ? <a href={directionsHref} target="_blank" rel="noreferrer" className="btn-secondary !text-base">📍 Get Directions</a>
              : <button className="btn-secondary !text-base" onClick={() => window.print()}>🖨 Print</button>}
          </div>

          {!granted && r.ticket_number && (
            <button className="btn-ghost w-full !text-base" onClick={askNotify}>
              🔔 Notify me when it's my turn
            </button>
          )}

          {/* Cancellation is deliberately NOT self-service. A booked slot is a
              commitment; the customer must speak to the business so staff stay
              in control of their schedule. Staff cancel from the queue board. */}
          {r.status === 'pending_checkin' && (
            <p className="mt-2 rounded-2xl bg-slate-50 px-4 py-3 text-center text-sm text-slate-500">
              Need to change or cancel? Please contact {r.business.name}
              {r.business.phone ? <> at <a href={`tel:${r.business.phone}`} className="font-semibold text-brand-600 underline">{r.business.phone}</a></> : ' directly'}.
            </p>
          )}
        </div>
      )}

      {closed && (
        <div className="mt-6 text-center">
          <Link to={`/${r.business.slug}`} className="btn-primary">Book again</Link>
        </div>
      )}

      <p className="mt-8 text-center text-xs text-slate-400">
        Keep this page bookmarked — it is your ticket.
      </p>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`ticket-num text-3xl ${accent ? 'text-brand-600' : 'text-slate-800'}`}>{value}</p>
    </div>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1.5">
      <span className="text-slate-400">{label}</span>
      <span className="text-right font-semibold text-slate-700">{value}</span>
    </div>
  )
}
