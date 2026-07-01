// P2-4b Plan Task 4: envelope serializer/parser + browser file I/O.
//
// The export envelope is `{ schemaVersion: 1, level: MazeData }`. Bump
// SCHEMA_VERSION (in types.ts) and update parseImport's accept list in the
// same edit if the shape ever changes; the editor and any third-party
// importers reject anything whose schemaVersion is not exactly 1.
//
// We deliberately reuse JsonMazeProvider.validateMaze for structural
// validation so a hand-edited JSON file goes through the same checks the
// runtime does — no second validator to keep in sync.

import { validateMaze } from './JsonMazeProvider';
import { clampErrorValue } from '../utils/errors';
import type { MazeData } from './types';

// The only accepted schemaVersion right now. Pinned to the literal 1 so a
// typo elsewhere (e.g. `schemaVersion === '1'`) is a compile error.
const ACCEPTED_SCHEMA_VERSION = 1;
const JSON_EXTENSION = '.json';
const MAZE3D_JSON_EXTENSION = '.maze3d.json';
// D-25: hard cap on imported JSON size. A 50x50 maze exports to ~10 KB,
// so 1 MiB leaves ~100x headroom for hand-edited additions while
// refusing anything that would freeze the tab via FileReader.readAsText
// + JSON.parse blocking the main thread.
export const MAX_IMPORT_BYTES = 1_048_576;

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

// F-2026-06-30-M-3: cap the level.name field on export so a hand-edited
// name with a 100KB string doesn't bloat the exported JSON and break the
// 1 MiB import cap downstream. 200 chars is well above any legitimate
// level title (the editor's name input is also a 200-char limit).
const MAX_NAME_LENGTH = 200;

// exportLevel — pretty-printed so hand-edited diffs in a code review stay
// readable. Indent of 2 matches the rest of the project's source style.
export function exportLevel(level: MazeData): string {
  // F-2026-06-30-M-3: cap level.name to MAX_NAME_LENGTH on export.
  const safeName = level.name.length > MAX_NAME_LENGTH
    ? level.name.slice(0, MAX_NAME_LENGTH)
    : level.name;
  return JSON.stringify(
    { schemaVersion: ACCEPTED_SCHEMA_VERSION, level: { ...level, name: safeName } },
    null,
    2,
  );
}

// F-2026-06-30-M-5: prototype-pollution key blocklist. JSON.parse on its
// own happily parses `{"__proto__": {"polluted": true}}` and V8 then
// stuffs those keys onto the resulting object — anything that later
// does `for (k in parsed)` or `Object.keys(parsed)` will iterate the
// poisoned proto chain. We strip these keys recursively before any
// other validation runs.
const POLLUTING_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function stripPollutingKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripPollutingKeys);
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (POLLUTING_KEYS.has(k)) continue;
      out[k] = stripPollutingKeys(v);
    }
    return out;
  }
  return value;
}

// parseImport — validates the envelope and the inner level, then returns
// the normalized MazeData plus the original `name`. The caller (the
// editor) uses nameToPreserve to keep the user-visible title intact even
// when other fields are rewritten; the parsed MazeData's name is the
// authoritative post-validation copy.
export function parseImport(raw: string): { level: MazeData; nameToPreserve: string } {
  // F-2026-06-30-M-4: bound the input size up front so a 500 MB paste
  // can't lock the tab on JSON.parse. Same cap as readJsonFile so the
  // two entry points reject at the same threshold.
  if (raw.length > MAX_IMPORT_BYTES) {
    throw new ImportError(
      `Import too large: ${raw.length} bytes; max ${MAX_IMPORT_BYTES}`,
    );
  }
  let envelope: unknown;
  try {
    envelope = JSON.parse(raw);
  } catch (e) {
    throw new ImportError(
      `Failed to parse JSON: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  // F-2026-06-30-M-5: strip prototype-pollution keys before any further
  // shape check. Done post-parse so a normal `{ "level": {...} }` body
  // is unaffected, but a `__proto__` payload has its malicious keys
  // dropped before reaching validateMaze.
  envelope = stripPollutingKeys(envelope);

  if (typeof envelope !== 'object' || envelope === null) {
    throw new ImportError('Import envelope must be a JSON object');
  }
  const env = envelope as Record<string, unknown>;

  if (env.schemaVersion !== ACCEPTED_SCHEMA_VERSION) {
    throw new ImportError(
      `Unsupported schemaVersion: ${JSON.stringify(env.schemaVersion)} (expected ${ACCEPTED_SCHEMA_VERSION})`,
    );
  }

  if (!('level' in env) || typeof env.level !== 'object' || env.level === null) {
    throw new ImportError('Import envelope is missing the `level` field');
  }
  const levelRaw = env.level as Record<string, unknown>;
  const nameToPreserve = typeof levelRaw.name === 'string' ? levelRaw.name : '';

  // validateMaze uses the level's own `id` as the error context, so the
  // resulting error messages point at the level rather than at the
  // envelope. The level id is guaranteed to be a string by validateMaze,
  // but a hand-crafted file could lie; fall back to a generic label.
  const idForValidation =
    typeof levelRaw.id === 'string' && levelRaw.id.length > 0 ? levelRaw.id : 'imported';

  let level: MazeData;
  try {
    level = validateMaze(levelRaw, idForValidation);
  } catch (e) {
    // Wrap any validator failure (LevelLoadError today, but in principle
    // any thrown value) so callers only ever need to catch ImportError
    // for the import flow.
    // F-2026-06-15-L-5.7: clamp the wrapped detail so a future validator
    // message containing user-controlled content (e.g. an oversized name
    // field) doesn't blow up the editor toast.
    const detail = clampErrorValue(e instanceof Error ? e.message : String(e));
    throw new ImportError(`Imported level is invalid: ${detail}`);
  }

  return { level, nameToPreserve };
}

// downloadAsJsonFile — builds a Blob, hands the browser a one-shot
// object URL, clicks an invisible <a download> element, then revokes the
// URL. The element is appended to the document so Firefox actually fires
// the download; some browsers ignore programmatic clicks on detached
// nodes. F-2026-06-30-L-12: defense in depth — sanitize the filename so
// a hand-typed name with a path separator or shell metacharacter can't
// escape the downloads dir. F-2026-06-30-L-13: `noopener noreferrer` on
// the rel attribute (we don't actually navigate, but the spec says to
// set it for any cross-origin target).
export function downloadAsJsonFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = sanitizeFilename(filename);
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// readJsonFile — guards the editor against the user picking a random
// binary or text file from disk. We accept `.json` and the project-
// specific `.maze3d.json` (used by Export) but reject anything else
// before reading the bytes, so the error message is clear.
//
// D-25: also rejects files larger than MAX_IMPORT_BYTES *before* loading
// them. Without this guard, a 500 MB pick would freeze the tab via
// FileReader.readAsText + JSON.parse blocking the main thread. The
// boundary is strict `>`, so a file exactly at the cap is accepted.
export async function readJsonFile(file: File): Promise<string> {
  const lower = file.name.toLowerCase();
  if (!lower.endsWith(JSON_EXTENSION) && !lower.endsWith(MAZE3D_JSON_EXTENSION)) {
    throw new ImportError(`File '${file.name}' is not a .json or .maze3d.json file`);
  }
  if (file.size > MAX_IMPORT_BYTES) {
    throw new ImportError(
      `File too large: ${file.size} bytes; max ${MAX_IMPORT_BYTES}`,
    );
  }
  return file.text();
}

// sanitizeFilename — collapses anything outside [A-Za-z0-9_-] to `_` so
// the result is safe across Windows / macOS / Linux filesystems and
// survives a round-trip through the browser's download attribute.
// F-2026-06-30-L-14: the previous `[^\w-]` (JS `\w`) accepted Unicode
// letters/digits/underscore, which is fine for in-memory display but
// lets a Chinese fullwidth space or zero-width-joiner slip through. A
// filename with a path separator or control character is the actual
// risk here; pin to ASCII so any non-ASCII character is collapsed.
export function sanitizeFilename(name: string): string {
  return name.replace(/[^A-Za-z0-9_-]/g, '_');
}
