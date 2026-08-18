package config

import (
	"log"
	"os"
)

type Config struct {
	Port        string
	DatabaseURL string
	JWTSecret   string
	PublicBase  string
	Env         string
}

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func Load() *Config {
	c := &Config{
		Port:        env("PORT", "8087"),
		DatabaseURL: env("DATABASE_URL", ""),
		JWTSecret:   env("JWT_SECRET", ""),
		PublicBase:  env("PUBLIC_BASE_URL", "https://qlio.arjism.com"),
		Env:         env("APP_ENV", "production"),
	}
	if c.DatabaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}
	if c.JWTSecret == "" {
		log.Fatal("JWT_SECRET is required")
	}
	return c
}
