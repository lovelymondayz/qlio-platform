package models

import "time"

type Business struct {
	ID                int64  `json:"id"`
	Slug              string `json:"slug"`
	Name              string `json:"name"`
	Category          string `json:"category"`
	Tagline           string `json:"tagline"`
	LogoURL           string `json:"logo_url"`
	Address           string `json:"address"`
	MapURL            string `json:"map_url"`
	Phone             string `json:"phone"`
	Email             string `json:"email"`
	Timezone          string `json:"timezone"`
	Currency          string `json:"currency"`
	Locale            string `json:"locale"`
	ThemeColor        string `json:"theme_color"`
	AllowAppointments bool   `json:"allow_appointments"`
	AllowQueue        bool   `json:"allow_queue"`
	AllowWalkin       bool   `json:"allow_walkin"`
	CounterLabel      string `json:"counter_label"`
	SetupStep         int    `json:"setup_step"`
	IsActive          bool   `json:"is_active"`
}

type Staff struct {
	ID         int64      `json:"id"`
	BusinessID *int64     `json:"business_id"`
	Email      string     `json:"email"`
	Name       string     `json:"name"`
	Role       string     `json:"role"`
	Title      string     `json:"title"`
	AvatarURL  string     `json:"avatar_url"`
	IsProvider bool       `json:"is_provider"`
	IsSuper    bool       `json:"is_super"`
	IsActive   bool       `json:"is_active"`
	LastLogin  *time.Time `json:"last_login_at,omitempty"`
}

type Service struct {
	ID               int64  `json:"id"`
	BusinessID       int64  `json:"business_id"`
	Name             string `json:"name"`
	Description      string `json:"description"`
	Icon             string `json:"icon"`
	DurationMin      int    `json:"duration_min"`
	BufferMin        int    `json:"buffer_min"`
	PriceCents       int64  `json:"price_cents"`
	TicketPrefix     string `json:"ticket_prefix"`
	AllowAppointment bool   `json:"allow_appointment"`
	AllowQueue       bool   `json:"allow_queue"`
	MaxDaily         int    `json:"max_daily"`
	SortOrder        int    `json:"sort_order"`
	IsActive         bool   `json:"is_active"`
}

type Counter struct {
	ID         int64  `json:"id"`
	BusinessID int64  `json:"business_id"`
	Name       string `json:"name"`
	Kind       string `json:"kind"`
	StaffID    *int64 `json:"staff_id"`
	StaffName  string `json:"staff_name,omitempty"`
	IsActive   bool   `json:"is_active"`
	SortOrder  int    `json:"sort_order"`
}

type ScheduleDay struct {
	Weekday    int     `json:"weekday"`
	IsOpen     bool    `json:"is_open"`
	OpenTime   string  `json:"open_time"`
	CloseTime  string  `json:"close_time"`
	BreakStart *string `json:"break_start"`
	BreakEnd   *string `json:"break_end"`
}

type Settings struct {
	SlotIntervalMin  int  `json:"slot_interval_min"`
	MaxDaysAhead     int  `json:"max_days_ahead"`
	TicketResetDaily bool `json:"ticket_reset_daily"`
	NotifyBrowser    bool `json:"notify_browser"`
	NotifyEmail      bool `json:"notify_email"`
	NotifySMS        bool `json:"notify_sms"`
	NotifyWhatsApp   bool `json:"notify_whatsapp"`
	AlmostTurnAhead  int  `json:"almost_turn_ahead"`
	AutoNoShowMin    int  `json:"auto_noshow_min"`
}
