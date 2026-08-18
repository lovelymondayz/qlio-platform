package handlers

import (
	"context"
	"fmt"
	"time"

	"qlio/backend/internal/db"
	"qlio/backend/internal/models"
	"qlio/backend/internal/ws"

	"github.com/jackc/pgx/v5"
)

// IssueTicket atomically allocates the next daily sequence for a prefix and
// creates the queue ticket. Must be called inside a transaction.
func IssueTicket(ctx context.Context, tx pgx.Tx, bizID, bookingID int64, svcID *int64, date string, prefix string) (*models.Ticket, error) {
	if prefix == "" {
		prefix = "A"
	}
	var seq int
	err := tx.QueryRow(ctx, `
		INSERT INTO ticket_counters (business_id, service_date, prefix, last_seq)
		VALUES ($1, $2::date, $3, 1)
		ON CONFLICT (business_id, service_date, prefix)
		DO UPDATE SET last_seq = ticket_counters.last_seq + 1
		RETURNING last_seq`, bizID, date, prefix).Scan(&seq)
	if err != nil {
		return nil, fmt.Errorf("alloc seq: %w", err)
	}

	number := fmt.Sprintf("%s%03d", prefix, seq)
	t := &models.Ticket{}
	err = tx.QueryRow(ctx, `
		INSERT INTO queue_tickets
			(business_id, booking_id, service_id, service_date, prefix, seq, ticket_number, state)
		VALUES ($1,$2,$3,$4::date,$5,$6,$7,'waiting')
		RETURNING id, booking_id, service_date::text, prefix, seq, ticket_number, state, issued_at, recall_count`,
		bizID, bookingID, svcID, date, prefix, seq, number).
		Scan(&t.ID, &t.BookingID, &t.ServiceDate, &t.Prefix, &t.Seq, &t.TicketNumber, &t.State, &t.IssuedAt, &t.RecallCount)
	if err != nil {
		return nil, fmt.Errorf("insert ticket: %w", err)
	}
	t.ServiceID = svcID
	return t, nil
}

// AvgServiceSec returns the rolling average service duration in seconds.
// Falls back to the configured service duration, then to 15 minutes.
func AvgServiceSec(ctx context.Context, bizID int64, svcID *int64) int {
	var avg *float64
	if svcID != nil {
		db.Pool.QueryRow(ctx, `
			SELECT AVG(duration_sec) FROM (
				SELECT duration_sec FROM service_samples
				WHERE business_id=$1 AND service_id=$2
				ORDER BY created_at DESC LIMIT 20
			) s`, bizID, *svcID).Scan(&avg)
	}
	if avg == nil {
		db.Pool.QueryRow(ctx, `
			SELECT AVG(duration_sec) FROM (
				SELECT duration_sec FROM service_samples
				WHERE business_id=$1 ORDER BY created_at DESC LIMIT 30
			) s`, bizID).Scan(&avg)
	}
	if avg != nil && *avg > 30 {
		return int(*avg)
	}
	if svcID != nil {
		var d int
		if err := db.Pool.QueryRow(ctx, `SELECT duration_min FROM services WHERE id=$1`, *svcID).Scan(&d); err == nil && d > 0 {
			return d * 60
		}
	}
	return 15 * 60
}

// ActiveDesks counts counters available to serve; always at least 1.
func ActiveDesks(ctx context.Context, bizID int64) int {
	var n int
	db.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM counters WHERE business_id=$1 AND is_active=TRUE`, bizID).Scan(&n)
	if n < 1 {
		return 1
	}
	return n
}

// EstimateWait computes the estimated wait in minutes for someone with N people ahead.
func EstimateWait(ctx context.Context, bizID int64, svcID *int64, peopleAhead int) int {
	if peopleAhead <= 0 {
		return 0
	}
	avgSec := AvgServiceSec(ctx, bizID, svcID)
	desks := ActiveDesks(ctx, bizID)
	mins := (peopleAhead * avgSec) / (desks * 60)
	if mins < 1 {
		return 1
	}
	return mins
}

// PeopleAhead counts tickets issued before this one that are still unserved.
func PeopleAhead(ctx context.Context, bizID int64, date string, issuedAt time.Time) int {
	var n int
	db.Pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM queue_tickets
		WHERE business_id=$1 AND service_date=$2::date
		  AND state IN ('waiting','almost','called','serving')
		  AND issued_at < $3`, bizID, date, issuedAt).Scan(&n)
	return n
}

// NowServing returns the most recent called/serving ticket number, if any.
func NowServing(ctx context.Context, bizID int64, date string) string {
	var s string
	db.Pool.QueryRow(ctx, `
		SELECT ticket_number FROM queue_tickets
		WHERE business_id=$1 AND service_date=$2::date AND state IN ('called','serving')
		ORDER BY called_at DESC NULLS LAST LIMIT 1`, bizID, date).Scan(&s)
	return s
}

// Today returns the current date in UTC. Prefer BizToday — a business in
// Asia/Jakarta (+7) rolls over to the next day 7 hours before UTC does, so
// using this for queue lookups makes the queue appear empty after 17:00 UTC.
func Today() string { return time.Now().Format("2006-01-02") }

// localToday returns today's date in the given IANA timezone, falling back to
// UTC when the name is empty or unknown.
func localToday(tz string) string {
	if tz == "" {
		return time.Now().Format("2006-01-02")
	}
	loc, err := time.LoadLocation(tz)
	if err != nil {
		return time.Now().Format("2006-01-02")
	}
	return time.Now().In(loc).Format("2006-01-02")
}

// BizToday returns the current date in the business's own timezone. All queue
// and ticket lookups must use this: tickets are stamped with the business-local
// service_date at issue time, so any reader using a different clock will miss
// them. Falls back to UTC only if the stored timezone is unparseable.
func BizToday(ctx context.Context, bizID int64) string {
	var tz string
	if err := db.Pool.QueryRow(ctx,
		`SELECT COALESCE(timezone,'UTC') FROM businesses WHERE id=$1`, bizID,
	).Scan(&tz); err != nil || tz == "" {
		return time.Now().Format("2006-01-02")
	}
	loc, err := time.LoadLocation(tz)
	if err != nil {
		return time.Now().Format("2006-01-02")
	}
	return time.Now().In(loc).Format("2006-01-02")
}

// PushQueue notifies the business room that the queue changed.
func PushQueue(bizID int64, evType string, payload interface{}) {
	ws.H.Broadcast(fmt.Sprintf("biz:%d", bizID), evType, payload)
}

// PushReceipt notifies one customer's receipt page.
func PushReceipt(token, evType string, payload interface{}) {
	ws.H.Broadcast("rcpt:"+token, evType, payload)
}
