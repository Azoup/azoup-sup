import { describe, it, expect } from 'vitest';
import { resolveUserAccessResult } from './userAccessResolve';

describe('resolveUserAccessResult', () => {
  it('usa o resultado da API quando existe', () => {
    expect(
      resolveUserAccessResult({ role: 'admin', permissions: null }, { role: 'user', permissions: null }),
    ).toEqual({ role: 'admin', permissions: null });
  });

  it('aceita Padrão real (role user sem permissões) vindo da API', () => {
    expect(resolveUserAccessResult({ role: 'user', permissions: null }, null)).toEqual({
      role: 'user',
      permissions: null,
    });
  });

  it('usa o fallback Supabase se a API falhar', () => {
    expect(resolveUserAccessResult(null, { role: 'admin', permissions: { kanban_view: true } })).toEqual({
      role: 'admin',
      permissions: { kanban_view: true },
    });
  });

  it('não inventa usuário Padrão quando API e Supabase falham', () => {
    expect(() => resolveUserAccessResult(null, null)).toThrow('user_access_unavailable');
  });
});
