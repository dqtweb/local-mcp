import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolModule } from "../registry.js";

const RECIPES: Record<string, string> = {
  znews_articles: "[...document.querySelectorAll('.article-title a')].map(a => a.innerText)",
};

const knowledge = `# Browser scraping knowledge

Use browser_navigate, browser_snapshot, and browser_evaluate for page scraping.

## Selector recipes

### znews_articles

Returns article titles from ZNews:

\`\`\`javascript
${RECIPES.znews_articles}
\`\`\`

When returning a recipe, include the recipe name, selector, and the JavaScript expression. Verify the selector against the current page before using it. Prefer browser_snapshot first, then browser_evaluate with a bounded result.
`;

export const browserKnowledge: ToolModule = {
  register(server: McpServer): void {
    server.registerResource(
      "browser-scraping-knowledge",
      "browser://scraping-knowledge",
      {
        title: "Browser scraping knowledge",
        description: "Known page selectors and safe browser_evaluate recipes.",
        mimeType: "text/markdown",
      },
      async () => ({
        contents: [{ uri: "browser://scraping-knowledge", mimeType: "text/markdown", text: knowledge }],
      }),
    );

    server.registerPrompt(
      "scrape-page-with-knowledge",
      {
        title: "Scrape a page using selector knowledge",
        description: "Use the browser and known selector recipes to extract page data.",
        argsSchema: {
          recipe: z.string().default("znews_articles"),
          task: z.string().optional(),
        },
      },
      async ({ recipe, task }) => ({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Read the browser://scraping-knowledge resource. Use the '${recipe}' recipe${task ? ` for this task: ${task}.` : "."} Navigate to the target page, inspect it with browser_snapshot, verify the selector, then run browser_evaluate. Return the recipe name, selector/expression, and extracted data.`,
            },
          },
        ],
      }),
    );
  },
};
