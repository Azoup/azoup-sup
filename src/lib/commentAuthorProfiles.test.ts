import { describe, it, expect } from 'vitest';
import { enrichCommentWithAuthorProfile } from './commentAuthorProfiles';

describe('enrichCommentWithAuthorProfile', () => {
  const row = {
    id: 'c1',
    card_id: 'card',
    user_id: 'u1',
    user_email: 'bea@azoup.com',
    content: 'teste',
    created_at: '2026-01-01T00:00:00Z',
  };

  it('usa foto do mapa de perfis', () => {
    const enriched = enrichCommentWithAuthorProfile(row, {
      u1: { name: 'Beatriz', photo_url: 'https://example.com/photo.jpg' },
    });
    expect(enriched.display_name).toBe('Beatriz');
    expect(enriched.photo_url).toBe('https://example.com/photo.jpg');
  });

  it('não usa avatar_url vazio do auth quando perfil existe', () => {
    const enriched = enrichCommentWithAuthorProfile(row, {
      u1: { name: 'bea.azoup', photo_url: 'https://cdn/avatar.png' },
    });
    expect(enriched.photo_url).toBe('https://cdn/avatar.png');
  });
});
