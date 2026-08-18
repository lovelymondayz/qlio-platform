import { useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { Alert, Spinner, EmptyState, Modal } from '../../components/UI'
import { Toggle } from './ServicesTab'
import type { Counter, StaffMember } from '../../types'

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner', manager: 'Manager', receptionist: 'Receptionist',
  staff: 'Staff', provider: 'Service Provider',
}

/** Counters + staff management (§24, §26). */
export default function TeamTab() {
  const [counters, setCounters] = useState<Counter[] | null>(null)
  const [team, setTeam] = useState<StaffMember[] | null>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [editCounter, setEditCounter] = useState<Partial<Counter> | null>(null)
  const [editStaff, setEditStaff] = useState<(Partial<StaffMember> & { password?: string }) | null>(null)

  const load = () => {
    api.aGet<{ counters: Counter[] }>('/api/staff/counters').then((d) => setCounters(d.counters)).catch(() => setCounters([]))
    api.aGet<{ staff: StaffMember[] }>('/api/staff/staff').then((d) => setTeam(d.staff)).catch(() => setTeam([]))
  }
  useEffect(load, [])

  const saveCounter = async () => {
    if (!editCounter?.name?.trim()) { setMsg('Please enter a name.'); return }
    setBusy(true); setMsg('')
    const body = {
      name: editCounter.name, kind: editCounter.kind || 'counter',
      staff_id: editCounter.staff_id ?? null,
      is_active: editCounter.is_active ?? true, sort_order: editCounter.sort_order ?? 0,
    }
    try {
      if (editCounter.id) await api.aPut(`/api/staff/counters/${editCounter.id}`, body)
      else await api.aPost('/api/staff/counters', body)
      setEditCounter(null); load()
    } catch (e) { setMsg((e as ApiError).message) } finally { setBusy(false) }
  }

  const saveStaff = async () => {
    if (!editStaff?.name?.trim()) { setMsg('Please enter a name.'); return }
    setBusy(true); setMsg('')
    try {
      if (editStaff.id) {
        await api.aPut(`/api/staff/staff/${editStaff.id}`, {
          name: editStaff.name, role: editStaff.role || 'staff', title: editStaff.title ?? '',
          is_provider: editStaff.is_provider ?? false, is_active: editStaff.is_active ?? true,
          password: editStaff.password ?? '',
        })
      } else {
        await api.aPost('/api/staff/staff', {
          email: editStaff.email ?? '', password: editStaff.password ?? '',
          name: editStaff.name, role: editStaff.role || 'staff', title: editStaff.title ?? '',
          is_provider: editStaff.is_provider ?? false,
        })
      }
      setEditStaff(null); load()
    } catch (e) { setMsg((e as ApiError).message) } finally { setBusy(false) }
  }

  const delCounter = async (c: Counter) => {
    setBusy(true)
    try { await api.aDel(`/api/staff/counters/${c.id}`); load() }
    catch (e) { setMsg((e as ApiError).message) } finally { setBusy(false) }
  }

  const delStaff = async (s: StaffMember) => {
    setBusy(true)
    try { await api.aDel(`/api/staff/staff/${s.id}`); load() }
    catch (e) { setMsg((e as ApiError).message) } finally { setBusy(false) }
  }

  if (!counters || !team) return <Spinner />

  const providers = team.filter((s) => s.is_provider && s.is_active)

  return (
    <div className="space-y-12">
      {msg && <Alert kind="info">{msg}</Alert>}

      {/* COUNTERS */}
      <section>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">Counters & Rooms</h2>
          <button className="btn-primary !min-h-0 !px-5 !py-3 !text-base"
            onClick={() => setEditCounter({ kind: 'counter', is_active: true, sort_order: counters.length + 1 })}>
            + Add
          </button>
        </div>

        {counters.length === 0 ? (
          <EmptyState icon="🪑" title="No counters" message="Add at least one so staff can call customers to a place." />
        ) : (
          <ul className="space-y-2">
            {counters.map((c) => (
              <li key={c.id} className={`flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ${!c.is_active && 'opacity-50'}`}>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-slate-800">{c.name}</span>
                  <span className="block text-sm capitalize text-slate-400">
                    {c.kind}{c.staff_name && ` · ${c.staff_name}`}{!c.is_active && ' · closed'}
                  </span>
                </span>
                <button className="rounded-lg px-3 py-2 text-sm font-bold text-brand-600 hover:bg-brand-50"
                  onClick={() => setEditCounter(c)}>Edit</button>
                <button className="rounded-lg px-3 py-2 text-sm font-bold text-rose-400 hover:bg-rose-50"
                  disabled={busy} onClick={() => delCounter(c)}>Delete</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* STAFF */}
      <section>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">Team</h2>
          <button className="btn-primary !min-h-0 !px-5 !py-3 !text-base"
            onClick={() => setEditStaff({ role: 'receptionist', is_active: true })}>+ Add</button>
        </div>

        <ul className="space-y-2">
          {team.map((s) => (
            <li key={s.id} className={`flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ${!s.is_active && 'opacity-50'}`}>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700">
                {s.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-slate-800">{s.name}</span>
                <span className="block truncate text-sm text-slate-400">
                  {ROLE_LABELS[s.role] ?? s.role}{s.title && ` · ${s.title}`} · {s.email}
                </span>
              </span>
              {s.role !== 'owner' && (
                <>
                  <button className="rounded-lg px-3 py-2 text-sm font-bold text-brand-600 hover:bg-brand-50"
                    onClick={() => setEditStaff(s)}>Edit</button>
                  {s.is_active && (
                    <button className="rounded-lg px-3 py-2 text-sm font-bold text-slate-400 hover:bg-slate-100"
                      disabled={busy} onClick={() => delStaff(s)}>Disable</button>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* COUNTER MODAL */}
      <Modal open={!!editCounter} onClose={() => setEditCounter(null)} title={editCounter?.id ? 'Edit counter' : 'New counter'}>
        {editCounter && (
          <div className="space-y-4">
            <div>
              <label className="label">Name</label>
              <input className="field" value={editCounter.name ?? ''} autoFocus
                onChange={(e) => setEditCounter({ ...editCounter, name: e.target.value })} placeholder="Counter 1" />
            </div>
            <div>
              <label className="label">Type</label>
              <select className="field" value={editCounter.kind ?? 'counter'}
                onChange={(e) => setEditCounter({ ...editCounter, kind: e.target.value })}>
                <option value="counter">Counter</option>
                <option value="room">Room</option>
                <option value="desk">Service desk</option>
                <option value="bay">Workshop bay</option>
                <option value="station">Station</option>
              </select>
            </div>
            {providers.length > 0 && (
              <div>
                <label className="label">Assigned to</label>
                <select className="field" value={editCounter.staff_id ?? ''}
                  onChange={(e) => setEditCounter({ ...editCounter, staff_id: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">Nobody</option>
                  {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
            <div className="rounded-2xl bg-slate-50 p-4">
              <Toggle label="Open for service" on={editCounter.is_active ?? true}
                onChange={(v) => setEditCounter({ ...editCounter, is_active: v })} />
            </div>
            <button className="btn-primary w-full" disabled={busy} onClick={saveCounter}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </Modal>

      {/* STAFF MODAL */}
      <Modal open={!!editStaff} onClose={() => setEditStaff(null)} title={editStaff?.id ? 'Edit team member' : 'Add team member'}>
        {editStaff && (
          <div className="space-y-4">
            <div>
              <label className="label">Name</label>
              <input className="field" value={editStaff.name ?? ''} autoFocus
                onChange={(e) => setEditStaff({ ...editStaff, name: e.target.value })} placeholder="Dr. Sarah" />
            </div>
            {!editStaff.id && (
              <div>
                <label className="label">Email</label>
                <input type="email" className="field" value={editStaff.email ?? ''}
                  onChange={(e) => setEditStaff({ ...editStaff, email: e.target.value })} placeholder="sarah@clinic.com" />
              </div>
            )}
            <div>
              <label className="label">
                {editStaff.id ? 'New password (leave blank to keep)' : 'Password'}
              </label>
              <input type="password" className="field" value={editStaff.password ?? ''}
                onChange={(e) => setEditStaff({ ...editStaff, password: e.target.value })} placeholder="At least 8 characters" />
            </div>
            <div>
              <label className="label">Role</label>
              <select className="field" value={editStaff.role ?? 'staff'}
                onChange={(e) => setEditStaff({ ...editStaff, role: e.target.value })}>
                <option value="manager">Manager — full access except owner settings</option>
                <option value="receptionist">Receptionist — scan, check in, queue</option>
                <option value="staff">Staff — scan, check in, queue</option>
                <option value="provider">Service Provider — serves customers</option>
              </select>
            </div>
            <div>
              <label className="label">Job title</label>
              <input className="field" value={editStaff.title ?? ''}
                onChange={(e) => setEditStaff({ ...editStaff, title: e.target.value })} placeholder="Dentist" />
            </div>
            <div className="space-y-2 rounded-2xl bg-slate-50 p-4">
              <Toggle label="Customers can book with this person" on={editStaff.is_provider ?? false}
                onChange={(v) => setEditStaff({ ...editStaff, is_provider: v })} />
              {editStaff.id && (
                <Toggle label="Account active" on={editStaff.is_active ?? true}
                  onChange={(v) => setEditStaff({ ...editStaff, is_active: v })} />
              )}
            </div>
            <button className="btn-primary w-full" disabled={busy} onClick={saveStaff}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </Modal>
    </div>
  )
}
