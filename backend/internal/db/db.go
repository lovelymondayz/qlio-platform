package db

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

var Pool *pgxpool.Pool

func Connect(url string) error {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return err
	}
	cfg.MaxConns = 12
	cfg.MinConns = 2
	cfg.MaxConnLifetime = time.Hour

	for i := 0; i < 15; i++ {
		p, err := pgxpool.NewWithConfig(context.Background(), cfg)
		if err == nil {
			ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
			err = p.Ping(ctx)
			cancel()
			if err == nil {
				Pool = p
				log.Println("db: connected")
				return nil
			}
			p.Close()
		}
		log.Printf("db: waiting (%d/15): %v", i+1, err)
		time.Sleep(2 * time.Second)
	}
	return fmt.Errorf("db: could not connect")
}

// Migrate runs every .sql file in dir, in lexical order, idempotently.
func Migrate(dir string) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		log.Printf("migrate: skip (%v)", err)
		return nil
	}
	var files []string
	for _, e := range entries {
		if !e.IsDir() && filepath.Ext(e.Name()) == ".sql" {
			files = append(files, e.Name())
		}
	}
	sort.Strings(files)
	for _, f := range files {
		b, err := os.ReadFile(filepath.Join(dir, f))
		if err != nil {
			return err
		}
		if _, err := Pool.Exec(context.Background(), string(b)); err != nil {
			return fmt.Errorf("migrate %s: %w", f, err)
		}
		log.Printf("migrate: applied %s", f)
	}
	return nil
}
