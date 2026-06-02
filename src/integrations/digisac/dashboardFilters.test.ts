import { describe, it, expect } from 'vitest';
import { mergeDigisacDashboardFilters, DIGISAC_DASHBOARD_FILTER_DEFAULTS } from './dashboardFilters';

describe('mergeDigisacDashboardFilters', () => {
  it('aplica padrões da API Digisac', () => {
    expect(mergeDigisacDashboardFilters({})).toEqual({
      ...DIGISAC_DASHBOARD_FILTER_DEFAULTS,
      serviceId: undefined,
    });
  });

  it('aceita filtros avançados', () => {
    expect(
      mergeDigisacDashboardFilters({
        periodType: 'closeDate',
        status: 'close',
        userParticipation: 'middle',
        departmentParticipation: 'middle',
        serviceId: 'svc-1',
      }),
    ).toMatchObject({
      periodType: 'closeDate',
      status: 'close',
      userParticipation: 'middle',
      departmentParticipation: 'middle',
      serviceId: 'svc-1',
    });
  });
});
