import { describe, expect, it } from 'vitest';
import {
  buildStatusChartRows,
  countCompletedInPeriod,
  filterCardsForDashboard,
  isInLocalDateRange,
} from './dashboardDevMetrics';

const columns = [
  { slug: 'backlog', title: 'Backlog' },
  { slug: 'concluidos', title: 'Concluídos' },
];

describe('dashboardDevMetrics', () => {
  const cards = [
    {
      id: '1',
      status: 'concluidos',
      created_at: '2026-05-10T12:00:00.000Z',
      updated_at: '2026-06-15T10:00:00.000Z',
      completed_at: '2026-06-15T10:00:00.000Z',
    },
    {
      id: '2',
      status: 'concluidos',
      created_at: '2026-06-05T12:00:00.000Z',
      updated_at: '2026-06-20T10:00:00.000Z',
      completed_at: '2026-06-20T10:00:00.000Z',
    },
    {
      id: '3',
      status: 'concluidos',
      created_at: '2026-06-01T12:00:00.000Z',
      updated_at: '2026-07-02T10:00:00.000Z',
      completed_at: '2026-07-02T10:00:00.000Z',
    },
    {
      id: '4',
      status: 'backlog',
      created_at: '2026-06-01T12:00:00.000Z',
      updated_at: '2026-06-01T12:00:00.000Z',
      completed_at: null,
    },
  ];

  it('counts completed in period using completion date, not creation date', () => {
    expect(
      countCompletedInPeriod(cards, '2026-06-01', '2026-06-30', 'concluidos', '', ''),
    ).toBe(2);
  });

  it('uses local date range boundaries', () => {
    expect(isInLocalDateRange('2026-06-30T23:30:00-03:00', '2026-06-01', '2026-06-30')).toBe(true);
  });

  it('shows completion column by finished date when month filter is active', () => {
    const filtered = filterCardsForDashboard(cards, '2026-06-01', '2026-06-30', '', '');
    const rows = buildStatusChartRows(columns, cards, filtered, {
      hasDateFilter: true,
      dateFrom: '2026-06-01',
      dateTo: '2026-06-30',
      completionColumnSlug: 'concluidos',
      filterAnalystId: '',
      filterDevId: '',
    });

    expect(rows.find((r) => r.name === 'Concluídos')?.cards).toBe(2);
    expect(rows.find((r) => r.name === 'Backlog')?.cards).toBe(1);
  });
});
