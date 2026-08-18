package util

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

// Fail sends a structured error the frontend can branch on.
func Fail(c *gin.Context, status int, code, msg string) {
	c.AbortWithStatusJSON(status, gin.H{"error": code, "message": msg})
}

func BadRequest(c *gin.Context, msg string) { Fail(c, http.StatusBadRequest, "bad_request", msg) }
func NotFound(c *gin.Context, msg string)   { Fail(c, http.StatusNotFound, "not_found", msg) }
func Server(c *gin.Context, err error) {
	Fail(c, http.StatusInternalServerError, "server_error", err.Error())
}

// NormalizePhone strips formatting and converts local Indonesian prefixes to 62.
func NormalizePhone(p string) string {
	var sb strings.Builder
	for _, r := range p {
		if r >= '0' && r <= '9' {
			sb.WriteRune(r)
		}
	}
	d := sb.String()
	switch {
	case strings.HasPrefix(d, "0"):
		return "62" + strings.TrimPrefix(d, "0")
	case strings.HasPrefix(d, "620"):
		return "62" + strings.TrimPrefix(d, "620")
	}
	return d
}

// MaskPhone hides the middle digits for any semi-public display.
func MaskPhone(p string) string {
	if len(p) < 6 {
		return "***"
	}
	return p[:4] + strings.Repeat("*", len(p)-7) + p[len(p)-3:]
}

func ClientIP(c *gin.Context) string { return c.ClientIP() }

// I64 formats an int64 without importing strconv at call sites.
func I64(v int64) string { return strconv.FormatInt(v, 10) }
