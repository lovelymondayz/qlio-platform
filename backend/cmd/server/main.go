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
		pub.POST("/receipt/:token/cancel", handlers.CancelBooking)
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
		st.GET("/analytics", handlers.Analytics)

		// scanning + check-in: any staff role
		st.POST("/scan", handlers.Scan)
		st.POST("/checkin", handlers.CheckIn)

		// queue control
		st.GET("/queue", handlers.QueueBoard)
		st.POST("/queue/call-next", handlers.CallNext)
		st.POST("/queue/:id/transfer", handlers.TransferTicket)
		st.POST("/queue/:id/:action", handlers.QueueAction)

		// business config: owner + manager
		cfgGrp := st.Group("", middleware.RequireRole("owner", "manager"))
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
			cfgGrp.DELETE("/staff/:id", handlers.DeleteStaff)

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
