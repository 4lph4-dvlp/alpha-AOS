import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { codexConfigRoot } from "./gsd-compat.js";

const workflows = ["execute-phase", "execute-plan", "quick"];
const MAX_CONTENT_CHARS = 12_000;

export async function readGsdContext(workflow: string, options: {
  configRoot?: string;
  step?: string;
  from?: number;
  lines?: number;
} = {}) {
  if (!workflows.includes(workflow)) throw new Error("GSD context supports execute-phase, execute-plan, or quick.");
  if (options.step !== undefined && (options.from !== undefined || options.lines !== undefined)) {
    throw new Error("Choose a named step or a line range, not both.");
  }
  if (options.lines !== undefined && options.from === undefined) throw new Error("--lines requires --from.");
  const root = await realpath(join(options.configRoot ?? codexConfigRoot(), "gsd-core", "workflows"));
  const source = await realpath(join(root, `${workflow}.md`));
  const rel = relative(root, source);
  if (isAbsolute(rel) || rel === ".." || rel.startsWith("..\\") || rel.startsWith("../")) {
    throw new Error("GSD workflow resolves outside its workflow root.");
  }
  const bytes = await readFile(source);
  if (bytes.length > 1024 * 1024) throw new Error("GSD workflow exceeds the 1 MiB context-reader bound.");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const lines = text.split(/\r?\n/u);
  const steps: Array<{ name: string; from: number; to: number }> = [];
  for (const [index, line] of lines.entries()) {
    const xml = /^<step\s+name="([^"]+)"/u.exec(line);
    const markdown = /^\*\*Step ([0-9]+[a-z]?): (.+)\*\*\s*$/u.exec(line);
    const name = xml?.[1] ?? (markdown ? `step-${markdown[1]}` : undefined);
    if (name === undefined) continue;
    const previous = steps.at(-1);
    if (previous) previous.to = index;
    steps.push({ name, from: index + 1, to: lines.length });
  }
  const common = {
    workflow,
    sourceSha256: createHash("sha256").update(bytes).digest("hex"),
    totalLines: lines.length,
    totalChars: text.length,
    maxContentChars: MAX_CONTENT_CHARS,
    authority: "Exact installed GSD text. This reader neither executes nor waives workflow gates; read the preamble and every applicable section/reference.",
  };
  if (options.step === undefined && options.from === undefined) {
    if (steps.length === 0) throw new Error("No recognized GSD steps; inspect the changed workflow format before execution.");
    return {
      ...common,
      mode: "outline" as const,
      preamble: { from: 1, to: (steps[0]?.from ?? 1) - 1 },
      steps,
    };
  }
  let from = options.from ?? 1;
  let to: number;
  if (options.step !== undefined) {
    const matches = steps.filter((step) => step.name === options.step);
    if (matches.length !== 1) throw new Error("GSD step is absent or ambiguous; inspect the outline.");
    from = matches[0]!.from;
    to = matches[0]!.to;
  } else {
    const count = options.lines ?? 80;
    if (!Number.isSafeInteger(from) || from < 1 || from > lines.length || !Number.isSafeInteger(count) || count < 1 || count > 200) {
      throw new Error("GSD line ranges require an existing start line and 1–200 lines.");
    }
    to = Math.min(lines.length, from + count - 1);
  }
  const content = lines.slice(from - 1, to).join("\n");
  if (content.length > MAX_CONTENT_CHARS) {
    return { ...common, mode: "range-required" as const, from, to, contentChars: content.length,
      reason: "Section exceeds the output bound. Request explicit smaller --from/--lines slices; no text was silently truncated." };
  }
  // The observable JSON seam bounds each string separately. Small chunks keep
  // a complete selected section below that per-string bound as well as ours.
  return { ...common, mode: "content" as const, from, to,
    assembly: "Concatenate content chunks with no separator; normal observable redaction still applies.",
    content: content.match(/[\s\S]{1,1000}/gu) ?? [""],
  };
}
