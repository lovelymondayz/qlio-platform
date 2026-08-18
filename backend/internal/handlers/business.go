package handlers

import (
	"net/http"

	"qlio/backend/internal/db"
	"qlio/backend/internal/middleware"
	"qlio/backend/internal/util"

	"github.com/gin-gonic/gin"
)

// GET /api/staff/business
func GetBusiness(c *gin.Context) {
	bizID := middleware.BizID(c)
	var b struct {
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
		ThemeColor        string `json:"theme_color"`
		AllowAppointments bool   `json:"allow_appointments"`
		AllowQueue        bool   `json:"allow_queue"`
		AllowWalkin       bool   `json:"allow_walkin"`
		CounterLabel      string `json:"counter_label"`
		SetupStep         int    `json:"setup_step"`
	}
	err := db.Pool.QueryRow(c, `
		SELECT id, slug, name, category, tagline, logo_url, address, map_url, phone, email,
		       timezone, currency, theme_color, allow_appointments, allow_queue, allow_walkin,
		       counter_label, setup_step
		FROM businesses WHERE id=$1`, bizID).
		Scan(&b.ID, &b.Slug, &b.Name, &b.Category, &b.Tagline, &b.LogoURL, &b.Address,
			&b.MapURL, &b.Phone, &b.Email, &b.Timezone, &b.Currency, &b.ThemeColor,
			&b.AllowAppointments, &b.AllowQueue, &b.AllowWalkin, &b.CounterLabel, &b.SetupStep)
	if err != nil {
		util.NotFound(c, "Business not found.")
		return
	}

	var s struct {
		SlotIntervalMin int  `json:"slot_interval_min"`
		MaxDaysAhead    int  `json:"max_days_ahead"`
		AlmostTurnAhead int  `json:"almost_turn_ahead"`
		NotifyBrowser   bool `json:"notify_browser"`
	}
	db.Pool.QueryRow(c, `
		SELECT slot_interval_min, max_days_ahead, almost_turn_ahead, notify_browser
		FROM business_settings WHERE business_id=$1`, bizID).
		Scan(&s.SlotIntervalMin, &s.MaxDaysAhead, &s.AlmostTurnAhead, &s.NotifyBrowser)

	c.JSON(http.StatusOK, gin.H{
		"business": b, "settings": s, "schedule": listSchedule(c, bizID),
	})
}

type updateBizReq struct {
	Name              *string `json:"name"`
	Category          *string `json:"category"`
	Tagline           *string `json:"tagline"`
	LogoURL           *string `json:"logo_url"`
	Address           *string `json:"address"`
	MapURL            *string `json:"map_url"`
	Phone             *string `json:"phone"`
	Email             *string `json:"email"`
	Timezone          *string `json:"timezone"`
	Currency          *string `json:"currency"`
	ThemeColor        *string `json:"theme_color"`
	AllowAppointments *bool   `json:"allow_appointments"`
	AllowQueue        *bool   `json:"allow_queue"`
	AllowWalkin       *bool   `json:"allow_walkin"`
	CounterLabel      *string `json:"counter_label"`
	SetupStep         *int    `json:"setup_step"`
	SlotIntervalMin   *int    `json:"slot_interval_min"`
	AlmostTurnAhead   *int    `json:"almost_turn_ahead"`
}

// PUT /api/staff/business
func UpdateBusiness(c *gin.Context) {
	bizID := middleware.BizID(c)
	var r updateBizReq
	if err := c.ShouldBindJSON(&r); err != nil {
		util.BadRequest(c, "Please check the form.")
		return
	}
	_, err := db.Pool.Exec(c, `
		UPDATE businesses SET
			name = COALESCE($2, name),
			category = COALESCE($3, category),
			tagline = COALESCE($4, tagline),
			logo_url = COALESCE($5, logo_url),
			address = COALESCE($6, address),
			map_url = COALESCE($7, map_url),
			phone = COALESCE($8, phone),
			email = COALESCE($9, email),
			timezone = COALESCE($10, timezone),
			currency = COALESCE($11, currency),
			theme_color = COALESCE($12, theme_color),
			allow_appointments = COALESCE($13, allow_appointments),
			allow_queue = COALESCE($14, allow_queue),
			allow_walkin = COALESCE($15, allow_walkin),
			counter_label = COALESCE($16, counter_label),
			setup_step = COALESCE($17, setup_step),
			updated_at = now()
		WHERE id=$1`,
		bizID, r.Name, r.Category, r.Tagline, r.LogoURL, r.Address, r.MapURL, r.Phone,
		r.Email, r.Timezone, r.Currency, r.ThemeColor, r.AllowAppointments, r.AllowQueue,
		r.AllowWalkin, r.CounterLabel, r.SetupStep)
	if err != nil {
		util.Server(c, err)
		return
	}
	if r.SlotIntervalMin != nil || r.AlmostTurnAhead != nil {
		db.Pool.Exec(c, `
			UPDATE business_settings SET
				slot_interval_min = COALESCE($2, slot_interval_min),
				almost_turn_ahead = COALESCE($3, almost_turn_ahead),
				updated_at = now()
			WHERE business_id=$1`, bizID, r.SlotIntervalMin, r.AlmostTurnAhead)
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type scheduleReq struct {
	Days []struct {
		Weekday   int    `json:"weekday"`
		IsOpen    bool   `json:"is_open"`
		OpenTime  string `json:"open_time"`
		CloseTime string `json:"close_time"`
	} `json:"days"`
}

// PUT /api/staff/schedule
func UpdateSchedule(c *gin.Context) {
	bizID := middleware.BizID(c)
	var r scheduleReq
	if err := c.ShouldBindJSON(&r); err != nil {
		util.BadRequest(c, "Please check the schedule.")
		return
	}
	for _, d := range r.Days {
		if d.Weekday < 0 || d.Weekday > 6 {
			continue
		}
		open, close_ := d.OpenTime, d.CloseTime
		if open == "" {
			open = "09:00"
		}
		if close_ == "" {
			close_ = "17:00"
		}
		_, err := db.Pool.Exec(c, `
			INSERT INTO business_schedule (business_id, weekday, is_open, open_time, close_time)
			VALUES ($1,$2,$3,$4::time,$5::time)
			ON CONFLICT (business_id, weekday) DO UPDATE
			SET is_open=EXCLUDED.is_open, open_time=EXCLUDED.open_time, close_time=EXCLUDED.close_time`,
			bizID, d.Weekday, d.IsOpen, open, close_)
		if err != nil {
			util.Server(c, err)
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{"schedule": listSchedule(c, bizID)})
}
