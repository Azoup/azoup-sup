import type { CSSProperties } from 'react';

const TAILWIND_COLUMN_COLOR_HEX: Record<string, string> = {
  'border-t-gray-500': '#6b7280',
  'border-t-blue-500': '#3b82f6',
  'border-t-amber-500': '#f59e0b',
  'border-t-emerald-500': '#10b981',
  'border-t-rose-500': '#f43f5e',
  'border-t-purple-500': '#a855f7',
  'border-t-orange-500': '#f97316',
  'border-t-cyan-500': '#06b6d4',
  'border-t-pink-500': '#ec4899',
  'border-t-indigo-500': '#6366f1',
};

export const DEFAULT_KANBAN_COLUMN_COLOR = '#3b82f6';

export function isKanbanColumnHexColor(color: string | null | undefined): boolean {
  return !!color && color.startsWith('#');
}

/** Converte valor legado (Tailwind) ou hex para o color picker. */
export function columnColorToPickerValue(color: string | null | undefined): string {
  if (!color) return DEFAULT_KANBAN_COLUMN_COLOR;
  if (isKanbanColumnHexColor(color)) return color;
  return TAILWIND_COLUMN_COLOR_HEX[color] ?? DEFAULT_KANBAN_COLUMN_COLOR;
}

export function getKanbanColumnBorderClassName(color: string | null | undefined): string {
  if (isKanbanColumnHexColor(color)) return 'border-t-4';
  return `border-t-4 ${color || 'border-t-blue-500'}`;
}

export function getKanbanColumnBorderStyle(color: string | null | undefined): CSSProperties | undefined {
  if (isKanbanColumnHexColor(color)) return { borderTopColor: color };
  return undefined;
}
