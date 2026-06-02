import { describe, it, expect } from 'vitest';
import { isSupportKanbanCardFormDirty } from './kanbanCardFormDirty';

describe('isSupportKanbanCardFormDirty', () => {
  const card = {
    title: 'Título',
    description: 'Desc',
    analyst_id: 'a1',
    status: 'todo',
    labels: [{ id: 'l1' }],
  };

  it('detecta alteração na descrição', () => {
    expect(
      isSupportKanbanCardFormDirty(card, {
        title: 'Título',
        description: 'Nova desc',
        analystId: 'a1',
        selectedLabels: ['l1'],
        moveToColumnSlug: 'todo',
      }),
    ).toBe(true);
  });

  it('retorna false quando nada mudou', () => {
    expect(
      isSupportKanbanCardFormDirty(card, {
        title: 'Título',
        description: 'Desc',
        analystId: 'a1',
        selectedLabels: ['l1'],
        moveToColumnSlug: 'todo',
      }),
    ).toBe(false);
  });
});
