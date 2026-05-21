import { describe, it, expect } from 'vitest';
import {
  isSignedStorageUrl,
  normalizeProfilePhotoUrl,
  storageObjectFromPublicUrl,
} from '@/lib/profilePhotoUrl';

describe('profilePhotoUrl', () => {
  it('normalizes legacy host', () => {
    const url =
      'https://ffvgrvrkuiypjzfdcfyw.supabase.co/storage/v1/object/public/analyst-photos/a.jpg';
    const n = normalizeProfilePhotoUrl(url);
    expect(n).not.toContain('ffvgrvrkuiypjzfdcfyw');
  });

  it('parses public object path', () => {
    const url =
      'https://ittmglvkympbyeowgucl.supabase.co/storage/v1/object/public/profile-photos/u/1.jpg';
    expect(storageObjectFromPublicUrl(url)).toEqual({
      bucket: 'profile-photos',
      path: 'u/1.jpg',
    });
  });

  it('skips signed urls for re-signing', () => {
    const signed =
      'https://x.supabase.co/storage/v1/object/sign/analyst-photos/a.jpg?token=abc';
    expect(isSignedStorageUrl(signed)).toBe(true);
    expect(storageObjectFromPublicUrl(signed)).toBeNull();
  });
});
