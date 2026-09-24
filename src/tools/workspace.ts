import path from "node:path";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AppContext } from "../context.js";

export function resolveWithin(root: string, rel: string): string {
  const r = path.resolve(root);
  const target = path.resolve(r, rel);
  if (target !== r && !target.startsWith(r + path.sep)) {
    throw new Error(`Path ${JSON.stringify(rel)} escapes the workspace sandbox.`);
  }
  return target;
}

export const workspaceTools = {
  register(server: McpServer, ctx: AppContext): void {
    server.registerTool(
      "workspace_write",
      { description: "Write (or overwrite) a UTF-8 text file inside the sandboxed workspace.",
        inputSchema: { path: z.string(), content: z.string() } },
      async ({ path: p, content }) => {
        const target = resolveWithin(ctx.settings.workspaceDir, p);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, content, "utf8");
        return { content: [{ type: "text", text: `Wrote ${content.length} chars to ${p}` }] };
      },
    );

    server.registerTool(
      "workspace_read",
      { description: "Read a text file from the sandboxed workspace.", inputSchema: { path: z.string() } },
      async ({ path: p }) => {
        try {
          const text = await readFile(resolveWithin(ctx.settings.workspaceDir, p), "utf8");
          return { content: [{ type: "text", text }] };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { content: [{ type: "text", text: `Unable to read ${p}: ${message}` }], isError: true };
        }
      },
    );

    server.registerTool(
      "workspace_list",
      { description: "List entries under a workspace directory.", inputSchema: { subdir: z.string().default(".") } },
      async ({ subdir }) => {
        try {
          const entries = await readdir(resolveWithin(ctx.settings.workspaceDir, subdir));
          const out = entries.sort().join("\n") || "(empty)";
          return { content: [{ type: "text", text: out }] };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { content: [{ type: "text", text: `Unable to list ${subdir}: ${message}` }], isError: true };
        }
      },
    );
  },
};
