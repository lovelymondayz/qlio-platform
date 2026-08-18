package middleware

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

type Claims struct {
	StaffID    int64  `json:"sid"`
	BusinessID int64  `json:"bid"`
	Role       string `json:"role"`
	IsSuper    bool   `json:"sup"`
	Name       string `json:"name"`
	jwt.RegisteredClaims
}

var secret []byte

func SetSecret(s string) { secret = []byte(s) }

func IssueToken(staffID, businessID int64, role, name string, isSuper bool) (string, error) {
	c := Claims{
		StaffID:    staffID,
		BusinessID: businessID,
		Role:       role,
		IsSuper:    isSuper,
		Name:       name,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(14 * 24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "qlio",
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, c).SignedString(secret)
}

func parse(tok string) (*Claims, error) {
	t, err := jwt.ParseWithClaims(tok, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		return secret, nil
	}, jwt.WithValidMethods([]string{"HS256"}))
	if err != nil {
		return nil, err
	}
	c, ok := t.Claims.(*Claims)
	if !ok || !t.Valid {
		return nil, jwt.ErrTokenInvalidClaims
	}
	return c, nil
}

// Auth requires a valid staff/owner token.
func Auth() gin.HandlerFunc {
	return func(c *gin.Context) {
		h := c.GetHeader("Authorization")
		if !strings.HasPrefix(h, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		cl, err := parse(strings.TrimPrefix(h, "Bearer "))
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid_token"})
			return
		}
		c.Set("staff_id", cl.StaffID)
		c.Set("business_id", cl.BusinessID)
		c.Set("role", cl.Role)
		c.Set("is_super", cl.IsSuper)
		c.Set("staff_name", cl.Name)
		c.Next()
	}
}

// RequireRole gates an endpoint to specific roles. Super admin always passes.
func RequireRole(roles ...string) gin.HandlerFunc {
	allowed := map[string]bool{}
	for _, r := range roles {
		allowed[r] = true
	}
	return func(c *gin.Context) {
		if sup, _ := c.Get("is_super"); sup == true {
			c.Next()
			return
		}
		role, _ := c.Get("role")
		rs, _ := role.(string)
		if !allowed[rs] {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden", "message": "Your role cannot perform this action."})
			return
		}
		c.Next()
	}
}

// BizID is the tenant scope for every authenticated query. Never trust a body field.
func BizID(c *gin.Context) int64 {
	v, _ := c.Get("business_id")
	id, _ := v.(int64)
	return id
}

func StaffID(c *gin.Context) int64 {
	v, _ := c.Get("staff_id")
	id, _ := v.(int64)
	return id
}

func IsSuper(c *gin.Context) bool {
	v, _ := c.Get("is_super")
	b, _ := v.(bool)
	return b
}

// BizFromToken validates a token passed as a query param (WebSocket upgrades
// cannot carry an Authorization header) and returns its business scope.
func BizFromToken(tok string) (int64, bool) {
	cl, err := parse(tok)
	if err != nil {
		return 0, false
	}
	return cl.BusinessID, true
}
