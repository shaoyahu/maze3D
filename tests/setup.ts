import '@testing-library/jest-dom/vitest';

// Node 22+ ships a global `localStorage` that is just a plain object with no
// Web Storage API methods. It shadows happy-dom's real localStorage in the
// test environment. Replace it with a minimal in-memory implementation so
// tests that rely on localStorage.clear/setItem/getItem/removeItem work.
if (typeof globalThis.localStorage?.clear !== 'function') {
  const store: Record<string, string> = {};
  const ls = {
    getItem(k: string): string | null {
      return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null;
    },
    setItem(k: string, v: string): void {
      store[k] = String(v);
    },
    removeItem(k: string): void {
      delete store[k];
    },
    clear(): void {
      for (const k of Object.keys(store)) delete store[k];
    },
    key(i: number): string | null {
      return Object.keys(store)[i] ?? null;
    },
    get length(): number {
      return Object.keys(store).length;
    },
  };
  (globalThis as { localStorage: typeof ls }).localStorage = ls;
  (window as unknown as { localStorage: typeof ls }).localStorage = ls;
}
