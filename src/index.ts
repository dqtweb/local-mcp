#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildContext } from "./context.js";
import { ensureDirs, loadSettings } from "./config.js";
import { attachWebSocket, buildHttpApp, listen } from "./http.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const settings = loadSettings();
  ensureDirs(settings);
  const mode = process.argv[2] ?? "http";
  const ctx = await buildContext(settings); // loads the embedding model once

  if (mode === "stdio") {
    const server = await createServer(ctx);
    await server.connect(new StdioServerTransport());
    return; // stdout is the protocol — never log to it in stdio mode
  }

  const httpServer = await listen(buildHttpApp(ctx), ctx);
  attachWebSocket(httpServer, ctx);
  console.error(`MCP: http://${settings.host}:${settings.port}/mcp · events: ws://${settings.host}:${settings.port}/ws`);

  const shutdown = async () => {
    await ctx.browser.shutdown();
    httpServer.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.error(`MCP server listening on http://${settings.host}:${settings.port}/mcp`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
