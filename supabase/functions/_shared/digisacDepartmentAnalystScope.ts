export function normalizeDigisacScopeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

type DepartmentRule = {
  matchesDepartment: (normalizedDept: string) => boolean;
  matchesAnalyst: (normalizedAnalyst: string) => boolean;
};

export function isBeatrizClosureAnalyst(normalizedAnalyst: string): boolean {
  return normalizedAnalyst.includes("beatriz") && normalizedAnalyst.includes("oliveira");
}

const DEPARTMENT_ANALYST_RULES: DepartmentRule[] = [
  {
    matchesDepartment: (d) =>
      (d.includes("expediente") && (d.includes("apos") || d.includes("depois") || d.includes("pos"))) ||
      d.includes("apos expediente") ||
      d.includes("depois expediente"),
    matchesAnalyst: isBeatrizClosureAnalyst,
  },
  {
    matchesDepartment: (d) =>
      d.includes("tempo de resposta") ||
      d.includes("apos tempo") ||
      (d.includes("resposta") && (d.includes("apos") || d.includes("depois"))),
    matchesAnalyst: isBeatrizClosureAnalyst,
  },
];

export function findDigisacDepartmentAnalystRule(
  departmentName: string | undefined | null,
): DepartmentRule | undefined {
  if (!departmentName?.trim()) return undefined;
  const normalized = normalizeDigisacScopeName(departmentName);
  return DEPARTMENT_ANALYST_RULES.find((rule) => rule.matchesDepartment(normalized));
}

export function filterDigisacUsersForDepartment<T extends { id: string; name: string }>(
  departmentName: string | undefined | null,
  users: T[],
): T[] {
  const rule = findDigisacDepartmentAnalystRule(departmentName);
  if (!rule) return users;
  const filtered = users.filter((u) => rule.matchesAnalyst(normalizeDigisacScopeName(u.name)));
  if (filtered.length > 0) return filtered;
  const beatriz = users.filter((u) => isBeatrizClosureAnalyst(normalizeDigisacScopeName(u.name)));
  return beatriz.length > 0 ? beatriz : users;
}
