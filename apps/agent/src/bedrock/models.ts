/**
 * Bedrock inference profile catalog for the HuggyArena agent.
 *
 * All IDs here were verified `ACTIVE` in account 878581769054 / us-east-1 via
 * `bedrock:ListInferenceProfiles` at session start. Direct-model IDs (without
 * the `us.` / `global.` prefix) are intentionally NOT used — the ON_DEMAND
 * quota pool for Anthropic legacy models is tight in this account, and
 * inference profiles are the AWS-blessed path for the 4.x+ lineup.
 *
 * Add new models by appending here; the CLI picks them up automatically.
 */
export interface ModelSpec {
  /** Short alias users pass on the CLI (`--model sonnet-4-6`). */
  alias: string;
  /** Full Bedrock inference-profile ID or ON_DEMAND model ID. */
  id: string;
  /** Region that hosts the profile. For `global.*` this is still us-east-1 for invocation. */
  region: string;
  /** Rough per-turn cost tier — picked by the agent's router when auto-selecting. */
  tier: "frontier" | "balanced" | "cheap";
  description: string;
}

export const MODELS: readonly ModelSpec[] = [
  {
    alias: "sonnet-4-6",
    id: "us.anthropic.claude-sonnet-4-6",
    region: "us-east-1",
    tier: "balanced",
    description:
      "Claude Sonnet 4.6 via US inference profile. Default reasoner — strong tool use, fast.",
  },
  {
    alias: "sonnet-4-5",
    id: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
    region: "us-east-1",
    tier: "balanced",
    description: "Claude Sonnet 4.5. Good balance and more widely available.",
  },
  {
    alias: "opus-4-7",
    id: "us.anthropic.claude-opus-4-7",
    region: "us-east-1",
    tier: "frontier",
    description:
      "Claude Opus 4.7. Deepest reasoning for multi-step planning and research.",
  },
  {
    alias: "opus-4-5",
    id: "us.anthropic.claude-opus-4-5-20251101-v1:0",
    region: "us-east-1",
    tier: "frontier",
    description: "Claude Opus 4.5.",
  },
  {
    alias: "haiku-4-5",
    id: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    region: "us-east-1",
    tier: "cheap",
    description:
      "Claude Haiku 4.5. Cheap per-turn — used for the verification pass on write actions and for JSON extraction.",
  },
  {
    alias: "nova-pro",
    id: "us.amazon.nova-pro-v1:0",
    region: "us-east-1",
    tier: "balanced",
    description:
      "Amazon Nova Pro. AWS-native fallback if Anthropic profiles throttle.",
  },
];

export const DEFAULT_MODEL_ALIAS = "sonnet-4-6";
export const VERIFIER_MODEL_ALIAS = "haiku-4-5";

export function resolveModel(aliasOrId?: string | null): ModelSpec {
  const key = (aliasOrId ?? DEFAULT_MODEL_ALIAS).toLowerCase();
  const byAlias = MODELS.find((m) => m.alias.toLowerCase() === key);
  if (byAlias) return byAlias;
  const byId = MODELS.find((m) => m.id.toLowerCase() === key);
  if (byId) return byId;
  // Allow arbitrary IDs so users can point at something we haven't catalogued.
  return {
    alias: aliasOrId ?? key,
    id: aliasOrId ?? key,
    region: process.env.AWS_REGION ?? "us-east-1",
    tier: "balanced",
    description: "User-specified model id (not in catalog).",
  };
}
