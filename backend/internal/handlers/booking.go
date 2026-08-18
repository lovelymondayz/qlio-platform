package handlers

import (
	"context"
	"net/http"
	"strings"
	"time"

	"qlio/backend/internal/db"
	"qlio/backend/internal/models"
	"qlio/backend/internal/util"

	"github.com/gin-gonic/gin"
)

type createBookingReq struct {
	ServiceID int64  `json:"service_id"`
	Kind      string `json:"kind"` // appointment | queue
	Date      string `json:"date"`
	Time      string `json:"time"`
	Name      string `json:"name"`
	Phone     string `json:"phone"`
	Email     string `json:"email"`
	Notes     string `json:"notes"`
	StaffID   *int64 `json:"staff_id"`
	Origin    string `json:"origin"` // online | kiosk
}

// POST /api/public/b/:slug/book
func CreateBooking(c *gin.Context) {
	slug := c.Param("slug")
	var r createBookingReq
	if err := c.ShouldBindJSON(&r); err != nil {
		util.BadRequest(c, "Please check the form and try again.")
		return
	}

	r.Name = strings.TrimSpace(r.Name)
	if len(r.Name) < 2 {
		util.Fail(c, http.StatusBadRequest, "invalid_name", "Please enter your full name.")
		return
	}
	phone := util.NormalizePhone(r.Phone)
	if len(phone) < 8 {
		util.Fail(c, http.StatusBadRequest, "invalid_phone", "Please enter a valid phone number.")
		return
	}
	if r.Kind != "queue" {
		r.Kind = "appointment"
	}
	if r.Origin != "kiosk" {
		r.Origin = "online"
	}

	// rate limit: 6 bookings / 10 min / IP
	if !allowRate(c, "book:"+util.ClientIP(c), 6, 10*time.Minute) {
		util.Fail(c, http.StatusTooManyRequests, "rate_limited", "Too many attempts. Please wait a few minutes.")
		return
	}

	var bizID int64
	var tz string
	var allowAppt, allowQueue bool
	err := db.Pool.QueryRow(c, `
		SELECT id, timezone, allow_appointments, allow_queue
		FROM businesses WHERE slug=$1 AND is_active=TRUE`, slug).
		Scan(&bizID, &tz, &allowAppt, &allowQueue)
	if err != nil {
		util.NotFound(c, "Business not found.")
		return
	}
	if r.Kind == "appointment" && !allowAppt {
		util.Fail(c, http.StatusBadRequest, "appointments_disabled", "This business does not take appointments.")
		return
	}
	if r.Kind == "queue" && !allowQueue {
		util.Fail(c, http.StatusBadRequest, "queue_disabled", "This business does not use a queue.")
		return
	}

	var svcName, prefix string
	var price int64
	var svcAllowAppt, svcAllowQueue bool
	var maxDaily int
	err = db.Pool.QueryRow(c, `
		SELECT name, ticket_prefix, price_cents, allow_appointment, allow_queue, max_daily
		FROM services WHERE id=$1 AND business_id=$2 AND is_active=TRUE`, r.ServiceID, bizID).
		Scan(&svcName, &prefix, &price, &svcAllowAppt, &svcAllowQueue, &maxDaily)
	if err != nil {
		util.Fail(c, http.StatusBadRequest, "invalid_service", "That service is not available.")
		return
	}
	if r.Kind == "appointment" && !svcAllowAppt {
		util.Fail(c, http.StatusBadRequest, "appointments_disabled", "This service cannot be booked in advance.")
		return
	}
	if r.Kind == "queue" && !svcAllowQueue {
		util.Fail(c, http.StatusBadRequest, "queue_disabled", "This service is not available in the queue.")
		return
	}

	loc, lerr := time.LoadLocation(tz)
	if lerr != nil {
		loc = time.UTC
	}
	date := r.Date
	if date == "" || r.Kind == "queue" {
		date = time.Now().In(loc).Format("2006-01-02")
	}

	if maxDaily > 0 {
		var used int
		db.Pool.QueryRow(c, `
			SELECT COUNT(*) FROM bookings
			WHERE business_id=$1 AND service_id=$2 AND service_date=$3::date
			  AND status NOT IN ('cancelled','no_show')`, bizID, r.ServiceID, date).Scan(&used)
		if used >= maxDaily {
			util.Fail(c, http.StatusConflict, "fully_booked", "This service is fully booked for that day.")
			return
		}
	}

	var schedAt *time.Time
	if r.Kind == "appointment" {
		if r.Time == "" {
			util.Fail(c, http.StatusBadRequest, "time_required", "Please pick a time.")
			return
		}
		t, perr := time.ParseInLocation("2006-01-02 15:04", date+" "+r.Time, loc)
		if perr != nil {
			util.BadRequest(c, "Invalid time.")
			return
		}
		schedAt = &t

		var clash int
		db.Pool.QueryRow(c, `
			SELECT COUNT(*) FROM bookings
			WHERE business_id=$1 AND scheduled_at=$2 AND service_id=$3
			  AND status NOT IN ('cancelled','no_show')`, bizID, t, r.ServiceID).Scan(&clash)
		if clash > 0 {
			util.Fail(c, http.StatusConflict, "slot_taken", "That time was just taken. Please pick another.")
			return
		}
	}

	tx, err := db.Pool.Begin(c)
	if err != nil {
		util.Server(c, err)
		return
	}
	defer tx.Rollback(context.Background())

	// upsert customer record for repeat-visit stats
	var custID int64
	tx.QueryRow(c, `
		INSERT INTO customers (business_id, name, phone, email, visit_count)
		VALUES ($1,$2,$3,$4,1)
		ON CONFLICT (business_id, phone)
		DO UPDATE SET visit_count = customers.visit_count + 1,
		              name = EXCLUDED.name
		RETURNING id`, bizID, r.Name, phone, r.Email).Scan(&custID)

	token := util.ReceiptToken()
	code := util.BookingCode()
	status := "pending_checkin"

	var bookingID int64
	err = tx.QueryRow(c, `
		INSERT INTO bookings
			(business_id, service_id, customer_id, staff_id, kind, origin, booking_code,
			 receipt_token, customer_name, customer_phone, customer_email, notes,
			 service_date, scheduled_at, price_cents, status)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::date,$14,$15,$16)
		RETURNING id`,
		bizID, r.ServiceID, custID, r.StaffID, r.Kind, r.Origin, code, token,
		r.Name, phone, r.Email, r.Notes, date, schedAt, price, status).Scan(&bookingID)
	if err != nil {
		util.Server(c, err)
		return
	}

	// A queue booking gets its ticket immediately. An appointment gets one at check-in (§13).
	var ticket *models.Ticket
	if r.Kind == "queue" {
		ticket, err = IssueTicket(c, tx, bizID, bookingID, &r.ServiceID, date, prefix)
		if err != nil {
			util.Server(c, err)
			return
		}
	}

	if err := tx.Commit(c); err != nil {
		util.Server(c, err)
		return
	}

	if ticket != nil {
		PushQueue(bizID, "queue.joined", gin.H{"ticket": ticket.TicketNumber, "name": r.Name})
	} else {
		PushQueue(bizID, "booking.created", gin.H{"code": code, "name": r.Name, "at": schedAt})
	}

	c.JSON(http.StatusCreated, gin.H{
		"receipt_token": token,
		"booking_code":  code,
		"receipt_url":   "/r/" + token,
	})
}

// allowRate is a simple DB-backed sliding window limiter.
func allowRate(ctx context.Context, bucket string, limit int, window time.Duration) bool {
	var n int
	err := db.Pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM rate_hits
		WHERE bucket=$1 AND created_at > now() - $2::interval`,
		bucket, window.String()).Scan(&n)
	if err == nil && n >= limit {
		return false
	}
	db.Pool.Exec(ctx, `INSERT INTO rate_hits (bucket) VALUES ($1)`, bucket)
	// opportunistic cleanup
	db.Pool.Exec(ctx, `DELETE FROM rate_hits WHERE created_at < now() - interval '2 hours'`)
	return true
}
