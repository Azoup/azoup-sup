import { describe, expect, it } from 'vitest';
import { isDevNotesSchemaError } from './devKanbanDevNotes';

describe('isDevNotesSchemaError', () => {
  it('detects PostgREST schema cache message', () => {
    expect(
      isDevNotesSchemaError(
        "Could not find the 'dev_notes' column of 'dev_kanban_cards' in the schema cache",
      ),
    ).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    expect(isDevNotesSchemaError('permission denied')).toBe(false);
  });
});
