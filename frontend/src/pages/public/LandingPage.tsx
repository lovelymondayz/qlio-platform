import { Link } from 'react-router-dom'

const JOURNEY = [
  { n: '01', t: 'Customer opens Qlio',   d: 'They tap your link or scan your QR code. No app to install.' },
  { n: '02', t: 'Chooses a service',     d: 'Clear cards with duration and price. One tap.' },
  { n: '03', t: 'Books or joins queue',  d: 'Pick a time, or take a number for today.' },
  { n: '04', t: 'Receives a receipt',    d: 'A digital ticket with a QR code — no account needed.' },
  { n: '05', t: 'Arrives at your place', d: 'They bring the receipt on their phone, or a saved image.' },
  { n: '06', t: 'Staff scans the QR',    d: 'Your reception sees who they are in under a second.' },
  { n: '07', t: 'Customer is checked in', d: 'One tap and they enter the queue with a number.' },
  { n: '08', t: 'They watch the queue',  d: 'Their receipt updates live. No more asking "am I next?"' },
  { n: '09', t: "Qlio says: It's Your Turn!", d: 'With the exact counter or room to go to.' },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <span className="text-2xl font-black text-brand-600">Qlio</span>
        <nav className="flex items-center gap-2">
          <Link to="/biz/login" className="rounded-xl px-4 py-2.5 font-semibold text-slate-600 hover:bg-slate-50">Sign in</Link>
          <Link to="/biz/signup" className="rounded-xl bg-brand-600 px-5 py-2.5 font-bold text-white hover:bg-brand-700">Start free</Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-5 pb-16 pt-12 text-center sm:pt-20">
        <h1 className="text-5xl font-black leading-[1.05] tracking-tight text-slate-900 sm:text-7xl">
          Book. Scan.<br />Queue. <span className="text-brand-600">Done.</span>
        </h1>
        <p className="mt-6 text-2xl font-bold text-slate-700 sm:text-3xl">
          Appointments and queues without the headache.
        </p>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-500 sm:text-xl">
          Qlio makes it ridiculously simple for customers to book appointments, join queues,
          check in with a QR receipt, and know exactly when it's their turn.
        </p>
        <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to="/biz/signup" className="btn-primary btn-lg">Start for free</Link>
          <a href="#how" className="btn-secondary btn-lg">See how it works</a>
        </div>
        <p className="mt-6 text-base font-semibold text-slate-400">
          No app for your customers. No account for them either.
        </p>
      </section>

      {/* The one big idea */}
      <section className="border-y border-slate-100 bg-slate-50 py-16">
        <div className="mx-auto max-w-3xl px-5 text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-brand-600">The core idea</p>
          <p className="mt-4 text-3xl font-black leading-snug text-slate-900 sm:text-4xl">
            Customers should never need an account just to book an appointment or join a queue.
          </p>
          <p className="mt-5 text-lg text-slate-500">
            Their booking receipt becomes their temporary digital identity — a QR code they can
            save as an image and show at your counter.
          </p>
        </div>
      </section>

      {/* Journey */}
      <section id="how" className="mx-auto max-w-4xl px-5 py-20">
        <h2 className="text-center text-3xl font-black text-slate-900 sm:text-4xl">The complete journey</h2>
        <p className="mt-3 text-center text-lg text-slate-500">From "I need this done" to "thank you, goodbye".</p>

        <ol className="mt-14 space-y-3">
          {JOURNEY.map((s, i) => (
            <li key={s.n} className="relative">
              <div className="flex gap-5 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
                <span className={`ticket-num shrink-0 text-2xl ${i === 8 ? 'text-brand-600' : 'text-slate-300'}`}>
                  {s.n}
                </span>
                <div>
                  <p className={`text-xl font-bold ${i === 8 ? 'text-brand-700' : 'text-slate-900'}`}>{s.t}</p>
                  <p className="mt-1 text-base text-slate-500">{s.d}</p>
                </div>
              </div>
              {i < JOURNEY.length - 1 && (
                <div className="mx-auto h-3 w-0.5 bg-slate-200" aria-hidden />
              )}
            </li>
          ))}
        </ol>
      </section>

      {/* Value */}
      <section className="border-t border-slate-100 bg-slate-50 py-20">
        <div className="mx-auto grid max-w-5xl gap-6 px-5 sm:grid-cols-2">
          <div className="rounded-3xl bg-white p-8 shadow-sm">
            <p className="text-sm font-bold uppercase tracking-widest text-brand-600">For customers</p>
            <ul className="mt-5 space-y-3 text-lg text-slate-700">
              <Li>Less waiting around</Li>
              <Li>No confusion about what to do</Li>
              <Li>No account, no password, no app</Li>
              <Li>Know exactly when it's your turn</Li>
            </ul>
          </div>
          <div className="rounded-3xl bg-white p-8 shadow-sm">
            <p className="text-sm font-bold uppercase tracking-widest text-brand-600">For businesses</p>
            <ul className="mt-5 space-y-3 text-lg text-slate-700">
              <Li>Less work at reception</Li>
              <Li>Organised, visible queues</Li>
              <Li>Fewer missed appointments</Li>
              <Li>Real-time view of your day</Li>
              <Li>Set up in a few minutes</Li>
            </ul>
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section className="mx-auto max-w-4xl px-5 py-20 text-center">
        <h2 className="text-3xl font-black text-slate-900">Built for almost any service business</h2>
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {['Clinics', 'Dentists', 'Auto workshops', 'Barbershops', 'Hair salons', 'Beauty salons',
            'Repair shops', 'Personal trainers', 'Consultants', 'Public services', 'Restaurants',
            'Car washes', 'Pet grooming', 'Photo studios'].map((t) => (
            <span key={t} className="rounded-full bg-slate-100 px-4 py-2 text-base font-semibold text-slate-600">{t}</span>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-brand-600 py-20 text-center text-white">
        <div className="mx-auto max-w-2xl px-5">
          <h2 className="text-4xl font-black sm:text-5xl">Ready in minutes</h2>
          <p className="mt-4 text-xl text-brand-100">
            Answer five questions and your Qlio page is live, with a QR code you can print today.
          </p>
          <Link to="/biz/signup"
            className="mt-9 inline-flex min-h-[4rem] items-center justify-center rounded-2xl bg-white px-10 text-xl font-black text-brand-700 hover:bg-brand-50">
            Start for free
          </Link>
        </div>
      </section>

      <footer className="border-t border-slate-100 py-10 text-center text-sm text-slate-400">
        <p className="mb-2 text-lg font-black text-slate-500">Qlio</p>
        <p>Book. Scan. Queue. Done.</p>
        <p className="mt-4">
          <Link to="/biz/login" className="font-semibold hover:text-brand-600">Business sign in</Link>
        </p>
      </footer>
    </div>
  )
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 text-emerald-500" aria-hidden>✓</span>
      <span>{children}</span>
    </li>
  )
}
