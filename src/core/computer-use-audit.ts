export class ComputerAudit {
  static async open(_root: string, _run: string): Promise<any> { throw new Error("audit unavailable"); }
}
export async function verifyComputerAudit(_root: string, _run: string, _anchor: unknown): Promise<any> { throw new Error("audit unavailable"); }
