#!/usr/bin/env bash
set -euo pipefail

echo "CI dry run: validate secrets and config"

# Check env vars (use local env as a proxy for secrets)
missing=()
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then missing+=(CLOUDFLARE_API_TOKEN); fi
if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then missing+=(CLOUDFLARE_ACCOUNT_ID); fi
if [ ${#missing[@]} -ne 0 ]; then
  echo "Missing required secrets: ${missing[*]}"
  echo "Set them in your environment to simulate CI, e.g. export CLOUDFLARE_API_TOKEN=..."
  exit 1
fi

echo "Secrets present. Checking for wrangler config..."
if [ ! -f wrangler.jsonc ] && [ ! -f wrangler.json ] && [ ! -f wrangler.toml ]; then
  echo "No wrangler config found (wrangler.jsonc, wrangler.json, or wrangler.toml)."
  exit 1
fi

echo "Found wrangler config. Simulating npm install (no network)..."
if [ -f package-lock.json ] || [ -f package.json ]; then
  echo "(skipping actual npm install in dry run)"
else
  echo "No package.json found; skipping npm steps"
fi

echo "Dry run completed successfully. (no deploy performed)"

exit 0
