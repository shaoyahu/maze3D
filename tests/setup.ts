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
  // F-2026-07-01-FCR-L-15: add a Proxy with ownKeys / getOwnPropertyDescriptor
  // traps so `Object.keys(localStorage)` enumerates the entries via
  // `key(i)`. Without this, any test that calls `Object.keys(localStorage)`
  // directly would get an empty array (the plain object has no own
  // enumerable keys; the enumeration logic above is hidden behind the
  // `key(i)` and `length` methods).
  const proxy = new Proxy(ls, {
    ownKeys() {
      const out: string[] = [];
      for (let i = 0; i < ls.length; i += 1) {
        const k = ls.key(i);
        if (k !== null) out.push(k);
      }
      return out;
    },
    getOwnPropertyDescriptor(_target, prop) {
      if (typeof prop !== 'string') return undefined;
      if (!Object.prototype.hasOwnProperty.call(store, prop)) return undefined;
      return { configurable: true, enumerable: true, writable: true, value: store[prop] };
    },
  });
  (globalThis as { localStorage: typeof proxy }).localStorage = proxy;
  (window as unknown as { localStorage: typeof proxy }).localStorage = proxy;
}
