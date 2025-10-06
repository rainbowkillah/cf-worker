# CI Secrets for this repository

This repository's GitHub Actions workflow (`.github/workflows/deploy.yml`) requires the following repository Secrets to be configured for deployments to Cloudflare.

Required secrets

- `CLOUDFLARE_API_TOKEN` — A Cloudflare API token with permissions to publish Workers (Workers Scripts: edit, Account: read). Create this in your Cloudflare dashboard and add it to repository Settings → Secrets → Actions.
- `CLOUDFLARE_ACCOUNT_ID` — Your Cloudflare account ID. Required by `wrangler deploy`.

Optional secrets

- `OPENAI_API_KEY` — If you enable LLM features in the Worker, store the OpenAI API key as a secret and reference it in your `wrangler` environment configuration.

How to add secrets

1. Go to your repository on GitHub.
2. Click Settings → Secrets and variables → Actions.
3. Click New repository secret and add the keys above with their values.

Notes

- Do not commit secrets into source code or `wrangler.jsonc`.
- For production deployments, prefer short-lived tokens or fine-grained API tokens with least privilege.
