import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const endpoint = process.env.MCP_URL ?? "http://127.0.0.1:8000/mcp";
const text = process.env.AVATAR_TEXT ?? "?";
const color = process.env.AVATAR_COLOR ?? "#ef4444";
const format = process.env.AVATAR_FORMAT === "png" ? "png" : "svg";
const client = new Client({ name: "verify-avatar-tool", version: "1.0.0" });
const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
  requestInit: process.env.MCP_AUTH_TOKEN
    ? { headers: { authorization: `Bearer ${process.env.MCP_AUTH_TOKEN}` } }
    : undefined,
});

try {
  await client.connect(transport);
  const result = await client.callTool({
    name: "avatar_generate",
    arguments: { text, color, format, seed: "verification" },
  });

  console.log(JSON.stringify(result, null, 2));

  if (result.isError) {
    console.error("MCP tool error: avatar_generate returned isError=true");
    process.exitCode = 1;
  } else {
    console.log("avatar_generate succeeded");
  }
} catch (error) {
  console.error("MCP transport or connection error:", error);
  process.exitCode = 2;
} finally {
  await client.close();
}
