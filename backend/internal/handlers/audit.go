package handlers

import (
	"qlio/backend/internal/db"
	"qlio/backend/internal/middleware"
	"qlio/backend/internal/util"

	"github.com/gin-gonic/gin"
)

// Audit records a staff action against the tenant's audit trail (§45).
//
// Deliberately best-effort: an audit write must never fail the operation the
// user asked for, so the error is swallowed. It runs after the change has been
// committed, using the request context.
//
// entityID may be nil for actions that are not about a single row (e.g. a
// schedule replacement, which rewrites seven rows at once).
func Audit(c *gin.Context, action, entity string, entityID *int64, meta map[string]any) {
	bizID := middleware.BizID(c)
	if bizID == 0 {
		return
	}
	if meta == nil {
		meta = map[string]any{}
	}
	// Always record who acted, so the log reads correctly even after the
	// staff row is renamed or deleted.
	meta["by"] = middleware.StaffName(c)
	meta["role"] = middleware.Role(c)

	db.Pool.Exec(c, `
		INSERT INTO audit_log (business_id, staff_id, action, entity, entity_id, meta, ip)
		VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		bizID, middleware.StaffID(c), action, entity, entityID, meta, util.ClientIP(c))
}

// AuditID is the common case: an action on one row whose id is known.
func AuditID(c *gin.Context, action, entity string, entityID int64, meta map[string]any) {
	Audit(c, action, entity, &entityID, meta)
}
