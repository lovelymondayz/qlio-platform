# Qlio Platform — Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Cloudflare Edge                          │
│                    qlio.arjism.com (HTTPS)                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Cloudflare Tunnel (cf-tunnel)                │
│              http://192.168.88.101:8087 (plain HTTP)            │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Nginx Reverse Proxy                      │
│                    :8087 → :8087 (backend)                      │
│                    :3007 → :3007 (frontend)                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                              ▼
┌──────────────────────┐        ┌──────────────────────┐
│   Go + GIN Backend   │        │  React + Vite + TS   │
│   :8087 (internal)   │        │  :3007 (internal)    │
│                      │        │                      │
│  - JWT Auth          │        │  - Tailwind CSS      │
│  - pgx + Postgres    │        │  - react-router-dom  │
│  - Multi-tenant      │        │  - Dashboard         │
│  - API Keys          │        │  - Analytics         │
└──────────┬───────────┘        └──────────────────────┘
           │
           ▼
┌──────────────────────┐
│   PostgreSQL :5438   │
│                      │
│  - Tenants           │
│  - Users             │
│  - API Keys          │
│  - Usage Logs        │
└──────────────────────┘
```

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Language | Go | 1.22+ |
| Web Framework | Gin | v1.10 |
| Database Driver | pgx | v4 |
| Auth | JWT (golang-jwt/jwt) | v5 |
| Frontend | React + Vite + TypeScript | Vite 5, React 18 |
| Styling | Tailwind CSS | v3 |
| Routing | react-router-dom | v6 |
| Deployment | Docker Compose | v3.8 |
| Reverse Proxy | Nginx | - |
| Tunnel | Cloudflare Tunnel | - |

## Key Design Decisions

### 1. Multi-tenant Architecture
- Tenant isolation via database rows
- API key per tenant
- Usage quotas and rate limiting

### 2. API-First Design
- RESTful API with OpenAPI spec
- API key authentication
- Rate limiting per tenant

### 3. Usage Analytics
- Track API calls per tenant
- Dashboard with usage metrics
- Billing-ready data model

### 4. Scalable Storage
- PostgreSQL for relational data
- Ready for Redis caching
- S3-compatible object storage

## API Endpoints

### Public
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/auth/register` | Register tenant |
| POST | `/api/auth/login` | Login |

### Authenticated (API Key)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/tenant` | Get tenant info |
| GET | `/api/usage` | Get usage stats |
| POST | `/api/keys` | Create API key |

## Ports

| Service | External | Internal |
|---------|----------|----------|
| Backend | `:8087` | `:8087` |
| Frontend | `:3007` | `:80` |
| DB | `:5438` | `:5432` |
