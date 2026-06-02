/** Parâmetros oficiais do endpoint Digisac `GET /api/v1/dashboard/general`. */
export type DigisacPeriodType = 'openDate' | 'closeDate';
export type DigisacParticipation = 'last' | 'middle';
export type DigisacTicketStatus = 'all' | 'open' | 'close';

export type DigisacDashboardQueryFilters = {
  startDate?: string;
  endDate?: string;
  departmentId?: string;
  /** ID do usuário Digisac ou `all`. */
  userId?: string;
  periodType?: DigisacPeriodType;
  departmentParticipation?: DigisacParticipation;
  userParticipation?: DigisacParticipation;
  status?: DigisacTicketStatus;
  serviceId?: string;
  grouping?: string;
};

export const DIGISAC_DASHBOARD_FILTER_DEFAULTS: Required<
  Pick<
    DigisacDashboardQueryFilters,
    | 'periodType'
    | 'departmentParticipation'
    | 'userParticipation'
    | 'status'
    | 'departmentId'
    | 'userId'
    | 'grouping'
  >
> = {
  periodType: 'openDate',
  departmentParticipation: 'last',
  userParticipation: 'last',
  status: 'all',
  departmentId: 'all',
  userId: 'all',
  grouping: '',
};

export function mergeDigisacDashboardFilters(
  partial?: DigisacDashboardQueryFilters,
): DigisacDashboardQueryFilters {
  return {
    ...DIGISAC_DASHBOARD_FILTER_DEFAULTS,
    ...partial,
    departmentId: partial?.departmentId?.trim() || 'all',
    userId: partial?.userId?.trim() || 'all',
    serviceId: partial?.serviceId?.trim() || undefined,
    grouping: partial?.grouping ?? '',
  };
}
