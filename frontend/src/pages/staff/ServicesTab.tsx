import { useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { Alert, Spinner, EmptyState, Modal } from '../../components/UI'
import { money } from '../../lib/format'
import type { Service } from '../../types'

/** Service management — create, edit, deactivate. */
export default function ServicesTab() {
  const [rows, setRows] = useState<Service[] | null>(null)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [editing, setEditing] = useState<Partial<Service> | null>(null)
  const [busy, setBusy] = useState(false)

  const load = () => {
    api.aGet<{ services: Service[] }>('/api/staff/services')
      .then((d) => setRows(d.services))
      .catch((e: ApiError) => setErr(e.message))
  }
  useEffect(load, [])

  const save = async () => {
    if (!editing?.name?.trim()) { setMsg('Please enter a service name.'); return }
    setBusy(true); setMsg('')
    const body = {
      name: editing.name,
      description: editing.description ?? '',
      icon: editing.icon ?? '',
      duration_min: editing.duration_min ?? 30,
      buffer_min: editing.buffer_min ?? 0,
      price_cents: editing.price_cents ?? 0,
      ticket_prefix: editing.ticket_prefix || editing.name[0].toUpperCase(),
      allow_appointment: editing.allow_appointment ?? true,
      allow_queue: editing.allow_queue ?? true,
      max_daily: editing.max_daily ?? 0,
      sort_order: editing.sort_order ?? 0,
      is_active: editing.is_active ?? true,
    }
    try {
      if (editing.id) await api.aPut(`/api/staff/services/${editing.id}`, body)
      else await api.aPost('/api/staff/services', body)
      setEditing(null)
      load()
    } catch (e) { setMsg((e as ApiError).message) } finally { setBusy(false) }
  }

  const remove = async (s: Service) => {
    setBusy(true)
    try { await api.aDel(`/api/staff/services/${s.id}`); load() }
    catch (e) { setMsg((e as ApiError).message) } finally { setBusy(false) }
  }

  if (err) return <Alert kind="error">{err}</Alert>
  if (!rows) return <Spinner />

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900">Services</h2>
        <button className="btn-primary !min-h-0 !px-5 !py-3 !text-base"
          onClick={() => setEditing({ duration_min: 30, allow_appointment: true, allow_queue: true, is_active: true })}>
          + Add
        </button>
      </div>

      {msg && <div className="mb-4"><Alert kind="info">{msg}</Alert></div>}

      {rows.length === 0 ? (
        <EmptyState icon="🧰" title="No services yet" message="Add what your customers can book." />
      ) : (
        <ul className="space-y-2">
          {rows.map((s) => (
            <li key={s.id} className={`rounded-2xl bg-white p-4 shadow-sm ${!s.is_active && 'opacity-50'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-bold text-slate-800">
                    {s.icon && <span aria-hidden>{s.icon}</span>}
                    {s.name}
                    <span className="ticket-num text-xs text-brand-500">{s.ticket_prefix}</span>
                    {!s.is_active && <span className="chip-done">hidden</span>}
                  </p>
                  {s.description && <p className="truncate text-sm text-slate-500">{s.description}</p>}
                  <p className="mt-1 text-sm text-slate-400">
                    {s.duration_min} min
                    {s.price_cents > 0 && ` · ${money(s.price_cents)}`}
                    {' · '}
                    {[s.allow_appointment && 'appointments', s.allow_queue && 'queue'].filter(Boolean).join(' + ') || 'disabled'}
                    {s.max_daily > 0 && ` · max ${s.max_daily}/day`}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button className="rounded-lg px-3 py-2 text-sm font-bold text-brand-600 hover:bg-brand-50"
                    onClick={() => setEditing(s)}>Edit</button>
                  {s.is_active && (
                    <button className="rounded-lg px-3 py-2 text-sm font-bold text-slate-400 hover:bg-slate-100"
                      disabled={busy} onClick={() => remove(s)}>Hide</button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Edit service' : 'New service'}>
        {editing && (
          <div className="space-y-4">
            <div>
              <label className="label">Name</label>
              <input className="field" value={editing.name ?? ''} autoFocus
                onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Oil Change" />
            </div>
            <div>
              <label className="label">Description</label>
              <input className="field" value={editing.description ?? ''}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="Optional" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Minutes</label>
                <input type="number" className="field" value={editing.duration_min ?? 30}
                  onChange={(e) => setEditing({ ...editing, duration_min: Number(e.target.value) })} />
              </div>
              <div>
                <label className="label">Price</label>
                <input type="number" className="field" value={editing.price_cents ?? 0}
                  onChange={(e) => setEditing({ ...editing, price_cents: Number(e.target.value) })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Ticket letter</label>
                <input className="field uppercase" maxLength={4} value={editing.ticket_prefix ?? ''}
                  onChange={(e) => setEditing({ ...editing, ticket_prefix: e.target.value.toUpperCase() })} placeholder="A" />
              </div>
              <div>
                <label className="label">Max per day</label>
                <input type="number" className="field" value={editing.max_daily ?? 0}
                  onChange={(e) => setEditing({ ...editing, max_daily: Number(e.target.value) })} placeholder="0 = no limit" />
              </div>
            </div>
            <div className="space-y-2 rounded-2xl bg-slate-50 p-4">
              <Toggle label="Can be booked in advance" on={editing.allow_appointment ?? true}
                onChange={(v) => setEditing({ ...editing, allow_appointment: v })} />
              <Toggle label="Available in the queue" on={editing.allow_queue ?? true}
                onChange={(v) => setEditing({ ...editing, allow_queue: v })} />
              <Toggle label="Visible to customers" on={editing.is_active ?? true}
                onChange={(v) => setEditing({ ...editing, is_active: v })} />
            </div>
            <button className="btn-primary w-full" disabled={busy} onClick={save}>
              {busy ? 'Saving…' : 'Save service'}
            </button>
          </div>
        )}
      </Modal>
    </div>
  )
}

export function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="flex w-full items-center justify-between py-2 text-left">
      <span className="font-semibold text-slate-700">{label}</span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? 'bg-brand-600' : 'bg-slate-300'}`}>
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${on ? 'left-6' : 'left-1'}`} />
      </span>
    </button>
  )
}
