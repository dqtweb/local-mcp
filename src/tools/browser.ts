import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { AppContext } from "../context.js";
import type { ToolModule } from "../registry.js";
import { resolveWithin } from "./workspace.js";

const SAFE_URL = (url: string): string => {
  const u = new URL(url);
  if (!["http:", "https:"].includes(u.protocol)) {
    throw new Error(`Blocked scheme "${u.protocol}" — only http/https are allowed.`);
  }
  return u.toString();
};

const SELECTOR_HELP =
  "Playwright selector: CSS ('#submit'), text ('text=Sign in'), or role ('role=button[name=\"Log in\"]')";

export const browserTools: ToolModule = {
  register(server: McpServer, ctx: AppContext): void {
    server.registerTool(
      "browser_navigate",
      {
        description:
          "Navigate the companion browser to an http(s) URL and wait for the page to load. " +
          "Call browser_snapshot afterwards to read the page.",
        inputSchema: { url: z.string().describe("Absolute http(s) URL") },
      },
      async ({ url }) => {
        const page = await ctx.browser.page();
        const resp = await page.goto(SAFE_URL(url), {
          waitUntil: "domcontentloaded",
          timeout: ctx.settings.browserNavTimeoutMs,
        });
        const text = `Status ${resp?.status() ?? "?"} · "${await page.title()}" · ${page.url()}`;
        return { content: [{ type: "text", text }] };
      },
    );

    server.registerTool(
      "browser_snapshot",
      {
        description:
          "Capture the current page as an accessibility-tree snapshot (compact, structured, " +
          "LLM-friendly). Use this to read pages and to pick selectors for click/type.",
        inputSchema: {},
      },
      async () => {
        const page = await ctx.browser.page();
        const snap = await page.locator("body").ariaSnapshot();
        return { content: [{ type: "text", text: `URL: ${page.url()}\n\n${snap}` }] };
      },
    );

    // Compatibility alias for clients that use the older browser_get_content name.
    server.registerTool(
      "browser_get_content",
      {
        description: "Return the current page text or HTML content.",
        inputSchema: {
          selector: z.string().optional().describe("Optional CSS selector; defaults to the whole page"),
          html: z.boolean().default(false).describe("Return HTML instead of visible text"),
        },
      },
      async ({ selector, html }) => {
        const page = await ctx.browser.page();
        const target = selector ? page.locator(selector).first() : page.locator("body");
        const content = html ? await target.evaluate((element) => element.outerHTML) : await target.innerText();
        return { content: [{ type: "text", text: content.slice(0, 100_000) }] };
      },
    );

    server.registerTool(
      "browser_click",
      {
        description: "Click an element. Auto-waits for it to be visible and actionable.",
        inputSchema: { selector: z.string().describe(SELECTOR_HELP) },
      },
      async ({ selector }) => {
        const page = await ctx.browser.page();
        await page.click(selector, { timeout: ctx.settings.browserNavTimeoutMs });
        return { content: [{ type: "text", text: `Clicked: ${selector}` }] };
      },
    );

    server.registerTool(
      "browser_type",
      {
        description: "Clear a field and type text into it (input, textarea, contenteditable).",
        inputSchema: {
          selector: z.string().describe(SELECTOR_HELP),
          text: z.string(),
        },
      },
      async ({ selector, text }) => {
        const page = await ctx.browser.page();
        await page.fill(selector, text, { timeout: ctx.settings.browserNavTimeoutMs });
        return { content: [{ type: "text", text: `Typed ${text.length} chars into ${selector}` }] };
      },
    );

    server.registerTool(
      "browser_screenshot",
      {
        description:
          "Screenshot the current page. Returns a PNG/JPEG image block the client can display " +
          "(and a vision-capable model can see).",
        inputSchema: {
          full_page: z.boolean().default(false),
          format: z.enum(["png", "jpeg"]).default("png"),
          save_to_workspace: z.boolean().default(false),
        },
      },
      async ({ full_page, format, save_to_workspace }) => {
        const page = await ctx.browser.page();
        const buffer = await page.screenshot({
          fullPage: full_page,
          type: format,
          quality: format === "jpeg" ? 80 : undefined,
        });
        const content: CallToolResult["content"] = [
          { type: "image", data: buffer.toString("base64"), mimeType: `image/${format}` },
        ];
        if (save_to_workspace) {
          const name = `screenshots/${Date.now()}.${format}`;
          const target = resolveWithin(ctx.settings.workspaceDir, name);
          await mkdir(path.dirname(target), { recursive: true });
          await writeFile(target, buffer);
          content.push({ type: "text", text: `Saved to workspace: ${name}` });
        }
        return { content };
      },
    );

    server.registerTool(
      "browser_evaluate",
      {
        description:
          "Run a JavaScript expression in the page context and return the JSON result. " +
          "Use for data extraction not covered by browser_snapshot.",
        inputSchema: {
          expression: z.string().describe("e.g. \"document.querySelectorAll('h2').length\""),
        },
      },
      async ({ expression }) => {
        if (!ctx.settings.browserAllowEval) {
          return { content: [{ type: "text", text: "browser_evaluate is disabled (MCP_BROWSER_ALLOW_EVAL=false)" }] };
        }
        const page = await ctx.browser.page();
        const result: unknown = await page.evaluate(expression);
        const json = JSON.stringify(
          result,
          (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v),
          2,
        ) ?? "undefined";
        return { content: [{ type: "text", text: json.slice(0, 20_000) }] };
      },
    );

    server.registerTool(
      "browser_close",
      {
        description:
          "Shut down the companion browser. If we launched it, the process exits; " +
          "if we attached to your Chrome, we only disconnect.",
        inputSchema: {},
      },
      async () => {
        await ctx.browser.shutdown();
        return { content: [{ type: "text", text: "Browser companion closed." }] };
      },
    );
  },
};
