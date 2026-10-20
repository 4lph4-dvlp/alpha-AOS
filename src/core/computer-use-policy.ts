export function decideComputerVerification(_input: { mode: string; deterministic: boolean; reversible: boolean; covered: boolean }): { mode: string } {
  return { mode: "manual" };
}
export function validateComputerAuthority(_value: unknown): any { throw new Error("authority unavailable"); }
export function authorizeComputerAction(_authority: any, _state: any, _action: any): void { throw new Error("authority unavailable"); }
