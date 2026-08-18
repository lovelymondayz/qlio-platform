import { useState } from 'react'
import BusinessTab from './BusinessTab'
import ServicesTab from './ServicesTab'
import TeamTab from './TeamTab'

type Tab = 'business' | 'services' | 'team'

/** Settings shell — three focused tabs instead of one dense admin screen. */
export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('business')

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'business', label: 'Business', icon: '🏢' },
    { id: 'services', label: 'Services', icon: '🧰' },
    { id: 'team', label: 'Team', icon: '👥' },
  ]

  return (
    <div className="mx-auto max-w-3xl px-5 py-6">
      <h1 className="mb-5 text-2xl font-black text-slate-900">Settings</h1>

      <div className="mb-8 flex gap-1 rounded-2xl bg-slate-100 p-1.5">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 rounded-xl py-3 text-sm font-bold transition sm:text-base ${
              tab === t.id ? 'bg-white text-brand-700 shadow' : 'text-slate-500'
            }`}>
            <span className="mr-1" aria-hidden>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {tab === 'business' && <BusinessTab />}
      {tab === 'services' && <ServicesTab />}
      {tab === 'team' && <TeamTab />}
    </div>
  )
}
