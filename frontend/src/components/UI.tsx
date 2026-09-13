import type { ReactNode } from 'react'
import { cx } from '../lib/format'

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16" role="status" aria-live="polite">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-brand-600" />
      <p className="text-lg font-medium text-slate-500">{label}</p>
    </div>
  )
}

export function ErrorBox({ title = 'Something went wrong', message, onRetry }: {
  title?: string; message: string; onRetry?: () => void
}) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <div className="mb-4 text-5xl" aria-hidden>😕</div>
      <h2 className="mb-2 text-2xl font-bold text-slate-900">{title}</h2>
      <p className="mb-6 text-lg text-slate-600">{message}</p>
      {onRetry && <button className="btn-primary" onClick={onRetry}>Try again</button>}
    </div>
  )
}

export function EmptyState({ icon = '📭', title, message, action }: {
  icon?: string; title: string; message?: string; action?: ReactNode
}) {
  return (
    <div className="py-14 text-center">
      <div className="mb-3 text-5xl" aria-hidden>{icon}</div>
      <h3 className="mb-1 text-xl font-bold text-slate-800">{title}</h3>
      {message && <p className="mx-auto mb-5 max-w-sm text-slate-500">{message}</p>}
      {action}
    </div>
  )
}

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'success' | 'info' | 'warn'; children: ReactNode }) {
  const styles = {
    error:   'bg-rose-50 border-rose-200 text-rose-800',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    info:    'bg-brand-50 border-brand-200 text-brand-800',
    warn:    'bg-amber-50 border-amber-200 text-amber-900',
  }[kind]
  const icon = { error: '⚠️', success: '✓', info: 'ℹ️', warn: '⚠️' }[kind]
  return (
    <div className={cx('animate-slide-up flex items-start gap-3 rounded-2xl border-2 p-4 text-base font-medium', styles)} role="alert">
      <span aria-hidden className="text-lg leading-none">{icon}</span>
      <div className="flex-1">{children}</div>
    </div>
  )
}

/** Step counter for the booking flow — "clear progress" (§35). */
export function Steps({ current, total, labels }: { current: number; total: number; labels?: string[] }) {
  return (
    <nav aria-label="Progress" className="mb-8">
      <div className="mb-2 flex items-center gap-2">
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            className={cx(
              'h-2 flex-1 rounded-full transition-colors',
              i < current ? 'bg-brand-600' : i === current ? 'bg-brand-400' : 'bg-slate-200'
            )}
          />
        ))}
      </div>
      <p className="text-sm font-semibold text-slate-500">
        Step {current + 1} of {total}{labels?.[current] ? ` · ${labels[current]}` : ''}
      </p>
    </nav>
  )
}

export function BackButton({ onClick, label = 'Back' }: { onClick: () => void; label?: string }) {
  return (
    <button onClick={onClick} className="mb-4 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-base font-semibold text-slate-600 hover:bg-slate-100">
      <span aria-hidden>←</span> {label}
    </button>
  )
}

export function StatusChip({ status }: { status: string }) {
  // Imported lazily to avoid a circular import with format.ts constants
  const meta = STATUS[status] ?? { label: status, icon: '•', cls: 'chip-done' }
  return (
    <span className={meta.cls}>
      <span aria-hidden>{meta.icon}</span> {meta.label}
    </span>
  )
}

const STATUS: Record<string, { label: string; icon: string; cls: string }> = {
  pending_checkin: { label: 'Waiting for check-in', icon: '🟡', cls: 'chip-wait' },
  checked_in:      { label: 'Checked in',           icon: '🟢', cls: 'chip-in'   },
  waiting:         { label: 'Waiting',              icon: '🟢', cls: 'chip-in'   },
  almost:          { label: 'Almost your turn',     icon: '🔶', cls: 'chip-call' },
  called:          { label: "It's your turn",       icon: '🔔', cls: 'chip-call' },
  serving:         { label: 'Being served',         icon: '💬', cls: 'chip-call' },
  completed:       { label: 'Completed',            icon: '✓',  cls: 'chip-done' },
  cancelled:       { label: 'Cancelled',            icon: '✕',  cls: 'chip-bad'  },
  no_show:         { label: 'No show',              icon: '—',  cls: 'chip-bad'  },
}

export function LiveDot({ on }: { on: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide">
      <span className={cx('h-2 w-2 rounded-full', on ? 'animate-pulse bg-emerald-500' : 'bg-slate-300')} />
      <span className={on ? 'text-emerald-600' : 'text-slate-400'}>{on ? 'Live' : 'Offline'}</span>
    </span>
  )
}

export function Modal({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="animate-slide-up w-full max-w-lg rounded-t-3xl bg-white p-6 shadow-lg sm:rounded-3xl"
        role="dialog" aria-modal="true" aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl font-bold">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="rounded-xl p-2 text-2xl leading-none text-slate-400 hover:bg-slate-100">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}
