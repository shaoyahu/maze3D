export function isStorageAvailable(): boolean {
  try {
    const k = '__test__';
    localStorage.setItem(k, k);
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

export function loadJSON<T>(key: string, fallback: T): T;
export function loadJSON<T>(key: string): T | undefined;
export function loadJSON<T>(key: string, fallback?: T): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback as T | undefined;
    return JSON.parse(raw) as T;
  } catch {
    return fallback as T | undefined;
  }
}

export function saveJSON(key: string, value: unknown): void {
  if (!isStorageAvailable()) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('persist: failed to save', key, e);
  }
}
