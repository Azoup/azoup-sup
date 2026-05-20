import type { PostgrestError } from '@supabase/supabase-js';

export function assertSupabaseData<T>(
  data: T | null,
  error: PostgrestError | null,
  context?: string,
): T {
  if (error) {
    const prefix = context ? `[${context}] ` : '';
    throw new Error(`${prefix}${error.message}`);
  }
  return (data ?? []) as T;
}
