/**
 * F-project-review-2026-06-13-D-21: migration framework for versioned
 * localStorage data.
 *
 * Persistent keys (`maze3d.levels.v1`, `maze3d.customLevels.v1`) embed
 * their schema version in the key name. Today only v1 exists; when a
 * future schema bump introduces v2, v1 data on disk would be orphaned
 * unless it is migrated on load. This module is the single chokepoint
 * that turns that future bump into a one-line change:
 *
 *   1. Bump `CURRENT_LEVEL_SCHEMA_VERSION` to the new version.
 *   2. Append `{ fromVersion: N-1, toVersion: N, transform }` to
 *      `LEVEL_MIGRATIONS`.
 *
 * The init code in `levelStore` already routes every load through
 * `applyLevelMigrations`, so no caller changes are needed when the
 * schema is bumped.
 *
 * Why version-in-key rather than `__schemaVersion` inside the data:
 * the existing stored shape is `{ "levelId": BestRecord, ... }` with
 * no metadata field. Adding an embedded version field would either
 * mix metadata with entries (ugly) or change the outer shape (breaks
 * existing localStorage data on first read). The `.v1` suffix is
 * already there — we read it.
 */

/**
 * The schema version this build understands. Bump this together with
 * adding a new entry to `LEVEL_MIGRATIONS`; bumping either in isolation
 * is a breaking change.
 */
export const CURRENT_LEVEL_SCHEMA_VERSION = 1;

export interface LevelMigration {
  fromVersion: number;
  toVersion: number;
  /**
   * Pure transform from a previous-schema value to the next-schema
   * value. Implementations MUST NOT mutate the input — `levelStore`
   * may hand the same data to `sanitizeBestRecordMap` /
   * `sanitizeCustomLevelsMap` after migration, and a mutated v1
   * payload would corrupt the on-disk source.
   */
  transform: (data: unknown) => unknown;
}

/**
 * Ordered migration chain. Currently empty because the only schema
 * in the wild is v1 — there is no v_n → v_{n+1} step to apply yet.
 *
 * When v2 ships, add the first entry here:
 *
 *   export const LEVEL_MIGRATIONS: readonly LevelMigration[] = [
 *     { fromVersion: 1, toVersion: 2, transform: v1ToV2 },
 *   ];
 *
 * And bump `CURRENT_LEVEL_SCHEMA_VERSION` to 2.
 */
export const LEVEL_MIGRATIONS: readonly LevelMigration[] = [];

/**
 * Parse the trailing `.vN` segment from a storage key name.
 * Returns `null` for keys without a version suffix, non-integer
 * versions, or `v0` (which is not a valid schema).
 *
 * Used by `levelStore` to decide which version's data it is about
 * to load, so it can route it through the migration chain.
 */
const STORAGE_KEY_VERSION_RE = /\.v(\d+)$/;

export function parseStorageKeyVersion(key: string): number | null {
  const match = STORAGE_KEY_VERSION_RE.exec(key);
  if (!match) return null;
  const n = Number.parseInt(match[1], 10);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/**
 * Run the migration chain from `fromVersion` (parsed by the caller
 * from the storage key) up to `CURRENT_LEVEL_SCHEMA_VERSION`. Returns
 * the input reference unchanged when `fromVersion` already matches
 * the current schema (the no-op chokepoint).
 *
 * Throws when:
 *   - `fromVersion > CURRENT_LEVEL_SCHEMA_VERSION`: the on-disk data
 *     was written by a newer build than this one; refuse to silently
 *     load it as a partial schema.
 *   - The migration chain has a gap (an entry's `fromVersion` does
 *     not equal the previous entry's `toVersion`).
 *   - The chain finishes at a version other than
 *     `CURRENT_LEVEL_SCHEMA_VERSION` (a partially-applied chain).
 *
 * The chain MUST be contiguous: entry N's `toVersion` must equal
 * entry N+1's `fromVersion`, and the final entry's `toVersion` must
 * equal `CURRENT_LEVEL_SCHEMA_VERSION`. The walker validates this
 * on every call so a misconfigured registry fails loudly instead of
 * silently producing half-migrated data.
 */
export function applyLevelMigrations(data: unknown, fromVersion: number): unknown {
  if (fromVersion > CURRENT_LEVEL_SCHEMA_VERSION) {
    throw new Error(
      `Level data is schema v${fromVersion}, which is newer than this build's ` +
        `supported v${CURRENT_LEVEL_SCHEMA_VERSION}`,
    );
  }
  // Hot path: v1 → v1 (the only version that exists today, and the
  // version every existing localStorage entry is at). Return the
  // same reference — no allocation, no copy. levelStore will hand
  // this directly to sanitizeBestRecordMap / sanitizeCustomLevelsMap.
  if (fromVersion === CURRENT_LEVEL_SCHEMA_VERSION) return data;

  let current = data;
  let version = fromVersion;
  for (const migration of LEVEL_MIGRATIONS) {
    if (migration.fromVersion !== version) {
      throw new Error(
        `Migration chain mismatch at v${version}: expected fromVersion=${version}, ` +
          `got fromVersion=${migration.fromVersion}`,
      );
    }
    current = migration.transform(current);
    version = migration.toVersion;
  }
  if (version !== CURRENT_LEVEL_SCHEMA_VERSION) {
    throw new Error(
      `Migration chain incomplete: ended at v${version}, ` +
        `expected v${CURRENT_LEVEL_SCHEMA_VERSION}`,
    );
  }
  return current;
}