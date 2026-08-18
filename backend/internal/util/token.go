package util

import (
	"crypto/rand"
	"math/big"
	"strings"
)

const tokenAlphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

func randFrom(alphabet string, n int) string {
	var sb strings.Builder
	max := big.NewInt(int64(len(alphabet)))
	for i := 0; i < n; i++ {
		v, err := rand.Int(rand.Reader, max)
		if err != nil {
			// crypto/rand failure is unrecoverable; panic is correct here
			panic("crypto/rand unavailable: " + err.Error())
		}
		sb.WriteByte(alphabet[v.Int64()])
	}
	return sb.String()
}

// ReceiptToken is the unguessable public identity of a booking (URL + QR payload).
func ReceiptToken() string { return randFrom(tokenAlphabet, 24) }

// BookingCode is the short human-readable reference, e.g. QL-8F29A4.
func BookingCode() string { return "QL-" + randFrom(codeAlphabet, 6) }

// Slugify makes a URL-safe business slug.
func Slugify(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	var sb strings.Builder
	lastDash := false
	for _, r := range s {
		switch {
		case (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9'):
			sb.WriteRune(r)
			lastDash = false
		case r == ' ' || r == '-' || r == '_' || r == '.':
			if !lastDash && sb.Len() > 0 {
				sb.WriteByte('-')
				lastDash = true
			}
		}
	}
	out := strings.Trim(sb.String(), "-")
	if len(out) > 48 {
		out = strings.Trim(out[:48], "-")
	}
	return out
}
