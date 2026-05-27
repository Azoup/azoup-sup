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

describe('isDevTicketNumberQuery', () => {
  it('detects numeric ticket searches', () => {
    expect(isDevTicketNumberQuery('0002')).toBe(true);
    expect(isDevTicketNumberQuery('#42')).toBe(true);
    expect(isDevTicketNumberQuery('bug')).toBe(false);
  });
});

describe('devTicketMatchesSearch', () => {
  it('matches exact ticket by padded or short form', () => {
    expect(devTicketMatchesSearch(42, '0042')).toBe(true);
    expect(devTicketMatchesSearch(42, '42')).toBe(true);
    expect(devTicketMatchesSearch(42, '#0042')).toBe(true);
    expect(devTicketMatchesSearch(2, '0002')).toBe(true);
  });

  it('does not match other tickets when searching 0002', () => {
    expect(devTicketMatchesSearch(2, '0002')).toBe(true);
    expect(devTicketMatchesSearch(20, '0002')).toBe(false);
    expect(devTicketMatchesSearch(21, '0002')).toBe(false);
    expect(devTicketMatchesSearch(200, '0002')).toBe(false);
    expect(devTicketMatchesSearch(12, '0002')).toBe(false);
  });

  it('supports prefix while typing', () => {
    expect(devTicketMatchesSearch(2, '000')).toBe(true);
    expect(devTicketMatchesSearch(20, '000')).toBe(true);
    expect(devTicketMatchesSearch(100, '000')).toBe(false);
  });

  it('returns false for non-numeric queries', () => {
    expect(devTicketMatchesSearch(42, 'bug')).toBe(false);
  });
});
