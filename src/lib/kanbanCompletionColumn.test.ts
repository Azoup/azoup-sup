import { describe, it, expect } from 'vitest';
import { isKanbanCompletionSlug, resolveCompletionColumnSlug } from '@/lib/kanbanCompletionColumn';

describe('kanbanCompletionColumn', () => {
  const devColumns = [
    { slug: 'analisados', title: 'Analisados', position: 0 },
    { slug: 'postar', title: 'Postar', position: 1 },
    { slug: 'para_atualizar_123', title: 'Para atualizar', position: 2 },
    { slug: 'finalizados', title: 'Finalizados', position: 3 },
  ];

  it('resolves finalizados as dev completion column', () => {
    expect(resolveCompletionColumnSlug(devColumns, 'dev')).toBe('finalizados');
  });

  it('does not treat para atualizar as completion', () => {
    const completion = resolveCompletionColumnSlug(devColumns, 'dev');
    expect(isKanbanCompletionSlug('para_atualizar_123', completion)).toBe(false);
    expect(isKanbanCompletionSlug('postar', completion)).toBe(false);
  });

  it('treats only finalizados as completion', () => {
    const completion = resolveCompletionColumnSlug(devColumns, 'dev');
    expect(isKanbanCompletionSlug('finalizados', completion)).toBe(true);
  });

  it('does not match broad substring false positives', () => {
    const completion = resolveCompletionColumnSlug(devColumns, 'dev');
    expect(isKanbanCompletionSlug('aguardando_finalizacao', completion)).toBe(false);
    expect(isKanbanCompletionSlug('para_atualizar', completion)).toBe(false);
  });

  it('resolves done column for support board', () => {
    const cols = [
      { slug: 'pending', title: 'Pendências' },
      { slug: 'done', title: 'Concluídos' },
    ];
    expect(resolveCompletionColumnSlug(cols, 'support')).toBe('done');
  });
});
