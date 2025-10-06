
# home.mrrainbowsmoke.com (Cloudflare Worker)

This folder contains a Cloudflare Worker used as the landing page for `home.mrrainbowsmoke.com`.

Goals:
- Serve a small static landing page via Cloudflare Workers.
- Later integrate Cloudflare D1 (SQL), R2 (object storage), KV, and Durable Objects as needed.

Quick start

- Start local dev server:

```bash
npm run dev
```

- Publish (set `account_id` in `wrangler.toml` first):

```bash
npm run deploy
```

Files added

- `wrangler.toml` — Wrangler configuration for the worker
- `src/index.js` — Worker source that returns the landing page HTML
- `package.json` — scripts for local dev and deploy

Next steps

- If you want, I can scaffold D1, R2, KV bindings and a simple Durable Object and wire them into `wrangler.toml`.

Environment / publishing notes


```bash
export CLOUDFLARE_ACCOUNT_ID=$(cat .env | sed -n 's/^CLOUDFLARE_ACCOUNT_ID=\(.*\)$/\1/p')
wrangler publish
```
 
 Deployment
 ----------
 
 The worker is deployed at:
 
 https://home-mrrainbowsmoke.64zgd764sm.workers.dev

CI / GitHub Actions
-------------------

You can configure GitHub Actions to deploy on push to `main`. The repository must define the following secrets:

- `CLOUDFLARE_ACCOUNT_ID` — your Cloudflare account ID
- `CLOUDFLARE_API_TOKEN` — a scoped API token with permissions to manage Workers and related resources

The repo includes a sample workflow at `.github/workflows/deploy.yml` that installs Wrangler and runs `wrangler deploy` using those secrets.

Workflow badge
--------------

You can add a badge to show the status of the `Deploy Worker` workflow:

```
[![Deploy Worker](https://github.com/rainbowkillah/cf-worker/actions/workflows/deploy.yml/badge.svg)](https://github.com/rainbowkillah/cf-worker/actions/workflows/deploy.yml)
```

Setting up secrets
------------------

1. Go to your repository Settings → Secrets & variables → Actions.
2. Add `CLOUDFLARE_API_TOKEN` with a token scoped to:
	- Account: Read & Write for Workers, KV, D1 and R2 as needed (restrict as appropriate).
	- Workers Scripts: write
3. Add `CLOUDFLARE_ACCOUNT_ID` with your account id.




