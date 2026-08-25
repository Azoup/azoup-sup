import type { DigisacBuContactTagKey } from "@/lib/digisacBuContactTags";

export type DigisacBuUnitMetrics = {
  atendimentos: number;
  contatos: number;
};

export type DigisacBuUnitStats = DigisacBuUnitMetrics & {
  key: DigisacBuContactTagKey;
  tagId: string;
  tagName: string;
};

export type DigisacBuBucket = {
  startDate: string;
  endDate: string;
  label: string;
  units: Record<DigisacBuContactTagKey, DigisacBuUnitMetrics>;
};

export type DigisacBuDashboardResponse = {
  departmentId: string;
  departmentName: string;
  startDate: string;
  endDate: string;
  units: DigisacBuUnitStats[];
  weeks: DigisacBuBucket[];
  months: DigisacBuBucket[];
  warnings?: string[];
};
