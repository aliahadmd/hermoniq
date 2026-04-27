#!/usr/bin/env bash
set -euo pipefail

# Harmoniq Backend Deployment Script
# Run from the backend/ directory: ./scripts/deploy.sh

SCRIPT_DIR="$(dirname "$0")"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$BACKEND_DIR"

echo "=== Harmoniq Backend Deployment ==="
echo ""

# Step 1: Create the production D1 database (one-time)
echo "Step 1: Create the production D1 database (skip if already created)"
echo "  Run: wrangler d1 create harmoniq-db"
echo "  This outputs a database_id — copy it for the next step."
echo ""
read -p "Have you already created the D1 database? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Creating D1 database..."
  wrangler d1 create harmoniq-db
  echo ""
  echo ">>> IMPORTANT: Copy the database_id from the output above"
  echo ">>> and update it in wrangler.json under d1_databases[0].database_id"
  echo ""
  read -p "Press Enter after updating wrangler.json with the database_id..."
fi

# Step 2: Verify database_id is set
if grep -q '"database_id": "LOCAL_PLACEHOLDER"' wrangler.json; then
  echo "ERROR: database_id in wrangler.json is still set to LOCAL_PLACEHOLDER."
  echo "Please update it with the real ID from 'wrangler d1 create harmoniq-db' and re-run."
  exit 1
fi

# Step 3: Apply migrations to the production database
echo ""
echo "Step 3: Applying migrations to production D1 database..."
wrangler d1 migrations apply harmoniq-db --remote

# Step 4: Deploy the worker
echo ""
echo "Step 4: Deploying worker to Cloudflare..."
wrangler deploy

echo ""
echo "=== Deployment complete ==="
echo "Your backend is live. Check the Cloudflare dashboard for the production URL."
