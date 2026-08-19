package handlers

import (
	"net/http"
	"strings"
	"time"

	"qlio/backend/internal/db"
	"qlio/backend/internal/models"
	"qlio/backend/internal/util"
	"qlio/backend/internal/ws"

	"github.com/gin-gonic/gin"
)

// buildReceipt resolves a receipt token into the full public payload.
// This is the ONLY way a token becomes data — the QR never carries booking info.
func buildReceipt(c *gin.Context, token string) (*models.Receipt, int64, error) {
	var r models.Receipt
	var bizID int64
	var schedAt *time.Time
	var svcID *int64
	var tz string
	var svcName, staffName *string
	var checkedInAt *time.Time

	err := db.Pool.QueryRow(c, `
		SELECT b.id, bk.booking_code, bk.status, bk.kind, bk.customer_name, bk.customer_phone,
		       bk.service_date::text, bk.scheduled_at, bk.price_cents, bk.notes, bk.service_id,
		       bk.receipt_token, bk.checked_in_at,
		       s.name, st.name,
		       b.slug, b.name, b.logo_url, b.address, b.map_url, b.phone, b.currency,
		       b.theme_color, b.counter_label, b.timezone
		FROM bookings bk
		JOIN businesses b ON b.id = bk.business_id
		LEFT JOIN services s ON s.id = bk.service_id
		LEFT JOIN staff st ON st.id = bk.staff_id
		WHERE bk.receipt_token = $1`, token).
		Scan(&bizID, &r.BookingCode, &r.Status, &r.Kind, &r.CustomerName, &r.PhoneMasked,
			&r.ServiceDate, &schedAt, &r.PriceCents, &r.Notes, &svcID,
			&r.ReceiptToken, &checkedInAt,
			&svcName, &staffName,
			&r.Business.Slug, &r.Business.Name, &r.Business.LogoURL, &r.Business.Address,
			&r.Business.MapURL, &r.Business.Phone, &r.Business.Currency,
			&r.Business.ThemeColor, &r.Business.CounterLabel, &tz)
	if err != nil {
		return nil, 0, err
	}

	r.PhoneMasked = util.MaskPhone(r.PhoneMasked)
	if svcName != nil {
		r.ServiceName = *svcName
	}
	if staffName != nil {
		r.StaffName = *staffName
	}
	r.CheckedIn = checkedInAt != nil

	loc, lerr := time.LoadLocation(tz)
	if lerr != nil {
		loc = time.UTC
	}
	if schedAt != nil {
		r.ScheduledTime = schedAt.In(loc).Format("15:04")
	}

	// attach ticket + live queue position if a ticket exists
	var t models.Ticket
	var counterName *string
	terr := db.Pool.QueryRow(c, `
		SELECT qt.ticket_number, qt.state, qt.issued_at, co.name
		FROM queue_tickets qt
		LEFT JOIN counters co ON co.id = qt.counter_id
		WHERE qt.booking_id = (SELECT id FROM bookings WHERE receipt_token=$1)`, token).
		Scan(&t.TicketNumber, &t.State, &t.IssuedAt, &counterName)
	if terr == nil {
		r.TicketNumber = t.TicketNumber
		if counterName != nil {
			r.CounterName = *counterName
		}
		if t.State == "waiting" || t.State == "almost" {
			ahead := PeopleAhead(c, bizID, r.ServiceDate, t.IssuedAt)
			r.PeopleAhead = ahead
			r.Position = ahead + 1
			r.EstWaitMin = EstimateWait(c, bizID, svcID, ahead)
		}
		r.NowServing = NowServing(c, bizID, r.ServiceDate)
	}

	return &r, bizID, nil
}

// GET /api/public/receipt/:token
func GetReceipt(c *gin.Context) {
	token := c.Param("token")
	if len(token) < 16 {
		util.NotFound(c, "Receipt not found.")
		return
	}
	r, _, err := buildReceipt(c, token)
	if err != nil {
		util.NotFound(c, "We could not find that receipt.")
		return
	}
	c.JSON(http.StatusOK, r)
}

// GET /api/public/receipt/:token/ws — live updates for one customer
func ReceiptWS(c *gin.Context) {
	token := c.Param("token")
	var exists bool
	db.Pool.QueryRow(c, `SELECT TRUE FROM bookings WHERE receipt_token=$1`, token).Scan(&exists)
	if !exists {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	ws.Serve(c.Writer, c.Request, "rcpt:"+token)
}

type findReq struct {
	Phone string `json:"phone"`
	Code  string `json:"code"`
}

// POST /api/public/find — recover a booking without an account.
// Requires phone AND booking code together to prevent enumeration.
func FindBooking(c *gin.Context) {
	var r findReq
	if err := c.ShouldBindJSON(&r); err != nil {
		util.BadRequest(c, "Please enter your details.")
		return
	}
	if !allowRate(c, "find:"+util.ClientIP(c), 5, 15*time.Minute) {
		util.Fail(c, http.StatusTooManyRequests, "rate_limited", "Too many attempts. Please wait 15 minutes.")
		return
	}

	phone := util.NormalizePhone(r.Phone)
	code := strings.ToUpper(strings.TrimSpace(r.Code))
	if phone == "" || code == "" {
		util.Fail(c, http.StatusBadRequest, "both_required", "Please enter both your phone number and booking ID.")
		return
	}
	if !strings.HasPrefix(code, "QL-") {
		code = "QL-" + code
	}

	var token string
	err := db.Pool.QueryRow(c, `
		SELECT receipt_token FROM bookings
		WHERE customer_phone=$1 AND booking_code=$2
		ORDER BY created_at DESC LIMIT 1`, phone, code).Scan(&token)
	if err != nil {
		util.Fail(c, http.StatusNotFound, "not_found", "No booking matches those details.")
		return
	}
	c.JSON(http.StatusOK, gin.H{"receipt_token": token, "receipt_url": "/r/" + token})
}

// Customer self-cancellation is deliberately not supported. A booked slot is a
// commitment to the business, so cancelling requires talking to them: staff
// cancel from the queue board via POST /api/staff/queue/:id/cancel, which is
// audit-logged against the staff member who performed it.
//
// If self-service cancellation is ever wanted, it should go through an approval
// step (customer requests → owner confirms) rather than an immediate delete.
