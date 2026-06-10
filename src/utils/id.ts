// Centralized ID generation for the level editor (and any other consumers).
// Primary path: crypto.randomUUID() (RFC 4122 v4, available in all evergreen
// browsers and Node 19+). Fallback: a non-RFC4122 string composed of
// Date.now() and Math.random() for very old environments where crypto is
// missing or crypto.randomUUID is unavailable.

export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `fallback-${Date.now()}-${Math.random()}`;
}
