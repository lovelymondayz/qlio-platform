import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom'
import { clearSession, getSession } from '../../lib/api'

interface NavItem { to: string; label: string; icon: string; exact?: boolean }

const NAV: NavItem[] = [
  { to: '/biz',          label: 'Home',     icon: '🏠', exact: true },
  { to: '/biz/scan',     label: 'Scan',     icon: '📷' },
  { to: '/biz/queue',    label: 'Queue',    icon: '🎟️' },
  { to: '/biz/bookings', label: 'Bookings', icon: '📅' },
]

const MANAGER_NAV: NavItem[] = [
  { to: '/biz/analytics', label: 'Insights', icon: '📊' },
  { to: '/biz/settings',  label: 'Settings', icon: '⚙️' },
]

/** Authenticated shell: sidebar on desktop, bottom tab bar on mobile. */
export default function StaffLayout() {
  const session = getSession()
  const loc = useLocation()

  if (!session) return <Navigate to="/biz/login" replace state={{ from: loc.pathname }} />

  // Force setup completion before the dashboard is usable
  if (session.setup_step > 0 && session.setup_step < 5 && !loc.pathname.startsWith('/biz/setup')) {
    return <Navigate to="/biz/setup" replace />
  }

  const isManager = ['owner', 'manager'].includes(session.role) || session.is_super
  const items = isManager ? [...NAV, ...MANAGER_NAV] : NAV

  const signOut = () => { clearSession(); location.href = '/biz/login' }

  return (
    <div className="min-h-screen bg-slate-50 pb-20 sm:flex sm:pb-0">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white p-5 sm:flex sm:flex-col">
        <p className="mb-8 text-2xl font-black text-brand-600">Qlio</p>
        <nav className="flex-1 space-y-1">
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.exact ?? false}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-4 py-3 text-base font-semibold transition ${
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50'
                }`}>
              <span aria-hidden>{n.icon}</span>{n.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-100 pt-4">
          <p className="truncate px-4 text-sm font-bold text-slate-700">{session.name}</p>
          <p className="mb-3 truncate px-4 text-xs capitalize text-slate-400">{session.role}</p>
          <button onClick={signOut} className="w-full rounded-xl px-4 py-2.5 text-left text-sm font-semibold text-slate-500 hover:bg-slate-50">
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 sm:hidden">
        <p className="text-xl font-black text-brand-600">Qlio</p>
        <button onClick={signOut} className="text-sm font-semibold text-slate-500">Sign out</button>
      </header>

      <main className="min-w-0 flex-1">
        <Outlet />
      </main>

      {/* Mobile bottom tabs — large touch targets */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-slate-200 bg-white sm:hidden">
        {items.slice(0, 5).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.exact ?? false}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-3 text-xs font-bold transition ${
                isActive ? 'text-brand-600' : 'text-slate-400'
              }`}>
            <span className="text-xl" aria-hidden>{n.icon}</span>
            {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
