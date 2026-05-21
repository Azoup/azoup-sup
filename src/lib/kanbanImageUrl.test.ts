import { describe, it, expect } from 'vitest';
import { kanbanImagePathFromUrl, normalizeKanbanImageUrl } from '@/lib/kanbanImageUrl';

describe('kanbanImageUrl', () => {
  it('extracts path from public storage url', () => {
    const url =
      'https://ittmglvkympbyeowgucl.supabase.co/storage/v1/object/public/kanban-images/abc.png';
    expect(kanbanImagePathFromUrl(url)).toBe('abc.png');
  });

  it('extracts path from signed url', () => {
    const url =
      'https://x.supabase.co/storage/v1/object/sign/kanban-images/card/1.jpg?token=abc';
    expect(kanbanImagePathFromUrl(url)).toBe('card/1.jpg');
  });

  it('normalizes legacy host to current project', () => {
    const url =
      'https://ffvgrvrkuiypjzfdcfyw.supabase.co/storage/v1/object/public/kanban-images/old.png';
    const n = normalizeKanbanImageUrl(url);
    expect(n).not.toContain('ffvgrvrkuiypjzfdcfyw');
    expect(n).toContain('/kanban-images/old.png');
  });

  it('builds public url from bare filename', () => {
    const n = normalizeKanbanImageUrl('1716291234-abc.png');
    expect(n).toContain('/storage/v1/object/public/kanban-images/1716291234-abc.png');
  });
});
