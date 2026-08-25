import type { DigisacBuContactTagKey } from "@/lib/digisacBuContactTags";
import type {
  RecurrenceClass,
  RecurrenceContactRow,
  RecurrenceSummary,
} from "@/lib/digisacBuRecurrence";

export type DigisacBuRecurrenceResponse = {
  departmentId: string;
  departmentName: string;
  startDate: string;
  endDate: string;
  summary: RecurrenceSummary;
  contacts: RecurrenceContactRow[];
  warnings?: string[];
};

export type { RecurrenceClass, RecurrenceContactRow, RecurrenceSummary, DigisacBuContactTagKey };
