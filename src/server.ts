import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "./context.js";
import { registerAll } from "./registry.js";

/** Cheap to construct — heavy deps (embedder, DB) live in ctx, created once. */
export async function createServer(ctx: AppContext): Promise<McpServer> {
  const server = new McpServer(
    { name: "local-agent", version: "0.1.0" },
    { instructions: "Local agent server: persistent RAG memory + sandboxed workspace tools." },
  );
  await registerAll(server, ctx);
  return server;
}