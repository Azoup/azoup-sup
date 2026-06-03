import { describe, it, expect } from 'vitest';
import { resolveDigisacQueryPlan } from './digisacApiQueryPlan';

describe('resolveDigisacQueryPlan', () => {
  it('usa departmentId + userId singular (doc Digisac)', () => {
    const plan = resolveDigisacQueryPlan({
      action: 'geral',
      departmentId: 'dept-1',
      requestedUserIds: ['user-b'],
      effectiveUserIds: ['user-b'],
      isClosureDepartment: false,
    });
    expect(plan.useDepartmentAndUserSingular).toBe(true);
    expect(plan.useTeamMultiUserParams).toBe(false);
    expect(plan.userIds).toEqual(['user-b']);
    expect(plan.departmentId).toBe('dept-1');
  });

  it('departamento sem analista específico usa userId=all', () => {
    const plan = resolveDigisacQueryPlan({
      action: 'geral',
      departmentId: 'dept-1',
      requestedUserIds: [],
      effectiveUserIds: ['u1', 'u2'],
      isClosureDepartment: false,
    });
    expect(plan.userIds).toEqual([]);
    expect(plan.departmentId).toBe('dept-1');
  });

  it('departamento de encerramento força um único usuário', () => {
    const plan = resolveDigisacQueryPlan({
      action: 'analistas',
      departmentId: 'dept-x',
      requestedUserIds: [],
      effectiveUserIds: ['beatriz-id'],
      isClosureDepartment: true,
    });
    expect(plan.useDepartmentAndUserSingular).toBe(true);
    expect(plan.userIds).toEqual(['beatriz-id']);
  });

  it('vários analistas usa dept+userId por pessoa (sem userId[])', () => {
    const plan = resolveDigisacQueryPlan({
      action: 'analistas',
      departmentId: 'all',
      requestedUserIds: [],
      effectiveUserIds: ['u1', 'u2', 'u3'],
      isClosureDepartment: false,
    });
    expect(plan.useTeamMultiUserParams).toBe(false);
    expect(plan.useDepartmentAndUserSingular).toBe(true);
    expect(plan.userIds).toEqual(['u1', 'u2', 'u3']);
  });
});
