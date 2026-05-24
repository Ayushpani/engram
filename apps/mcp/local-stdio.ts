import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { SmaranClient } from "./src/client.js";

const server = new McpServer({
  name: "smaran-local",
  version: "1.0.0"
});

server.tool("recall", "Search memories", { query: z.string() }, async ({ query }) => {
  const client = new SmaranClient("dummy-key");
  const result = await client.search(query, 10);
  return {
    content: [{ type: "text", text: JSON.stringify(result.results, null, 2) }]
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Local stdio MCP server is running");
}

main().catch(console.error);
