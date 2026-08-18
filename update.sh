#!/bin/bash
# Qlio — manual update: pull latest, rebuild, recreate containers
# Usage: ./update.sh [--force]
# Prerequisite: git push origin main (run this AFTER pushing)
#
# IMPORTANT: Always use this instead of "docker compose restart"
# because restart keeps old containers running with stale images.

set -e

PROJECT_DIR="/root/qlio-platform"
COMPOSE="docker compose"

cd "$PROJECT_DIR"

echo "📡 Checking for updates..."
git fetch origin main 2>/dev/null

LOCAL=$(git rev-parse main 2>/dev/null)
REMOTE=$(git rev-parse origin/main 2>/dev/null)

if [ "$LOCAL" = "$REMOTE" ] && [ "$1" != "--force" ]; then
    echo "✅ Already up to date ($LOCAL)"
    echo ""
    echo "Services:"
    $COMPOSE ps 2>/dev/null
    exit 0
fi

if [ "$LOCAL" = "$REMOTE" ] && [ "$1" = "--force" ]; then
    echo "🔄 Forced rebuild ($LOCAL)"
else
    echo "🔄 Update: $LOCAL → $REMOTE"
    git pull origin main
fi

echo "🔨 Building..."
$COMPOSE build --no-cache

echo "🚀 Recreating with latest image..."
$COMPOSE up -d --force-recreate

echo "⏳ Waiting for services..."
sleep 8

echo ""
echo "📊 Status:"
$COMPOSE ps

echo ""
echo "🏥 Health:"
curl -fsS http://localhost:8087/api/health && echo "  ← backend OK" || echo "  ✗ backend FAILED"
curl -fsS -o /dev/null -w "  frontend HTTP %{http_code}\n" http://localhost:3007/ || echo "  ✗ frontend FAILED"

echo ""
echo "✅ Done!"
