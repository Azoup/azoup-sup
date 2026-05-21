import { describe, it, expect, vi } from 'vitest';
import { isSupabaseLockError, withSupabaseRetry } from '@/lib/supabaseRetry';

describe('supabaseRetry', () => {
  it('detects lock errors', () => {
    expect(
      isSupabaseLockError(new Error("Lock broken by another request with the 'steal' option.")),
    ).toBe(true);
    expect(isSupabaseLockError(new DOMException('aborted', 'AbortError'))).toBe(true);
  });

  it('retries on lock error then succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("Lock broken by another request with the 'steal' option."))
      .mockResolvedValueOnce('ok');

    await expect(withSupabaseRetry(fn, 3)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
