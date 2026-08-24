#!/bin/bash
# Qlio — manual update: pull latest, rebuild, recreate containers
# Usage: ./scripts/update.sh [--force]
# Prerequisite: git push origin main (run this AFTER pushing)
#
# This script:
# 1. Fetches latest from git
# 2. Builds Docker images (--no-cache = fresh build)
# 3. Recreates containers (--force-recreate = new containers from latest image)
#
# IMPORTANT: Always use this instead of "docker compose restart"
# because restart keeps old containers running with stale images.

set -e

PROJECT_DIR="/root/hermes/qlio-platform"
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
sleep 5

echo ""
echo "📊 Status:"
$COMPOSE ps

echo ""
echo "🏥 Health:"
curl -sf http://localhost:8087/api/health > /dev/null && echo "  Backend:  ✅" || echo "  Backend:  ❌"
curl -sf http://localhost:3007/ > /dev/null && echo "  Frontend: ✅" || echo "  Frontend: ❌"

echo ""
echo "✅ Done!"
