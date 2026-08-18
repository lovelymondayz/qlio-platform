package handlers

import (
	"context"
	"net/http"
	"time"

	"qlio/backend/internal/db"
	"qlio/backend/internal/models"
	"qlio/backend/internal/util"

	"github.com/gin-gonic/gin"
)

// GET /api/public/b/:slug — the customer entry page payload
func PublicBusiness(c *gin.Context) {
	slug := c.Param("slug")
	var b models.Business
	err := db.Pool.QueryRow(c, `
		SELECT id, slug, name, category, tagline, logo_url, address, map_url, phone,
		       timezone, currency, locale, theme_color, allow_appointments, allow_queue,
		       allow_walkin, counter_label
		FROM businesses WHERE slug=$1 AND is_active=TRUE`, slug).
		Scan(&b.ID, &b.Slug, &b.Name, &b.Category, &b.Tagline, &b.LogoURL, &b.Address,
			&b.MapURL, &b.Phone, &b.Timezone, &b.Currency, &b.Locale, &b.ThemeColor,
			&b.AllowAppointments, &b.AllowQueue, &b.AllowWalkin, &b.CounterLabel)
	if err != nil {
		util.NotFound(c, "That business page does not exist.")
		return
	}

	svcs := listServices(c, b.ID, true)
	// business-local date, not UTC — b.Timezone is already loaded above
	today := localToday(b.Timezone)

	var waiting int
	db.Pool.QueryRow(c, `
		SELECT COUNT(*) FROM queue_tickets
		WHERE business_id=$1 AND service_date=$2::date AND state IN ('waiting','almost')`,
		b.ID, today).Scan(&waiting)

	c.JSON(http.StatusOK, gin.H{
		"business":    b,
		"services":    svcs,
		"schedule":    listSchedule(c, b.ID),
		"now_serving": NowServing(c, b.ID, today),
		"waiting":     waiting,
		"est_wait":    EstimateWait(c, b.ID, nil, waiting),
	})
}

func listServices(ctx context.Context, bizID int64, activeOnly bool) []models.Service {
	q := `SELECT id, business_id, name, description, icon, duration_min, buffer_min,
	             price_cents, ticket_prefix, allow_appointment, allow_queue, max_daily,
	             sort_order, is_active
	      FROM services WHERE business_id=$1`
	if activeOnly {
		q += ` AND is_active=TRUE`
	}
	q += ` ORDER BY sort_order, id`
	rows, err := db.Pool.Query(ctx, q, bizID)
	out := []models.Service{}
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var s models.Service
		if err := rows.Scan(&s.ID, &s.BusinessID, &s.Name, &s.Description, &s.Icon,
			&s.DurationMin, &s.BufferMin, &s.PriceCents, &s.TicketPrefix,
			&s.AllowAppointment, &s.AllowQueue, &s.MaxDaily, &s.SortOrder, &s.IsActive); err == nil {
			out = append(out, s)
		}
	}
	return out
}

func listSchedule(ctx context.Context, bizID int64) []models.ScheduleDay {
	rows, err := db.Pool.Query(ctx, `
		SELECT weekday, is_open, open_time::text, close_time::text,
		       break_start::text, break_end::text
		FROM business_schedule WHERE business_id=$1 ORDER BY weekday`, bizID)
	out := []models.ScheduleDay{}
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var d models.ScheduleDay
		if err := rows.Scan(&d.Weekday, &d.IsOpen, &d.OpenTime, &d.CloseTime, &d.BreakStart, &d.BreakEnd); err == nil {
			out = append(out, d)
		}
	}
	return out
}

// GET /api/public/b/:slug/slots?service_id=&date=YYYY-MM-DD
func PublicSlots(c *gin.Context) {
	slug := c.Param("slug")
	svcID := c.Query("service_id")

	var bizID int64
	var tz string
	if err := db.Pool.QueryRow(c, `SELECT id, timezone FROM businesses WHERE slug=$1 AND is_active=TRUE`, slug).Scan(&bizID, &tz); err != nil {
		util.NotFound(c, "Business not found.")
		return
	}

	// default to the business's local today, not the server's UTC today
	dateStr := c.DefaultQuery("date", localToday(tz))

	d, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		util.BadRequest(c, "Invalid date.")
		return
	}

	var dur, buf int
	if svcID != "" {
		db.Pool.QueryRow(c, `SELECT duration_min, buffer_min FROM services WHERE id=$1 AND business_id=$2`, svcID, bizID).Scan(&dur, &buf)
	}
	if dur <= 0 {
		dur = 30
	}

	var interval int
	db.Pool.QueryRow(c, `SELECT slot_interval_min FROM business_settings WHERE business_id=$1`, bizID).Scan(&interval)
	if interval <= 0 {
		interval = 30
	}

	weekday := int(d.Weekday())
	var isOpen bool
	var openT, closeT string
	var bs, be *string
	err = db.Pool.QueryRow(c, `
		SELECT is_open, open_time::text, close_time::text, break_start::text, break_end::text
		FROM business_schedule WHERE business_id=$1 AND weekday=$2`, bizID, weekday).
		Scan(&isOpen, &openT, &closeT, &bs, &be)
	if err != nil || !isOpen {
		c.JSON(http.StatusOK, gin.H{"date": dateStr, "is_open": false, "slots": []string{}})
		return
	}

	loc, lerr := time.LoadLocation(tz)
	if lerr != nil {
		loc = time.UTC
	}
	open, _ := time.ParseInLocation("2006-01-02 15:04:05", dateStr+" "+openT, loc)
	close_, _ := time.ParseInLocation("2006-01-02 15:04:05", dateStr+" "+closeT, loc)

	// taken slots for this date
	taken := map[string]bool{}
	rows, _ := db.Pool.Query(c, `
		SELECT to_char(scheduled_at AT TIME ZONE $3, 'HH24:MI')
		FROM bookings
		WHERE business_id=$1 AND service_date=$2::date AND scheduled_at IS NOT NULL
		  AND status NOT IN ('cancelled','no_show')`, bizID, dateStr, tz)
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var t string
			if rows.Scan(&t) == nil {
				taken[t] = true
			}
		}
	}

	now := time.Now().In(loc)
	slots := []gin.H{}
	step := time.Duration(interval) * time.Minute
	for t := open; t.Add(time.Duration(dur)*time.Minute).Compare(close_) <= 0; t = t.Add(step) {
		hm := t.Format("15:04")
		if bs != nil && be != nil {
			if hm >= (*bs)[:5] && hm < (*be)[:5] {
				continue
			}
		}
		past := t.Before(now)
		slots = append(slots, gin.H{
			"time":      hm,
			"available": !taken[hm] && !past,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"date": dateStr, "is_open": true, "slots": slots,
		"open": openT[:5], "close": closeT[:5], "duration_min": dur,
	})
}
