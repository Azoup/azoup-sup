import { describe, expect, it } from 'vitest';
import { aggregateAnswersByMappedAnalysts } from './digisacNpsAggregate';

describe('aggregateAnswersByMappedAnalysts', () => {
  it('agrupa linhas da API como no TXT por analista', () => {
    const mapped = [
      { id: 'u1', name: 'Beatriz Oliveira' },
      { id: 'u2', name: 'Flavia Andreotti' },
    ];
    const rows = [
      { score: 10, userId: 'u1' },
      { score: 8, attendantName: 'Flavia Andreotti' },
      { score: 5, userId: 'u1' },
    ];
    const by = aggregateAnswersByMappedAnalysts(rows, mapped);
    expect(by.get('u1')?.total).toBe(2);
    expect(by.get('u1')?.promoters).toBe(1);
    expect(by.get('u1')?.detractors).toBe(1);
    expect(by.get('u2')?.total).toBe(1);
    expect(by.get('u2')?.neutrals).toBe(1);
  });
});
