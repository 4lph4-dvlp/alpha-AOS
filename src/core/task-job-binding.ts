import { isAbsolute } from "node:path";

/** Registered typed bridge. Arbitrary PowerShell wrappers are not metered routes. */
export interface TaskJobBinding {
  route: "codex-json-v1";
  contractPath: string;
  contractDigest: string;
  runId: string;
  role: "controller" | "executor" | "reviewer";
  prompt: string;
  resumeSessionId?: string;
}

export function validateTaskJobBinding(value: unknown): TaskJobBinding {
  const binding = value as TaskJobBinding;
  if (!binding || typeof binding !== "object" || Array.isArray(binding) ||
    Object.keys(binding).some((key) => !["route", "contractPath", "contractDigest", "runId", "role", "prompt", "resumeSessionId"].includes(key)) ||
    binding.route !== "codex-json-v1" || !["controller", "executor", "reviewer"].includes(binding.role) ||
    typeof binding.contractPath !== "string" || !isAbsolute(binding.contractPath) ||
    !/^[a-f0-9]{64}$/u.test(binding.contractDigest) ||
    typeof binding.runId !== "string" || !/^[a-z0-9]{8,}-[a-f0-9]{8}$/u.test(binding.runId) ||
    typeof binding.prompt !== "string" || !binding.prompt.trim() || Buffer.byteLength(binding.prompt) > 16 * 1024 ||
    (binding.resumeSessionId !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/u.test(binding.resumeSessionId))) {
    throw new Error("Invalid registered task job binding");
  }
  return binding;
}

