// Reject if `promise` has not settled within `ms`. Guards UI that disables its
// controls while a write is in flight: without a ceiling, a request that hangs
// (connection black-holed, never errors) would leave the controls disabled forever.
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
