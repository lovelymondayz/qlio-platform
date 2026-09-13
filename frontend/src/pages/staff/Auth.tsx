import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, ApiError, setSession } from '../../lib/api'
import { Alert } from '../../components/UI'
import type { Session } from '../../types'

export function LoginPage() {
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(''); setCode('')
    if (!email.trim() || !password) { setErr('Please enter your email and password.'); return }
    setBusy(true)
    try {
      const s = await api.post<Session>('/api/auth/login', { email: email.trim(), password })
      setSession(s)
      nav(s.setup_step > 0 && s.setup_step < 5 ? '/biz/setup' : '/biz', { replace: true })
    } catch (e) {
      const ex = e as ApiError
      setErr(ex.message); setCode(ex.code)
    } finally { setBusy(false) }
  }

  return (
    <AuthShell title="Sign in to Qlio" sub="Manage your bookings and queue.">
      <form onSubmit={submit} className="space-y-5">
        <div>
          <label className="label" htmlFor="e">Email</label>
          <input id="e" type="email" className={`field ${code === 'invalid_credentials' ? 'field-error' : ''}`}
            value={email} onChange={(e) => { setEmail(e.target.value); setErr('') }}
            autoComplete="email" placeholder="you@business.com" />
        </div>
        <div>
          <label className="label" htmlFor="p">Password</label>
          <input id="p" type="password" className={`field ${code === 'wrong_password' ? 'field-error' : ''}`}
            value={password} onChange={(e) => { setPassword(e.target.value); setErr('') }}
            autoComplete="current-password" placeholder="••••••••" />
        </div>
        {err && <Alert kind="error">{err}</Alert>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <p className="mt-6 text-center text-base text-slate-500">
        New here? <Link to="/biz/signup" className="font-bold text-brand-600 hover:underline">Create your Qlio page</Link>
      </p>
    </AuthShell>
  )
}

export function SignupPage() {
  const nav = useNavigate()
  const [f, setF] = useState({ business_name: '', owner_name: '', email: '', password: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setF({ ...f, [k]: e.target.value }); setErr('')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    if (f.business_name.trim().length < 2) { setErr('Please enter your business name.'); return }
    if (!f.email.includes('@')) { setErr('Please enter a valid email address.'); return }
    if (f.password.length < 8) { setErr('Password must be at least 8 characters.'); return }
    setBusy(true)
    try {
      const s = await api.post<Session>('/api/auth/signup', f)
      setSession(s)
      nav('/biz/setup', { replace: true })
    } catch (e) { setErr((e as ApiError).message) } finally { setBusy(false) }
  }

  return (
    <AuthShell title="Create your Qlio page" sub="Free to start. Ready in a few minutes.">
      <form onSubmit={submit} className="space-y-5">
        <div>
          <label className="label" htmlFor="bn">Business name</label>
          <input id="bn" className="field" value={f.business_name} onChange={set('business_name')} placeholder="e.g. Toko Budi" />
        </div>
        <div>
          <label className="label" htmlFor="on">Your name</label>
          <input id="on" className="field" value={f.owner_name} onChange={set('owner_name')} placeholder="e.g. Budi Santoso" autoComplete="name" />
        </div>
        <div>
          <label className="label" htmlFor="em">Email</label>
          <input id="em" type="email" className="field" value={f.email} onChange={set('email')} placeholder="you@business.com" autoComplete="email" />
        </div>
        <div>
          <label className="label" htmlFor="pw">Password</label>
          <input id="pw" type="password" className="field" value={f.password} onChange={set('password')} placeholder="At least 8 characters" autoComplete="new-password" />
        </div>
        {err && <Alert kind="error">{err}</Alert>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Creating…' : 'Start for free'}</button>
      </form>
      <p className="mt-6 text-center text-base text-slate-500">
        Already have an account? <Link to="/biz/login" className="font-bold text-brand-600 hover:underline">Sign in</Link>
      </p>
    </AuthShell>
  )
}

function AuthShell({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-primary from-brand-50 to-slate-50 px-5 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 block text-center text-2xl font-black text-brand-600">Qlio</Link>
        <div className="rounded-3xl bg-white p-8 shadow-xl">
          <h1 className="mb-1 text-2xl font-black text-slate-900">{title}</h1>
          <p className="mb-7 text-slate-500">{sub}</p>
          {children}
        </div>
      </div>
    </div>
  )
}
