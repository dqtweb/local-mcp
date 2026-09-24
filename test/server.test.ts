import { mkdtempSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ensureDirs, loadSettings } from "../src/config.js";
import { buildContext } from "../src/context.js";
import { buildHttpApp } from "../src/http.js";

const token = "test-token";
let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  const settings = loadSettings({
    MCP_AUTH_TOKEN: token,
    MCP_DATA_DIR: mkdtempSync(join(tmpdir(), "mcp-data-")), // note: first run downloads the model
    MCP_WORKSPACE_DIR: mkdtempSync(join(tmpdir(), "mcp-ws-")),
  });
  ensureDirs(settings);
  const ctx = await buildContext(settings);
  server = await new Promise<http.Server>((resolve) => {
    const s = http.createServer(buildHttpApp(ctx));
    s.listen(0, "127.0.0.1", () => resolve(s));
  });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(() => server?.close());

async function connect(auth?: string) {
  const client = new Client({ name: "test", version: "0.0.1" });
  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
    requestInit: auth ? { headers: { authorization: `Bearer ${auth}` } } : undefined,
  });
  await client.connect(transport);
  return client;
}

describe("mcp http server", () => {
  it("exposes healthz without auth", async () => {
    const res = await fetch(`${baseUrl}/healthz`);
    expect(res.status).toBe(200);
  });

  it("rejects unauthenticated MCP connections", async () => {
    await expect(connect()).rejects.toThrow();
  });

  it("round-trips a memory over streamable http", async () => {
    const client = await connect(token);
    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name)).toEqual(expect.arrayContaining(["memory_save", "memory_search"]));

    await client.callTool({
      name: "memory_save",
      arguments: { text: "The user prefers Rust for systems tooling.", tags: ["prefs"] },
    });
    const found = await client.callTool({
      name: "memory_search",
      arguments: { query: "which language does the user like for systems work?" },
    });
    expect((found.content as any)[0].text).toContain("Rust");
    await client.close();
  });
});