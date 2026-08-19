package main

import (
	"log"
	"net/http"
	"time"

	"qlio/backend/internal/config"
	"qlio/backend/internal/db"
	"qlio/backend/internal/handlers"
	"qlio/backend/internal/middleware"

	"github.com/gin-gonic/gin"
)

func main() {
	cfg := config.Load()
	middleware.SetSecret(cfg.JWTSecret)

	if err := db.Connect(cfg.DatabaseURL); err != nil {
		log.Fatalf("db: %v", err)
	}
	defer db.Pool.Close()

	if err := db.Migrate("./migrations"); err != nil {
		log.Fatalf("migrate: %v", err)
	}

	if cfg.Env == "production" {
		gin.SetMode(gin.ReleaseMode)
	}
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(gin.LoggerWithConfig(gin.LoggerConfig{SkipPaths: []string{"/api/health"}}))

	r.Use(middleware.CORS())

	r.GET("/api/health", func(c *gin.Context) {
		if err := db.Pool.Ping(c); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"status": "db_down"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "ok", "service": "qlio", "time": time.Now()})
	})

	// ---------- PUBLIC: no account required ----------
	pub := r.Group("/api/public")
	{
		pub.GET("/b/:slug", handlers.PublicBusiness)
		pub.GET("/b/:slug/slots", handlers.PublicSlots)
		pub.POST("/b/:slug/book", handlers.CreateBooking)
		pub.GET("/b/:slug/display", handlers.PublicDisplay)
		pub.GET("/b/:slug/display/ws", handlers.PublicDisplayWS)

		pub.GET("/receipt/:token", handlers.GetReceipt)
		pub.GET("/receipt/:token/ws", handlers.ReceiptWS)
		// NOTE: there is deliberately no customer self-cancel endpoint. A booked
		// slot is a commitment — the customer contacts the business, and staff
		// cancel from the queue board (POST /api/staff/queue/:id/cancel), which
		// is audit-logged against the staff member who performed it.
		pub.POST("/find", handlers.FindBooking)
	}

	// ---------- AUTH ----------
	auth := r.Group("/api/auth")
	{
		auth.POST("/signup", handlers.Signup)
		auth.POST("/login", handlers.Login)
	}

	// ---------- STAFF: authenticated, tenant-scoped ----------
	// WS route sits outside Auth() because browsers cannot set headers on upgrade.
	r.GET("/api/staff/queue/ws", handlers.StaffQueueWS)

	st := r.Group("/api/staff", middleware.Auth())
	{
		st.GET("/me", handlers.Me)
		st.GET("/dashboard", handlers.Dashboard)
		st.GET("/bookings", handlers.ListBookings)
		// Resolve a booking that has not been checked in yet, from the calendar:
		// confirmed | no_show | cancelled | rescheduled. Front-desk work — a
		// receptionist answers the phone — so it needs receptionist rank, but a
		// plain 'staff' helper or a service provider must not silently move
		// someone else's appointment.
		st.PUT("/bookings/:id/status",
			middleware.RequireRank(middleware.RankReceptionist), handlers.BookingStatus)
		st.PUT("/bookings/:id/reschedule",
			middleware.RequireRank(middleware.RankReceptionist), handlers.RescheduleBooking)
		// Analytics is business performance data, not day-to-day operations.
		st.GET("/analytics", middleware.RequireRank(middleware.RankManager), handlers.Analytics)

		// scanning + check-in: front desk and above
		st.POST("/scan", middleware.RequireRank(middleware.RankProvider), handlers.Scan)
		st.POST("/checkin", middleware.RequireRank(middleware.RankProvider), handlers.CheckIn)

		// queue control — every staff role can read the board and move the
		// queue along; that is the whole job on a busy floor.
		st.GET("/queue", handlers.QueueBoard)
		st.POST("/queue/call-next", handlers.CallNext)
		st.POST("/queue/:id/transfer", handlers.TransferTicket)
		st.POST("/queue/:id/:action", handlers.QueueAction)

		// business config: manager rank and above (owner passes by rank)
		cfgGrp := st.Group("", middleware.RequireRank(middleware.RankManager))
		{
			cfgGrp.GET("/business", handlers.GetBusiness)
			cfgGrp.PUT("/business", handlers.UpdateBusiness)
			cfgGrp.PUT("/schedule", handlers.UpdateSchedule)

			cfgGrp.GET("/services", handlers.ListServices)
			cfgGrp.POST("/services", handlers.CreateService)
			cfgGrp.PUT("/services/:id", handlers.UpdateService)
			cfgGrp.DELETE("/services/:id", handlers.DeleteService)

			cfgGrp.GET("/counters", handlers.ListCounters)
			cfgGrp.POST("/counters", handlers.CreateCounter)
			cfgGrp.PUT("/counters/:id", handlers.UpdateCounter)
			cfgGrp.DELETE("/counters/:id", handlers.DeleteCounter)

			cfgGrp.GET("/staff", handlers.ListStaff)
			cfgGrp.POST("/staff", handlers.CreateStaff)
			cfgGrp.PUT("/staff/:id", handlers.UpdateStaff)
			// Removing a colleague is owner-only. A compromised manager
			// account should not be able to lock the owner out.
			cfgGrp.DELETE("/staff/:id",
				middleware.RequireRank(middleware.RankOwner), handlers.DeleteStaff)

			cfgGrp.GET("/audit", handlers.AuditLog)
		}
	}

	log.Printf("qlio: listening on :%s (env=%s)", cfg.Port, cfg.Env)
	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      r,
		ReadTimeout:  20 * time.Second,
		WriteTimeout: 20 * time.Second,
		IdleTimeout:  120 * time.Second,
	}
	if err := srv.ListenAndServe(); err != nil {
		log.Fatalf("server: %v", err)
	}
}
