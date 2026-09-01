import { describe, expect, it } from 'vitest';
import {
  isKanbanDoneLabelName,
  needsKanbanDoneLabelRename,
  pickKanbanDoneLabel,
  KANBAN_DONE_LABEL_NAME,
} from './kanbanDoneLabel';

describe('kanbanDoneLabel', () => {
  it('reconhece Concluídos e o singular legado', () => {
    expect(isKanbanDoneLabelName('Concluídos')).toBe(true);
    expect(isKanbanDoneLabelName('concluido')).toBe(true);
    expect(isKanbanDoneLabelName('Em andamento')).toBe(false);
    expect(isKanbanDoneLabelName('Pré-concluído')).toBe(false);
  });

  it('prefere a etiqueta Concluídos quando as duas existem', () => {
    const picked = pickKanbanDoneLabel([
      { id: '1', name: 'Urgente' },
      { id: '2', name: 'Concluído' },
      { id: '3', name: 'Concluídos' },
    ]);
    expect(picked?.id).toBe('3');
    expect(KANBAN_DONE_LABEL_NAME).toBe('Concluídos');
  });

  it('marca o singular para rename', () => {
    expect(needsKanbanDoneLabelRename('Concluído')).toBe(true);
    expect(needsKanbanDoneLabelRename('Concluídos')).toBe(false);
  });
});
