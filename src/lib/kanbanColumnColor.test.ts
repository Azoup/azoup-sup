import { describe, expect, it } from 'vitest';
import {
  columnColorToPickerValue,
  getKanbanColumnBorderClassName,
  getKanbanColumnBorderStyle,
} from './kanbanColumnColor';

describe('kanbanColumnColor', () => {
  it('maps legacy tailwind color to hex for picker', () => {
    expect(columnColorToPickerValue('border-t-amber-500')).toBe('#f59e0b');
  });

  it('keeps hex colors as-is', () => {
    expect(columnColorToPickerValue('#eb1414')).toBe('#eb1414');
  });

  it('uses inline border style for hex colors', () => {
    expect(getKanbanColumnBorderClassName('#eb1414')).toBe('border-t-4');
    expect(getKanbanColumnBorderStyle('#eb1414')).toEqual({ borderTopColor: '#eb1414' });
  });

  it('keeps tailwind class for legacy colors', () => {
    expect(getKanbanColumnBorderClassName('border-t-blue-500')).toBe('border-t-4 border-t-blue-500');
    expect(getKanbanColumnBorderStyle('border-t-blue-500')).toBeUndefined();
  });
});
