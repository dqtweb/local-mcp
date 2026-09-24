import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const boolean = z
  .enum(["true", "false"])
  .default("true")
  .transform((v) => v === "true"); // z.coerce.boolean() would turn "false" into true — avoid

const Env = z.object({
  MCP_HOST: z.string().default("127.0.0.1"),
  MCP_PORT: z.coerce.number().default(8000),
  MCP_STATELESS_HTTP: boolean,
  MCP_AUTH_TOKEN: z.string().optional(),
  MCP_DATA_DIR: z.string().default("data"),
  MCP_WORKSPACE_DIR: z.string().default("workspace"),
  MCP_EMBEDDING_MODEL: z.string().default("Xenova/bge-small-en-v1.5"),
  MCP_CHUNK_SIZE: z.coerce.number().default(800),
  MCP_CHUNK_OVERLAP: z.coerce.number().default(100),
  MCP_DEFAULT_TOP_K: z.coerce.number().default(5),
  // Node equivalent of Python entry points: comma-separated module specifiers
  // whose default export is { register(server, ctx) }
  MCP_TOOL_MODULES: z.string().default(""),
  MCP_BROWSER_HEADLESS: boolean.default("true"),
  MCP_BROWSER_MODE: z.enum(["launch", "connect"]).default("launch"),
  MCP_BROWSER_CDP_URL: z.string().default("http://127.0.0.1:9222"),
  MCP_BROWSER_NAV_TIMEOUT_MS: z.coerce.number().default(30000),
  MCP_BROWSER_ALLOW_EVAL: boolean.default("true"),
  MCP_WS_ENABLED: boolean.default("true"),
});

export interface Settings {
  host: string;
  port: number;
  statelessHttp: boolean;
  authToken?: string;
  dataDir: string;
  workspaceDir: string;
  embeddingModel: string;
  chunkSize: number;
  chunkOverlap: number;
  defaultTopK: number;
  extraToolModules: string[];
  browserHeadless: boolean;
  browserMode: "launch" | "connect";
  browserCdpUrl: string;
  browserNavTimeoutMs: number;
  browserAllowEval: boolean;
  wsEnabled: boolean;
}

export function loadSettings(env: NodeJS.ProcessEnv = process.env): Settings {
  const e = Env.parse(env);
  return {
    host: e.MCP_HOST,
    port: e.MCP_PORT,
    statelessHttp: e.MCP_STATELESS_HTTP,
    authToken: e.MCP_AUTH_TOKEN,
    dataDir: e.MCP_DATA_DIR,
    workspaceDir: e.MCP_WORKSPACE_DIR,
    embeddingModel: e.MCP_EMBEDDING_MODEL,
    chunkSize: e.MCP_CHUNK_SIZE,
    chunkOverlap: e.MCP_CHUNK_OVERLAP,
    defaultTopK: e.MCP_DEFAULT_TOP_K,
    extraToolModules: e.MCP_TOOL_MODULES.split(",").map((s) => s.trim()).filter(Boolean),
    browserHeadless: e.MCP_BROWSER_HEADLESS,
    browserMode: e.MCP_BROWSER_MODE,
    browserCdpUrl: e.MCP_BROWSER_CDP_URL,
    browserNavTimeoutMs: e.MCP_BROWSER_NAV_TIMEOUT_MS,
    browserAllowEval: e.MCP_BROWSER_ALLOW_EVAL,
    wsEnabled: e.MCP_WS_ENABLED,
  };
}

export function ensureDirs(s: Settings): void {
  mkdirSync(s.dataDir, { recursive: true });
  mkdirSync(s.workspaceDir, { recursive: true });
}

export const modelCacheDir = (s: Settings) => join(s.dataDir, "models");
