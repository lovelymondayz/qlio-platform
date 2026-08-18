package handlers

import (
	"net/http"
	"strings"
	"time"

	"qlio/backend/internal/db"
	"qlio/backend/internal/middleware"
	"qlio/backend/internal/models"
	"qlio/backend/internal/util"

	"github.com/gin-gonic/gin"
)

type scanReq struct {
	Token string `json:"token"` // from QR payload
	Code  string `json:"code"`  // manual fallback
}

type scanResult struct {
	Found         bool   `json:"found"`
	BookingID     int64  `json:"booking_id"`
	ReceiptToken  string `json:"receipt_token"`
	BookingCode   string `json:"booking_code"`
	CustomerName  string `json:"customer_name"`
	CustomerPhone string `json:"customer_phone"`
	ServiceName   string `json:"service_name"`
	Kind          string `json:"kind"`
	ServiceDate   string `json:"service_date"`
	ScheduledTime string `json:"scheduled_time"`
	Status        string `json:"status"`
	TicketNumber  string `json:"ticket_number"`
	Notes         string `json:"notes"`
	CanCheckIn    bool   `json:"can_check_in"`
	Reason        string `json:"reason"`
}

// POST /api/staff/scan — resolve a QR token (or manual code) to a booking.
// The QR payload is ONLY a token. Ownership is validated against the scanning
// staff member's business — a token from another tenant resolves to not-found.
func Scan(c *gin.Context) {
	bizID := middleware.BizID(c)
	var r scanReq
	if err := c.ShouldBindJSON(&r); err != nil {
		util.BadRequest(c, "Nothing to scan.")
		return
	}

	token := strings.TrimSpace(r.Token)
	// Accept a full receipt URL pasted/scanned as well as a bare token.
	if i := strings.LastIndex(token, "/r/"); i >= 0 {
		token = token[i+3:]
	}
	token = strings.Trim(token, "/ ")

	code := strings.ToUpper(strings.TrimSpace(r.Code))
	if code != "" && !strings.HasPrefix(code, "QL-") {
		code = "QL-" + code
	}
	if token == "" && code == "" {
		util.BadRequest(c, "No booking reference provided.")
		return
	}

	var res scanResult
	var schedAt *time.Time
	var svcName *string
	var tz string
	var ticket *string

	err := db.Pool.QueryRow(c, `
		SELECT bk.id, bk.receipt_token, bk.booking_code, bk.customer_name, bk.customer_phone,
		       bk.kind, bk.service_date::text, bk.scheduled_at, bk.status, bk.notes,
		       s.name, b.timezone, qt.ticket_number
		FROM bookings bk
		JOIN businesses b ON b.id = bk.business_id
		LEFT JOIN services s ON s.id = bk.service_id
		LEFT JOIN queue_tickets qt ON qt.booking_id = bk.id
		WHERE bk.business_id = $1
		  AND ( ($2 <> '' AND bk.receipt_token = $2) OR ($3 <> '' AND bk.booking_code = $3) )
		LIMIT 1`, bizID, token, code).
		Scan(&res.BookingID, &res.ReceiptToken, &res.BookingCode, &res.CustomerName,
			&res.CustomerPhone, &res.Kind, &res.ServiceDate, &schedAt, &res.Status,
			&res.Notes, &svcName, &tz, &ticket)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"found":  false,
			"reason": "We could not find that booking. Check the code, or make sure the customer is at the right business.",
		})
		return
	}

	res.Found = true
	if svcName != nil {
		res.ServiceName = *svcName
	}
	if ticket != nil {
		res.TicketNumber = *ticket
	}
	loc, lerr := time.LoadLocation(tz)
	if lerr != nil {
		loc = time.UTC
	}
	if schedAt != nil {
		res.ScheduledTime = schedAt.In(loc).Format("15:04")
	}

	switch res.Status {
	case "pending_checkin":
		res.CanCheckIn = true
	case "cancelled":
		res.Reason = "This booking was cancelled."
	case "no_show":
		res.Reason = "This booking was marked as a no-show."
	case "completed":
		res.Reason = "This customer has already been served."
	default:
		res.Reason = "This customer is already checked in."
	}

	c.JSON(http.StatusOK, res)
}

type checkinReq struct {
	Token     string `json:"token"`
	Code      string `json:"code"`
	Method    string `json:"method"`
	CounterID *int64 `json:"counter_id"`
}

// POST /api/staff/checkin — confirm arrival; issues a queue ticket for appointments (§13).
func CheckIn(c *gin.Context) {
	bizID := middleware.BizID(c)
	staffID := middleware.StaffID(c)
	var r checkinReq
	if err := c.ShouldBindJSON(&r); err != nil {
		util.BadRequest(c, "Nothing to check in.")
		return
	}

	token := strings.TrimSpace(r.Token)
	if i := strings.LastIndex(token, "/r/"); i >= 0 {
		token = token[i+3:]
	}
	token = strings.Trim(token, "/ ")
	code := strings.ToUpper(strings.TrimSpace(r.Code))
	if code != "" && !strings.HasPrefix(code, "QL-") {
		code = "QL-" + code
	}
	method := r.Method
	if method == "" {
		method = "qr"
	}

	tx, err := db.Pool.Begin(c)
	if err != nil {
		util.Server(c, err)
		return
	}
	defer tx.Rollback(c)

	// Lock the booking row: anti-replay. A second scan of the same QR finds
	// status already advanced and is rejected below.
	var bookingID int64
	var status, kind, rtoken string
	var svcID *int64
	var date string
	var custName string
	err = tx.QueryRow(c, `
		SELECT id, status, kind, receipt_token, service_id, service_date::text, customer_name
		FROM bookings
		WHERE business_id=$1
		  AND ( ($2 <> '' AND receipt_token=$2) OR ($3 <> '' AND booking_code=$3) )
		FOR UPDATE`, bizID, token, code).
		Scan(&bookingID, &status, &kind, &rtoken, &svcID, &date, &custName)
	if err != nil {
		util.Fail(c, http.StatusNotFound, "not_found", "We could not find that booking.")
		return
	}
	if status != "pending_checkin" {
		util.Fail(c, http.StatusConflict, "already_processed", "This booking is already "+humanStatus(status)+".")
		return
	}

	// Queue bookings already hold a ticket; appointments get one now.
	var t *models.Ticket
	var existing models.Ticket
	terr := tx.QueryRow(c, `
		SELECT id, ticket_number, state FROM queue_tickets WHERE booking_id=$1`, bookingID).
		Scan(&existing.ID, &existing.TicketNumber, &existing.State)
	if terr == nil {
		t = &existing
	} else {
		prefix := "A"
		if svcID != nil {
			tx.QueryRow(c, `SELECT ticket_prefix FROM services WHERE id=$1`, *svcID).Scan(&prefix)
		}
		t, err = IssueTicket(c, tx, bizID, bookingID, svcID, date, prefix)
		if err != nil {
			util.Server(c, err)
			return
		}
	}

	if _, err := tx.Exec(c, `
		UPDATE bookings SET status='waiting', checked_in_at=now(), updated_at=now()
		WHERE id=$1`, bookingID); err != nil {
		util.Server(c, err)
		return
	}

	if _, err := tx.Exec(c, `
		INSERT INTO checkins (business_id, booking_id, staff_id, method, ip)
		VALUES ($1,$2,$3,$4,$5)
		ON CONFLICT (booking_id) DO NOTHING`,
		bizID, bookingID, staffID, method, util.ClientIP(c)); err != nil {
		util.Server(c, err)
		return
	}

	if r.CounterID != nil {
		tx.Exec(c, `UPDATE queue_tickets SET counter_id=$1 WHERE id=$2`, *r.CounterID, t.ID)
	}

	tx.Exec(c, `
		INSERT INTO audit_log (business_id, staff_id, action, entity, entity_id, meta, ip)
		VALUES ($1,$2,'checkin','booking',$3,$4,$5)`,
		bizID, staffID, bookingID,
		map[string]any{"ticket": t.TicketNumber, "method": method}, util.ClientIP(c))

	if err := tx.Commit(c); err != nil {
		util.Server(c, err)
		return
	}

	ahead := PeopleAhead(c, bizID, date, time.Now())
	est := EstimateWait(c, bizID, svcID, ahead)

	PushQueue(bizID, "queue.changed", gin.H{"ticket": t.TicketNumber, "event": "checked_in"})
	PushReceipt(rtoken, "receipt.updated", gin.H{"status": "waiting", "ticket": t.TicketNumber})

	c.JSON(http.StatusOK, gin.H{
		"status":        "checked_in",
		"ticket_number": t.TicketNumber,
		"customer_name": custName,
		"people_ahead":  ahead,
		"est_wait_min":  est,
		"receipt_token": rtoken,
	})
}

func humanStatus(s string) string {
	switch s {
	case "pending_checkin":
		return "waiting for check-in"
	case "checked_in", "waiting":
		return "checked in"
	case "almost":
		return "almost up"
	case "called":
		return "called"
	case "serving":
		return "being served"
	case "completed":
		return "completed"
	case "cancelled":
		return "cancelled"
	case "no_show":
		return "a no-show"
	}
	return s
}
