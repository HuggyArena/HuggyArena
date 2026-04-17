#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import pc from "picocolors";
import {
  MODELS,
  DEFAULT_MODEL_ALIAS,
  resolveModel,
} from "../bedrock/models";
import { AgentRunner } from "../runner/agent";
import {
  attachStdioMcp,
  playwrightMcpSpec,
  selfMcpSpec,
  type AttachedMcp,
} from "../runner/mcp-client";
import { listSkills } from "../runner/skills";
import type { TraceEvent } from "../runner/agent";

/**
 * CLI entrypoint. Three commands today:
 *
 *     arena-agent chat "…"         — one-shot Converse loop with tools
 *     arena-agent mcp              — run huggyarena-mcp as an MCP stdio server
 *     arena-agent list-models      — print the Bedrock model catalogue
 *     arena-agent list-skills      — print the playbook catalogue
 *
 * `chat` is the main demo surface. `mcp` is for plugging the agent's tools
 * into Claude Desktop / Claude Code / Cursor as an MCP server.
 */

const program = new Command();
program
  .name("arena-agent")
  .description("Clawdius — HuggyArena operator agent (Bedrock + MCP)")
  .version("0.1.0");

program
  .command("list-models")
  .description("Print the Bedrock model catalogue.")
  .action(() => {
    console.log(pc.bold("Available Bedrock models"));
    console.log();
    for (const m of MODELS) {
      const isDefault = m.alias === DEFAULT_MODEL_ALIAS ? pc.green(" (default)") : "";
      const tierTag =
        m.tier === "frontier"
          ? pc.magenta("frontier")
          : m.tier === "balanced"
            ? pc.cyan("balanced")
            : pc.dim("cheap");
      console.log(`  ${pc.bold(m.alias.padEnd(10))} ${tierTag}${isDefault}`);
      console.log(`    id: ${pc.dim(m.id)}`);
      console.log(`    ${m.description}`);
      console.log();
    }
  });

program
  .command("list-skills")
  .description("Print the playbook catalogue.")
  .action(() => {
    const skills = listSkills();
    if (!skills.length) {
      console.log(pc.yellow("no skills found under apps/agent/skills/"));
      return;
    }
    console.log(pc.bold("Available skills"));
    console.log();
    for (const s of skills) {
      console.log(`  ${pc.bold(s.name)}`);
      console.log(`    ${pc.dim(s.file)}`);
    }
  });

program
  .command("mcp")
  .description("Run the huggyarena-mcp stdio MCP server (for Claude Desktop / Cursor / Code).")
  .action(async () => {
    // Invoke the server entrypoint explicitly — a bare `import()` only
    // executes module-level code, and the server's main() is guarded by
    // `require.main === module` which is false on dynamic import, so we
    // have to call main() ourselves.
    const { main } = await import("../mcp-server/index");
    await main();
  });

program
  .command("chat")
  .argument("<prompt...>", "Prompt to send to the agent.")
  .option("-m, --model <alias>", "Model alias (see list-models).", DEFAULT_MODEL_ALIAS)
  .option("--operator", "Operator mode (will unlock write tools in Phase 1B).", false)
  .option("--skill <name...>", "One or more skills to inject into the system prompt.")
  .option("--with-playwright", "Also spawn @playwright/mcp for browser research tools.", false)
  .option("--max-turns <n>", "Max Converse ↔ tool ping-pong turns.", (v) => parseInt(v, 10), 12)
  .option("--quiet", "Suppress trace output.", false)
  .action(async (promptParts: string[], opts) => {
    const prompt = promptParts.join(" ").trim();
    if (!prompt) {
      console.error(pc.red("prompt required"));
      process.exit(2);
    }

    const model = resolveModel(opts.model);
    console.error(pc.dim(`[agent] model=${model.alias} (${model.id})`));

    const mcps: AttachedMcp[] = [];
    try {
      const selfMcp = await attachStdioMcp(selfMcpSpec());
      mcps.push(selfMcp);
      console.error(
        pc.dim(
          `[agent] attached mcp "huggyarena" with ${selfMcp.listToolsResponse.tools.length} tools`,
        ),
      );
      if (opts.withPlaywright) {
        try {
          const pw = await attachStdioMcp(playwrightMcpSpec());
          mcps.push(pw);
          console.error(
            pc.dim(
              `[agent] attached mcp "playwright" with ${pw.listToolsResponse.tools.length} tools`,
            ),
          );
        } catch (err) {
          console.error(
            pc.yellow(
              `[agent] playwright-mcp failed to attach: ${(err as Error).message} (continuing without it)`,
            ),
          );
        }
      }

      const runner = new AgentRunner({
        model,
        mcps,
        skillNames: opts.skill ?? [],
        operatorMode: opts.operator,
        maxTurns: opts.maxTurns,
        trace: opts.quiet ? undefined : (e) => printTrace(e),
      });

      console.error(pc.dim(`[agent] ${runner.toolCount} tools visible to model`));
      console.error();
      const result = await runner.chat(prompt);
      console.error();
      console.error(
        pc.dim(
          `[agent] done in ${result.turns} turns, in=${result.usage.totalInputTokens} out=${result.usage.totalOutputTokens}`,
        ),
      );
      console.log();
      console.log(pc.bold(pc.green("assistant >")));
      console.log(result.text);
    } finally {
      for (const m of mcps) {
        await m.close();
      }
    }
  });

function printTrace(e: TraceEvent): void {
  const prefix = pc.dim(`[t${e.turn}]`);
  switch (e.type) {
    case "turn-start":
      console.error(`${prefix} ${pc.cyan("→ converse")}`);
      break;
    case "tool-call":
      console.error(
        `${prefix}   ${pc.magenta("tool_use")} ${e.server}::${e.name} ${pc.dim(JSON.stringify(e.input))}`,
      );
      break;
    case "tool-result":
      console.error(
        `${prefix}   ${e.isError ? pc.red("tool_error") : pc.green("tool_result")} ${e.server}::${e.name} ${pc.dim(e.preview.replace(/\s+/g, " ").slice(0, 140))}`,
      );
      break;
    case "assistant-text":
      // Trace-level only; the final text is also printed once at the end.
      break;
    case "usage":
      break;
    case "stop":
      console.error(`${prefix} ${pc.dim(`stop=${e.reason}`)}`);
      break;
  }
}

program.parseAsync(process.argv).catch((err) => {
  console.error(pc.red("fatal:"), (err as Error).stack ?? err);
  process.exit(1);
});
