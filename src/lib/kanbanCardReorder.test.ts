import { describe, expect, it } from 'vitest';
import {
  computeKanbanDragPositionUpdates,
  sortKanbanCardsByPosition,
} from './kanbanCardReorder';

describe('sortKanbanCardsByPosition', () => {
  it('orders by position ascending', () => {
    const sorted = sortKanbanCardsByPosition([
      { id: 'b', status: 'todo', position: 2 },
      { id: 'a', status: 'todo', position: 0 },
      { id: 'c', status: 'todo', position: 1 },
    ]);
    expect(sorted.map((c) => c.id)).toEqual(['a', 'c', 'b']);
  });
});

describe('computeKanbanDragPositionUpdates', () => {
  const cards = [
    { id: 'a', status: 'todo', position: 0 },
    { id: 'b', status: 'todo', position: 1 },
    { id: 'c', status: 'todo', position: 2 },
    { id: 'x', status: 'done', position: 0 },
  ];

  it('reorders within the same column', () => {
    const updates = computeKanbanDragPositionUpdates(cards, 'a', 'todo', 'todo', 0, 2);
    expect(updates).toEqual([
      { id: 'b', status: 'todo', position: 0 },
      { id: 'c', status: 'todo', position: 1 },
      { id: 'a', status: 'todo', position: 2 },
    ]);
  });

  it('moves across columns and reindexes both lists', () => {
    const updates = computeKanbanDragPositionUpdates(cards, 'b', 'todo', 'done', 1, 1);
    expect(updates).toEqual([
      { id: 'a', status: 'todo', position: 0 },
      { id: 'c', status: 'todo', position: 1 },
      { id: 'x', status: 'done', position: 0 },
      { id: 'b', status: 'done', position: 1 },
    ]);
  });
});
