/** Filtros do endpoint Digisac `GET /api/v1/answers/overview`. */
export type DigisacEvaluationType = 'nps' | 'csat';
export type DigisacAnswersPeriodType = 'all' | 'close' | 'open';

export type DigisacNpsQueryFilters = {
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  departmentId?: string;
  departmentName?: string;
  userId?: string;
  evaluationType?: DigisacEvaluationType;
  periodType?: DigisacAnswersPeriodType;
  serviceId?: string;
};

export const DIGISAC_NPS_FILTER_DEFAULTS: Required<
  Pick<DigisacNpsQueryFilters, 'evaluationType' | 'periodType' | 'userId'>
> = {
  evaluationType: 'nps',
  periodType: 'all',
  userId: 'all',
};

export function mergeDigisacNpsFilters(
  partial?: DigisacNpsQueryFilters,
): DigisacNpsQueryFilters {
  return {
    ...DIGISAC_NPS_FILTER_DEFAULTS,
    ...partial,
    userId: partial?.userId?.trim() || 'all',
    evaluationType: partial?.evaluationType ?? 'nps',
    periodType: partial?.periodType ?? 'all',
    departmentId: partial?.departmentId?.trim() || undefined,
    departmentName: partial?.departmentName?.trim() || undefined,
    serviceId: partial?.serviceId?.trim() || undefined,
  };
}
