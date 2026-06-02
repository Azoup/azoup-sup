import { describe, it, expect } from 'vitest';
import {
  filterDigisacAnalystStatsForDepartment,
  filterDigisacUsersForDepartment,
  isDigisacDepartmentWithScopedAnalysts,
} from './digisacDepartmentAnalystScope';

const team = [
  { id: '1', name: 'Beatriz Oliveira' },
  { id: '2', name: 'Anna Carollina' },
  { id: '3', name: 'Henri Mecca' },
];

describe('digisacDepartmentAnalystScope', () => {
  it('restringe após expediente a Beatriz', () => {
    expect(isDigisacDepartmentWithScopedAnalysts('Após expediente')).toBe(true);
    const filtered = filterDigisacUsersForDepartment('Após expediente', team);
    expect(filtered.map((u) => u.name)).toEqual(['Beatriz Oliveira']);
  });

  it('restringe após tempo de resposta a Beatriz', () => {
    expect(isDigisacDepartmentWithScopedAnalysts('Após tempo de resposta')).toBe(true);
    expect(isDigisacDepartmentWithScopedAnalysts('Apos Tempo de Resposta')).toBe(true);
    const filtered = filterDigisacUsersForDepartment('Após tempo de resposta', team);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('Beatriz Oliveira');
  });

  it('restringe mesmo com todos os analistas no filtro (só Beatriz na API)', () => {
    const stats = [
      { name: 'Anna Carollina', tma: 1 },
      { name: 'Beatriz Oliveira', tma: 2 },
    ];
    const filtered = filterDigisacAnalystStatsForDepartment('Após expediente', stats);
    expect(filtered.map((s) => s.name)).toEqual(['Beatriz Oliveira']);
  });

  it('mantém todos em departamento comum', () => {
    expect(isDigisacDepartmentWithScopedAnalysts('Suporte')).toBe(false);
    expect(filterDigisacUsersForDepartment('Suporte', team)).toHaveLength(3);
  });
});
