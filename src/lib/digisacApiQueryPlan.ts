/**
 * Estratégias de query para `GET /api/v1/dashboard/general` (documentação Digisac).
 *
 * - Geral: departmentId=all & userId=all
 * - Por departamento: departmentId={id} & userId=all
 * - Por departamento + usuário (oficial): departmentId={id} & userId={id}
 * - Equipe (breakdown): departmentId + userId[] (painel interno Digisac)
 */

export type DigisacQueryPlan = {
  departmentId: string;
  userIds: string[];
  /** Query oficial: um único userId (não array). */
  useDepartmentAndUserSingular: boolean;
  /** Vários analistas na mesma requisição (userId[]). */
  useTeamMultiUserParams: boolean;
};

export function resolveDigisacQueryPlan(input: {
  action: "geral" | "analistas";
  departmentId: string;
  requestedUserIds: string[];
  effectiveUserIds: string[];
  isClosureDepartment: boolean;
}): DigisacQueryPlan {
  const dept =
    input.departmentId && input.departmentId !== "all" ? input.departmentId : "all";
  const { effectiveUserIds, isClosureDepartment, action } = input;

  if (isClosureDepartment && effectiveUserIds.length > 0) {
    return {
      departmentId: dept,
      userIds: effectiveUserIds.slice(0, 1),
      useDepartmentAndUserSingular: true,
      useTeamMultiUserParams: false,
    };
  }

  if (dept !== "all" && effectiveUserIds.length === 1) {
    return {
      departmentId: dept,
      userIds: [effectiveUserIds[0]],
      useDepartmentAndUserSingular: true,
      useTeamMultiUserParams: false,
    };
  }

  if (action === "analistas" && effectiveUserIds.length > 0) {
    return {
      departmentId: dept,
      userIds: effectiveUserIds,
      useDepartmentAndUserSingular: true,
      useTeamMultiUserParams: false,
    };
  }

  if (action === "geral") {
    return {
      departmentId: dept,
      userIds: effectiveUserIds.length === 1 ? [effectiveUserIds[0]] : [],
      useDepartmentAndUserSingular: dept !== "all" && effectiveUserIds.length === 1,
      useTeamMultiUserParams: false,
    };
  }

  return {
    departmentId: dept,
    userIds: effectiveUserIds,
    useDepartmentAndUserSingular: effectiveUserIds.length === 1,
    useTeamMultiUserParams: false,
  };
}
