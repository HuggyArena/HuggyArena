import { type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * In-process MCP client for stdio servers.
 *
 * Each call to `attachStdioMcp()` spawns a child process (e.g. our own
 * `huggyarena-mcp` server, or `npx @playwright/mcp@latest`), wires it up
 * over stdio JSON-RPC, and returns a handle that can list + call tools.
 *
 * The returned `close()` cleanly tears down both the SDK client and the
 * child process. The Converse loop in `./agent.ts` holds N of these and
 * closes them on CLI exit.
 */
export interface McpServerSpec {
  /** Logical name used for tool-namespacing and trace lines. */
  id: string;
  /** Executable to spawn. */
  command: string;
  /** Args to pass to the executable. */
  args: string[];
  /** Env overrides for the child. Merged on top of process.env. */
  env?: Record<string, string>;
  /** Working directory. */
  cwd?: string;
}

export interface AttachedMcp {
  id: string;
  client: Client;
  listToolsResponse: Awaited<ReturnType<Client["listTools"]>>;
  child: ChildProcessWithoutNullStreams | null;
  close: () => Promise<void>;
}

export async function attachStdioMcp(spec: McpServerSpec): Promise<AttachedMcp> {
  const transport = new StdioClientTransport({
    command: spec.command,
    args: spec.args,
    env: { ...process.env, ...spec.env } as Record<string, string>,
    cwd: spec.cwd,
  });
  const client = new Client(
    { name: `huggyarena-agent/${spec.id}`, version: "0.1.0" },
    { capabilities: {} },
  );
  await client.connect(transport);
  const listToolsResponse = await client.listTools();
  return {
    id: spec.id,
    client,
    listToolsResponse,
    child: null, // SDK owns the child handle via the transport
    close: async () => {
      try {
        await client.close();
      } catch {
        /* best-effort */
      }
    },
  };
}

/**
 * Convenience: spec for the huggyarena-mcp server running from this package.
 * Used by the in-process agent loop so a chat session gets the tools for free.
 */
export function selfMcpSpec(): McpServerSpec {
  // Prefer the built .js artefact (production); fall back to running the .ts
  // source through tsx (dev mode). Probing via fs.existsSync is robust because
  // require.resolve would throw for either path in the wrong mode.
  const builtPath = path.join(__dirname, "..", "mcp-server", "index.js");
  if (fs.existsSync(builtPath)) {
    return {
      id: "huggyarena",
      command: process.execPath,
      args: [builtPath],
    };
  }
  const srcPath = path.join(__dirname, "..", "mcp-server", "index.ts");
  return {
    id: "huggyarena",
    command: process.execPath,
    args: ["--import", "tsx", srcPath],
  };
}

/**
 * Convenience: spec for `@playwright/mcp`, invoked via `npx`. Not spawned
 * by default — the agent's CLI opts you in with `--with-playwright` so we
 * don't force a ~200 MB Chromium download on every session.
 */
export function playwrightMcpSpec(): McpServerSpec {
  return {
    id: "playwright",
    command: "npx",
    args: ["-y", "@playwright/mcp@latest", "--browser", "chromium", "--headless"],
  };
}
