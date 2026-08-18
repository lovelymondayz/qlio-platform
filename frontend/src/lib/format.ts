import type { BookingStatus } from '../types'

/** Money — no decimals for IDR, two for everything else. */
export function money(cents: number, currency = 'IDR'): string {
  if (currency === 'IDR') {
    return 'Rp' + Math.round(cents).toLocaleString('id-ID')
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
}

export function duration(min: number): string {
  if (min < 60) return `${min} minutes`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h}h ${m}m` : `${h} hour${h > 1 ? 's' : ''}`
}

/** Plain-language wait text. Never shows "0 minutes". */
export function waitText(min: number): string {
  if (min <= 0) return 'You are next'
  if (min < 60) return `~${min} minutes`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `~${h}h ${m}m` : `~${h} hour${h > 1 ? 's' : ''}`
}

export function prettyDate(iso: string, locale = 'en-GB'): string {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  const today = new Date()
  const tomorrow = new Date(today.getTime() + 86400000)
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (same(d, today)) return 'Today'
  if (same(d, tomorrow)) return 'Tomorrow'
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
}

export function shortDate(iso: string): string {
  if (!iso) return ''
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Status → plain language + icon. Colour is never the only signal (§36). */
export const STATUS_META: Record<BookingStatus, { label: string; icon: string; cls: string }> = {
  pending_checkin: { label: 'Waiting for check-in', icon: '🟡', cls: 'chip-wait' },
  checked_in:      { label: 'Checked in',           icon: '🟢', cls: 'chip-in'   },
  waiting:         { label: 'Waiting',              icon: '🟢', cls: 'chip-in'   },
  almost:          { label: 'Almost your turn',     icon: '🔶', cls: 'chip-call' },
  called:          { label: 'It\'s your turn',      icon: '🔔', cls: 'chip-call' },
  serving:         { label: 'Being served',         icon: '💬', cls: 'chip-call' },
  completed:       { label: 'Completed',            icon: '✓',  cls: 'chip-done' },
  cancelled:       { label: 'Cancelled',            icon: '✕',  cls: 'chip-bad'  },
  no_show:         { label: 'No show',              icon: '—',  cls: 'chip-bad'  },
}

export function statusMeta(s: string) {
  return STATUS_META[s as BookingStatus] ?? { label: s, icon: '•', cls: 'chip-done' }
}

export const BUSINESS_CATEGORIES = [
  { id: 'doctor',     label: 'Doctor / Clinic',  icon: '🩺' },
  { id: 'dentist',    label: 'Dentist',          icon: '🦷' },
  { id: 'workshop',   label: 'Auto Workshop',    icon: '🔧' },
  { id: 'salon',      label: 'Hair Salon',       icon: '💇' },
  { id: 'beauty',     label: 'Beauty Salon',     icon: '💅' },
  { id: 'barber',     label: 'Barbershop',       icon: '💈' },
  { id: 'repair',     label: 'Repair Shop',      icon: '🛠️' },
  { id: 'restaurant', label: 'Restaurant',       icon: '🍽️' },
  { id: 'petcare',    label: 'Pet Grooming',     icon: '🐾' },
  { id: 'photo',      label: 'Photo Studio',     icon: '📸' },
  { id: 'trainer',    label: 'Personal Trainer', icon: '🏋️' },
  { id: 'consultant', label: 'Consultant',       icon: '💼' },
  { id: 'government', label: 'Public Service',   icon: '🏛️' },
  { id: 'carwash',    label: 'Car Wash',         icon: '🚗' },
  { id: 'other',      label: 'Something else',   icon: '🏢' },
]

export function categoryIcon(id: string): string {
  return BUSINESS_CATEGORIES.find((c) => c.id === id)?.icon ?? '🏢'
}

/** Build the absolute receipt URL that gets embedded in the QR code. */
export function receiptURL(token: string): string {
  return `${location.origin}/r/${token}`
}

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}
