// Shared API types — mirror the Go structs in backend/internal/models

export interface Business {
  id: number
  slug: string
  name: string
  category: string
  tagline: string
  logo_url: string
  address: string
  map_url: string
  phone: string
  email?: string
  timezone: string
  currency: string
  locale: string
  theme_color: string
  allow_appointments: boolean
  allow_queue: boolean
  allow_walkin: boolean
  counter_label: string
  setup_step: number
  is_active?: boolean
}

export interface Service {
  id: number
  business_id: number
  name: string
  description: string
  icon: string
  duration_min: number
  buffer_min: number
  price_cents: number
  ticket_prefix: string
  allow_appointment: boolean
  allow_queue: boolean
  max_daily: number
  sort_order: number
  is_active: boolean
}

export interface ScheduleDay {
  weekday: number
  is_open: boolean
  open_time: string
  close_time: string
  break_start?: string | null
  break_end?: string | null
}

export interface Counter {
  id: number
  name: string
  kind: string
  staff_id?: number | null
  staff_name?: string
  is_active: boolean
  sort_order: number
}

export interface StaffMember {
  id: number
  email: string
  name: string
  role: string
  title: string
  is_provider: boolean
  is_active: boolean
  last_login_at?: string | null
}

export interface BusinessPublic {
  slug: string
  name: string
  logo_url: string
  address: string
  map_url: string
  phone: string
  currency: string
  theme_color: string
  counter_label: string
}

export interface PublicBusinessResponse {
  business: Business
  services: Service[]
  schedule: ScheduleDay[]
  now_serving: string
  waiting: number
  est_wait: number
}

export interface Slot {
  time: string
  available: boolean
}

export interface SlotsResponse {
  date: string
  is_open: boolean
  slots: Slot[]
  open?: string
  close?: string
  duration_min?: number
}

export type BookingStatus =
  | 'pending_checkin' | 'checked_in' | 'waiting' | 'almost'
  | 'called' | 'serving' | 'completed' | 'cancelled' | 'no_show'

export interface Receipt {
  booking_code: string
  status: BookingStatus
  kind: 'appointment' | 'queue'
  customer_name: string
  phone_masked: string
  service_name: string
  service_date: string
  scheduled_time: string
  price_cents: number
  notes: string
  staff_name: string
  receipt_token: string
  ticket_number: string
  now_serving: string
  people_ahead: number
  position: number
  est_wait_min: number
  counter_name: string
  checked_in: boolean
  business: BusinessPublic
}

export interface Ticket {
  id: number
  booking_id: number
  ticket_number: string
  state: string
  issued_at: string
  called_at?: string | null
  recall_count: number
  counter_name?: string
  served_by_name?: string
  service_name?: string
  customer_name?: string
  kind?: string
  scheduled_time?: string
}

export interface QueueSnapshot {
  now_serving: Ticket[]
  waiting: Ticket[]
  completed: number
  waiting_count: number
  est_wait_min: number
  active_desks: number
}

export interface ScanResult {
  found: boolean
  booking_id: number
  receipt_token: string
  booking_code: string
  customer_name: string
  customer_phone: string
  service_name: string
  kind: string
  service_date: string
  scheduled_time: string
  status: BookingStatus
  ticket_number: string
  notes: string
  can_check_in: boolean
  reason: string
}

export interface CheckInResult {
  status: string
  ticket_number: string
  customer_name: string
  people_ahead: number
  est_wait_min: number
  receipt_token: string
}

export interface DashboardStats {
  date: string
  appointments: number
  waiting: number
  serving: number
  completed: number
  cancelled: number
  no_show: number
  walkins: number
  avg_wait_min: number
  avg_service_min: number
  now_serving: string
}

export interface BookingRow {
  id: number
  booking_code: string
  kind: string
  origin: string
  customer_name: string
  customer_phone: string
  service_date: string
  scheduled_time: string
  status: BookingStatus
  price_cents: number
  notes: string
  service_name: string
  staff_name: string
  ticket_number: string
  receipt_token: string
}

export interface Session {
  token: string
  business_slug: string
  business_id: number
  role: string
  name: string
  is_super?: boolean
  setup_step: number
}

export interface AnalyticsResponse {
  days: number
  daily: { date: string; total: number; completed: number; no_show: number; cancelled: number }[]
  peak_hours: { hour: number; count: number }[]
  top_services: { service: string; count: number }[]
  total: number
  completed: number
  no_show: number
  no_show_rate: number
  avg_service_min: number
}
