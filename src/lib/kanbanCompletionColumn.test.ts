import { describe, it, expect } from 'vitest';
import {
  isEnteringColumn,
  isKanbanCompletionDestination,
  isKanbanCompletionSlug,
  isLeavingColumn,
  resolveCompletionColumnSlug,
  resolveParaAtualizarColumnSlug,
} from '@/lib/kanbanCompletionColumn';

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

  it('prefere Concluídos quando Finalizados também existe', () => {
    const cols = [
      { slug: 'finalizados', title: 'Finalizados' },
      { slug: 'concluidos', title: 'Concluídos' },
    ];
    expect(resolveCompletionColumnSlug(cols, 'dev')).toBe('concluidos');
  });

  it('reconhece Concluídos como destino mesmo com Finalizados no board', () => {
    const cols = [
      { slug: 'em_andamento', title: 'Em andamento' },
      { slug: 'finalizados', title: 'Finalizados' },
      { slug: 'concluidos', title: 'Concluídos' },
    ];
    expect(isKanbanCompletionDestination('concluidos', cols, 'dev')).toBe(true);
    expect(isKanbanCompletionDestination('finalizados', cols, 'dev')).toBe(true);
    expect(isKanbanCompletionDestination('em_andamento', cols, 'dev')).toBe(false);
  });

  it('resolve a coluna Para atualizar pelo título', () => {
    expect(resolveParaAtualizarColumnSlug(devColumns)).toBe('para_atualizar_123');
  });

  it('não confunde Para atualizar com outras listas', () => {
    expect(
      resolveParaAtualizarColumnSlug([
        { slug: 'aguardando_atualizacao', title: 'Aguardando atualização' },
        { slug: 'finalizados', title: 'Finalizados' },
      ]),
    ).toBe(null);
  });

  it('detecta entrada e saída de Para atualizar', () => {
    expect(isEnteringColumn('postar', 'para_atualizar_123', 'para_atualizar_123')).toBe(true);
    expect(isEnteringColumn('para_atualizar_123', 'finalizados', 'para_atualizar_123')).toBe(false);
    expect(isLeavingColumn('para_atualizar_123', 'finalizados', 'para_atualizar_123')).toBe(true);
    expect(isLeavingColumn('postar', 'para_atualizar_123', 'para_atualizar_123')).toBe(false);
  });
});
