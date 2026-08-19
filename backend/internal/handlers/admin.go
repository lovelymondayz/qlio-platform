package handlers

import (
	"net/http"
	"strings"

	"qlio/backend/internal/db"
	"qlio/backend/internal/middleware"
	"qlio/backend/internal/util"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

// GET /api/staff/services
func ListServices(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"services": listServices(c, middleware.BizID(c), false)})
}

type serviceReq struct {
	Name             string `json:"name"`
	Description      string `json:"description"`
	Icon             string `json:"icon"`
	DurationMin      int    `json:"duration_min"`
	BufferMin        int    `json:"buffer_min"`
	PriceCents       int64  `json:"price_cents"`
	TicketPrefix     string `json:"ticket_prefix"`
	AllowAppointment bool   `json:"allow_appointment"`
	AllowQueue       bool   `json:"allow_queue"`
	MaxDaily         int    `json:"max_daily"`
	SortOrder        int    `json:"sort_order"`
	IsActive         bool   `json:"is_active"`
}

// POST /api/staff/services
func CreateService(c *gin.Context) {
	bizID := middleware.BizID(c)
	var r serviceReq
	if err := c.ShouldBindJSON(&r); err != nil {
		util.BadRequest(c, "Please check the service details.")
		return
	}
	r.Name = strings.TrimSpace(r.Name)
	if r.Name == "" {
		util.Fail(c, http.StatusBadRequest, "name_required", "Please enter a service name.")
		return
	}
	if r.DurationMin <= 0 {
		r.DurationMin = 30
	}
	prefix := strings.ToUpper(strings.TrimSpace(r.TicketPrefix))
	if prefix == "" {
		prefix = strings.ToUpper(r.Name[:1])
	}
	if len(prefix) > 4 {
		prefix = prefix[:4]
	}

	var id int64
	err := db.Pool.QueryRow(c, `
		INSERT INTO services (business_id, name, description, icon, duration_min, buffer_min,
		                      price_cents, ticket_prefix, allow_appointment, allow_queue,
		                      max_daily, sort_order, is_active)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,TRUE) RETURNING id`,
		bizID, r.Name, r.Description, r.Icon, r.DurationMin, r.BufferMin, r.PriceCents,
		prefix, r.AllowAppointment, r.AllowQueue, r.MaxDaily, r.SortOrder).Scan(&id)
	if err != nil {
		util.Server(c, err)
		return
	}
	AuditID(c, "service.create", "service", id, map[string]any{"name": r.Name})
	c.JSON(http.StatusCreated, gin.H{"id": id})
}

// PUT /api/staff/services/:id
func UpdateService(c *gin.Context) {
	bizID := middleware.BizID(c)
	var r serviceReq
	if err := c.ShouldBindJSON(&r); err != nil {
		util.BadRequest(c, "Please check the service details.")
		return
	}
	prefix := strings.ToUpper(strings.TrimSpace(r.TicketPrefix))
	if prefix == "" {
		prefix = "A"
	}
	res, err := db.Pool.Exec(c, `
		UPDATE services SET name=$3, description=$4, icon=$5, duration_min=$6, buffer_min=$7,
		       price_cents=$8, ticket_prefix=$9, allow_appointment=$10, allow_queue=$11,
		       max_daily=$12, sort_order=$13, is_active=$14
		WHERE id=$1 AND business_id=$2`,
		c.Param("id"), bizID, r.Name, r.Description, r.Icon, r.DurationMin, r.BufferMin,
		r.PriceCents, prefix, r.AllowAppointment, r.AllowQueue, r.MaxDaily, r.SortOrder, r.IsActive)
	if err != nil {
		util.Server(c, err)
		return
	}
	if res.RowsAffected() == 0 {
		util.NotFound(c, "Service not found.")
		return
	}
	Audit(c, "service.update", "service", util.ParamID(c), map[string]any{"name": r.Name})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// DELETE /api/staff/services/:id — soft delete to preserve booking history
func DeleteService(c *gin.Context) {
	bizID := middleware.BizID(c)
	res, err := db.Pool.Exec(c, `
		UPDATE services SET is_active=FALSE WHERE id=$1 AND business_id=$2`, c.Param("id"), bizID)
	if err != nil {
		util.Server(c, err)
		return
	}
	if res.RowsAffected() == 0 {
		util.NotFound(c, "Service not found.")
		return
	}
	Audit(c, "service.delete", "service", util.ParamID(c), nil)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// GET /api/staff/counters
func ListCounters(c *gin.Context) {
	bizID := middleware.BizID(c)
	rows, err := db.Pool.Query(c, `
		SELECT co.id, co.name, co.kind, co.staff_id, co.is_active, co.sort_order, st.name
		FROM counters co LEFT JOIN staff st ON st.id = co.staff_id
		WHERE co.business_id=$1 ORDER BY co.sort_order, co.id`, bizID)
	out := []gin.H{}
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var id int64
			var name, kind string
			var staffID *int64
			var active bool
			var order int
			var sname *string
			if rows.Scan(&id, &name, &kind, &staffID, &active, &order, &sname) == nil {
				s := ""
				if sname != nil {
					s = *sname
				}
				out = append(out, gin.H{"id": id, "name": name, "kind": kind,
					"staff_id": staffID, "staff_name": s, "is_active": active, "sort_order": order})
			}
		}
	}
	c.JSON(http.StatusOK, gin.H{"counters": out})
}

type counterReq struct {
	Name      string `json:"name"`
	Kind      string `json:"kind"`
	StaffID   *int64 `json:"staff_id"`
	IsActive  bool   `json:"is_active"`
	SortOrder int    `json:"sort_order"`
}

// POST /api/staff/counters
func CreateCounter(c *gin.Context) {
	bizID := middleware.BizID(c)
	var r counterReq
	if err := c.ShouldBindJSON(&r); err != nil || strings.TrimSpace(r.Name) == "" {
		util.BadRequest(c, "Please enter a counter name.")
		return
	}
	if r.Kind == "" {
		r.Kind = "counter"
	}
	var id int64
	err := db.Pool.QueryRow(c, `
		INSERT INTO counters (business_id, name, kind, staff_id, is_active, sort_order)
		VALUES ($1,$2,$3,$4,TRUE,$5) RETURNING id`,
		bizID, r.Name, r.Kind, r.StaffID, r.SortOrder).Scan(&id)
	if err != nil {
		util.Server(c, err)
		return
	}
	AuditID(c, "counter.create", "counter", id, map[string]any{"name": r.Name, "kind": r.Kind})
	c.JSON(http.StatusCreated, gin.H{"id": id})
}

// PUT /api/staff/counters/:id
func UpdateCounter(c *gin.Context) {
	bizID := middleware.BizID(c)
	var r counterReq
	if err := c.ShouldBindJSON(&r); err != nil {
		util.BadRequest(c, "Please check the counter details.")
		return
	}
	res, err := db.Pool.Exec(c, `
		UPDATE counters SET name=$3, kind=$4, staff_id=$5, is_active=$6, sort_order=$7
		WHERE id=$1 AND business_id=$2`,
		c.Param("id"), bizID, r.Name, r.Kind, r.StaffID, r.IsActive, r.SortOrder)
	if err != nil {
		util.Server(c, err)
		return
	}
	if res.RowsAffected() == 0 {
		util.NotFound(c, "Counter not found.")
		return
	}
	Audit(c, "counter.update", "counter", util.ParamID(c), map[string]any{"name": r.Name, "is_active": r.IsActive})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// DELETE /api/staff/counters/:id
func DeleteCounter(c *gin.Context) {
	bizID := middleware.BizID(c)
	_, err := db.Pool.Exec(c, `DELETE FROM counters WHERE id=$1 AND business_id=$2`, c.Param("id"), bizID)
	if err != nil {
		util.Server(c, err)
		return
	}
	Audit(c, "counter.delete", "counter", util.ParamID(c), nil)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// GET /api/staff/staff
func ListStaff(c *gin.Context) {
	bizID := middleware.BizID(c)
	rows, err := db.Pool.Query(c, `
		SELECT id, email, name, role, title, is_provider, is_active, last_login_at
		FROM staff WHERE business_id=$1 ORDER BY
		  CASE role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 WHEN 'receptionist' THEN 2 ELSE 3 END, id`, bizID)
	out := []gin.H{}
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var id int64
			var email, name, role, title string
			var isProv, isActive bool
			var last interface{}
			if rows.Scan(&id, &email, &name, &role, &title, &isProv, &isActive, &last) == nil {
				out = append(out, gin.H{"id": id, "email": email, "name": name, "role": role,
					"title": title, "is_provider": isProv, "is_active": isActive, "last_login_at": last})
			}
		}
	}
	c.JSON(http.StatusOK, gin.H{"staff": out})
}

type staffReq struct {
	Email      string `json:"email"`
	Password   string `json:"password"`
	Name       string `json:"name"`
	Role       string `json:"role"`
	Title      string `json:"title"`
	IsProvider bool   `json:"is_provider"`
	IsActive   bool   `json:"is_active"`
}

var validRoles = map[string]bool{"manager": true, "receptionist": true, "staff": true, "provider": true}

// POST /api/staff/staff — owner/manager only
func CreateStaff(c *gin.Context) {
	bizID := middleware.BizID(c)
	var r staffReq
	if err := c.ShouldBindJSON(&r); err != nil {
		util.BadRequest(c, "Please check the details.")
		return
	}
	r.Email = strings.ToLower(strings.TrimSpace(r.Email))
	if !strings.Contains(r.Email, "@") {
		util.Fail(c, http.StatusBadRequest, "invalid_email", "Please enter a valid email.")
		return
	}
	if len(r.Password) < 8 {
		util.Fail(c, http.StatusBadRequest, "weak_password", "Password must be at least 8 characters.")
		return
	}
	if !validRoles[r.Role] {
		util.Fail(c, http.StatusBadRequest, "invalid_role", "Choose a valid role.")
		return
	}
	// A manager must not be able to mint a peer with equal reach. Only an
	// owner may appoint a manager; anyone below that can only create roles
	// strictly beneath their own rank.
	if middleware.RoleRank(r.Role) >= middleware.RoleRank(middleware.Role(c)) && !middleware.IsSuper(c) {
		util.Fail(c, http.StatusForbidden, "role_too_high",
			"You can only create roles below your own.")
		return
	}
	var taken bool
	db.Pool.QueryRow(c, `SELECT TRUE FROM staff WHERE lower(email)=$1`, r.Email).Scan(&taken)
	if taken {
		util.Fail(c, http.StatusConflict, "email_taken", "That email is already in use.")
		return
	}
	hash, _ := bcrypt.GenerateFromPassword([]byte(r.Password), bcrypt.DefaultCost)
	var id int64
	err := db.Pool.QueryRow(c, `
		INSERT INTO staff (business_id, email, password_hash, name, role, title, is_provider)
		VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
		bizID, r.Email, string(hash), r.Name, r.Role, r.Title, r.IsProvider).Scan(&id)
	if err != nil {
		util.Server(c, err)
		return
	}
	AuditID(c, "staff.create", "staff", id, map[string]any{
		"email": r.Email, "name": r.Name, "role": r.Role})
	c.JSON(http.StatusCreated, gin.H{"id": id})
}

// PUT /api/staff/staff/:id
func UpdateStaff(c *gin.Context) {
	bizID := middleware.BizID(c)
	var r staffReq
	if err := c.ShouldBindJSON(&r); err != nil {
		util.BadRequest(c, "Please check the details.")
		return
	}
	// never allow role escalation to owner via this endpoint
	if r.Role == "owner" || !validRoles[r.Role] {
		util.Fail(c, http.StatusBadRequest, "invalid_role", "Choose a valid role.")
		return
	}
	// Same rank ceiling as CreateStaff: a manager cannot promote someone into
	// their own tier, and cannot edit a peer manager at all.
	if middleware.RoleRank(r.Role) >= middleware.RoleRank(middleware.Role(c)) && !middleware.IsSuper(c) {
		util.Fail(c, http.StatusForbidden, "role_too_high",
			"You can only assign roles below your own.")
		return
	}
	var targetRole string
	db.Pool.QueryRow(c, `SELECT role FROM staff WHERE id=$1 AND business_id=$2`,
		c.Param("id"), bizID).Scan(&targetRole)
	if targetRole != "" && middleware.RoleRank(targetRole) >= middleware.RoleRank(middleware.Role(c)) && !middleware.IsSuper(c) {
		util.Fail(c, http.StatusForbidden, "peer_locked",
			"You cannot edit someone at or above your own role.")
		return
	}
	res, err := db.Pool.Exec(c, `
		UPDATE staff SET name=$3, role=$4, title=$5, is_provider=$6, is_active=$7
		WHERE id=$1 AND business_id=$2 AND role <> 'owner'`,
		c.Param("id"), bizID, r.Name, r.Role, r.Title, r.IsProvider, r.IsActive)
	if err != nil {
		util.Server(c, err)
		return
	}
	if res.RowsAffected() == 0 {
		util.NotFound(c, "Staff member not found, or the owner cannot be edited here.")
		return
	}
	if r.Password != "" {
		if len(r.Password) < 8 {
			util.Fail(c, http.StatusBadRequest, "weak_password", "Password must be at least 8 characters.")
			return
		}
		hash, _ := bcrypt.GenerateFromPassword([]byte(r.Password), bcrypt.DefaultCost)
		db.Pool.Exec(c, `UPDATE staff SET password_hash=$3 WHERE id=$1 AND business_id=$2`,
			c.Param("id"), bizID, string(hash))
	}
	Audit(c, "staff.update", "staff", util.ParamID(c), map[string]any{
		"name": r.Name, "role": r.Role, "is_active": r.IsActive,
		"password_changed": r.Password != ""})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// DELETE /api/staff/staff/:id
func DeleteStaff(c *gin.Context) {
	bizID := middleware.BizID(c)
	res, err := db.Pool.Exec(c, `
		UPDATE staff SET is_active=FALSE WHERE id=$1 AND business_id=$2 AND role <> 'owner'`,
		c.Param("id"), bizID)
	if err != nil {
		util.Server(c, err)
		return
	}
	if res.RowsAffected() == 0 {
		util.NotFound(c, "Staff member not found.")
		return
	}
	Audit(c, "staff.deactivate", "staff", util.ParamID(c), nil)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
