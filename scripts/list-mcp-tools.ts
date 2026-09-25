import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const endpoint = process.env.MCP_URL ?? "http://127.0.0.1:8000/mcp";
const authToken = process.env.MCP_AUTH_TOKEN;

const client = new Client({ name: "list-mcp-tools", version: "1.0.0" });
const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
  requestInit: authToken
    ? { headers: { authorization: `Bearer ${authToken}` } }
    : undefined,
});

try {
  await client.connect(transport);
  const { tools } = await client.listTools();

  console.log(`MCP endpoint: ${endpoint}`);
  console.log(`Tools (${tools.length}):`);
  for (const tool of tools) {
    console.log(`- ${tool.name}${tool.description ? `: ${tool.description}` : ""}`);
  }
} finally {
  await client.close();
}
