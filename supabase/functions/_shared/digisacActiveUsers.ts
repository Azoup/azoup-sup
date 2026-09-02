export type DigisacUserStatusFields = {
  id?: unknown;
  archivedAt?: unknown;
  archived_at?: unknown;
  archived?: unknown;
  deletedAt?: unknown;
  deleted_at?: unknown;
  active?: unknown;
  isClientUser?: unknown;
  is_client_user?: unknown;
};

function hasTimestamp(value: unknown): boolean {
  if (value == null || value === false) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

export function isEligibleDigisacAnalystUser(
  user: DigisacUserStatusFields | null | undefined,
): boolean {
  if (!user || user.id == null || String(user.id).trim() === "") return false;
  if (hasTimestamp(user.deletedAt) || hasTimestamp(user.deleted_at)) return false;
  if (hasTimestamp(user.archivedAt) || hasTimestamp(user.archived_at)) return false;
  if (user.archived === true) return false;
  if (user.isClientUser === true || user.is_client_user === true) return false;
  if (user.active === false) return false;
  return true;
}
