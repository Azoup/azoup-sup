import { describe, it, expect } from 'vitest';
import { toDigisacPeriodIso } from './digisacPeriod';

describe('toDigisacPeriodIso', () => {
  it('início do dia em Brasília vira 03:00 UTC', () => {
    const iso = toDigisacPeriodIso('2026-06-02', 'start');
    expect(iso).toBe('2026-06-02T03:00:00.000Z');
  });

  it('horário customizado no início', () => {
    const iso = toDigisacPeriodIso('2026-06-02', 'start', '08:30');
    expect(iso).toBe('2026-06-02T11:30:00.000Z');
  });

  it('horário customizado no fim (até o minuto selecionado)', () => {
    const iso = toDigisacPeriodIso('2026-06-02', 'end', '18:00');
    expect(iso).toBe('2026-06-02T21:00:59.999Z');
  });
});
