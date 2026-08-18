package handlers

import (
	"net/http"
	"time"

	"qlio/backend/internal/db"
	"qlio/backend/internal/middleware"
	"qlio/backend/internal/util"

	"github.com/gin-gonic/gin"
)

// GET /api/staff/dashboard
func Dashboard(c *gin.Context) {
	bizID := middleware.BizID(c)
	date := c.DefaultQuery("date", BizToday(c, bizID))

	var appts, waiting, serving, completed, cancelled, noshow, walkins int
	db.Pool.QueryRow(c, `
		SELECT
			COUNT(*) FILTER (WHERE kind='appointment' AND status NOT IN ('cancelled')),
			COUNT(*) FILTER (WHERE status IN ('waiting','almost','checked_in')),
			COUNT(*) FILTER (WHERE status IN ('called','serving')),
			COUNT(*) FILTER (WHERE status='completed'),
			COUNT(*) FILTER (WHERE status='cancelled'),
			COUNT(*) FILTER (WHERE status='no_show'),
			COUNT(*) FILTER (WHERE origin='kiosk' OR kind='queue')
		FROM bookings WHERE business_id=$1 AND service_date=$2::date`, bizID, date).
		Scan(&appts, &waiting, &serving, &completed, &cancelled, &noshow, &walkins)

	var avgWaitSec, avgServeSec *float64
	db.Pool.QueryRow(c, `
		SELECT AVG(EXTRACT(EPOCH FROM (qt.called_at - qt.issued_at)))
		FROM queue_tickets qt
		WHERE qt.business_id=$1 AND qt.service_date=$2::date AND qt.called_at IS NOT NULL`,
		bizID, date).Scan(&avgWaitSec)
	db.Pool.QueryRow(c, `
		SELECT AVG(EXTRACT(EPOCH FROM (qt.completed_at - COALESCE(qt.serving_at, qt.called_at))))
		FROM queue_tickets qt
		WHERE qt.business_id=$1 AND qt.service_date=$2::date AND qt.completed_at IS NOT NULL`,
		bizID, date).Scan(&avgServeSec)

	min := func(p *float64) int {
		if p == nil || *p <= 0 {
			return 0
		}
		return int(*p / 60)
	}

	c.JSON(http.StatusOK, gin.H{
		"date":            date,
		"appointments":    appts,
		"waiting":         waiting,
		"serving":         serving,
		"completed":       completed,
		"cancelled":       cancelled,
		"no_show":         noshow,
		"walkins":         walkins,
		"avg_wait_min":    min(avgWaitSec),
		"avg_service_min": min(avgServeSec),
		"now_serving":     NowServing(c, bizID, date),
	})
}

// GET /api/staff/bookings?from=&to=&status=
func ListBookings(c *gin.Context) {
	bizID := middleware.BizID(c)
	from := c.DefaultQuery("from", BizToday(c, bizID))
	to := c.DefaultQuery("to", from)
	status := c.Query("status")

	rows, err := db.Pool.Query(c, `
		SELECT bk.id, bk.booking_code, bk.kind, bk.origin, bk.customer_name, bk.customer_phone,
		       bk.service_date::text, bk.scheduled_at, bk.status, bk.price_cents, bk.notes,
		       s.name, st.name, qt.ticket_number, bk.receipt_token
		FROM bookings bk
		LEFT JOIN services s ON s.id = bk.service_id
		LEFT JOIN staff st ON st.id = bk.staff_id
		LEFT JOIN queue_tickets qt ON qt.booking_id = bk.id
		WHERE bk.business_id=$1
		  AND bk.service_date BETWEEN $2::date AND $3::date
		  AND ($4 = '' OR bk.status = $4)
		ORDER BY bk.scheduled_at NULLS LAST, bk.created_at`, bizID, from, to, status)
	out := []gin.H{}
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var id int64
			var code, kind, origin, name, phone, date, st2 string
			var schedAt *time.Time
			var price int64
			var notes string
			var svc, staffName, ticket *string
			var rtoken string
			if rows.Scan(&id, &code, &kind, &origin, &name, &phone, &date, &schedAt, &st2,
				&price, &notes, &svc, &staffName, &ticket, &rtoken) != nil {
				continue
			}
			str := func(p *string) string {
				if p == nil {
					return ""
				}
				return *p
			}
			tm := ""
			if schedAt != nil {
				tm = schedAt.Format("15:04")
			}
			out = append(out, gin.H{
				"id": id, "booking_code": code, "kind": kind, "origin": origin,
				"customer_name": name, "customer_phone": util.MaskPhone(phone),
				"service_date": date, "scheduled_time": tm, "status": st2,
				"price_cents": price, "notes": notes, "service_name": str(svc),
				"staff_name": str(staffName), "ticket_number": str(ticket),
				"receipt_token": rtoken,
			})
		}
	}
	c.JSON(http.StatusOK, gin.H{"bookings": out})
}

// GET /api/staff/analytics?days=7
func Analytics(c *gin.Context) {
	bizID := middleware.BizID(c)
	days := 7
	if d := c.Query("days"); d == "30" {
		days = 30
	}

	// daily totals
	rows, _ := db.Pool.Query(c, `
		SELECT service_date::text,
		       COUNT(*),
		       COUNT(*) FILTER (WHERE status='completed'),
		       COUNT(*) FILTER (WHERE status='no_show'),
		       COUNT(*) FILTER (WHERE status='cancelled')
		FROM bookings
		WHERE business_id=$1 AND service_date > CURRENT_DATE - $2::int
		GROUP BY service_date ORDER BY service_date`, bizID, days)
	daily := []gin.H{}
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var d string
			var total, done, ns, canc int
			if rows.Scan(&d, &total, &done, &ns, &canc) == nil {
				daily = append(daily, gin.H{"date": d, "total": total,
					"completed": done, "no_show": ns, "cancelled": canc})
			}
		}
	}

	// peak hours
	prows, _ := db.Pool.Query(c, `
		SELECT EXTRACT(HOUR FROM COALESCE(scheduled_at, created_at))::int AS hr, COUNT(*)
		FROM bookings
		WHERE business_id=$1 AND service_date > CURRENT_DATE - $2::int
		GROUP BY hr ORDER BY hr`, bizID, days)
	peak := []gin.H{}
	if prows != nil {
		defer prows.Close()
		for prows.Next() {
			var hr, n int
			if prows.Scan(&hr, &n) == nil {
				peak = append(peak, gin.H{"hour": hr, "count": n})
			}
		}
	}

	// top services
	srows, _ := db.Pool.Query(c, `
		SELECT s.name, COUNT(*)
		FROM bookings bk JOIN services s ON s.id = bk.service_id
		WHERE bk.business_id=$1 AND bk.service_date > CURRENT_DATE - $2::int
		GROUP BY s.name ORDER BY COUNT(*) DESC LIMIT 8`, bizID, days)
	top := []gin.H{}
	if srows != nil {
		defer srows.Close()
		for srows.Next() {
			var n string
			var cnt int
			if srows.Scan(&n, &cnt) == nil {
				top = append(top, gin.H{"service": n, "count": cnt})
			}
		}
	}

	var total, done, ns int
	db.Pool.QueryRow(c, `
		SELECT COUNT(*), COUNT(*) FILTER (WHERE status='completed'),
		       COUNT(*) FILTER (WHERE status='no_show')
		FROM bookings WHERE business_id=$1 AND service_date > CURRENT_DATE - $2::int`,
		bizID, days).Scan(&total, &done, &ns)

	nsRate := 0.0
	if total > 0 {
		nsRate = float64(ns) / float64(total) * 100
	}

	c.JSON(http.StatusOK, gin.H{
		"days": days, "daily": daily, "peak_hours": peak, "top_services": top,
		"total": total, "completed": done, "no_show": ns,
		"no_show_rate":    nsRate,
		"avg_service_min": AvgServiceSec(c, bizID, nil) / 60,
	})
}

// GET /api/staff/audit
func AuditLog(c *gin.Context) {
	bizID := middleware.BizID(c)
	rows, err := db.Pool.Query(c, `
		SELECT a.action, a.entity, a.entity_id, a.meta, a.created_at, s.name
		FROM audit_log a LEFT JOIN staff s ON s.id = a.staff_id
		WHERE a.business_id=$1 ORDER BY a.created_at DESC LIMIT 100`, bizID)
	out := []gin.H{}
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var action, entity string
			var eid *int64
			var meta map[string]any
			var at time.Time
			var who *string
			if rows.Scan(&action, &entity, &eid, &meta, &at, &who) == nil {
				w := "system"
				if who != nil {
					w = *who
				}
				out = append(out, gin.H{"action": action, "entity": entity,
					"entity_id": eid, "meta": meta, "at": at, "staff": w})
			}
		}
	}
	c.JSON(http.StatusOK, gin.H{"entries": out})
}
