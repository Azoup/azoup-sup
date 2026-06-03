export type DigisacQueryPlan = {
  departmentId: string;
  userIds: string[];
  useDepartmentAndUserSingular: boolean;
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
