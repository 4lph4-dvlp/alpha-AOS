const CONTRACT_ID = /^[a-z0-9][a-z0-9-]{0,63}$/u;

/** Whether a value can name a task — and so a directory under the state root. */
export function isTaskContractId(value: string): boolean {
  return CONTRACT_ID.test(value);
}
