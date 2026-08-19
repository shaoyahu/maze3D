import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

// P0-followup #3: typecheck 蒙混 vector audit (vitest mirror).
// P5-2 review H-1 revealed that the strict `walls xor walls2d` mutex
// (P5-2 decision A5) lets `maze.walls!` non-null asserts pass typecheck
// but crash at runtime on multi-layer levels (maze.walls is undefined
// when maze.walls2d is set). The audit grep catches future regressions
// at three layers:
//   1. pre-commit hook (`.husky/pre-commit`)
//   2. CI step (`.github/workflows/ci.yml`)
//   3. this vitest case (runs as part of `npm test`)
//
// The grep excludes:
//   - the explicit fallback pattern `maze.walls ?? maze.walls2d![...]!`
//     (reviewer-blessed multi-layer-safe shape)
//   - lines starting with `//` (comments — the test files
//     minimap.test.tsx / ParchmentMap.test.tsx reference the
//     `maze.walls!` audit pattern in their regression-test
//     comments; those don't actually call the assert)
//   - the audit directory itself (this file's own self-references)
describe('P0-followup #3 — typecheck 蒙混 vector audit', () => {
  it('src/ contains no non-null asserts on maze.walls without a fallback (multi-layer mutex violation)', () => {
    const repoRoot = resolve(__dirname, '../../..');
    // Grep `src/` only — test files can reference the pattern in
    // comments / regression fixtures (the pre-commit hook covers the
    // test files separately; we keep this vitest case focused on
    // production code).
    const cmd = [
      'grep',
      '-rn',
      "'maze\\.walls!'",
      'src/',
      '--include=*.ts',
      '--include=*.tsx',
    ].join(' ');
    let raw = '';
    try {
      raw = execSync(cmd, {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      // grep returns 1 when no matches — that's the passing case.
      raw = '';
    }
    // Drop fallback-shape lines (`??` immediately after `maze.walls!`).
    // Drop comment lines (// after the colon) — the test files
    // reference the pattern in regression comments.
    const violations = raw
      .split('\n')
      .filter((line) => line.length > 0)
      .filter((line) => !line.includes('??'))
      .filter((line) => !/:\s*\/\//.test(line));
    if (violations.length > 0) {
      const report = violations
        .map((v) => `  - ${v}`)
        .join('\n');
      throw new Error(
        `Found ${violations.length} maze.walls! non-null assert(s) without a ?? fallback.\n` +
          `The 'walls xor walls2d' mutex (P5-2 decision A5) means a non-null\n` +
          `assert on maze.walls crashes at runtime on multi-layer levels.\n` +
          `Use \`maze.walls ?? maze.walls2d![...]!\` instead.\n` +
          `Violations:\n${report}`,
      );
    }
    expect(violations).toEqual([]);
  });
});
