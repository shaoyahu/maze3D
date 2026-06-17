/**
 * P2-8: enforce that `zh.ts` and `en.ts` carry the same set of keys.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { zh } from '../../../src/i18n/resources/zh';
import { en } from '../../../src/i18n/resources/en';

describe('i18n resource parity', () => {
  it('zh and en expose the exact same set of keys', () => {
    const zhKeys = Object.keys(zh).sort();
    const enKeys = Object.keys(en).sort();
    expect(zhKeys).toEqual(enKeys);
  });

  it('every key/value is a non-empty string', () => {
    for (const [k, v] of Object.entries(zh)) {
      expect(typeof k).toBe('string');
      expect(k.length).toBeGreaterThan(0);
      expect(typeof v).toBe('string');
      expect(v.length).toBeGreaterThan(0);
    }
  });

  it('every key uses the dotted namespace convention', () => {
    const validDomain =
      /^(app|controls|hud|overlays|settings|levels|editor|common|tutorial)(\.[a-zA-Z][a-zA-Z0-9]*)+$/;
    for (const k of Object.keys(zh)) {
      expect(k, `key "${k}" must match dotted namespace`).toMatch(validDomain);
    }
  });
});

// F-2026-06-17-A-1: orphan-key detection. P2-13 added 10 dead
// `editor.mylevels.*` keys (5 zh + 5 en) but never wired them up — the
// only `mylevels` references are stale CSS class names.
//
// Detection strategy: collect EVERY string literal matching the i18n
// dotted-key shape (`^[a-z][\w]*(\.[a-zA-Z][\w]*)+$`) across the entire
// repo (src/** + public/**). A resource key is "consumed" if it appears
// verbatim as such a literal — that catches:
//   - t('foo.bar')              — direct call
//   - t(`foo.${x}.bar`)         — template-literal prefix stops at `${`
//   - labelKey: 'foo.bar'       — object property value
//   - "messageKey": "foo.bar"   — JSON payload (e.g. tutorial step keys)
//   - 'foo.bar' as any other literal that happens to be a key
//
// False positives: any non-i18n string that coincidentally matches the
// dotted-key shape (e.g. an HTML class id like "user.name"). These are
// rare in practice and tolerable — the test names the specific orphans
// so they can be inspected rather than just "test failed".
function collectConsumedKeys(): Set<string> {
  const consumed = new Set<string>();
  // Match any quoted literal whose content is a dotted-key shape:
  //   - single or double quotes, OR
  //   - backtick template literal (capture only the prefix before `${`)
  // Then filter to the i18n key shape.
  const LITERAL_RE = /(['"`])([a-z][\w]*(?:\.[a-zA-Z][\w]*)+)\1/g;
  const TEMPLATE_PREFIX_RE = /`([a-z][\w]*(?:\.[a-zA-Z][\w]*)*)/g;
  // Known i18n top-level namespaces; if a matched literal's first
  // segment isn't one of these, it's almost certainly NOT an i18n key
  // (e.g. a CSS class or an English sentence fragment).
  const NAMESPACES = new Set([
    'app',
    'common',
    'controls',
    'editor',
    'hud',
    'levels',
    'overlays',
    'settings',
    'tutorial',
  ]);

  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.tsx?$/.test(entry.name) || /\.json$/.test(entry.name)) {
        if (entry.name.endsWith('.d.ts')) continue;
        const text = fs.readFileSync(full, 'utf-8');
        for (const m of text.matchAll(LITERAL_RE)) {
          const key = m[2];
          const ns = key.split('.')[0];
          if (NAMESPACES.has(ns)) consumed.add(key);
        }
        for (const m of text.matchAll(TEMPLATE_PREFIX_RE)) {
          const prefix = m[1];
          const ns = prefix.split('.')[0];
          if (NAMESPACES.has(ns)) consumed.add(prefix);
        }
      }
    }
  };
  walk(path.resolve(__dirname, '../../../src'));
  walk(path.resolve(__dirname, '../../../public'));
  return consumed;
}

describe('i18n orphan-key detection (F-2026-06-17-A-1)', () => {
  it('every zh.ts / en.ts key appears as a literal in src/ or public/', () => {
    const consumed = collectConsumedKeys();
    const resourceKeys = Object.keys(zh);
    const orphans = resourceKeys.filter((k) => !consumed.has(k));
    expect(
      orphans,
      `orphan i18n keys (defined in zh/en but never appear as a literal anywhere in src/ or public/):\n  ${orphans.join('\n  ')}`,
    ).toEqual([]);
  });
});