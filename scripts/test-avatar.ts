import { writeFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";

const server = await createServer({
    settings: { extraToolModules: [], workspaceDir: "./workspace" },
    memory: {},
});
const client = new Client({ name: "avatar-smoke-test", version: "0.1.0" });
const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();

try {
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const tools = await client.listTools();
    if (!tools.tools.some((tool) => tool.name === "avatar_generate")) {
        throw new Error("avatar_generate is not registered");
    }

    const result = await client.callTool({
        name: "avatar_generate",
        arguments: { text: "JR", format: "png", size: 512, seed: "user-42" },
    });
    const image = result.content.find(
        (content): content is { type: "image"; data: string; mimeType: string } => content.type === "image",
    );
    if (!image) throw new Error("avatar_generate did not return an image");

    await writeFile("avatar.png", Buffer.from(image.data, "base64"));
    console.log("avatar_generate registered and wrote avatar.png");
} finally {
    await client.close();
    await server.close();
}
