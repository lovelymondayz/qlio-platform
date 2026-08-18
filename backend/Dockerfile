FROM golang:1.22-alpine AS build
WORKDIR /src
RUN apk add --no-cache git
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/qlio ./cmd/server

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata curl && adduser -D -u 10001 qlio
WORKDIR /app
COPY --from=build /out/qlio /app/qlio
COPY migrations /app/migrations
USER qlio
EXPOSE 8087
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:8087/api/health || exit 1
CMD ["/app/qlio"]
