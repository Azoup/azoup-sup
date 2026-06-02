import { describe, expect, it } from 'vitest';
import { pickSuporteDepartmentId } from './digisacSuporteDepartment';

describe('pickSuporteDepartmentId', () => {
  it('encontra departamento Suporte pelo nome', () => {
    const id = pickSuporteDepartmentId([
      { id: '1', name: 'Comercial' },
      { id: '2', name: 'Suporte Técnico' },
    ]);
    expect(id).toBe('2');
  });
});
