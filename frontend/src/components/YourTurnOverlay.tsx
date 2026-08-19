import { useEffect, useState } from 'react'
import type { Receipt } from '../types'

/**
 * §16 "IT'S YOUR TURN" — a full-screen takeover, not a banner.
 *
 * The brief asks for "an extremely obvious screen". A card at the top of the
 * receipt can be scrolled out of view, and a customer glancing at their phone
 * across a waiting room can miss it. This covers the viewport so the ticket
 * number and destination are the only things on screen.
 *
 * Dismissible, because the customer still needs their QR to be scanned at the
 * counter — but it always returns on a fresh 'called' transition.
 */
export function YourTurnOverlay({
  receipt,
  counterLabel = 'Counter',
  onDismiss,
}: {
  receipt: Receipt
  counterLabel?: string
  onDismiss: () => void
}) {
  const [pulse, setPulse] = useState(true)

  // Vibrate in a repeating pattern while the overlay is up (mobile only).
  useEffect(() => {
    let stop = false
    const buzz = () => {
      if (stop) return
      try { navigator.vibrate?.([400, 200, 400]) } catch { /* unsupported */ }
    }
    buzz()
    const iv = window.setInterval(buzz, 4000)
    const t = window.setTimeout(() => setPulse(false), 12000)
    return () => { stop = true; clearInterval(iv); clearTimeout(t) }
  }, [])

  // Escape closes, matching the visible Got it button for keyboard users (§36).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onDismiss() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDismiss])

  const destination = receipt.counter_name

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="turn-title"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-brand-600 px-6 text-center text-white"
    >
      <p
        id="turn-title"
        className={`text-4xl font-black leading-tight sm:text-5xl ${pulse ? 'animate-ring-flash' : ''}`}
      >
        <span aria-hidden>🔔</span> It's Your Turn!
      </p>

      <p className="ticket-num mt-6 text-[22vw] leading-none sm:text-[9rem]">
        {receipt.ticket_number || receipt.booking_code.replace('QL-', '')}
      </p>

      {destination ? (
        <>
          <p className="mt-8 text-lg font-semibold uppercase tracking-widest opacity-80">
            Please go to
          </p>
          <p className="mt-1 text-5xl font-black sm:text-6xl">{destination}</p>
        </>
      ) : (
        <p className="mt-8 text-2xl font-bold opacity-90">
          Please go to the {counterLabel.toLowerCase()}.
        </p>
      )}

      <p className="mt-8 max-w-sm text-lg opacity-85">
        Show your QR code so the staff can start your service.
      </p>

      <button
        onClick={onDismiss}
        className="mt-10 rounded-2xl bg-white px-10 py-4 text-xl font-black text-brand-700 shadow-lg focus:outline-none focus:ring-4 focus:ring-white/50"
      >
        Got it — show my QR
      </button>
    </div>
  )
}
