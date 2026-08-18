import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { api, ApiError } from '../../lib/api'
import { Alert, Spinner } from '../../components/UI'
import { statusMeta } from '../../lib/format'
import type { ScanResult, CheckInResult } from '../../types'

/**
 * Staff QR scanner (§19, §20). Camera opens automatically, resolves the token
 * server-side, and offers one giant CHECK IN button. No confirmation dialogs.
 */
export default function ScannerPage() {
  const [phase, setPhase] = useState<'scanning' | 'found' | 'done'>('scanning')
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [done, setDone] = useState<CheckInResult | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [manual, setManual] = useState('')
  const [showManual, setShowManual] = useState(false)
  const [camState, setCamState] = useState<'starting' | 'on' | 'blocked'>('starting')

  const scannerRef = useRef<Html5Qrcode | null>(null)
  const lockRef = useRef(false)

  const stopCamera = async () => {
    const s = scannerRef.current
    scannerRef.current = null
    if (!s) return
    try { await s.stop() } catch { /* already stopped */ }
    try { s.clear() } catch { /* noop */ }
  }

  const resolveToken = async (raw: string) => {
    if (lockRef.current) return
    lockRef.current = true
    setBusy(true); setErr('')
    try {
      const res = await api.aPost<ScanResult>('/api/staff/scan',
        raw.startsWith('QL-') || /^[A-Z0-9]{6}$/i.test(raw) ? { code: raw } : { token: raw })
      if (!res.found) {
        setErr(res.reason || 'Booking not found.')
        lockRef.current = false
      } else {
        await stopCamera()
        setScan(res)
        setPhase('found')
      }
    } catch (e) {
      setErr((e as ApiError).message)
      lockRef.current = false
    } finally { setBusy(false) }
  }

  // Start the camera whenever we return to the scanning phase
  useEffect(() => {
    if (phase !== 'scanning') return
    lockRef.current = false
    let cancelled = false

    const start = async () => {
      setCamState('starting')
      try {
        const inst = new Html5Qrcode('qr-reader', { verbose: false })
        if (cancelled) return
        scannerRef.current = inst
        await inst.start(
          { facingMode: 'environment' },
          { fps: 12, qrbox: { width: 260, height: 260 }, aspectRatio: 1.0 },
          (text) => { void resolveToken(text.trim()) },
          () => { /* per-frame decode misses are normal */ }
        )
        if (!cancelled) setCamState('on')
      } catch {
        if (!cancelled) { setCamState('blocked'); setShowManual(true) }
      }
    }
    void start()

    return () => { cancelled = true; void stopCamera() }
  }, [phase])

  const checkIn = async () => {
    if (!scan) return
    setBusy(true); setErr('')
    try {
      const res = await api.aPost<CheckInResult>('/api/staff/checkin', {
        token: scan.receipt_token, method: camState === 'on' ? 'qr' : 'manual',
      })
      setDone(res)
      setPhase('done')
    } catch (e) {
      setErr((e as ApiError).message)
    } finally { setBusy(false) }
  }

  const again = () => {
    setScan(null); setDone(null); setErr(''); setManual('')
    setPhase('scanning')
  }

  return (
    <div className="mx-auto max-w-lg px-5 py-6">
      {/* ---------- SCANNING ---------- */}
      {phase === 'scanning' && (
        <>
          <h1 className="mb-1 text-2xl font-black text-slate-900">Scan Customer</h1>
          <p className="mb-6 text-slate-500">Point the camera at the customer's QR code.</p>

          <div className="overflow-hidden rounded-3xl bg-slate-900">
            <div id="qr-reader" className="w-full [&_video]:!w-full [&_video]:!rounded-none" />
            {camState === 'starting' && (
              <div className="py-20 text-center text-white/60">Opening camera…</div>
            )}
            {camState === 'blocked' && (
              <div className="px-6 py-12 text-center text-white/70">
                <p className="mb-2 text-4xl" aria-hidden>📷</p>
                <p className="font-semibold">Camera not available.</p>
                <p className="mt-1 text-sm">Enter the booking ID below instead.</p>
              </div>
            )}
          </div>

          {busy && <div className="mt-4"><Spinner label="Looking up booking…" /></div>}
          {err && <div className="mt-4"><Alert kind="error">{err}</Alert></div>}

          <div className="mt-6">
            {!showManual ? (
              <button className="btn-secondary w-full !text-base" onClick={() => setShowManual(true)}>
                Enter Booking ID manually
              </button>
            ) : (
              <form
                onSubmit={(e) => { e.preventDefault(); if (manual.trim()) void resolveToken(manual.trim().toUpperCase()) }}
                className="space-y-3"
              >
                <label className="label" htmlFor="mid">Booking ID</label>
                <input id="mid" className="field uppercase" value={manual} autoFocus
                  onChange={(e) => setManual(e.target.value)} placeholder="QL-8F29A4" autoCapitalize="characters" />
                <button className="btn-primary w-full" disabled={busy || !manual.trim()}>Look up</button>
              </form>
            )}
          </div>
        </>
      )}

      {/* ---------- CUSTOMER FOUND ---------- */}
      {phase === 'found' && scan && (
        <div className="animate-slide-up">
          <p className="mb-4 text-center text-lg font-bold text-emerald-600">✓ Customer Found</p>

          <div className="card text-center">
            <p className="text-2xl font-black text-slate-900">{scan.customer_name}</p>
            <p className="mt-1 text-lg text-slate-500">{scan.service_name}</p>

            {scan.ticket_number && (
              <>
                <p className="mt-5 text-sm font-bold uppercase tracking-widest text-slate-400">Ticket</p>
                <p className="ticket-num text-6xl text-slate-900">{scan.ticket_number}</p>
              </>
            )}

            <dl className="mt-6 space-y-2 border-t border-slate-100 pt-5 text-left text-base">
              {scan.scheduled_time && <Row k="Appointment" v={`${scan.scheduled_time}`} />}
              <Row k="Type" v={scan.kind === 'queue' ? 'Walk-in / Queue' : 'Appointment'} />
              <Row k="Booking ID" v={scan.booking_code} />
              <Row k="Phone" v={scan.customer_phone} />
              <div className="flex justify-between gap-4 pt-1">
                <dt className="text-slate-400">Status</dt>
                <dd className="font-semibold">
                  {statusMeta(scan.status).icon} {statusMeta(scan.status).label}
                </dd>
              </div>
              {scan.notes && <Row k="Notes" v={scan.notes} />}
            </dl>
          </div>

          {err && <div className="mt-4"><Alert kind="error">{err}</Alert></div>}

          {scan.can_check_in ? (
            <button className="btn-primary btn-lg mt-6 w-full" disabled={busy} onClick={checkIn}>
              {busy ? 'Checking in…' : '✓ CHECK IN'}
            </button>
          ) : (
            <div className="mt-6"><Alert kind="warn">{scan.reason}</Alert></div>
          )}

          <button className="btn-ghost mt-3 w-full" onClick={again}>Scan another</button>
        </div>
      )}

      {/* ---------- CHECKED IN ---------- */}
      {phase === 'done' && done && (
        <div className="animate-slide-up text-center">
          <p className="text-5xl" aria-hidden>✅</p>
          <h2 className="mt-3 text-2xl font-black text-slate-900">Check-in Successful</h2>
          <p className="mt-1 text-lg text-slate-500">{done.customer_name}</p>

          <p className="mt-8 text-sm font-bold uppercase tracking-widest text-slate-400">Ticket</p>
          <p className="ticket-num text-7xl text-slate-900">{done.ticket_number}</p>

          <div className="mt-8 grid grid-cols-2 gap-4">
            <div className="card !p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">People ahead</p>
              <p className="ticket-num mt-1 text-3xl text-slate-800">{done.people_ahead}</p>
            </div>
            <div className="card !p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Est. wait</p>
              <p className="ticket-num mt-1 text-3xl text-slate-800">
                {done.est_wait_min > 0 ? `${done.est_wait_min}m` : 'Next'}
              </p>
            </div>
          </div>

          <p className="mt-6 text-base text-slate-500">
            The customer's receipt has updated automatically.
          </p>

          <button className="btn-primary mt-8 w-full" onClick={again}>Scan next customer</button>
        </div>
      )}
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-400">{k}</dt>
      <dd className="text-right font-semibold text-slate-700">{v}</dd>
    </div>
  )
}
