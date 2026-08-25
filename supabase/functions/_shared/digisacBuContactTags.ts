export const DIGISAC_BU_CONTACT_TAG_KEYS = ["B1", "B2"] as const;
export type DigisacBuContactTagKey = (typeof DIGISAC_BU_CONTACT_TAG_KEYS)[number];

export function normalizeDigisacTagName(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

/** Só a etiqueta exata B1/B2 — ignora "B1 - Confecção", "B2 - Indústrias", etc. */
export function isExactDigisacBuContactTag(name: string, key: DigisacBuContactTagKey): boolean {
  return normalizeDigisacTagName(name).toUpperCase() === key;
}

export function pickExactDigisacBuContactTags<T extends { id: string; name: string }>(
  tags: T[],
): Partial<Record<DigisacBuContactTagKey, T>> {
  const out: Partial<Record<DigisacBuContactTagKey, T>> = {};
  for (const tag of tags) {
    if (!tag?.id) continue;
    for (const key of DIGISAC_BU_CONTACT_TAG_KEYS) {
      if (!out[key] && isExactDigisacBuContactTag(tag.name || "", key)) {
        out[key] = tag;
      }
    }
  }
  return out;
}
