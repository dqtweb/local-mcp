import http from "node:http";
import { randomBytes, timingSafeEqual, createHash } from "node:crypto";
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { WebSocketServer, WebSocket } from "ws";
import type { AppContext } from "./context.js";
import { createServer } from "./server.js";
import { buildAdminRouter, type AdminMetrics } from "./admin.js";

/** /ws — broadcast every EventBus event as JSON lines to connected clients.
    Auth via ?token= (browser WS clients can't set headers easily). */
export function attachWebSocket(server: http.Server, ctx: AppContext): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const { pathname, searchParams } = new URL(req.url ?? "/", "http://localhost");
    if (pathname !== "/ws" || !ctx.settings.wsEnabled) {
      socket.destroy();
      return;
    }
    if (ctx.settings.authToken && searchParams.get("token") !== ctx.settings.authToken) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  wss.on("connection", (ws) => {
    ws.send(JSON.stringify({ type: "hello", ts: new Date().toISOString() }));
    ws.on("message", (raw) => {
      // clients may send {"type":"ping"} — reply, ignore everything else
      if (String(raw).includes("ping")) ws.send(JSON.stringify({ type: "pong" }));
    });
  });

  const unsubscribe = ctx.bus.subscribe((event) => {
    const msg = JSON.stringify(event);
    for (const ws of wss.clients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    }
  });

  server.on("close", () => {
    unsubscribe();
    wss.close();
  });
  return wss;
}

export function buildHttpApp(ctx: AppContext): express.Express {
  const app = express();
  const metrics: AdminMetrics = { clients: new Map(), traffic: [], active: 0 };
  const clients = new Set<string>();
  const codes = new Map<string, { clientId: string; redirectUri: string; challenge: string; expires: number }>();
  const accessTokens = new Set<string>();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "20mb" }));
  app.use(express.urlencoded({ extended: false }));

  app.get("/healthz", (_req, res) => res.json({ status: "ok" }));
  app.use("/admin", buildAdminRouter(ctx, metrics));

  app.use((req, res, next) => {
    if (!req.path.startsWith("/mcp")) return next();
    const started = Date.now();
    const client = String(req.headers["x-client-name"] ?? req.headers["user-agent"] ?? req.ip ?? "unknown").slice(0, 100);
    const item = metrics.clients.get(client) ?? { client, lastSeen: Date.now(), requests: 0 };
    item.lastSeen = Date.now(); item.requests += 1; metrics.clients.set(client, item); metrics.active += 1;
    res.on("finish", () => { metrics.active = Math.max(0, metrics.active - 1); metrics.traffic.push({ time: new Date().toISOString(), client, method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - started }); if (metrics.traffic.length > 100) metrics.traffic.shift(); });
    next();
  });

  // Local OAuth/PKCE endpoints for clients such as VS Code/Continue.
  app.post("/register", (req, res) => {
    const clientId = randomBytes(16).toString("hex");
    clients.add(clientId);
    res.status(201).json({
      client_id: clientId,
      client_name: req.body?.client_name ?? "local-mcp-client",
      redirect_uris: req.body?.redirect_uris ?? [],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    });
  });

  app.get("/authorize", (req, res) => {
    const { client_id, redirect_uri, code_challenge, state } = req.query;
    if (typeof client_id !== "string" || typeof redirect_uri !== "string" || typeof code_challenge !== "string") {
      res.status(400).send("Missing OAuth parameters");
      return;
    }
    if (clients.size > 0 && !clients.has(client_id)) {
      res.status(400).send("Unknown client_id");
      return;
    }
    const code = randomBytes(32).toString("base64url");
    codes.set(code, { clientId: client_id, redirectUri: redirect_uri, challenge: code_challenge, expires: Date.now() + 60_000 });
    const redirect = new URL(redirect_uri);
    redirect.searchParams.set("code", code);
    if (typeof state === "string") redirect.searchParams.set("state", state);
    res.redirect(redirect.toString());
  });

  app.post("/token", (req, res) => {
    const { grant_type, code, client_id, redirect_uri, code_verifier } = req.body ?? {};
    const record = typeof code === "string" ? codes.get(code) : undefined;
    if (grant_type !== "authorization_code" || !record || record.expires < Date.now() || record.clientId !== client_id || record.redirectUri !== redirect_uri || typeof code_verifier !== "string") {
      res.status(400).json({ error: "invalid_grant" });
      return;
    }
    const challenge = createHash("sha256").update(code_verifier).digest("base64url");
    if (challenge.length !== record.challenge.length || !timingSafeEqual(Buffer.from(challenge), Buffer.from(record.challenge))) {
      res.status(400).json({ error: "invalid_grant" });
      return;
    }
    codes.delete(code);
    const accessToken = randomBytes(32).toString("base64url");
    accessTokens.add(accessToken);
    res.json({ access_token: accessToken, token_type: "Bearer", expires_in: 3600 });
  });

  if (ctx.settings.authToken) {
    const expected = `Bearer ${ctx.settings.authToken}`;
    app.use("/mcp", (req, res, next) =>
      req.headers.authorization === expected || accessTokens.has(req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "")
        ? next()
        : res.status(401).json({ error: "unauthorized" }),
    );
  }

  // Stateless pattern from the SDK docs: fresh transport (and server wrapper)
  // per request. Heavy deps are shared via ctx, so this is cheap.
  app.post("/mcp", async (req, res) => {
    try {
      const server = await createServer(ctx);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless — no sticky sessions
        enableJsonResponse: true,
        // Optional hardening: allowedHosts: ["127.0.0.1", "localhost"],
      });
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      // Express 5 forwards rejected promises, but explicit is fine here too
      if (!res.headersSent) res.status(500).json({ error: "internal error" });
    }
  });

  const notAllowed = (_req: express.Request, res: express.Response) =>
    res.status(405).json({ error: "method not allowed (stateless mode)" });
  app.get("/mcp", notAllowed);
  app.delete("/mcp", notAllowed);

  return app;
}

export function listen(app: express.Express, ctx: AppContext): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(ctx.settings.port, ctx.settings.host, () => resolve(server));
  });
}
