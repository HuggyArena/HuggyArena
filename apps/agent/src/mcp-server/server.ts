import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { resolveMarketDataSource, type MarketDataSource } from "../data";
import { buildTools, type ToolDef } from "./tools";

/**
 * The `huggyarena-mcp` stdio MCP server.
 *
 * Exposes Phase-1A read-only market tools to any MCP-aware client
 * (Claude Desktop, Claude Code, Cursor, our own in-process client in the
 * Converse loop). Startup is O(seed size) and synchronous; perfect for
 * `npx`-style invocation.
 */
export interface HuggyArenaMcpServerOptions {
  source?: MarketDataSource;
  tools?: ToolDef[];
  name?: string;
  version?: string;
}

export async function startHuggyArenaMcpServer(
  opts: HuggyArenaMcpServerOptions = {},
): Promise<{ server: Server; stop: () => Promise<void> }> {
  const source = opts.source ?? resolveMarketDataSource();
  const tools = opts.tools ?? buildTools();
  const server = new Server(
    {
      name: opts.name ?? "huggyarena-mcp",
      version: opts.version ?? "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: input } = req.params;
    const tool = tools.find((t) => t.name === name);
    if (!tool) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Unknown tool: ${name}. Available: ${tools.map((t) => t.name).join(", ")}`,
          },
        ],
      };
    }
    try {
      const result = await tool.handler(input, { source });
      return {
        content: [
          {
            type: "text",
            text:
              typeof result === "string"
                ? result
                : JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error in ${name}: ${(err as Error).message}`,
          },
        ],
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  return {
    server,
    stop: async () => {
      await server.close();
    },
  };
}
