import { describe, expect, it } from 'vitest';
import {
  devTicketLabel,
  devTicketMatchesSearch,
  formatDevTicketNumber,
} from './devKanbanTicketNumber';

describe('formatDevTicketNumber', () => {
  it('formats with zero padding', () => {
    expect(formatDevTicketNumber(1)).toBe('#0001');
    expect(formatDevTicketNumber(42)).toBe('#0042');
  });

  it('returns empty for invalid values', () => {
    expect(formatDevTicketNumber(null)).toBe('');
    expect(formatDevTicketNumber(undefined)).toBe('');
  });
});

describe('devTicketLabel', () => {
  it('includes formatted number and title', () => {
    expect(devTicketLabel(7, 'Bug login')).toBe('#0007 "Bug login"');
  });
});

describe('devTicketMatchesSearch', () => {
  it('matches formatted and raw queries', () => {
    expect(devTicketMatchesSearch(42, '#0042')).toBe(true);
    expect(devTicketMatchesSearch(42, '42')).toBe(true);
    expect(devTicketMatchesSearch(42, '0042')).toBe(true);
    expect(devTicketMatchesSearch(42, 'bug')).toBe(false);
  });
});
