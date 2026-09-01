import { pickSuporteDepartment, type DigisacDepartmentOption } from "@/lib/digisacSuporteDepartment";

export const RECURRENCE_DEPARTMENT_KEYS = ["suporte", "confec"] as const;
export type RecurrenceDepartmentKey = (typeof RECURRENCE_DEPARTMENT_KEYS)[number];

export const RECURRENCE_DEPARTMENT_LABEL: Record<RecurrenceDepartmentKey, string> = {
  suporte: "Suporte",
  confec: "Azoup Confec",
};

export function parseRecurrenceDepartmentKey(value: unknown): RecurrenceDepartmentKey {
  return value === "confec" ? "confec" : "suporte";
}

function normalizeDepartmentName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function pickConfecDepartment(
  departments: DigisacDepartmentOption[] | undefined,
): DigisacDepartmentOption | undefined {
  if (!departments?.length) return undefined;

  const withNormalized = departments
    .filter((d) => d?.id && d.name?.trim())
    .map((d) => ({ dept: d, normalized: normalizeDepartmentName(d.name) }));

  const exact = withNormalized.find((row) => row.normalized === "azoup confec");
  if (exact) return exact.dept;

  const withAzoup = withNormalized.find(
    (row) => row.normalized.includes("azoup") && row.normalized.includes("confec"),
  );
  if (withAzoup) return withAzoup.dept;

  return withNormalized.find((row) => row.normalized.includes("confec"))?.dept;
}

export function pickRecurrenceDepartment(
  departments: DigisacDepartmentOption[] | undefined,
  key: RecurrenceDepartmentKey,
): DigisacDepartmentOption | undefined {
  if (key === "confec") return pickConfecDepartment(departments);
  return pickSuporteDepartment(departments);
}

export function pickRecurrenceDepartmentId(
  departments: DigisacDepartmentOption[] | undefined,
  key: RecurrenceDepartmentKey,
): string | undefined {
  return pickRecurrenceDepartment(departments, key)?.id;
}
