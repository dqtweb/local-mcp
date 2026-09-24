import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../context.js";
import type { MemoryRecord } from "../rag/store.js";

const fmt = (records: MemoryRecord[]): string =>
  records.length === 0
    ? "No matching memories found."
    : records
        .map((r) => {
          const tags = r.tags.length ? ` [${r.tags.join(", ")}]` : "";
          const score = r.score != null ? ` (score ${r.score.toFixed(2)})` : "";
          return `- id=${r.id}${tags}${score}\n  ${r.text}`;
        })
        .join("\n");

export const memoryTools = {
  register(server: McpServer, ctx: AppContext): void {
    server.registerTool(
      "memory_save",
      {
        description:
          "Store a fact, preference, or decision in long-term memory. Keep each memory atomic (one fact per call) for better retrieval quality.",
        inputSchema: {
          text: z.string().describe("The fact to remember, phrased as a complete sentence"),
          tags: z.array(z.string()).optional().describe("Optional labels for filtering later"),
        },
      },
      async ({ text, tags }) => {
        const id = await ctx.memory.remember(text, tags ?? []);
        return { content: [{ type: "text", text: `Saved memory ${id}` }] };
      },
    );

    server.registerTool(
      "memory_search",
      { description: "Semantic search over long-term memory. Returns top matches with ids.",
        inputSchema: {
          query: z.string(),
          top_k: z.number().int().min(1).max(50).default(5),
          tags: z.array(z.string()).optional(),
        } },
      async ({ query, top_k, tags }) => {
        const hits = await ctx.memory.recall(query, top_k, tags);
        return { content: [{ type: "text", text: fmt(hits) }] };
      },
    );

    server.registerTool(
      "memory_get",
      { description: "Fetch a single memory by id.", inputSchema: { memory_id: z.string() } },
      async ({ memory_id }) => {
        const rec = await ctx.memory.get(memory_id);
        return { content: [{ type: "text", text: rec ? fmt([rec]) : `Memory ${memory_id} not found.` }] };
      },
    );

    server.registerTool(
      "memory_delete",
      { description: "Delete a memory by id.", inputSchema: { memory_id: z.string() } },
      async ({ memory_id }) => {
        const ok = await ctx.memory.delete(memory_id);
        return { content: [{ type: "text", text: ok ? "Deleted." : `Memory ${memory_id} not found.` }] };
      },
    );

    server.registerTool(
      "memory_list",
      { description: "List stored memories, optionally filtered by tag.",
        inputSchema: { tag: z.string().optional(), limit: z.number().int().default(50) } },
      async ({ tag, limit }) => {
        let recs = await ctx.memory.list(limit);
        if (tag) recs = recs.filter((r) => r.tags.includes(tag));
        return { content: [{ type: "text", text: fmt(recs) }] };
      },
    );

    server.registerTool(
      "memory_ingest",
      { description: "Ingest a long document: chunked and embedded for retrieval.",
        inputSchema: { text: z.string(), source: z.string().default("document"), tags: z.array(z.string()).optional() } },
      async ({ text, source, tags }) => {
        const n = await ctx.memory.ingest(text, source, tags ?? []);
        return { content: [{ type: "text", text: `Ingested '${source}' as ${n} chunk(s).` }] };
      },
    );

    server.registerTool("memory_stats", { description: "Report how many memories are stored." }, async () => {
      const n = await ctx.memory.count();
      return { content: [{ type: "text", text: `${n} memories stored.` }] };
    });
  },
};