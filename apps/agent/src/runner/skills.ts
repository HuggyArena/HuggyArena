import fs from "node:fs";
import path from "node:path";

/**
 * Loads playbook skills from `apps/agent/skills/*.md`.
 *
 * Skills are markdown files. The first `#` heading is the skill name; the
 * body is injected into the system prompt when the CLI passes `--skill X`
 * (or when the auto-router picks a skill, Phase 1B).
 *
 * ECC teaches JIT skill loading — inject only what's needed per turn — but
 * Phase 1A does it at session start for simplicity. Token cost is small
 * because skill files are short.
 */
export interface LoadedSkill {
  name: string;
  file: string;
  body: string;
}

export function skillsDir(): string {
  return path.resolve(__dirname, "..", "..", "skills");
}

export function listSkills(dir: string = skillsDir()): LoadedSkill[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
  return entries.map((file) => {
    const full = path.join(dir, file);
    const body = fs.readFileSync(full, "utf8");
    const firstH1 = body.match(/^#\s+(.+)$/m);
    const name = firstH1 ? firstH1[1].trim() : file.replace(/\.md$/, "");
    return { name, file: full, body };
  });
}

export function loadSkillsByName(
  names: string[],
  dir: string = skillsDir(),
): LoadedSkill[] {
  if (!names.length) return [];
  const all = listSkills(dir);
  const found: LoadedSkill[] = [];
  for (const raw of names) {
    const key = raw.toLowerCase();
    const hit =
      all.find(
        (s) =>
          s.name.toLowerCase() === key ||
          path.basename(s.file, ".md").toLowerCase() === key,
      ) ?? null;
    if (hit) found.push(hit);
  }
  return found;
}
