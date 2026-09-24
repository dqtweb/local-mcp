# How to use

## Step 1 — Start it

```sh
# Node version
npm install
MCP_AUTH_TOKEN=dev-token npm run dev          # dev (tsx watch)
# or: npm run build && MCP_AUTH_TOKEN=dev-token npm start

# Python version
uv sync
MCP_AUTH_TOKEN=dev-token uv run mcp-local-server
```

Verify it's alive:

```sh
curl http://127.0.0.1:8000/healthz
# {"status":"ok"}
```

(First start downloads the ~30 MB embedding model into data/models; after that it's instant.)

## Step 2 — Explore it interactively (recommended first)

```sh
npx @modelcontextprotocol/inspector
```

node --import tsx scripts/test-avatar.ts

/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/mcp-chrome