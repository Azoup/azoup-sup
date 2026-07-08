import { describe, expect, it } from 'vitest';
import {
  applyVisibleReorderToColumn,
  computeKanbanDragPositionUpdates,
  computeKanbanDragPositionUpdatesWithVisible,
  filterChangedPositionUpdates,
  mapVisibleDestIndexToFull,
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

describe('filterChangedPositionUpdates', () => {
  it('skips cards already at the target position', () => {
    const all = [
      { id: 'a', status: 'todo', position: 0 },
      { id: 'b', status: 'todo', position: 1 },
      { id: 'c', status: 'todo', position: 2 },
    ];
    const updates = [
      { id: 'a', status: 'todo', position: 0 },
      { id: 'b', status: 'todo', position: 0 },
      { id: 'c', status: 'todo', position: 1 },
    ];
    expect(filterChangedPositionUpdates(all, updates)).toEqual([
      { id: 'b', status: 'todo', position: 0 },
      { id: 'c', status: 'todo', position: 1 },
    ]);
  });
});

describe('computeKanbanDragPositionUpdatesWithVisible', () => {
  const allCards = [
    { id: 'a', status: 'todo', position: 0 },
    { id: 'b', status: 'todo', position: 1 },
    { id: 'c', status: 'todo', position: 2 },
    { id: 'd', status: 'todo', position: 3 },
    { id: 'x', status: 'done', position: 0 },
    { id: 'y', status: 'done', position: 1 },
  ];

  it('moves across columns using filtered destination index', () => {
    const visible = {
      todo: [
        { id: 'b', status: 'todo', position: 1 },
        { id: 'd', status: 'todo', position: 3 },
      ],
      done: [{ id: 'x', status: 'done', position: 0 }],
    };

    const updates = computeKanbanDragPositionUpdatesWithVisible(
      allCards,
      visible,
      'b',
      'todo',
      'done',
      0,
      1,
    );

    expect(updates).toEqual([
      { id: 'a', status: 'todo', position: 0 },
      { id: 'c', status: 'todo', position: 1 },
      { id: 'd', status: 'todo', position: 2 },
      { id: 'x', status: 'done', position: 0 },
      { id: 'b', status: 'done', position: 1 },
      { id: 'y', status: 'done', position: 2 },
    ]);
  });

  it('reorders within column when only visible cards are shown', () => {
    const visible = {
      todo: [
        { id: 'b', status: 'todo', position: 1 },
        { id: 'd', status: 'todo', position: 3 },
      ],
    };

    const updates = computeKanbanDragPositionUpdatesWithVisible(
      allCards,
      visible,
      'b',
      'todo',
      'todo',
      0,
      1,
    );

    expect(updates).toEqual([
      { id: 'a', status: 'todo', position: 0 },
      { id: 'd', status: 'todo', position: 1 },
      { id: 'c', status: 'todo', position: 2 },
      { id: 'b', status: 'todo', position: 3 },
    ]);
  });
});

describe('mapVisibleDestIndexToFull', () => {
  it('maps filtered index to full list index', () => {
    const all = [
      { id: 'a', status: 'todo', position: 0 },
      { id: 'b', status: 'todo', position: 1 },
      { id: 'c', status: 'todo', position: 2 },
    ];
    const visible = [
      { id: 'b', status: 'todo', position: 1 },
      { id: 'c', status: 'todo', position: 2 },
    ];
    expect(
      mapVisibleDestIndexToFull(all, visible, 0, 'x', 'todo', 'todo'),
    ).toBe(1);
  });
});
