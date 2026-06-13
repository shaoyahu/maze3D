// Centralized ID generation for the level editor (and any other consumers).
//
// Priority:
//   1. crypto.randomUUID()        — RFC 4122 v4, evergreen browsers + Node 19+
//   2. crypto.getRandomValues()   — 16 bytes hex (32 chars), collision-resistant
//   3. Date.now() + Math.random() — last-resort, non-RFC4122, only if `crypto`
//                                    is entirely missing (ancient environments)

export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    // 16 bytes hex-encoded (no dashes) — same collision entropy as UUIDv4
    // without the v4 formatting. P3-A-L2: replaces the prior Math.random
    // fallback whose entropy was insufficient for long editor sessions.
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    let hex = '';
    for (let i = 0; i < bytes.length; i++) {
      hex += bytes[i]!.toString(16).padStart(2, '0');
    }
    return hex;
  }
  return `fallback-${Date.now()}-${Math.random()}`;
}
