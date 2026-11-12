// Minimal assertions for the function tests, so they need no dependency beyond Deno itself.
export function assert(cond: unknown, msg = "assertion failed"): asserts cond {
  if (!cond) throw new Error(msg);
}

export function assertEquals<T>(actual: T, expected: T, msg = ""): void {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg ? msg + ": " : ""}expected ${e}, got ${a}`);
}

export function assertThrows(fn: () => unknown, _type: ErrorConstructor, includes: string, msg = ""): void {
  try {
    fn();
  } catch (e) {
    if (!String((e as Error).message).includes(includes)) throw new Error(`${msg}: threw ${e}, expected "${includes}"`);
    return;
  }
  throw new Error(`${msg}: did not throw`);
}

export async function assertRejects(fn: () => Promise<unknown>, _type: ErrorConstructor, includes: string, msg = ""): Promise<void> {
  try {
    await fn();
  } catch (e) {
    if (!String((e as Error).message).includes(includes)) throw new Error(`${msg}: rejected with ${e}, expected "${includes}"`);
    return;
  }
  throw new Error(`${msg}: did not reject`);
}
