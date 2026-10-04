# ApiDuck AI Studio - GitHub Pages + Cloudflare Worker

Architecture:

Browser -> GitHub Pages -> Cloudflare Worker -> ApiDuck

The ApiDuck API key is stored as a Cloudflare Worker secret and is never placed in the frontend.

## Step 1 - GitHub

Create a repository and upload:
- index.html
- worker/api.js
- wrangler.toml

Enable GitHub Pages from Settings -> Pages -> Deploy from a branch -> main -> /(root).

## Step 2 - Cloudflare

Create a Worker named `apiduck-ai-proxy`.

Deploy `worker/api.js`.

Add a Worker secret named:
APIDUCK_API_KEY

Use your ApiDuck key as the secret value.

Copy the Worker URL. It will look like:
https://apiduck-ai-proxy.<your-subdomain>.workers.dev

## Step 3 - Connect the frontend

Open index.html and change:

const API="/api/ai";

to:

const API="https://YOUR-WORKER.workers.dev";

Commit the change to GitHub.

## Important

Do not put the ApiDuck key in index.html, JavaScript, GitHub source, or GitHub Actions logs.

The image edit endpoint is included as a best-effort ApiDuck-compatible route. If ApiDuck exposes editing under a different route, only the Worker route needs to be changed.
