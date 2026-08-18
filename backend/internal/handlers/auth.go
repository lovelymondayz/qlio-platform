package handlers

import (
	"net/http"
	"strings"
	"time"

	"qlio/backend/internal/db"
	"qlio/backend/internal/middleware"
	"qlio/backend/internal/util"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

type signupReq struct {
	BusinessName string `json:"business_name"`
	Category     string `json:"category"`
	OwnerName    string `json:"owner_name"`
	Email        string `json:"email"`
	Password     string `json:"password"`
}

// POST /api/auth/signup — open self-serve business registration
func Signup(c *gin.Context) {
	var r signupReq
	if err := c.ShouldBindJSON(&r); err != nil {
		util.BadRequest(c, "Please check the form.")
		return
	}
	r.Email = strings.ToLower(strings.TrimSpace(r.Email))
	r.BusinessName = strings.TrimSpace(r.BusinessName)

	if len(r.BusinessName) < 2 {
		util.Fail(c, http.StatusBadRequest, "invalid_business", "Please enter your business name.")
		return
	}
	if !strings.Contains(r.Email, "@") {
		util.Fail(c, http.StatusBadRequest, "invalid_email", "Please enter a valid email address.")
		return
	}
	if len(r.Password) < 8 {
		util.Fail(c, http.StatusBadRequest, "weak_password", "Password must be at least 8 characters.")
		return
	}
	if !allowRate(c, "signup:"+util.ClientIP(c), 5, time.Hour) {
		util.Fail(c, http.StatusTooManyRequests, "rate_limited", "Too many attempts. Please try again later.")
		return
	}

	var taken bool
	db.Pool.QueryRow(c, `SELECT TRUE FROM staff WHERE lower(email)=$1`, r.Email).Scan(&taken)
	if taken {
		util.Fail(c, http.StatusConflict, "email_taken", "An account with that email already exists.")
		return
	}

	// unique slug
	base := util.Slugify(r.BusinessName)
	if base == "" {
		base = "business"
	}
	slug := base
	for i := 2; i < 200; i++ {
		var exists bool
		db.Pool.QueryRow(c, `SELECT TRUE FROM businesses WHERE slug=$1`, slug).Scan(&exists)
		if !exists {
			break
		}
		slug = base + "-" + itoa(i)
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(r.Password), bcrypt.DefaultCost)
	if err != nil {
		util.Server(c, err)
		return
	}

	tx, err := db.Pool.Begin(c)
	if err != nil {
		util.Server(c, err)
		return
	}
	defer tx.Rollback(c)

	cat := r.Category
	if cat == "" {
		cat = "other"
	}

	var bizID int64
	err = tx.QueryRow(c, `
		INSERT INTO businesses (slug, name, category, setup_step)
		VALUES ($1,$2,$3,1) RETURNING id`, slug, r.BusinessName, cat).Scan(&bizID)
	if err != nil {
		util.Server(c, err)
		return
	}

	name := r.OwnerName
	if name == "" {
		name = "Owner"
	}
	var staffID int64
	err = tx.QueryRow(c, `
		INSERT INTO staff (business_id, email, password_hash, name, role, is_provider)
		VALUES ($1,$2,$3,$4,'owner',FALSE) RETURNING id`,
		bizID, r.Email, string(hash), name).Scan(&staffID)
	if err != nil {
		util.Server(c, err)
		return
	}

	// sane defaults: Mon-Fri open, weekend closed
	for wd := 0; wd <= 6; wd++ {
		open := wd >= 1 && wd <= 5
		tx.Exec(c, `
			INSERT INTO business_schedule (business_id, weekday, is_open, open_time, close_time)
			VALUES ($1,$2,$3,'09:00','17:00')
			ON CONFLICT (business_id, weekday) DO NOTHING`, bizID, wd, open)
	}
	tx.Exec(c, `INSERT INTO business_settings (business_id) VALUES ($1) ON CONFLICT DO NOTHING`, bizID)
	tx.Exec(c, `INSERT INTO counters (business_id, name, kind, sort_order) VALUES ($1,'Counter 1','counter',1)`, bizID)

	if err := tx.Commit(c); err != nil {
		util.Server(c, err)
		return
	}

	tok, err := middleware.IssueToken(staffID, bizID, "owner", name, false)
	if err != nil {
		util.Server(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{
		"token": tok, "business_slug": slug, "business_id": bizID,
		"role": "owner", "name": name, "setup_step": 1,
	})
}

type loginReq struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// POST /api/auth/login
func Login(c *gin.Context) {
	var r loginReq
	if err := c.ShouldBindJSON(&r); err != nil {
		util.BadRequest(c, "Please enter your email and password.")
		return
	}
	r.Email = strings.ToLower(strings.TrimSpace(r.Email))

	if !allowRate(c, "login:"+util.ClientIP(c), 10, 15*time.Minute) {
		util.Fail(c, http.StatusTooManyRequests, "rate_limited", "Too many attempts. Please wait 15 minutes.")
		return
	}

	var staffID int64
	var bizID *int64
	var hash, name, role string
	var isSuper, isActive bool
	var slug *string
	err := db.Pool.QueryRow(c, `
		SELECT s.id, s.business_id, s.password_hash, s.name, s.role, s.is_super, s.is_active, b.slug
		FROM staff s LEFT JOIN businesses b ON b.id = s.business_id
		WHERE lower(s.email)=$1`, r.Email).
		Scan(&staffID, &bizID, &hash, &name, &role, &isSuper, &isActive, &slug)
	if err != nil {
		util.Fail(c, http.StatusUnauthorized, "invalid_credentials", "No account found with that email.")
		return
	}
	if !isActive {
		util.Fail(c, http.StatusForbidden, "account_disabled", "This account has been disabled.")
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(r.Password)) != nil {
		util.Fail(c, http.StatusUnauthorized, "wrong_password", "Incorrect password.")
		return
	}

	var b int64
	if bizID != nil {
		b = *bizID
	}
	tok, err := middleware.IssueToken(staffID, b, role, name, isSuper)
	if err != nil {
		util.Server(c, err)
		return
	}
	db.Pool.Exec(c, `UPDATE staff SET last_login_at=now() WHERE id=$1`, staffID)

	s := ""
	if slug != nil {
		s = *slug
	}
	var step int
	if b > 0 {
		db.Pool.QueryRow(c, `SELECT setup_step FROM businesses WHERE id=$1`, b).Scan(&step)
	}
	c.JSON(http.StatusOK, gin.H{
		"token": tok, "business_slug": s, "business_id": b,
		"role": role, "name": name, "is_super": isSuper, "setup_step": step,
	})
}

// GET /api/staff/me
func Me(c *gin.Context) {
	bizID := middleware.BizID(c)
	var slug, bname string
	var step int
	db.Pool.QueryRow(c, `SELECT slug, name, setup_step FROM businesses WHERE id=$1`, bizID).Scan(&slug, &bname, &step)
	role, _ := c.Get("role")
	name, _ := c.Get("staff_name")
	c.JSON(http.StatusOK, gin.H{
		"staff_id": middleware.StaffID(c), "business_id": bizID,
		"business_slug": slug, "business_name": bname,
		"role": role, "name": name, "is_super": middleware.IsSuper(c), "setup_step": step,
	})
}

func itoa(i int) string {
	if i == 0 {
		return "0"
	}
	neg := i < 0
	if neg {
		i = -i
	}
	var b [20]byte
	p := len(b)
	for i > 0 {
		p--
		b[p] = byte('0' + i%10)
		i /= 10
	}
	if neg {
		p--
		b[p] = '-'
	}
	return string(b[p:])
}
