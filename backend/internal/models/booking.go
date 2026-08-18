package models

import "time"

type Booking struct {
	ID            int64      `json:"id"`
	BusinessID    int64      `json:"business_id"`
	ServiceID     *int64     `json:"service_id"`
	CustomerID    *int64     `json:"customer_id"`
	StaffID       *int64     `json:"staff_id"`
	Kind          string     `json:"kind"`
	Origin        string     `json:"origin"`
	BookingCode   string     `json:"booking_code"`
	ReceiptToken  string     `json:"receipt_token,omitempty"`
	CustomerName  string     `json:"customer_name"`
	CustomerPhone string     `json:"customer_phone"`
	CustomerEmail string     `json:"customer_email"`
	Notes         string     `json:"notes"`
	ServiceDate   string     `json:"service_date"`
	ScheduledAt   *time.Time `json:"scheduled_at"`
	PriceCents    int64      `json:"price_cents"`
	Status        string     `json:"status"`
	CheckedInAt   *time.Time `json:"checked_in_at"`
	CompletedAt   *time.Time `json:"completed_at"`
	CreatedAt     time.Time  `json:"created_at"`

	ServiceName string `json:"service_name,omitempty"`
	StaffName   string `json:"staff_name,omitempty"`
}

type Ticket struct {
	ID            int64      `json:"id"`
	BookingID     int64      `json:"booking_id"`
	ServiceID     *int64     `json:"service_id"`
	CounterID     *int64     `json:"counter_id"`
	CounterName   string     `json:"counter_name,omitempty"`
	ServedBy      *int64     `json:"served_by"`
	ServedByName  string     `json:"served_by_name,omitempty"`
	ServiceDate   string     `json:"service_date"`
	Prefix        string     `json:"prefix"`
	Seq           int        `json:"seq"`
	TicketNumber  string     `json:"ticket_number"`
	State         string     `json:"state"`
	IssuedAt      time.Time  `json:"issued_at"`
	CalledAt      *time.Time `json:"called_at"`
	CompletedAt   *time.Time `json:"completed_at"`
	ServiceName   string     `json:"service_name,omitempty"`
	CustomerName  string     `json:"customer_name,omitempty"`
	Kind          string     `json:"kind,omitempty"`
	ScheduledTime string     `json:"scheduled_time,omitempty"`
	RecallCount   int        `json:"recall_count"`
}

// Receipt is the full public payload served at /api/public/receipt/:token
type Receipt struct {
	BookingCode   string `json:"booking_code"`
	Status        string `json:"status"`
	Kind          string `json:"kind"`
	CustomerName  string `json:"customer_name"`
	PhoneMasked   string `json:"phone_masked"`
	ServiceName   string `json:"service_name"`
	ServiceDate   string `json:"service_date"`
	ScheduledTime string `json:"scheduled_time"`
	PriceCents    int64  `json:"price_cents"`
	Notes         string `json:"notes"`
	StaffName     string `json:"staff_name"`
	ReceiptToken  string `json:"receipt_token"`

	TicketNumber string `json:"ticket_number"`
	NowServing   string `json:"now_serving"`
	PeopleAhead  int    `json:"people_ahead"`
	Position     int    `json:"position"`
	EstWaitMin   int    `json:"est_wait_min"`
	CounterName  string `json:"counter_name"`
	CheckedIn    bool   `json:"checked_in"`

	Business BusinessPublic `json:"business"`
}

type BusinessPublic struct {
	Slug         string `json:"slug"`
	Name         string `json:"name"`
	LogoURL      string `json:"logo_url"`
	Address      string `json:"address"`
	MapURL       string `json:"map_url"`
	Phone        string `json:"phone"`
	Currency     string `json:"currency"`
	ThemeColor   string `json:"theme_color"`
	CounterLabel string `json:"counter_label"`
}

type QueueSnapshot struct {
	NowServing  []Ticket `json:"now_serving"`
	Waiting     []Ticket `json:"waiting"`
	Completed   int      `json:"completed"`
	WaitingCnt  int      `json:"waiting_count"`
	EstWaitMin  int      `json:"est_wait_min"`
	ActiveDesks int      `json:"active_desks"`
}
