export async function pollUntil<T>(
  check: () => Promise<T | null>,
  timeoutMs: number,
  intervalMs = 100,
): Promise<T> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const result = await check();
    if (result != null) {
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`pollUntil: timeout after ${timeoutMs}ms`);
}
