import { describe, it, expect } from 'vitest';
import { shouldRejectEmptyBoardFetch } from './boardFetchSafety';

describe('shouldRejectEmptyBoardFetch', () => {
  it('rejeita board vazio quando havia cards em cache', () => {
    expect(
      shouldRejectEmptyBoardFetch({ cards: [] }, { cards: [{ id: '1' }] }),
    ).toBe(true);
  });

  it('aceita board vazio sem cache anterior', () => {
    expect(shouldRejectEmptyBoardFetch({ cards: [] }, undefined)).toBe(false);
  });

  it('aceita board com cards', () => {
    expect(
      shouldRejectEmptyBoardFetch({ cards: [{ id: '1' }] }, { cards: [{ id: '2' }] }),
    ).toBe(false);
  });
});
