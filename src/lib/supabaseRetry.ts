/** Erro de lock do auth Supabase (várias requisições REST em paralelo). */
export function isSupabaseLockError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  const name = error instanceof Error ? error.name : '';
  return (
    /lock broken/i.test(msg) ||
    /steal/i.test(msg) ||
    name === 'AbortError' ||
    msg.includes('AbortError')
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Repete operação quando o cliente Supabase perde o lock de sessão. */
export async function withSupabaseRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 4,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isSupabaseLockError(error) || attempt >= maxAttempts - 1) {
        throw error;
      }
      await sleep(100 * (attempt + 1));
    }
  }
  throw lastError;
}
