import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  markBoardLocalWrite,
  consumeBoardRealtimeSkip,
  resetBoardRefreshGuard,
} from './boardRefreshGuard';

describe('boardRefreshGuard', () => {
  beforeEach(() => {
    resetBoardRefreshGuard();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('consome skips por contagem', () => {
    markBoardLocalWrite(2);
    expect(consumeBoardRealtimeSkip()).toBe(true);
    expect(consumeBoardRealtimeSkip()).toBe(true);
    expect(consumeBoardRealtimeSkip()).toBe(true);
  });

  it('mantém grace period após esgotar contador', () => {
    markBoardLocalWrite(1);
    expect(consumeBoardRealtimeSkip()).toBe(true);
    expect(consumeBoardRealtimeSkip()).toBe(true);
    vi.advanceTimersByTime(5_000);
    expect(consumeBoardRealtimeSkip()).toBe(false);
  });
});
