import { describe, expect, it } from 'vitest';
import { normalizeNpsOverviewPayload } from './npsNormalize';

describe('normalizeNpsOverviewPayload', () => {
  it('lê promotores, neutros e detratores no formato objeto', () => {
    const result = normalizeNpsOverviewPayload({
      totals: { count: 124 },
      promoters: { count: 119, percent: 95.97 },
      neutrals: { count: 2, percent: 1.61 },
      detractors: { count: 3, percent: 2.42 },
      nps: 93.55,
    });
    expect(result.total).toBe(124);
    expect(result.promoters.count).toBe(119);
    expect(result.neutrals.count).toBe(2);
    expect(result.detractors.count).toBe(3);
    expect(result.npsScore).toBe(93.55);
  });

  it('calcula NPS quando a API não envia score', () => {
    const result = normalizeNpsOverviewPayload({
      promoters: { count: 9 },
      neutrals: { count: 1 },
      detractors: { count: 0 },
    });
    expect(result.total).toBe(10);
    expect(result.npsScore).toBe(90);
  });
});
