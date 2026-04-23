import { startHuggyArenaMcpServer } from "./server";

/**
 * Entrypoint for `npx @arena/agent mcp`.
 *
 * No CLI flags here — configure via environment:
 *   HUGGYARENA_AGENT_SOURCE         mock | subgraph | appsync  (default mock)
 *   HUGGYARENA_SUBGRAPH_URL         (subgraph only)
 *   HUGGYARENA_APPSYNC_URL / _KEY   (appsync only)
 *
 * Must not print to stdout — MCP uses stdout for the JSON-RPC transport.
 * All logging goes to stderr.
 */
export async function main(): Promise<void> {
  process.stderr.write("[huggyarena-mcp] starting stdio server...\n");
  const { server } = await startHuggyArenaMcpServer();
  process.stderr.write(
    `[huggyarena-mcp] ready (name=huggyarena-mcp version=0.1.0)\n`,
  );

  // Keep the process alive. MCP protocol is driven off stdin; SDK handles it.
  const shutdown = async (sig: string): Promise<void> => {
    process.stderr.write(`[huggyarena-mcp] ${sig}, closing...\n`);
    try {
      await server.close();
    } catch {
      /* best-effort */
    }
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

// Invoke main() when this module is the process entrypoint. The CLI's `mcp`
// subcommand calls main() directly (dynamic import from ../cli/index.ts), so
// don't gate on require.main there.
if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`[huggyarena-mcp] fatal: ${(err as Error).stack ?? err}\n`);
    process.exit(1);
  });
}
