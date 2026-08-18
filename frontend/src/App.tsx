import { Routes, Route, Navigate } from 'react-router-dom'

import LandingPage from './pages/public/LandingPage'
import BusinessEntry from './pages/customer/BusinessEntry'
import BookingFlow from './pages/customer/BookingFlow'
import ReceiptPage from './pages/customer/ReceiptPage'
import FindBooking from './pages/customer/FindBooking'
import KioskPage from './pages/customer/KioskPage'
import DisplayScreen from './pages/customer/DisplayScreen'

import { LoginPage, SignupPage } from './pages/staff/Auth'
import SetupWizard from './pages/staff/SetupWizard'
import StaffLayout from './pages/staff/StaffLayout'
import DashboardPage from './pages/staff/DashboardPage'
import ScannerPage from './pages/staff/ScannerPage'
import QueuePage from './pages/staff/QueuePage'
import BookingsPage from './pages/staff/BookingsPage'
import AnalyticsPage from './pages/staff/AnalyticsPage'
import SettingsPage from './pages/staff/SettingsPage'

/**
 * Route order matters: every fixed path is declared before the catch-all
 * "/:slug" so a business slug can never shadow a reserved route.
 */
export default function App() {
  return (
    <Routes>
      {/* Marketing */}
      <Route path="/" element={<LandingPage />} />

      {/* Business auth + setup */}
      <Route path="/biz/login" element={<LoginPage />} />
      <Route path="/biz/signup" element={<SignupPage />} />
      <Route path="/biz/setup" element={<SetupWizard />} />

      {/* Authenticated business app */}
      <Route path="/biz" element={<StaffLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="scan" element={<ScannerPage />} />
        <Route path="queue" element={<QueuePage />} />
        <Route path="bookings" element={<BookingsPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      {/* Customer receipt — the temporary digital identity */}
      <Route path="/r/:token" element={<ReceiptPage />} />

      {/* Kiosk + waiting-room screen */}
      <Route path="/kiosk/:slug" element={<KioskPage />} />
      <Route path="/display/:slug" element={<DisplayScreen />} />

      {/* Public business pages — declared last */}
      <Route path="/:slug" element={<BusinessEntry />} />
      <Route path="/:slug/book" element={<BookingFlow />} />
      <Route path="/:slug/find" element={<FindBooking />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
