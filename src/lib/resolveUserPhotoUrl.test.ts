import { describe, it, expect } from 'vitest';
import { personNameMatchesProfile, resolveUserPhoto } from '@/lib/resolveUserPhotoUrl';

describe('resolveUserPhoto', () => {
  it('prefers manual profile photo', () => {
    const r = resolveUserPhoto({
      profilePhoto: 'https://x.supabase.co/storage/v1/object/public/profile-photos/u/1.jpg',
      displayName: 'henri.mecca',
      analysts: [{ name: 'Henri Mecca', photo_url: 'https://x.supabase.co/analyst.jpg' }],
    });
    expect(r.source).toBe('profile');
    expect(r.photo_url).toContain('profile-photos');
  });

  it('uses analyst photo when profile has none', () => {
    const r = resolveUserPhoto({
      displayName: 'henri.mecca',
      analysts: [{ name: 'Henri Mecca', photo_url: 'https://x.supabase.co/storage/v1/object/public/analyst-photos/a.jpg' }],
      developers: [],
    });
    expect(r.source).toBe('analyst');
    expect(r.photo_url).toContain('analyst-photos');
  });

  it('matches display_name with dots to full name', () => {
    expect(personNameMatchesProfile('flavia.andreotti', 'Flavia Andreotti')).toBe(true);
    expect(personNameMatchesProfile('anna.bbento', 'Anna Bento')).toBe(true);
    expect(personNameMatchesProfile('henri.mecca', 'Henri Mecca')).toBe(true);
    expect(personNameMatchesProfile('Henri', 'Henri Mecca')).toBe(true);
  });
});
