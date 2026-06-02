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

/** Beatriz encerra chamados transferidos para estes departamentos. */
export function isBeatrizClosureAnalyst(normalizedAnalyst: string): boolean {
  return normalizedAnalyst.includes("beatriz") && normalizedAnalyst.includes("oliveira");
}

/**
 * Departamentos em que a equipe repassa o chamado e Beatriz Oliveira finaliza.
 * TMA e gráficos devem considerar só quem encerra (Beatriz), mesmo com "Todos os analistas".
 */
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
  if (filtered.length > 0) return filtered;
  const beatriz = users.filter((u) => isBeatrizClosureAnalyst(normalizeDigisacScopeName(u.name)));
  return beatriz.length > 0 ? beatriz : users;
}

export function filterDigisacAnalystStatsForDepartment<T extends { name: string }>(
  departmentName: string | undefined | null,
  stats: T[],
): T[] {
  const rule = findDigisacDepartmentAnalystRule(departmentName);
  if (!rule) return stats;
  const filtered = stats.filter((row) => rule.matchesAnalyst(normalizeDigisacScopeName(row.name)));
  if (filtered.length > 0) return filtered;
  const beatriz = stats.filter((row) => isBeatrizClosureAnalyst(normalizeDigisacScopeName(row.name)));
  return beatriz.length > 0 ? beatriz : stats;
}
