import { describe, it, expect, beforeEach } from 'vitest';
import {
  mergeCadastroRowsWithPhotoCache,
  rememberCadastroPhoto,
  getRememberedCadastroPhoto,
} from '@/lib/cadastroPhotoCache';

describe('cadastroPhotoCache', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('restores photo when db returns empty', () => {
    rememberCadastroPhoto('analysts', 'id-1', 'https://x.supabase.co/storage/v1/object/public/analyst-photos/id-1/a.jpg');
    const merged = mergeCadastroRowsWithPhotoCache('analysts', [
      { id: 'id-1', name: 'Anna', photo_url: null },
    ]);
    expect(merged[0].photo_url).toContain('analyst-photos');
    expect(getRememberedCadastroPhoto('analysts', 'id-1')).toContain('analyst-photos');
  });
});
