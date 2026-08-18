import QRCode from 'qrcode'
import type { Receipt } from '../types'
import { money, prettyDate } from './format'

/**
 * Renders the receipt as a self-contained PNG the customer saves to their gallery.
 * They can then show the saved image at the counter and staff scans it — this works
 * with no signal and no account, which is the whole point of the product.
 */
export async function renderTicketPNG(r: Receipt, qrPayload: string): Promise<Blob> {
  const W = 900
  const H = 1500
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  // background
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  // header band
  ctx.fillStyle = '#4f46e5'
  ctx.fillRect(0, 0, W, 200)

  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.font = '700 30px Inter, system-ui, sans-serif'
  ctx.fillText(truncate(r.business.name, 30), W / 2, 80)
  ctx.font = '500 24px Inter, system-ui, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.fillText(truncate(r.service_name || 'Booking', 36), W / 2, 125)
  ctx.font = '600 26px Inter, system-ui, sans-serif'
  ctx.fillStyle = '#ffffff'
  const when = r.scheduled_time
    ? `${prettyDate(r.service_date)} · ${r.scheduled_time}`
    : prettyDate(r.service_date)
  ctx.fillText(when, W / 2, 168)

  // ticket number — the biggest thing on the image
  let y = 300
  ctx.fillStyle = '#64748b'
  ctx.font = '600 24px Inter, system-ui, sans-serif'
  ctx.fillText('YOUR TICKET', W / 2, y)

  y += 110
  ctx.fillStyle = '#0f172a'
  ctx.font = '900 130px Inter, system-ui, sans-serif'
  ctx.fillText(r.ticket_number || r.booking_code.replace('QL-', ''), W / 2, y)

  // QR code
  const qrSize = 460
  const qrDataUrl = await QRCode.toDataURL(qrPayload, {
    width: qrSize,
    margin: 1,
    errorCorrectionLevel: 'H',
    color: { dark: '#0f172a', light: '#ffffff' },
  })
  const img = await loadImage(qrDataUrl)
  const qrX = (W - qrSize) / 2
  const qrY = y + 60

  // quiet-zone frame so the code scans reliably off a phone screen
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(qrX - 20, qrY - 20, qrSize + 40, qrSize + 40)
  ctx.strokeStyle = '#e2e8f0'
  ctx.lineWidth = 3
  ctx.strokeRect(qrX - 20, qrY - 20, qrSize + 40, qrSize + 40)
  ctx.drawImage(img, qrX, qrY, qrSize, qrSize)

  y = qrY + qrSize + 80

  // booking id
  ctx.fillStyle = '#64748b'
  ctx.font = '600 22px Inter, system-ui, sans-serif'
  ctx.fillText('BOOKING ID', W / 2, y)
  y += 46
  ctx.fillStyle = '#0f172a'
  ctx.font = '800 42px Inter, system-ui, sans-serif'
  ctx.fillText(r.booking_code, W / 2, y)

  // customer
  y += 62
  ctx.fillStyle = '#334155'
  ctx.font = '500 26px Inter, system-ui, sans-serif'
  ctx.fillText(truncate(r.customer_name, 32), W / 2, y)

  if (r.price_cents > 0) {
    y += 44
    ctx.fillStyle = '#0f172a'
    ctx.font = '700 30px Inter, system-ui, sans-serif'
    ctx.fillText(money(r.price_cents, r.business.currency), W / 2, y)
  }

  // instruction footer
  y += 70
  ctx.fillStyle = '#f1f5f9'
  ctx.fillRect(60, y - 40, W - 120, 90)
  ctx.fillStyle = '#334155'
  ctx.font = '600 26px Inter, system-ui, sans-serif'
  ctx.fillText('Show this code when you arrive', W / 2, y + 12)

  // address
  if (r.business.address) {
    y += 110
    ctx.fillStyle = '#94a3b8'
    ctx.font = '400 20px Inter, system-ui, sans-serif'
    wrapText(ctx, r.business.address, W / 2, y, W - 160, 28, 2)
  }

  // brand mark
  ctx.fillStyle = '#cbd5e1'
  ctx.font = '700 20px Inter, system-ui, sans-serif'
  ctx.fillText('Qlio · Book. Scan. Queue. Done.', W / 2, H - 40)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create image'))), 'image/png')
  })
}

/** Triggers a download, falling back to opening the image in a new tab on iOS Safari. */
export async function downloadTicket(r: Receipt, qrPayload: string) {
  const blob = await renderTicketPNG(r, qrPayload)
  const url = URL.createObjectURL(blob)
  const filename = `qlio-${r.ticket_number || r.booking_code}.png`

  const a = document.createElement('a')
  a.href = url
  a.download = filename

  if (typeof a.download === 'undefined') {
    window.open(url, '_blank')
  } else {
    document.body.appendChild(a)
    a.click()
    a.remove()
  }
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}

/** Web Share API — lets the customer send the ticket image to WhatsApp directly. */
export async function shareTicket(r: Receipt, qrPayload: string): Promise<boolean> {
  try {
    const blob = await renderTicketPNG(r, qrPayload)
    const file = new File([blob], `qlio-${r.ticket_number || r.booking_code}.png`, { type: 'image/png' })
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
    if (nav.canShare && nav.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: `${r.business.name} — ${r.ticket_number || r.booking_code}`,
        text: 'My booking ticket',
      })
      return true
    }
  } catch {
    /* user cancelled or unsupported */
  }
  return false
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = reject
    i.src = src
  })
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

function wrapText(
  ctx: CanvasRenderingContext2D, text: string, x: number, y: number,
  maxWidth: number, lineHeight: number, maxLines: number
) {
  const words = text.split(' ')
  let line = ''
  let lines = 0
  for (const w of words) {
    const test = line ? line + ' ' + w : w
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y)
      y += lineHeight
      lines++
      line = w
      if (lines >= maxLines - 1) break
    } else {
      line = test
    }
  }
  if (line) ctx.fillText(truncate(line, 60), x, y)
}

/** Builds an .ics file so "Add to Calendar" works without any third-party service. */
export function calendarICS(r: Receipt): string {
  const dt = r.scheduled_time
    ? `${r.service_date.replace(/-/g, '')}T${r.scheduled_time.replace(':', '')}00`
    : `${r.service_date.replace(/-/g, '')}T090000`
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Qlio//EN',
    'BEGIN:VEVENT',
    `UID:${r.booking_code}@qlio`,
    `DTSTAMP:${dt}`,
    `DTSTART:${dt}`,
    `SUMMARY:${r.service_name || 'Appointment'} — ${r.business.name}`,
    `DESCRIPTION:Booking ${r.booking_code}. Show your QR code on arrival.`,
    r.business.address ? `LOCATION:${r.business.address.replace(/\n/g, ' ')}` : '',
    'BEGIN:VALARM',
    'TRIGGER:-PT60M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Your appointment is in 1 hour',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean)
  return lines.join('\r\n')
}

export function downloadICS(r: Receipt) {
  const blob = new Blob([calendarICS(r)], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `qlio-${r.booking_code}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
