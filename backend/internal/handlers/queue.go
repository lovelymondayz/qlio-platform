package handlers

import (
	"net/http"
	"time"

	"qlio/backend/internal/db"
	"qlio/backend/internal/middleware"
	"qlio/backend/internal/models"
	"qlio/backend/internal/util"
	"qlio/backend/internal/ws"

	"github.com/gin-gonic/gin"
)

// GET /api/staff/queue — live board for reception
func QueueBoard(c *gin.Context) {
	bizID := middleware.BizID(c)
	date := c.DefaultQuery("date", BizToday(c, bizID))
	c.JSON(http.StatusOK, queueSnapshot(c, bizID, date))
}

// GET /api/public/b/:slug/display — waiting-room screen (no auth)
func PublicDisplay(c *gin.Context) {
	slug := c.Param("slug")
	var bizID int64
	var name, label string
	if err := db.Pool.QueryRow(c, `
		SELECT id, name, counter_label FROM businesses WHERE slug=$1 AND is_active=TRUE`, slug).
		Scan(&bizID, &name, &label); err != nil {
		util.NotFound(c, "Business not found.")
		return
	}
	snap := queueSnapshot(c, bizID, BizToday(c, bizID))
	c.JSON(http.StatusOK, gin.H{
		"business_name": name, "counter_label": label, "queue": snap,
	})
}

func queueSnapshot(c *gin.Context, bizID int64, date string) models.QueueSnapshot {
	snap := models.QueueSnapshot{NowServing: []models.Ticket{}, Waiting: []models.Ticket{}}

	rows, err := db.Pool.Query(c, `
		SELECT qt.id, qt.booking_id, qt.ticket_number, qt.state, qt.issued_at, qt.called_at,
		       qt.recall_count, co.name, st.name, bk.customer_name, s.name, bk.receipt_token,
		       bk.kind, bk.scheduled_at
		FROM queue_tickets qt
		JOIN bookings bk ON bk.id = qt.booking_id
		LEFT JOIN counters co ON co.id = qt.counter_id
		LEFT JOIN staff st ON st.id = qt.served_by
		LEFT JOIN services s ON s.id = qt.service_id
		WHERE qt.business_id=$1 AND qt.service_date=$2::date
		  AND qt.state IN ('waiting','almost','called','serving')
		ORDER BY qt.issued_at`, bizID, date)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var t models.Ticket
			var counter, servedBy, custName, svcName *string
			var rtoken, kind string
			var schedAt *time.Time
			if rows.Scan(&t.ID, &t.BookingID, &t.TicketNumber, &t.State, &t.IssuedAt,
				&t.CalledAt, &t.RecallCount, &counter, &servedBy, &custName, &svcName,
				&rtoken, &kind, &schedAt) != nil {
				continue
			}
			if counter != nil {
				t.CounterName = *counter
			}
			if servedBy != nil {
				t.ServedByName = *servedBy
			}
			if custName != nil {
				t.CustomerName = *custName
			}
			if svcName != nil {
				t.ServiceName = *svcName
			}
			t.Kind = kind
			if schedAt != nil {
				t.ScheduledTime = schedAt.Format("15:04")
			}
			if t.State == "called" || t.State == "serving" {
				snap.NowServing = append(snap.NowServing, t)
			} else {
				snap.Waiting = append(snap.Waiting, t)
			}
		}
	}

	snap.WaitingCnt = len(snap.Waiting)
	db.Pool.QueryRow(c, `
		SELECT COUNT(*) FROM queue_tickets
		WHERE business_id=$1 AND service_date=$2::date AND state='completed'`, bizID, date).Scan(&snap.Completed)
	snap.ActiveDesks = ActiveDesks(c, bizID)
	snap.EstWaitMin = EstimateWait(c, bizID, nil, snap.WaitingCnt)
	return snap
}

type queueActionReq struct {
	TicketID  int64  `json:"ticket_id"`
	CounterID *int64 `json:"counter_id"`
}

// POST /api/staff/queue/call-next — pull the longest-waiting ticket
func CallNext(c *gin.Context) {
	bizID := middleware.BizID(c)
	staffID := middleware.StaffID(c)
	var r queueActionReq
	c.ShouldBindJSON(&r)
	date := BizToday(c, bizID)

	tx, err := db.Pool.Begin(c)
	if err != nil {
		util.Server(c, err)
		return
	}
	defer tx.Rollback(c)

	var tID, bookingID int64
	var number, rtoken string
	err = tx.QueryRow(c, `
		SELECT qt.id, qt.booking_id, qt.ticket_number, bk.receipt_token
		FROM queue_tickets qt JOIN bookings bk ON bk.id = qt.booking_id
		WHERE qt.business_id=$1 AND qt.service_date=$2::date AND qt.state IN ('waiting','almost')
		ORDER BY qt.issued_at
		LIMIT 1 FOR UPDATE OF qt SKIP LOCKED`, bizID, date).
		Scan(&tID, &bookingID, &number, &rtoken)
	if err != nil {
		util.Fail(c, http.StatusNotFound, "queue_empty", "No one is waiting right now.")
		return
	}

	if _, err := tx.Exec(c, `
		UPDATE queue_tickets SET state='called', called_at=now(), served_by=$2, counter_id=COALESCE($3, counter_id)
		WHERE id=$1`, tID, staffID, r.CounterID); err != nil {
		util.Server(c, err)
		return
	}
	tx.Exec(c, `UPDATE bookings SET status='called', updated_at=now() WHERE id=$1`, bookingID)
	tx.Exec(c, `
		INSERT INTO audit_log (business_id, staff_id, action, entity, entity_id, meta)
		VALUES ($1,$2,'call_next','ticket',$3,$4)`,
		bizID, staffID, tID, map[string]any{"ticket": number})

	if err := tx.Commit(c); err != nil {
		util.Server(c, err)
		return
	}

	var counterName string
	if r.CounterID != nil {
		db.Pool.QueryRow(c, `SELECT name FROM counters WHERE id=$1`, *r.CounterID).Scan(&counterName)
	}

	PushQueue(bizID, "queue.changed", gin.H{"event": "called", "ticket": number})
	PushReceipt(rtoken, "your.turn", gin.H{"ticket": number, "counter": counterName})
	markAlmostUp(c, bizID, date)

	c.JSON(http.StatusOK, gin.H{"ticket_number": number, "ticket_id": tID, "counter": counterName})
}

// markAlmostUp flags the next N waiting tickets so their receipts warn them.
func markAlmostUp(c *gin.Context, bizID int64, date string) {
	var ahead int
	db.Pool.QueryRow(c, `SELECT almost_turn_ahead FROM business_settings WHERE business_id=$1`, bizID).Scan(&ahead)
	if ahead <= 0 {
		ahead = 2
	}
	rows, err := db.Pool.Query(c, `
		SELECT qt.id, bk.receipt_token FROM queue_tickets qt
		JOIN bookings bk ON bk.id = qt.booking_id
		WHERE qt.business_id=$1 AND qt.service_date=$2::date AND qt.state='waiting'
		ORDER BY qt.issued_at LIMIT $3`, bizID, date, ahead)
	if err != nil {
		return
	}
	type row struct {
		id    int64
		token string
	}
	var list []row
	for rows.Next() {
		var r row
		if rows.Scan(&r.id, &r.token) == nil {
			list = append(list, r)
		}
	}
	rows.Close()
	for _, r := range list {
		db.Pool.Exec(c, `UPDATE queue_tickets SET state='almost' WHERE id=$1`, r.id)
		db.Pool.Exec(c, `UPDATE bookings SET status='almost' WHERE id=(SELECT booking_id FROM queue_tickets WHERE id=$1)`, r.id)
		PushReceipt(r.token, "almost.turn", nil)
	}
}

// POST /api/staff/queue/:id/:action — recall | serving | complete | skip | cancel
func QueueAction(c *gin.Context) {
	bizID := middleware.BizID(c)
	staffID := middleware.StaffID(c)
	action := c.Param("action")
	tID := c.Param("id")

	var bookingID int64
	var number, state, rtoken string
	var svcID *int64
	var calledAt, servingAt *time.Time
	err := db.Pool.QueryRow(c, `
		SELECT qt.booking_id, qt.ticket_number, qt.state, bk.receipt_token, qt.service_id,
		       qt.called_at, qt.serving_at
		FROM queue_tickets qt JOIN bookings bk ON bk.id = qt.booking_id
		WHERE qt.id=$1 AND qt.business_id=$2`, tID, bizID).
		Scan(&bookingID, &number, &state, &rtoken, &svcID, &calledAt, &servingAt)
	if err != nil {
		util.NotFound(c, "Ticket not found.")
		return
	}

	var newState, newStatus string
	switch action {
	case "recall":
		newState, newStatus = "called", "called"
		db.Pool.Exec(c, `UPDATE queue_tickets SET recall_count=recall_count+1, called_at=now() WHERE id=$1`, tID)
		PushReceipt(rtoken, "your.turn", gin.H{"ticket": number, "recall": true})
	case "serving":
		newState, newStatus = "serving", "serving"
		db.Pool.Exec(c, `UPDATE queue_tickets SET serving_at=now(), served_by=$2 WHERE id=$1`, tID, staffID)
	case "complete":
		newState, newStatus = "completed", "completed"
		db.Pool.Exec(c, `UPDATE queue_tickets SET completed_at=now() WHERE id=$1`, tID)
		db.Pool.Exec(c, `UPDATE bookings SET completed_at=now() WHERE id=$1`, bookingID)
		// record a duration sample for wait estimation
		start := servingAt
		if start == nil {
			start = calledAt
		}
		if start != nil {
			sec := int(time.Since(*start).Seconds())
			if sec > 30 && sec < 6*3600 {
				db.Pool.Exec(c, `
					INSERT INTO service_samples (business_id, service_id, duration_sec)
					VALUES ($1,$2,$3)`, bizID, svcID, sec)
			}
		}
	case "skip":
		newState, newStatus = "no_show", "no_show"
	case "cancel":
		newState, newStatus = "cancelled", "cancelled"
		db.Pool.Exec(c, `UPDATE bookings SET cancelled_at=now() WHERE id=$1`, bookingID)
	default:
		util.BadRequest(c, "Unknown action.")
		return
	}

	if _, err := db.Pool.Exec(c, `UPDATE queue_tickets SET state=$2 WHERE id=$1`, tID, newState); err != nil {
		util.Server(c, err)
		return
	}
	db.Pool.Exec(c, `UPDATE bookings SET status=$2, updated_at=now() WHERE id=$1`, bookingID, newStatus)
	db.Pool.Exec(c, `
		INSERT INTO audit_log (business_id, staff_id, action, entity, entity_id, meta)
		VALUES ($1,$2,$3,'ticket',$4,$5)`,
		bizID, staffID, "queue_"+action, tID, map[string]any{"ticket": number})

	PushQueue(bizID, "queue.changed", gin.H{"event": action, "ticket": number})
	PushReceipt(rtoken, "receipt.updated", gin.H{"status": newStatus})

	c.JSON(http.StatusOK, gin.H{"ticket_number": number, "state": newState})
}

// POST /api/staff/queue/:id/transfer — move a ticket to another counter
func TransferTicket(c *gin.Context) {
	bizID := middleware.BizID(c)
	tID := c.Param("id")
	var r queueActionReq
	if err := c.ShouldBindJSON(&r); err != nil || r.CounterID == nil {
		util.BadRequest(c, "Please choose a counter.")
		return
	}
	var owns bool
	db.Pool.QueryRow(c, `SELECT TRUE FROM counters WHERE id=$1 AND business_id=$2`, *r.CounterID, bizID).Scan(&owns)
	if !owns {
		util.BadRequest(c, "That counter does not belong to your business.")
		return
	}
	res, err := db.Pool.Exec(c, `
		UPDATE queue_tickets SET counter_id=$1 WHERE id=$2 AND business_id=$3`, *r.CounterID, tID, bizID)
	if err != nil || res.RowsAffected() == 0 {
		util.NotFound(c, "Ticket not found.")
		return
	}
	var number, rtoken, cname string
	db.Pool.QueryRow(c, `
		SELECT qt.ticket_number, bk.receipt_token, co.name
		FROM queue_tickets qt JOIN bookings bk ON bk.id=qt.booking_id
		LEFT JOIN counters co ON co.id=qt.counter_id WHERE qt.id=$1`, tID).Scan(&number, &rtoken, &cname)

	PushQueue(bizID, "queue.changed", gin.H{"event": "transfer", "ticket": number})
	PushReceipt(rtoken, "receipt.updated", gin.H{"counter": cname})
	c.JSON(http.StatusOK, gin.H{"ticket_number": number, "counter": cname})
}

// GET /api/staff/queue/ws — live board socket
func StaffQueueWS(c *gin.Context) {
	// token arrives as a query param since browsers can't set WS headers
	tok := c.Query("token")
	if tok == "" {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	bizID, ok := middleware.BizFromToken(tok)
	if !ok {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	ws.Serve(c.Writer, c.Request, "biz:"+util.I64(bizID))
}

// GET /api/public/b/:slug/display/ws — waiting-room screen socket
func PublicDisplayWS(c *gin.Context) {
	var bizID int64
	if err := db.Pool.QueryRow(c, `SELECT id FROM businesses WHERE slug=$1 AND is_active=TRUE`, c.Param("slug")).Scan(&bizID); err != nil {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	ws.Serve(c.Writer, c.Request, "biz:"+util.I64(bizID))
}
