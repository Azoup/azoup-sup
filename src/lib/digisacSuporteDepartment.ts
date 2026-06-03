/** Departamento padrão do painel NPS (pesquisa configurada só em Suporte). */
export const DIGISAC_NPS_DEFAULT_DEPARTMENT_PATTERN = /suporte/i;

export type DigisacDepartmentOption = { id: string; name: string };

export function pickSuporteDepartment(
  departments: DigisacDepartmentOption[] | undefined,
): DigisacDepartmentOption | undefined {
  if (!departments?.length) return undefined;
  const exact = departments.find((d) => d.name.trim().toLowerCase() === 'suporte');
  if (exact) return exact;
  return departments.find((d) => DIGISAC_NPS_DEFAULT_DEPARTMENT_PATTERN.test(d.name.trim()));
}

export function pickSuporteDepartmentId(
  departments: DigisacDepartmentOption[] | undefined,
): string | undefined {
  return pickSuporteDepartment(departments)?.id;
}
