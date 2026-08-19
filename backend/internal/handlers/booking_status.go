package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"qlio/backend/internal/db"
	"qlio/backend/internal/middleware"
	"qlio/backend/internal/util"
)

// bookingStatusReq is the body for PUT /api/staff/bookings/:id/status
type bookingStatusReq struct {
	Status string `json:"status"`
	Reason string `json:"reason"`
}

// BookingStatus lets staff resolve a booking that has not been checked in yet,
// straight from the appointment calendar (§31).
//
// The queue actions in queue.go operate on a queue ticket, which only exists
// after check-in. A booking still in pending_checkin has no ticket, so it needs
// its own transition — this is that endpoint.
//
// Allowed transitions, all from pending_checkin only:
//
//	confirmed → staff acknowledged the appointment (e.g. phoned to confirm)
//	no_show   → the customer never arrived
//	cancelled → staff cancelled on the customer's behalf
//
// Customers cannot reach this endpoint. Cancellation is intentionally staff-only
// so the business keeps control of its own schedule, and every change here is
// written to the audit log against the staff member who made it.
func BookingStatus(c *gin.Context) {
	bizID := middleware.BizID(c)
	staffID := middleware.StaffID(c)
	id := c.Param("id")

	var r bookingStatusReq
	if err := c.ShouldBindJSON(&r); err != nil {
		util.BadRequest(c, "Please choose a status.")
		return
	}

	// Whitelist — never interpolate a client string into the UPDATE.
	switch r.Status {
	case "confirmed", "no_show", "cancelled":
	default:
		util.BadRequest(c, "That status is not allowed here.")
		return
	}

	// Scope by business_id from the JWT so one tenant can never touch another's
	// bookings. A mismatch reads as not-found rather than forbidden, so the
	// endpoint does not confirm that another tenant's booking id exists.
	var current, name, code string
	err := db.Pool.QueryRow(c, `
		SELECT status, customer_name, booking_code
		FROM bookings WHERE id=$1 AND business_id=$2`, id, bizID).
		Scan(&current, &name, &code)
	if err != nil {
		util.NotFound(c, "Booking not found.")
		return
	}

	if current != "pending_checkin" {
		util.Fail(c, http.StatusConflict, "already_processed",
			"This booking has already been checked in or closed. Use the queue board instead.")
		return
	}

	// cancelled_at is only meaningful for the two closing states.
	var tag string
	if r.Status == "cancelled" || r.Status == "no_show" {
		tag = ", cancelled_at=now()"
	}

	if _, err := db.Pool.Exec(c, `
		UPDATE bookings SET status=$1, updated_at=now()`+tag+`
		WHERE id=$2 AND business_id=$3`, r.Status, id, bizID); err != nil {
		util.Server(c, err)
		return
	}

	db.Pool.Exec(c, `
		INSERT INTO audit_log (business_id, staff_id, action, entity, entity_id, meta)
		VALUES ($1,$2,$3,'booking',$4,$5)`,
		bizID, staffID, "booking_"+r.Status, id,
		map[string]any{"customer": name, "code": code, "reason": r.Reason})

	// Refresh the customer's receipt and any open staff boards.
	var token string
	db.Pool.QueryRow(c, `SELECT receipt_token FROM bookings WHERE id=$1`, id).Scan(&token)
	if token != "" {
		PushReceipt(token, "receipt.updated", gin.H{"status": r.Status})
	}
	PushQueue(bizID, "queue_updated", gin.H{"booking": id, "status": r.Status})

	c.JSON(http.StatusOK, gin.H{"status": r.Status})
}
