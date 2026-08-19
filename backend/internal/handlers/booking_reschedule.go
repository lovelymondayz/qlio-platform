package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"qlio/backend/internal/db"
	"qlio/backend/internal/middleware"
	"qlio/backend/internal/util"
)

// rescheduleReq is the body for PUT /api/staff/bookings/:id/reschedule
type rescheduleReq struct {
	Date   string `json:"date"` // YYYY-MM-DD; empty keeps the current date
	Time   string `json:"time"` // HH:MM, business-local
	Reason string `json:"reason"`
}

// RescheduleBooking moves an appointment to a new date/time (§31).
//
// This is the fifth calendar action the brief asks for, alongside confirm,
// cancel, check in and no show. It is staff-only for the same reason
// cancellation is: the customer holds a receipt, not an account, and the
// business owns its own schedule. The customer's receipt updates itself over
// the WebSocket, so they see the new time without doing anything.
//
// Rules:
//   - appointments only — a queue ticket has no reserved time to move
//   - the booking must not have been checked in or closed yet
//   - the new time must be free for that service, using the same clash rule
//     CreateBooking applies, so staff cannot double-book a slot the public
//     booking flow would have refused
func RescheduleBooking(c *gin.Context) {
	bizID := middleware.BizID(c)
	id := c.Param("id")

	var r rescheduleReq
	if err := c.ShouldBindJSON(&r); err != nil {
		util.BadRequest(c, "Please choose a new date and time.")
		return
	}
	if r.Time == "" {
		util.Fail(c, http.StatusBadRequest, "time_required", "Please pick a new time.")
		return
	}

	// Load the booking inside the tenant scope. A cross-tenant id reads as
	// not-found so this endpoint never confirms another business's data.
	var status, kind, name, code, tz, token string
	var svcID *int64
	var curDate time.Time
	err := db.Pool.QueryRow(c, `
		SELECT bk.status, bk.kind, bk.customer_name, bk.booking_code,
		       COALESCE(b.timezone,'UTC'), bk.receipt_token, bk.service_id, bk.service_date
		FROM bookings bk
		JOIN businesses b ON b.id = bk.business_id
		WHERE bk.id=$1 AND bk.business_id=$2`, id, bizID).
		Scan(&status, &kind, &name, &code, &tz, &token, &svcID, &curDate)
	if err != nil {
		util.NotFound(c, "Booking not found.")
		return
	}

	if kind != "appointment" {
		util.Fail(c, http.StatusBadRequest, "not_an_appointment",
			"Queue tickets have no reserved time. Issue a new ticket instead.")
		return
	}
	// Only a booking still waiting for the customer may be moved. Once they
	// have arrived the queue board owns the booking.
	if status != "pending_checkin" && status != "confirmed" {
		util.Fail(c, http.StatusConflict, "already_processed",
			"This booking has already been checked in or closed, so it cannot be moved.")
		return
	}

	loc, lerr := time.LoadLocation(tz)
	if lerr != nil {
		loc = time.UTC
	}

	// An empty date means "same day, new time".
	newDate := r.Date
	if newDate == "" {
		newDate = curDate.In(loc).Format("2006-01-02")
	}

	newAt, perr := time.ParseInLocation("2006-01-02 15:04", newDate+" "+r.Time, loc)
	if perr != nil {
		util.BadRequest(c, "That date or time is not valid.")
		return
	}

	// Same clash rule as CreateBooking, excluding this booking itself so
	// re-saving the same time is not reported as a conflict.
	var clash int
	db.Pool.QueryRow(c, `
		SELECT COUNT(*) FROM bookings
		WHERE business_id=$1 AND scheduled_at=$2 AND service_id=$3
		  AND id <> $4 AND status NOT IN ('cancelled','no_show')`,
		bizID, newAt, svcID, id).Scan(&clash)
	if clash > 0 {
		util.Fail(c, http.StatusConflict, "slot_taken",
			"Another booking already holds that time. Please pick another.")
		return
	}

	if _, err := db.Pool.Exec(c, `
		UPDATE bookings
		SET service_date=$1::date, scheduled_at=$2, status='pending_checkin', updated_at=now()
		WHERE id=$3 AND business_id=$4`, newDate, newAt, id, bizID); err != nil {
		util.Server(c, err)
		return
	}

	Audit(c, "booking.reschedule", "booking", util.ParamID(c), map[string]any{
		"customer": name,
		"code":     code,
		"from":     curDate.In(loc).Format("2006-01-02"),
		"to":       newDate + " " + r.Time,
		"reason":   r.Reason,
	})

	// The customer is holding a receipt, not an account — push the new time to
	// it so the page they already have open corrects itself.
	if token != "" {
		PushReceipt(token, "receipt.updated", gin.H{
			"status": "pending_checkin",
			"date":   newDate,
			"time":   r.Time,
		})
	}
	PushQueue(bizID, "queue.changed", gin.H{"event": "reschedule", "booking": id})

	c.JSON(http.StatusOK, gin.H{
		"ok":           true,
		"service_date": newDate,
		"time":         r.Time,
	})
}
