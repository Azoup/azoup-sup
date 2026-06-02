/** Normaliza nome para comparação (sem acentos, minúsculas). */
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

/**
 * Departamentos em que só parte da equipe atua no Digisac.
 * Após expediente / após tempo de resposta: encerramento por Beatriz Oliveira.
 */
const DEPARTMENT_ANALYST_RULES: DepartmentRule[] = [
  {
    matchesDepartment: (d) =>
      d.includes("apos expediente") ||
      d.includes("depois do expediente") ||
      d.includes("depois expediente"),
    matchesAnalyst: (a) => a.includes("beatriz") && a.includes("oliveira"),
  },
  {
    matchesDepartment: (d) =>
      d.includes("apos tempo de resposta") ||
      (d.includes("tempo de resposta") && d.includes("apos")),
    matchesAnalyst: (a) => a.includes("beatriz") && a.includes("oliveira"),
  },
];

export function findDigisacDepartmentAnalystRule(
  departmentName: string | undefined | null,
): DepartmentRule | undefined {
  if (!departmentName?.trim()) return undefined;
  const normalized = normalizeDigisacScopeName(departmentName);
  return DEPARTMENT_ANALYST_RULES.find((rule) => rule.matchesDepartment(normalized));
}

export function isDigisacDepartmentWithScopedAnalysts(departmentName: string | undefined | null): boolean {
  return !!findDigisacDepartmentAnalystRule(departmentName);
}

export function filterDigisacUsersForDepartment<T extends { id: string; name: string }>(
  departmentName: string | undefined | null,
  users: T[],
): T[] {
  const rule = findDigisacDepartmentAnalystRule(departmentName);
  if (!rule) return users;
  const filtered = users.filter((u) => rule.matchesAnalyst(normalizeDigisacScopeName(u.name)));
  return filtered.length > 0 ? filtered : users;
}

export function filterDigisacAnalystStatsForDepartment<T extends { name: string }>(
  departmentName: string | undefined | null,
  stats: T[],
): T[] {
  const rule = findDigisacDepartmentAnalystRule(departmentName);
  if (!rule) return stats;
  return stats.filter((row) => rule.matchesAnalyst(normalizeDigisacScopeName(row.name)));
}
