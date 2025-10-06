
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

- I added a `.env` file with `CF_ACCOUNT_ID`. This file is in `.gitignore` to avoid committing it.
- `wrangler publish` will pick up the account id from the environment if you export it first:

```bash
export CF_ACCOUNT_ID=$(cat .env | sed -n 's/^CF_ACCOUNT_ID=\(.*\)$/\1/p')
wrangler publish
```

