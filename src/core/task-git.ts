// RED skeleton: the typed interface only. Every function throws until the
// GREEN commit implements it.

export const TASK_GIT_POINTER_MAX_BYTES = 4096;

export type TaskGitDirectory =
  | { status: "grantable"; layout: "in-tree" | "external"; gitDirectory: string }
  | {
      status: "not-grantable";
      layout: "missing" | "link" | "linked-worktree" | "unsupported";
      gitDirectory: string | null;
      reason: string;
    };

export async function resolveTaskGitDirectory(_projectRoot: string): Promise<TaskGitDirectory> {
  throw new Error("resolveTaskGitDirectory is not implemented");
}

export function grantedGitDirectory(
  _contract: { readonly allowedEffects: readonly string[] },
  _resolution: TaskGitDirectory,
): string | null {
  throw new Error("grantedGitDirectory is not implemented");
}
