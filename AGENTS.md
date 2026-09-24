# Local Agent MCP — Codex Guide

This repository is a TypeScript MCP server. When working with it, discover MCP capabilities with `tools/list`, `prompts/list`, and `resources/list`; do not invent prefixed names such as `local_agent_browser_get_content`. The server registers the raw tool name `browser_get_content`.

## Start and verify

```bash
npm install
npm run typecheck
npm run build

# HTTP MCP server
node dist/index.js http

# stdio MCP server (recommended for local MCP clients)
node dist/index.js stdio
```

HTTP endpoints:

- MCP: `http://127.0.0.1:8000/mcp`
- Health: `http://127.0.0.1:8000/healthz`
- Admin UI: `http://127.0.0.1:8000/admin`
- WebSocket events: `ws://127.0.0.1:8000/ws`

If `MCP_AUTH_TOKEN` is set, `/mcp` and `/admin` require `Authorization: Bearer <token>`.

## Tool catalog

Memory:

- `memory_save`: save one atomic fact or summary.
- `memory_search`: semantic search with optional tags and `top_k`.
- `memory_get`, `memory_delete`, `memory_list`, `memory_ingest`, `memory_stats`.

Workspace:

- `workspace_read`, `workspace_write`, `workspace_list`.
- Paths are sandboxed below `MCP_WORKSPACE_DIR`.

Avatar:

- `avatar_generate`: returns MCP image content as PNG by default or SVG; use PNG for inline previews.

Browser:

- `browser_navigate`: navigate to an `http`/`https` URL.
- `browser_snapshot`: read the accessibility tree before selecting elements.
- `browser_get_content`: compatibility alias; returns body/selector text or HTML.
- `browser_click`, `browser_type`, `browser_screenshot`, `browser_evaluate`, `browser_close`.

## Browser workflow

For web research, use this sequence:

1. `browser_navigate` to the target URL.
2. `browser_snapshot` to inspect the page.
3. Read `browser://scraping-knowledge` when a selector recipe may apply.
4. Use `browser_get_content` or `browser_evaluate` with a verified selector.
5. Summarize the results and call `memory_save` if the user asks to remember them.

The known recipe `znews_articles` is:

```javascript
[...document.querySelectorAll('.article-title a')].map(a => a.innerText)
```

The prompt `scrape-page-with-knowledge` guides this workflow. The prompt `avatar-create` guides avatar generation. The resource `avatar://tool-info` documents avatar output.

## Browser connection modes

Default mode launches a Playwright Chromium instance. To attach to an existing Chrome, start Chrome with remote debugging and set:

```bash
MCP_BROWSER_MODE=connect
MCP_BROWSER_CDP_URL=http://127.0.0.1:9222
MCP_BROWSER_HEADLESS=false
```

Install the browser binary if launch mode fails:

```bash
npx playwright install chromium
```

## Change discipline

- Keep MCP protocol output on stdout clean in stdio mode; log diagnostics to stderr.
- Update `src/registry.ts` when adding a new tool, prompt, or resource module.
- Run `npm run typecheck` and `npm run build` after changes.
- Do not expose admin controls or disable authentication beyond local development unless explicitly requested.
