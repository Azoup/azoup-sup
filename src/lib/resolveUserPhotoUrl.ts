import { normalizeProfilePhotoUrl } from '@/lib/profilePhotoUrl';

export type PersonWithPhoto = {
  name: string;
  photo_url: string | null;
};

function normalizeKey(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.\s_]+/g, ' ')
    .trim();
}

function firstToken(s: string): string {
  const n = normalizeKey(s);
  return n.split(' ')[0] || n.slice(0, 3);
}

/** Compara display_name do perfil (ex.: henri.mecca) com nome no cadastro (ex.: Henri Mecca). */
export function personNameMatchesProfile(displayName: string, personName: string): boolean {
  const a = normalizeKey(displayName);
  const b = normalizeKey(personName);
  if (!a || !b) return false;
  if (a === b) return true;

  const aFirst = firstToken(displayName);
  const bFirst = firstToken(personName);
  if (aFirst.length >= 3 && bFirst.length >= 3 && aFirst === bFirst) {
    return true;
  }

  const aParts = displayName.toLowerCase().split(/[._\s]+/).filter((p) => p.length >= 2);
  if (aParts.length >= 2) {
    const bNorm = normalizeKey(personName);
    if (aParts.every((part) => bNorm.includes(part))) return true;
  }

  return false;
}

function photoFromPeople(displayName: string, people: PersonWithPhoto[]): string | null {
  let best: { score: number; url: string } | null = null;

  for (const person of people) {
    if (!person.photo_url?.trim() || !personNameMatchesProfile(displayName, person.name)) continue;
    const url = normalizeProfilePhotoUrl(person.photo_url.trim()) ?? person.photo_url.trim();
    const score = normalizeKey(displayName) === normalizeKey(person.name) ? 100 : 50;
    if (!best || score > best.score) {
      best = { score, url };
    }
  }

  return best?.url ?? null;
}

export type ResolveUserPhotoInput = {
  profilePhoto?: string | null;
  displayName?: string | null;
  analysts?: PersonWithPhoto[];
  developers?: PersonWithPhoto[];
};

export type ResolvedUserPhoto = {
  photo_url: string;
  source: 'profile' | 'analyst' | 'developer' | null;
  profile_photo_url: string | null;
};

/** Foto manual no perfil tem prioridade; senão cadastro de analista ou desenvolvedor. */
export function resolveUserPhoto(input: ResolveUserPhotoInput): ResolvedUserPhoto {
  const profileRaw = input.profilePhoto?.trim() || null;
  const profilePhoto = profileRaw
    ? normalizeProfilePhotoUrl(profileRaw) ?? profileRaw
    : null;

  if (profilePhoto) {
    return {
      photo_url: profilePhoto,
      source: 'profile',
      profile_photo_url: profilePhoto,
    };
  }

  const displayName = input.displayName?.trim();
  if (!displayName) {
    return { photo_url: '', source: null, profile_photo_url: null };
  }

  const fromAnalyst = photoFromPeople(displayName, input.analysts ?? []);
  if (fromAnalyst) {
    return { photo_url: fromAnalyst, source: 'analyst', profile_photo_url: null };
  }

  const fromDev = photoFromPeople(displayName, input.developers ?? []);
  if (fromDev) {
    return { photo_url: fromDev, source: 'developer', profile_photo_url: null };
  }

  return { photo_url: '', source: null, profile_photo_url: null };
}
