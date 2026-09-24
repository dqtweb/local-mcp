import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "./context.js";
import { avatarTools } from "./tools/avatar.js";
import { memoryTools } from "./tools/memory.js";
import { workspaceTools } from "./tools/workspace.js";
import { browserTools } from "./tools/browser.js";
import { browserKnowledge } from "./browser/knowledge.js";

export interface ToolModule {
  register(server: McpServer, ctx: AppContext): void;
}

const builtins: ToolModule[] = [memoryTools, workspaceTools, avatarTools, browserTools, browserKnowledge];

export async function registerAll(server: McpServer, ctx: AppContext): Promise<void> {
  for (const m of builtins) m.register(server, ctx);
  // External packages: MCP_TOOL_MODULES=my-pkg-tools,other-tools
  for (const spec of ctx.settings.extraToolModules) {
    const mod = (await import(spec)) as { register: ToolModule["register"] };
    mod.register(server, ctx);
  }
}
