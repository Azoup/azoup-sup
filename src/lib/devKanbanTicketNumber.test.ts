import { describe, expect, it } from 'vitest';
import {
  devTicketLabel,
  devTicketMatchesSearch,
  formatDevTicketNumber,
  isDevTicketNumberQuery,
} from './devKanbanTicketNumber';

describe('formatDevTicketNumber', () => {
  it('formats with zero padding without hash', () => {
    expect(formatDevTicketNumber(1)).toBe('0001');
    expect(formatDevTicketNumber(42)).toBe('0042');
  });

  it('returns empty for invalid values', () => {
    expect(formatDevTicketNumber(null)).toBe('');
    expect(formatDevTicketNumber(undefined)).toBe('');
  });
});

describe('devTicketLabel', () => {
  it('includes formatted number and title', () => {
    expect(devTicketLabel(7, 'Bug login')).toBe('0007 "Bug login"');
  });
});

describe('devTicketMatchesSearch', () => {
  it('matches only the exact ticket for 0002', () => {
    expect(devTicketMatchesSearch(2, '0002')).toBe(true);
    expect(devTicketMatchesSearch(2, '2')).toBe(true);
    expect(devTicketMatchesSearch(2, '02')).toBe(true);
    expect(devTicketMatchesSearch(20, '0002')).toBe(false);
    expect(devTicketMatchesSearch(21, '0002')).toBe(false);
    expect(devTicketMatchesSearch(22, '0002')).toBe(false);
    expect(devTicketMatchesSearch(200, '0002')).toBe(false);
    expect(devTicketMatchesSearch(12, '0002')).toBe(false);
  });

  it('matches only the exact ticket for 0022', () => {
    expect(devTicketMatchesSearch(22, '0022')).toBe(true);
    expect(devTicketMatchesSearch(22, '22')).toBe(true);
    expect(devTicketMatchesSearch(2, '0022')).toBe(false);
  });

  it('does not match partial prefixes like 000', () => {
    expect(devTicketMatchesSearch(2, '000')).toBe(false);
    expect(devTicketMatchesSearch(1, '000')).toBe(false);
    expect(devTicketMatchesSearch(22, '000')).toBe(false);
  });

  it('returns false for non-numeric queries', () => {
    expect(devTicketMatchesSearch(42, 'bug')).toBe(false);
  });
});
